#input_type_name: CalculateContactPriorityInput
#output_type_name: CalculateContactPriorityResponse
#function_name: calculate_contact_priority_function

import json
import uuid
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, date, timedelta
from lemma_sdk import FunctionContext, Lemma

class CalculateContactPriorityInput(BaseModel):
    contact_id: str
    current_date: Optional[str] = None # format: YYYY-MM-DD

class PriorityReason(BaseModel):
    reason: str
    points: int

class CalculateContactPriorityResponse(BaseModel):
    contact_id: str
    raw_score: int
    weighted_score: int
    tier: str
    attention_level: str
    reasons: List[PriorityReason]
    priority_changed: bool
    history_recorded: bool

# --- Extensible Score Provider Framework ---

class ScoreProvider:
    def calculate_score(self, contact: dict, commitments: list, interactions: list, milestones: list, curr_date: date) -> List[PriorityReason]:
        raise NotImplementedError()

class CommitmentScoreProvider(ScoreProvider):
    def calculate_score(self, contact: dict, commitments: list, interactions: list, milestones: list, curr_date: date) -> List[PriorityReason]:
        reasons = []
        # Checks open founder-owned commitments
        for c in commitments:
            if c.get("status") == "open" and c.get("owner") == "founder":
                due_date_str = c.get("due_date")
                if due_date_str:
                    try:
                        due_date = datetime.strptime(due_date_str[:10], "%Y-%m-%d").date()
                        if due_date < curr_date:
                            reasons.append(PriorityReason(
                                reason=f"Founder commitment overdue: '{c.get('description')}'",
                                points=50
                            ))
                        elif 0 <= (due_date - curr_date).days <= 2:
                            reasons.append(PriorityReason(
                                reason=f"Founder commitment due within 48h: '{c.get('description')}'",
                                points=30
                            ))
                    except ValueError:
                        pass
        return reasons

class StateScoreProvider(ScoreProvider):
    def calculate_score(self, contact: dict, commitments: list, interactions: list, milestones: list, curr_date: date) -> List[PriorityReason]:
        reasons = []
        state = contact.get("relationship_state")
        if state == "waiting_on_me":
            reasons.append(PriorityReason(
                reason="Relationship state: waiting_on_me",
                points=20
            ))
        return reasons

class ActivityScoreProvider(ScoreProvider):
    def calculate_score(self, contact: dict, commitments: list, interactions: list, milestones: list, curr_date: date) -> List[PriorityReason]:
        reasons = []
        
        # 1. Expected Touch Date Overdue: +2/day (cap at +20)
        expected_touch_str = contact.get("expected_next_touch_date")
        if expected_touch_str:
            try:
                expected_touch = datetime.strptime(expected_touch_str[:10], "%Y-%m-%d").date()
                if curr_date > expected_touch:
                    days_overdue = (curr_date - expected_touch).days
                    points = min(20, days_overdue * 2)
                    reasons.append(PriorityReason(
                        reason=f"Expected next touch date overdue by {days_overdue} days",
                        points=points
                    ))
            except ValueError:
                pass
                
        # 2. Mutual Exploration Inactive > 14 days: +15
        state = contact.get("relationship_state")
        if state == "mutual_exploration":
            last_interaction_date = None
            if interactions:
                occ_at = interactions[0].get("occurred_at")
                if occ_at:
                    try:
                        last_interaction_date = datetime.fromisoformat(occ_at.replace("Z", "+00:00")).date()
                    except ValueError:
                        pass
            if last_interaction_date:
                days_inactive = (curr_date - last_interaction_date).days
                if days_inactive > 14:
                    reasons.append(PriorityReason(
                        reason=f"Mutual exploration inactive for {days_inactive} days (>14 days)",
                        points=15
                    ))
                    
        return reasons

class MilestoneScoreProvider(ScoreProvider):
    """Demonstrates extensibility: boosts priority slightly if an important milestone occurred recently."""
    def calculate_score(self, contact: dict, commitments: list, interactions: list, milestones: list, curr_date: date) -> List[PriorityReason]:
        reasons = []
        for m in milestones:
            score = int(m.get("importance_score") or 0)
            occ_at_str = m.get("occurred_at")
            if score >= 80 and occ_at_str:
                try:
                    occ_date = datetime.fromisoformat(occ_at_str.replace("Z", "+00:00")).date()
                    # within last 7 days
                    if 0 <= (curr_date - occ_date).days <= 7:
                        reasons.append(PriorityReason(
                            reason=f"High-value milestone in the last 7 days: '{m.get('summary')}'",
                            points=10
                        ))
                        # Limit to one milestone boost
                        break
                except ValueError:
                    pass
        return reasons

