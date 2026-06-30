#input_type_name: DetermineRelationshipStateInput
#output_type_name: DetermineRelationshipStateResponse
#function_name: determine_relationship_state_function

import json
import uuid
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, date, timedelta
from lemma_sdk import FunctionContext, Lemma

class DetermineRelationshipStateInput(BaseModel):
    contact_id: str
    current_date: Optional[str] = None # format: YYYY-MM-DD

class DetermineRelationshipStateResponse(BaseModel):
    contact_id: str
    previous_state: str
    new_state: str
    state_changed: bool
    reasons: List[str]
    transition_recorded: bool

async def determine_relationship_state_function(ctx: FunctionContext, data: DetermineRelationshipStateInput) -> DetermineRelationshipStateResponse:
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
        
    previous_state = contact.get("relationship_state") or "mutual_exploration"
    
    # 3. Fetch commitments, interactions, milestones, state history
    comms_query = f"SELECT id, description, owner, status, due_date FROM commitments WHERE contact_id = '{contact_id}'"
    comms_res = pod.query(comms_query)
    all_commitments = comms_res.to_dict().get("items", [])
    open_commitments = [c for c in all_commitments if c.get("status") == "open"]
    
    ints_query = f"SELECT id, type, summary, occurred_at FROM interactions WHERE contact_id = '{contact_id}'"
    ints_res = pod.query(ints_query)
    interactions = ints_res.to_dict().get("items", [])
    interactions.sort(key=lambda x: x.get("occurred_at", ""), reverse=True)
    
    milestones_query = f"SELECT id, summary, importance_score, evidence_quote, occurred_at FROM relationship_milestones WHERE contact_id = '{contact_id}'"
    milestones_res = pod.query(milestones_query)
    milestones = milestones_res.to_dict().get("items", [])
    
    history_query = f"SELECT id, old_state, new_state, reason, changed_at FROM relationship_state_history WHERE contact_id = '{contact_id}'"
    history_res = pod.query(history_query)
    state_history = history_res.to_dict().get("items", [])
    state_history.sort(key=lambda x: x.get("changed_at", ""), reverse=True)

    # 4. Resolve state deterministically based on priority hierarchy
    proposed_state = None
    reasons = []
    
    # Hierarchy Step 1: blocked
    # Check objections and memory for blocker keywords
    objections = contact.get("objections") or []
    if isinstance(objections, str):
        try:
            objections = json.loads(objections)
        except Exception:
            objections = [objections] if objections else []
            
    blocker_keywords = ["budget blocker", "procurement blocker", "hiring blocker", "legal blocker", "blocker", "blocked"]
    found_blocker = False
    
    for obj in objections:
        if any(kw in obj.lower() for kw in blocker_keywords):
            proposed_state = "blocked"
            reasons.append(f"Objection blocker detected: {obj}")
            found_blocker = True
            break
            
    if not found_blocker:
        # Check milestones for blocker keywords
        for m in milestones:
            summary = m.get("summary") or ""
            quote = m.get("evidence_quote") or ""
            if any(kw in summary.lower() or kw in quote.lower() for kw in blocker_keywords):
                proposed_state = "blocked"
                reasons.append(f"Milestone blocker detected: {summary}")
                found_blocker = True
                break
                
    # Hierarchy Step 2: waiting_on_me
    if not proposed_state:
        founder_comms = [c for c in open_commitments if c.get("owner") == "founder"]
        if founder_comms:
            proposed_state = "waiting_on_me"
            for c in founder_comms:
                reasons.append(f"Open founder commitment: {c.get('description')}")
                
    # Hierarchy Step 3: waiting_on_them
    if not proposed_state:
        contact_comms = [c for c in open_commitments if c.get("owner") == "contact"]
        if contact_comms:
            proposed_state = "waiting_on_them"
            for c in contact_comms:
                reasons.append(f"Open contact commitment: {c.get('description')}")
                
    # Hierarchy Step 4: mutual_exploration vs cooling vs reengagement_candidate
    if not proposed_state:
        last_int_date = None
        if interactions:
            occ_at = interactions[0].get("occurred_at")
            if occ_at:
                try:
                    last_int_date = datetime.fromisoformat(occ_at.replace("Z", "+00:00")).date()
                except ValueError:
                    pass
        
        # Calculate days since last interaction
        days_inactive = 9999
        if last_int_date:
            days_inactive = (curr_date - last_int_date).days
            
        # Check next touch date
        expected_touch_overdue = False
        expected_touch_str = contact.get("expected_next_touch_date")
        if expected_touch_str:
            try:
                expected_touch = datetime.strptime(expected_touch_str[:10], "%Y-%m-%d").date()
                if curr_date > expected_touch:
                    expected_touch_overdue = True
            except ValueError:
                pass
                
        if days_inactive > 30:
            # Check for important milestones (score >= 70)
            high_milestones = [m for m in milestones if int(m.get("importance_score", 0)) >= 70]
            if high_milestones:
                proposed_state = "reengagement_candidate"
                reasons.append(f"No interaction for {days_inactive} days (dormant). Important milestones exist: {high_milestones[0].get('summary')}")
            else:
                proposed_state = "cooling"
                reasons.append(f"No interaction for {days_inactive} days (dormant) with no high-value milestones.")
        elif days_inactive > 14 or expected_touch_overdue:
            proposed_state = "cooling"
            if expected_touch_overdue:
                reasons.append(f"Expected touchpoint was missed (expected: {expected_touch_str})")
            if days_inactive > 14:
                reasons.append(f"Conversation losing momentum (no interaction for {days_inactive} days)")
        else:
            proposed_state = "mutual_exploration"
            reasons.append(f"Active two-way conversation (last interaction {days_inactive} days ago)")

    # 5. Apply Anti-Flapping / Cooldown checks
    state_changed = (proposed_state != previous_state)
    transition_recorded = False
    
    if state_changed:
        allow_transition = True
        
        if state_history:
            last_transition = state_history[0]
            last_changed_at_str = last_transition.get("changed_at")
            
            if last_changed_at_str:
                try:
                    last_changed_at = datetime.fromisoformat(last_changed_at_str.replace("Z", "+00:00"))
                    curr_datetime = datetime.combine(curr_date, datetime.min.time())
                    
                    # Cooldown period check (3 days)
                    if (curr_datetime - last_changed_at.replace(tzinfo=None)) < timedelta(days=3):
                        # Flapping check: returning to the state before the last transition
                        if proposed_state == last_transition.get("old_state"):
                            # Cooldown bypass check: new interaction since the last transition
                            new_interaction_exists = False
                            for i in interactions:
                                occ = i.get("occurred_at")
                                if occ:
                                    occ_dt = datetime.fromisoformat(occ.replace("Z", "+00:00"))
                                    if occ_dt > last_changed_at:
                                        new_interaction_exists = True
                                        break
                                        
                            if not new_interaction_exists:
                                allow_transition = False
                                reasons.append(f"Anti-flapping block: Cooldown active (<3 days since last transition to {previous_state}) and no new interaction.")
                except ValueError:
                    pass
                    
        if allow_transition:
            # Save new state back to contacts table
            pod.table("contacts").update(contact_id, {
                "relationship_state": proposed_state
            })
            
            # Record transition in relationship_state_history
            reason_summary = "; ".join(reasons)
            pod.table("relationship_state_history").create({
                "id": str(uuid.uuid4()),
                "contact_id": contact_id,
                "old_state": previous_state,
                "new_state": proposed_state,
                "reason": reason_summary,
                "changed_at": datetime.utcnow().isoformat() + "Z"
            })
            
            # Record decision event
            pod.table("decision_events").create({
                "id": str(uuid.uuid4()),
                "contact_id": contact_id,
                "event_type": "STATE_CHANGE",
                "event_source": "relationship_state_engine",
                "previous_value": previous_state,
                "new_value": proposed_state,
                "reason": reason_summary,
                "evidence": json.dumps(reasons),
                "metadata": json.dumps({
                    "interactions_count": len(interactions),
                    "open_commitments_count": len(open_commitments)
                }),
                "created_at": datetime.utcnow().isoformat() + "Z"
            })
            transition_recorded = True
        else:
            # Keep original state
            proposed_state = previous_state
            
    return DetermineRelationshipStateResponse(
        contact_id=contact_id,
        previous_state=previous_state,
        new_state=proposed_state,
        state_changed=state_changed,
        reasons=reasons,
        transition_recorded=transition_recorded
    )
