import json
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

def get_category_from_action(action_str: str) -> str:
    """Helper to map a recommendation action text to its category enum."""
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

def record_recommendation_feedback(
    pod: Any,
    recommendation_id: str,
    feedback_action: str,
    reason: Optional[str] = None
) -> Dict[str, Any]:
    """
    Core function to record recommendation feedback, update the datastore,
    and log corresponding decision audit events.
    """
    # 1. Fetch recommendation details to get contact_id and action description
    rec_res = pod.query(f"SELECT contact_id, new_recommendation FROM recommendation_history WHERE id = '{recommendation_id}'")
    recs = rec_res.to_dict().get("items", [])
    if not recs:
        raise ValueError(f"Recommendation with ID {recommendation_id} not found in history.")
    
    contact_id = recs[0]["contact_id"]
    recommendation_action = recs[0]["new_recommendation"]

    # 2. Record the feedback in the recommendation_feedback table
    feedback_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat() + "Z"
    
    feedback_record = {
        "id": feedback_id,
        "recommendation_id": recommendation_id,
        "contact_id": contact_id,
        "feedback_action": feedback_action,
        "feedback_reason": reason,
        "created_at": created_at
    }
    pod.table("recommendation_feedback").create(feedback_record)

    # 3. Write a decision audit event
    event_type = f"RECOMMENDATION_{feedback_action}"
    pod.table("decision_events").create({
        "id": str(uuid.uuid4()),
        "contact_id": contact_id,
        "event_type": event_type,
        "event_source": "recommendation_engine",
        "previous_value": recommendation_action,
        "new_value": feedback_action,
        "reason": reason or f"Recommendation {feedback_action.lower()} by founder.",
        "evidence": json.dumps([recommendation_id]),
        "metadata": json.dumps({
            "feedback_id": feedback_id,
            "recommendation_id": recommendation_id
        }),
        "created_at": created_at
    })

    return feedback_record

# --- FEEDBACK APIs ---

def accept_recommendation(pod: Any, recommendation_id: str, reason: Optional[str] = None) -> Dict[str, Any]:
    """Marks a recommendation as ACCEPTED."""
    return record_recommendation_feedback(pod, recommendation_id, "ACCEPTED", reason)

def reject_recommendation(pod: Any, recommendation_id: str, reason: str) -> Dict[str, Any]:
    """Marks a recommendation as REJECTED."""
    if not reason:
        raise ValueError("A reason must be provided when rejecting a recommendation.")
    return record_recommendation_feedback(pod, recommendation_id, "REJECTED", reason)

def complete_recommendation(pod: Any, recommendation_id: str, reason: Optional[str] = None) -> Dict[str, Any]:
    """Marks a recommendation as COMPLETED."""
    return record_recommendation_feedback(pod, recommendation_id, "COMPLETED", reason)

def expire_recommendation(pod: Any, recommendation_id: str, reason: str) -> Dict[str, Any]:
    """Marks a recommendation as EXPIRED."""
    return record_recommendation_feedback(pod, recommendation_id, "EXPIRED", reason)

def auto_ignore_recommendations(pod: Any, ignore_after_days: int = 7) -> List[str]:
    """
    Identifies recommendations older than ignore_after_days with no feedback,
    and records them as IGNORED.
    """
    cutoff = (datetime.utcnow() - timedelta(days=ignore_after_days)).isoformat() + "Z"
    
    # Query older recommendations
    query = f"SELECT id, contact_id, new_recommendation, created_at FROM recommendation_history WHERE created_at < '{cutoff}'"
    recs = pod.query(query).to_dict().get("items", [])
    
    ignored_ids = []
    for rec in recs:
        rec_id = rec["id"]
        # Check if feedback already exists for this recommendation_id
        fb_res = pod.query(f"SELECT feedback_action FROM recommendation_feedback WHERE recommendation_id = '{rec_id}'")
        fbs = fb_res.to_dict().get("items", [])
        if not fbs:
            # Create IGNORED feedback
            created_at = datetime.utcnow().isoformat() + "Z"
            pod.table("recommendation_feedback").create({
                "id": str(uuid.uuid4()),
                "recommendation_id": rec_id,
                "contact_id": rec["contact_id"],
                "feedback_action": "IGNORED",
                "feedback_reason": f"No action taken after {ignore_after_days} days.",
                "created_at": created_at
            })
            
            # Record decision event
            pod.table("decision_events").create({
                "id": str(uuid.uuid4()),
                "contact_id": rec["contact_id"],
                "event_type": "RECOMMENDATION_IGNORED",
                "event_source": "recommendation_engine",
                "previous_value": rec["new_recommendation"],
                "new_value": "IGNORED",
                "reason": f"No action taken after {ignore_after_days} days.",
                "evidence": json.dumps([rec_id]),
                "metadata": json.dumps({
                    "recommendation_id": rec_id
                }),
                "created_at": created_at
            })
            ignored_ids.append(rec_id)
            
    return ignored_ids

