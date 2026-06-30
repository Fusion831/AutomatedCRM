#input_type_name: GenerateRecommendationInput
#output_type_name: GenerateRecommendationResponse
#function_name: generate_recommendation_function

import json
import uuid
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, date, timedelta
from lemma_sdk import FunctionContext, Lemma

class GenerateRecommendationInput(BaseModel):
    contact_id: str
    current_date: Optional[str] = None # format: YYYY-MM-DD

class GenerateRecommendationResponse(BaseModel):
    contact_id: str
    action: str
    category: str
    urgency: str
    reasoning: List[str]
    evidence: List[str]
    rec_changed: bool
    history_recorded: bool
    recommendation_confidence: int

# Category Priority Order
CATEGORY_PRIORITY = [
    "RESOLVE_BLOCKER",
    "RESPOND",
    "SEND_DOCUMENT",
    "SCHEDULE_MEETING",
    "FOLLOW_UP",
    "REENGAGE",
    "CLOSE_LOOP",
    "WAIT",
    "NO_ACTION"
]

def get_category_priority(category: str) -> int:
    try:
        return CATEGORY_PRIORITY.index(category)
    except ValueError:
        return 999

async def generate_recommendation_function(ctx: FunctionContext, data: GenerateRecommendationInput) -> GenerateRecommendationResponse:
    client = Lemma()
    pod = client.pod(str(ctx.pod_id))
    
    contact_id = data.contact_id
    
    # 1. Parse current date
    if data.current_date:
        try:
            curr_date = datetime.strptime(data.current_date[:10], "%Y-%m-%d").date()
        except ValueError:
            curr_date = datetime.utcnow().date()
    else:
        curr_date = datetime.utcnow().date()
        
    # 2. Fetch Contact
    contact = pod.table("contacts").get(contact_id)
    if not contact:
        raise ValueError(f"Contact {contact_id} not found")
        
    previous_action = contact.get("recommended_action") or ""
    previous_category = contact.get("recommendation_category") or ""
    
    # 3. Fetch commitments, interactions, milestones, state history
    comms_query = f"SELECT id, description, owner, status, due_date, evidence_quote FROM commitments WHERE contact_id = '{contact_id}'"
    comms_res = pod.query(comms_query)
    commitments = comms_res.to_dict().get("items", [])
    open_commitments = [c for c in commitments if c.get("status") == "open"]
    
    ints_query = f"SELECT id, type, occurred_at FROM interactions WHERE contact_id = '{contact_id}'"
    ints_res = pod.query(ints_query)
    interactions = ints_res.to_dict().get("items", [])
    interactions.sort(key=lambda x: x.get("occurred_at", ""), reverse=True)
    
    milestones_query = f"SELECT id, summary, importance_score, evidence_quote, occurred_at FROM relationship_milestones WHERE contact_id = '{contact_id}'"
    milestones_res = pod.query(milestones_query)
    milestones = milestones_res.to_dict().get("items", [])

    # 4. Evaluate and generate candidate recommendations
    candidates = []
    
    relationship_state = contact.get("relationship_state") or "mutual_exploration"
    
    # Candidate Generator 1: RESOLVE_BLOCKER
    if relationship_state == "blocked":
        # Check objections
        objections = contact.get("objections") or []
        if isinstance(objections, str):
            try:
                objections = json.loads(objections)
            except Exception:
                objections = [objections] if objections else []
        blocker_keywords = ["budget blocker", "procurement blocker", "hiring blocker", "legal blocker", "blocker", "blocked"]
        
        blocker_found = None
        for obj in objections:
            if any(kw in obj.lower() for kw in blocker_keywords):
                blocker_found = obj
                break
                
        if not blocker_found:
            for m in milestones:
                summary = m.get("summary") or ""
                quote = m.get("evidence_quote") or ""
                if any(kw in summary.lower() or kw in quote.lower() for kw in blocker_keywords):
                    blocker_found = summary
                    break
                    
        blocker_text = blocker_found or "Active blocker detected"
        candidates.append({
            "action": f"Resolve blocker: {blocker_text}",
            "category": "RESOLVE_BLOCKER",
            "urgency": "CRITICAL",
            "reasoning": ["Relationship state is 'blocked' due to operational hurdles."],
            "evidence": [blocker_text]
        })
        
    # Candidate Generator 2: RESPOND / SEND_DOCUMENT / SCHEDULE_MEETING / CLOSE_LOOP (waiting_on_me)
    if relationship_state == "waiting_on_me":
        founder_comms = [c for c in open_commitments if c.get("owner") == "founder"]
        for c in founder_comms:
            desc = c.get("description", "")
            desc_lower = desc.lower()
            quote = c.get("evidence_quote") or "Promised in interaction"
            
            # Determine due state
            due_date_str = c.get("due_date")
            is_overdue = False
            if due_date_str:
                try:
                    due_date = datetime.strptime(due_date_str[:10], "%Y-%m-%d").date()
                    if due_date < curr_date:
                        is_overdue = True
                except ValueError:
                    pass
            
            urg = "CRITICAL" if is_overdue else "HIGH"
            reason_suffix = " (OVERDUE)" if is_overdue else ""
            
            # Check RESPOND keywords
            if any(kw in desc_lower for kw in ["reply", "answer", "respond", "send email", "email back", "message"]):
                candidates.append({
                    "action": f"Respond to contact: '{desc}'",
                    "category": "RESPOND",
                    "urgency": urg,
                    "reasoning": [f"Open founder commitment requires a reply{reason_suffix}."],
                    "evidence": [f"Commitment: '{desc}' (Evidence quote: '{quote}')"]
                })
            # Check SEND_DOCUMENT keywords
            elif any(kw in desc_lower for kw in ["doc", "proposal", "deck", "model", "sheet", "pdf", "link", "slide", "pitch"]):
                candidates.append({
                    "action": f"Send document: '{desc}'",
                    "category": "SEND_DOCUMENT",
                    "urgency": urg,
                    "reasoning": [f"Open founder commitment to share materials{reason_suffix}."],
                    "evidence": [f"Commitment: '{desc}' (Evidence quote: '{quote}')"]
                })
            # Check SCHEDULE_MEETING keywords
            elif any(kw in desc_lower for kw in ["call", "meeting", "demo", "schedule", "zoom", "invite", "calendar", "meet"]):
                candidates.append({
                    "action": f"Schedule meeting: '{desc}'",
                    "category": "SCHEDULE_MEETING",
                    "urgency": urg,
                    "reasoning": [f"Open founder commitment to set up call{reason_suffix}."],
                    "evidence": [f"Commitment: '{desc}' (Evidence quote: '{quote}')"]
                })
            # Fallback close loop task
            else:
                candidates.append({
                    "action": f"Complete commitment: '{desc}'",
                    "category": "CLOSE_LOOP",
                    "urgency": "LOW" if not is_overdue else "HIGH",
                    "reasoning": [f"Open action item for founder{reason_suffix}."],
                    "evidence": [f"Commitment: '{desc}' (Evidence quote: '{quote}')"]
                })
                
    # Candidate Generator 3: FOLLOW_UP
    # A: Overdue contact commitments
    contact_comms = [c for c in open_commitments if c.get("owner") == "contact"]
    for c in contact_comms:
        desc = c.get("description", "")
        due_date_str = c.get("due_date")
        is_overdue = False
        if due_date_str:
            try:
                due_date = datetime.strptime(due_date_str[:10], "%Y-%m-%d").date()
                if due_date < curr_date:
                    is_overdue = True
            except ValueError:
                pass
        if is_overdue:
            candidates.append({
                "action": f"Follow up on contact commitment: '{desc}'",
                "category": "FOLLOW_UP",
                "urgency": "HIGH",
                "reasoning": ["Contact commitment is past its expected due date."],
                "evidence": [f"Commitment: '{desc}' (Due date was {due_date_str})"]
            })
            
    # B: Expected touch date overdue
    expected_touch_str = contact.get("expected_next_touch_date")
    if expected_touch_str:
        try:
            expected_touch = datetime.strptime(expected_touch_str[:10], "%Y-%m-%d").date()
            if curr_date > expected_touch:
                days_overdue = (curr_date - expected_touch).days
                urg = "HIGH" if days_overdue > 5 else "MEDIUM"
                candidates.append({
                    "action": "Reach out to check in",
                    "category": "FOLLOW_UP",
                    "urgency": urg,
                    "reasoning": [f"Expected check-in target was missed by {days_overdue} days."],
                    "evidence": [f"Expected touch date: {expected_touch_str}"]
                })
        except ValueError:
            pass

    # Candidate Generator 4: REENGAGE (reengagement_candidate)
    if relationship_state == "reengagement_candidate":
        # Find highest importance milestone
        sorted_milestones = sorted(milestones, key=lambda x: int(x.get("importance_score") or 0), reverse=True)
        if sorted_milestones:
            m = sorted_milestones[0]
            candidates.append({
                "action": f"Re-engage contact leveraging milestone: '{m.get('summary')}'",
                "category": "REENGAGE",
                "urgency": "MEDIUM",
                "reasoning": ["Relationship is dormant, but has valuable historical context to revive conversation."],
                "evidence": [f"Milestone: '{m.get('summary')}' (importance: {m.get('importance_score')})"]
            })
            
    # Candidate Generator 5: WAIT
    if relationship_state == "waiting_on_them":
        # Check last interaction time
        last_int_date = None
        if interactions:
            occ_at = interactions[0].get("occurred_at")
            if occ_at:
                try:
                    last_int_date = datetime.fromisoformat(occ_at.replace("Z", "+00:00")).date()
                except ValueError:
                    pass
        if last_int_date:
            days_since = (curr_date - last_int_date).days
            if days_since < 7:
                candidates.append({
                    "action": "Wait for contact response",
                    "category": "WAIT",
                    "urgency": "LOW",
                    "reasoning": [f"We recently interacted {days_since} days ago. Awaiting contact response."],
                    "evidence": [f"Last interaction occurred on {last_int_date}"]
                })

    # Fallback Generator: NO_ACTION
    if not candidates:
        candidates.append({
            "action": "No action required",
            "category": "NO_ACTION",
            "urgency": "LOW",
            "reasoning": ["Relationship is active and has no open loop commitments or blockers."],
            "evidence": ["Relationship state is mutual_exploration. Commitments are clear."]
        })

    # 5. Apply Priority Sorting Hierarchy
    candidates.sort(key=lambda x: get_category_priority(x["category"]))
    chosen = candidates[0]
    
    # 6. Calculate recommendation confidence based on prior success
    rec_confidence = 85
    try:
        # Query all historical recommendations for this contact
        rec_hist_query = f"SELECT id, new_recommendation FROM recommendation_history WHERE contact_id = '{contact_id}'"
        rec_hist_res = pod.query(rec_hist_query)
        rec_hist_items = rec_hist_res.to_dict().get("items", [])
        
        # Query all feedback for this contact
        fb_query = f"SELECT recommendation_id, feedback_action FROM recommendation_feedback WHERE contact_id = '{contact_id}'"
        fb_res = pod.query(fb_query)
        fb_items = fb_res.to_dict().get("items", [])
        
        # Build maps
        rec_id_to_action = {item["id"]: item["new_recommendation"] for item in rec_hist_items if "id" in item}
        
        # Map action to category helper
        def get_category_from_action(action_str: str) -> str:
            action_lower = action_str.lower()
            if "blocker" in action_lower:
                return "RESOLVE_BLOCKER"
            elif "respond" in action_lower or "reply" in action_lower:
                return "RESPOND"
            elif any(k in action_lower for k in ["send", "share", "document", "deck", "slides"]):
                return "SEND_DOCUMENT"
            elif any(k in action_lower for k in ["schedule", "meeting", "call"]):
                return "SCHEDULE_MEETING"
            elif "follow up" in action_lower or "reach out" in action_lower:
                return "FOLLOW_UP"
            elif "re-engage" in action_lower or "reengage" in action_lower:
                return "REENGAGE"
            elif "wait" in action_lower:
                return "WAIT"
            else:
                return "NO_ACTION"
                
        # Count stats for chosen["category"]
        positive_count = 0
        negative_count = 0
        ignored_count = 0
        
        for fb in fb_items:
            rec_id = fb.get("recommendation_id")
            action_str = rec_id_to_action.get(rec_id)
            if not action_str:
                continue
            cat = get_category_from_action(action_str)
            if cat == chosen["category"]:
                act = fb.get("feedback_action")
                if act in ["ACCEPTED", "COMPLETED"]:
                    positive_count += 1
                elif act == "REJECTED":
                    negative_count += 1
                elif act in ["IGNORED", "EXPIRED"]:
                    ignored_count += 1
                    
        total_fb = positive_count + negative_count + ignored_count
        if total_fb > 0:
            rec_confidence = 85 + (positive_count * 5) - (negative_count * 15) - (ignored_count * 5)
            rec_confidence = max(30, min(100, rec_confidence))
    except Exception:
        rec_confidence = 85

    # 7. Check if recommendation changed materials
    rec_changed = (chosen["action"] != previous_action or chosen["category"] != previous_category)
    history_recorded = False
    
    # Save back to contacts table
    pod.table("contacts").update(contact_id, {
        "recommended_action": chosen["action"],
        "recommendation_category": chosen["category"],
        "recommendation_urgency": chosen["urgency"],
        "recommendation_reasoning": json.dumps(chosen["reasoning"]),
        "recommendation_evidence": json.dumps(chosen["evidence"]),
        "recommendation_confidence": rec_confidence
    })
    
    if rec_changed:
        # Find the last recommendation history record BEFORE we create a new one,
        # so we can mark it as EXPIRED.
        try:
            last_rec_query = f"SELECT id FROM recommendation_history WHERE contact_id = '{contact_id}' ORDER BY created_at DESC LIMIT 1"
            last_rec_res = pod.query(last_rec_query)
            last_rec_items = last_rec_res.to_dict().get("items", [])
            if last_rec_items:
                prev_rec_id = last_rec_items[0]["id"]
                
                # Check if it already has final feedback (COMPLETED/REJECTED/EXPIRED/IGNORED)
                fb_check_query = f"SELECT feedback_action FROM recommendation_feedback WHERE recommendation_id = '{prev_rec_id}'"
                fb_check_res = pod.query(fb_check_query)
                fb_check_items = fb_check_res.to_dict().get("items", [])
                
                has_final_fb = any(item.get("feedback_action") in ["COMPLETED", "REJECTED", "EXPIRED", "IGNORED"] for item in fb_check_items)
                
                if not has_final_fb:
                    # Create EXPIRED feedback
                    pod.table("recommendation_feedback").create({
                        "id": str(uuid.uuid4()),
                        "recommendation_id": prev_rec_id,
                        "contact_id": contact_id,
                        "feedback_action": "EXPIRED",
                        "feedback_reason": f"Superseded by new recommendation: {chosen['category']} ({chosen['action']})",
                        "created_at": datetime.utcnow().isoformat() + "Z"
                    })
                    
                    # Record decision event
                    pod.table("decision_events").create({
                        "id": str(uuid.uuid4()),
                        "contact_id": contact_id,
                        "event_type": "RECOMMENDATION_EXPIRED",
                        "event_source": "recommendation_engine",
                        "previous_value": f"{previous_category} ({previous_action})" if previous_category or previous_action else "None",
                        "new_value": "EXPIRED",
                        "reason": f"Superseded by new recommendation: {chosen['category']} ({chosen['action']})",
                        "evidence": json.dumps([prev_rec_id]),
                        "metadata": json.dumps({
                            "recommendation_id": prev_rec_id
                        }),
                        "created_at": datetime.utcnow().isoformat() + "Z"
                    })
        except Exception:
            pass

        pod.table("recommendation_history").create({
            "id": str(uuid.uuid4()),
            "contact_id": contact_id,
            "previous_recommendation": previous_action,
            "new_recommendation": chosen["action"],
            "reason": f"Recalculated state {relationship_state} with priority reasons.",
            "created_at": datetime.utcnow().isoformat() + "Z"
        })
        
        # Record decision event
        pod.table("decision_events").create({
            "id": str(uuid.uuid4()),
            "contact_id": contact_id,
            "event_type": "RECOMMENDATION_CHANGE",
            "event_source": "recommendation_engine",
            "previous_value": f"{previous_category} ({previous_action})" if previous_category or previous_action else "None",
            "new_value": f"{chosen['category']} ({chosen['action']})",
            "reason": "; ".join(chosen["reasoning"]),
            "evidence": json.dumps(chosen["evidence"]),
            "metadata": json.dumps({
                "urgency": chosen["urgency"]
            }),
            "created_at": datetime.utcnow().isoformat() + "Z"
        })
        history_recorded = True
        
    return GenerateRecommendationResponse(
        contact_id=contact_id,
        action=chosen["action"],
        category=chosen["category"],
        urgency=chosen["urgency"],
        reasoning=chosen["reasoning"],
        evidence=chosen["evidence"],
        rec_changed=rec_changed,
        history_recorded=history_recorded,
        recommendation_confidence=rec_confidence
    )
