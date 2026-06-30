from datetime import datetime, date
from typing import Dict, List, Any

def calculate_contact_priority(
    contact: Dict[str, Any],
    commitments: List[Dict[str, Any]],
    current_date: date = None
) -> Dict[str, Any]:
    """
    Calculates contact priority score and explainability reasons deterministically.
    
    Rules:
    - Founder Commitment Overdue (confidence >= 70%): +50
    - Founder Commitment Due within 48 hours: +30
    - Relationship State is 'waiting_on_me': +20
    - Expected touch date overdue: +2 per day (capped at +20), freezes after 30 days of inactivity
    - Inactive mutual exploration > 14 days: +15
    - Tier Multipliers: A = 1.5, B = 1.0, C = 0.4
    - Overrides: Muted = 0, Pinned = 100
    """
    if current_date is None:
        current_date = date.today()

    score = 0
    reasons = []

    # 1. Overrides Check (Muted / Pinned)
    if contact.get("is_muted"):
        return {"score": 0, "reasons": ["Contact is muted by founder"]}
    if contact.get("is_pinned"):
        return {"score": 100, "reasons": ["Contact is pinned to top by founder"]}

    # 2. Commitment Heuristics
    has_overdue = False
    has_near_due = False

    for c in commitments:
        if c.get("status") != "open":
            continue
        
        # Only evaluate commitments owned by the founder with high confidence
        if c.get("owner") == "founder" and c.get("confidence", 100) >= 70:
            due_date = c.get("due_date")
            if due_date:
                if isinstance(due_date, str):
                    try:
                        due_date = datetime.strptime(due_date[:10], "%Y-%m-%d").date()
                    except ValueError:
                        continue
                elif isinstance(due_date, datetime):
                    due_date = due_date.date()
                
                days_left = (due_date - current_date).days
                if days_left < 0:
                    has_overdue = True
                elif 0 <= days_left <= 2:
                    has_near_due = True

    if has_overdue:
        score += 50
        reasons.append("+50: Overdue promise to contact (confidence >= 70%)")
    elif has_near_due:
        score += 30
        reasons.append("+30: Promise due to contact within 48 hours")

    # 3. State-based Heuristics
    state = contact.get("relationship_state", "mutual_exploration")
    if state == "waiting_on_me":
        score += 20
        reasons.append("+20: Attention state is 'Waiting on Me'")

    # 4. Expected Touch Date & Zombie Activity Caps
    expected_touch = contact.get("expected_next_touch_date")
    last_interaction_dt = contact.get("last_interaction")
    
    if expected_touch:
        if isinstance(expected_touch, str):
            try:
                expected_touch = datetime.strptime(expected_touch[:10], "%Y-%m-%d").date()
            except ValueError:
                expected_touch = None
        elif isinstance(expected_touch, datetime):
            expected_touch = expected_touch.date()

        if expected_touch:
            days_overdue = (current_date - expected_touch).days
            if days_overdue > 0:
                # Check for Zombie Cap: Freeze/exclude if inactive for > 30 days past expected touch
                if days_overdue > 30:
                    added_points = 20
                    reasons.append(f"+{added_points}: Expected touchpoint is overdue (>30 days - inactive cap applied)")
                else:
                    added_points = min(20, days_overdue * 2)
                    reasons.append(f"+{added_points}: Expected touchpoint is {days_overdue} days overdue")
                score += added_points

    # 5. Inactive Mutual Exploration
    if state == "mutual_exploration" and last_interaction_dt:
        if isinstance(last_interaction_dt, str):
            try:
                # Handle isoformat with possible 'Z' or timezone offset
                dt_str = last_interaction_dt.replace("Z", "+00:00")
                last_interaction_dt = datetime.fromisoformat(dt_str)
            except ValueError:
                last_interaction_dt = None
        
        if last_interaction_dt:
            if isinstance(last_interaction_dt, datetime):
                last_interaction_date = last_interaction_dt.date()
            else:
                last_interaction_date = last_interaction_dt

            days_inactive = (current_date - last_interaction_date).days
            if days_inactive > 14:
                score += 15
                reasons.append(f"+15: Active relationship with no touch for {days_inactive} days")

    # 6. Apply Tier Multipliers
    tier = contact.get("tier", "B")
    multiplier = 1.0
    if tier == "A":
        multiplier = 1.5
    elif tier == "C":
        multiplier = 0.4

    score = int(score * multiplier)
    if multiplier != 1.0:
        reasons.append(f"Applied Relationship Tier {tier} multiplier (x{multiplier})")

    # Cap final score
    score = min(100, max(0, score))

    return {
        "score": score,
        "reasons": reasons
    }