# --- ANALYTICS CALCULATIONS ---

def calculate_feedback_analytics(pod: Any) -> Dict[str, Any]:
    """
    Calculates acceptance, completion, rejection, and ignore rates,
    average completion time, and per-category success rates.
    """
    # 1. Fetch all recommendations and feedback
    recs = pod.query("SELECT id, new_recommendation, created_at FROM recommendation_history").to_dict().get("items", [])
    fbs = pod.query("SELECT recommendation_id, feedback_action, created_at FROM recommendation_feedback").to_dict().get("items", [])

    total_recs = len(recs)
    if total_recs == 0:
        return {
            "total_recommendations": 0,
            "acceptance_rate": 0.0,
            "completion_rate": 0.0,
            "rejection_rate": 0.0,
            "ignore_rate": 0.0,
            "average_completion_time_seconds": 0.0,
            "success_rate_by_category": {}
        }

    # 2. Map feedback actions to recommendation IDs
    rec_feedback_map: Dict[str, List[Dict[str, Any]]] = {}
    for fb in fbs:
        rec_id = fb["recommendation_id"]
        rec_feedback_map.setdefault(rec_id, []).append(fb)

    # 3. Count outcomes and compute completion times
    accepted_count = 0
    completed_count = 0
    rejected_count = 0
    ignored_count = 0
    
    completion_times = []
    
    # Track stats by category
    category_totals: Dict[str, int] = {}
    category_successes: Dict[str, int] = {}

    for rec in recs:
        rec_id = rec["id"]
        action_text = rec["new_recommendation"]
        category = get_category_from_action(action_text)
        
        category_totals[category] = category_totals.get(category, 0) + 1
        
        feedbacks = rec_feedback_map.get(rec_id, [])
        actions = [fb["feedback_action"] for fb in feedbacks]
        
        # Accepted means the user agreed it was valid (either explicitly accepted or directly completed)
        is_accepted = "ACCEPTED" in actions or "COMPLETED" in actions
        is_completed = "COMPLETED" in actions
        is_rejected = "REJECTED" in actions
        is_ignored = "IGNORED" in actions

        if is_accepted:
            accepted_count += 1
            category_successes[category] = category_successes.get(category, 0) + 1
        if is_completed:
            completed_count += 1
            
            # Calculate time to completion
            comp_fb = next(fb for fb in feedbacks if fb["feedback_action"] == "COMPLETED")
            try:
                # Parse ISO strings
                t_start = datetime.fromisoformat(rec["created_at"].replace("Z", "+00:00"))
                t_end = datetime.fromisoformat(comp_fb["created_at"].replace("Z", "+00:00"))
                duration = (t_end - t_start).total_seconds()
                if duration >= 0:
                    completion_times.append(duration)
            except Exception:
                pass
                
        if is_rejected:
            rejected_count += 1
        if is_ignored:
            ignored_count += 1

    # 4. Compute rates
    acceptance_rate = accepted_count / total_recs
    completion_rate = completed_count / total_recs
    rejection_rate = rejected_count / total_recs
    ignore_rate = ignored_count / total_recs
    
    avg_comp_time = sum(completion_times) / len(completion_times) if completion_times else 0.0

    # 5. Compute category-specific rates
    success_rate_by_category = {}
    for cat in ["FOLLOW_UP", "SEND_DOCUMENT", "SCHEDULE_MEETING", "RESPOND", "WAIT", "REENGAGE", "RESOLVE_BLOCKER", "CLOSE_LOOP", "NO_ACTION"]:
        tot = category_totals.get(cat, 0)
        succ = category_successes.get(cat, 0)
        success_rate_by_category[cat] = succ / tot if tot > 0 else 0.0

    return {
        "total_recommendations": total_recs,
        "acceptance_rate": round(acceptance_rate, 4),
        "completion_rate": round(completion_rate, 4),
        "rejection_rate": round(rejection_rate, 4),
        "ignore_rate": round(ignore_rate, 4),
        "average_completion_time_seconds": round(avg_comp_time, 2),
        "success_rate_by_category": success_rate_by_category
    }