# --- Function Implementation ---

async def calculate_contact_priority_function(ctx: FunctionContext, data: CalculateContactPriorityInput) -> CalculateContactPriorityResponse:
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
        
    # 3. Fetch commitments, interactions, milestones
    comms_query = f"SELECT id, description, owner, status, due_date FROM commitments WHERE contact_id = '{contact_id}'"
    comms_res = pod.query(comms_query)
    commitments = comms_res.to_dict().get("items", [])
    
    ints_query = f"SELECT id, type, occurred_at FROM interactions WHERE contact_id = '{contact_id}'"
    ints_res = pod.query(ints_query)
    interactions = ints_res.to_dict().get("items", [])
    interactions.sort(key=lambda x: x.get("occurred_at", ""), reverse=True)
    
    milestones_query = f"SELECT id, summary, importance_score, occurred_at FROM relationship_milestones WHERE contact_id = '{contact_id}'"
    milestones_res = pod.query(milestones_query)
    milestones = milestones_res.to_dict().get("items", [])

    # 4. Run Score Providers
    providers = [
        CommitmentScoreProvider(),
        StateScoreProvider(),
        ActivityScoreProvider(),
        MilestoneScoreProvider()
    ]
    
    reasons: List[PriorityReason] = []
    for provider in providers:
        reasons.extend(provider.calculate_score(contact, commitments, interactions, milestones, curr_date))
        
    raw_score = sum(r.points for r in reasons)
    
    # Apply Tier Multipliers
    tier = contact.get("tier") or "B"
    multiplier = 1.0
    if tier == "A":
        multiplier = 1.5
    elif tier == "C":
        multiplier = 0.4
        
    weighted_score = int(round(raw_score * multiplier))
    weighted_score = min(100, max(0, weighted_score))
    
    # Map Attention Level
    attention_level = "LOW"
    if weighted_score >= 80:
        attention_level = "CRITICAL"
    elif weighted_score >= 60:
        attention_level = "HIGH"
    elif weighted_score >= 30:
        attention_level = "MEDIUM"

    # Fetch last priority history
    history_query = f"SELECT id, new_score FROM priority_history WHERE contact_id = '{contact_id}' ORDER BY changed_at DESC"
    history_res = pod.query(history_query)
    history_records = history_res.to_dict().get("items", [])
    
    # 5. Check if change is material
    material_change = False
    old_score = 0
    
    if not history_records:
        if weighted_score > 0:
            material_change = True
    else:
        last_record = history_records[0]
        old_score = int(last_record.get("new_score") or 0)
        
        # Check absolute score difference > 5
        score_diff = abs(weighted_score - old_score)
        if score_diff > 5:
            material_change = True
            
        # Check attention level changes by checking thresholds
        def get_level(score: int) -> str:
            if score >= 80: return "CRITICAL"
            if score >= 60: return "HIGH"
            if score >= 30: return "MEDIUM"
            return "LOW"
            
        if get_level(weighted_score) != get_level(old_score):
            material_change = True
            
    # Serialize reasons to JSON format for contacts table update
    reasons_list_dict = [r.model_dump() for r in reasons]
    
    # Update Contacts
    pod.table("contacts").update(contact_id, {
        "priority_score": weighted_score,
        "priority_reasons": json.dumps(reasons_list_dict),
        "attention_level": attention_level
    })
    
    history_recorded = False
    if material_change:
        pod.table("priority_history").create({
            "id": str(uuid.uuid4()),
            "contact_id": contact_id,
            "old_score": old_score,
            "new_score": weighted_score,
            "reasons": json.dumps(reasons_list_dict),
            "changed_at": datetime.utcnow().isoformat() + "Z"
        })
        history_recorded = True
        
    return CalculateContactPriorityResponse(
        contact_id=contact_id,
        raw_score=raw_score,
        weighted_score=weighted_score,
        tier=tier,
        attention_level=attention_level,
        reasons=reasons,
        priority_changed=material_change,
        history_recorded=history_recorded
    )
