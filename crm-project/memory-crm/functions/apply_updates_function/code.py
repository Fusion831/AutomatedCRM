import json
import uuid
from datetime import datetime, date
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from lemma_sdk import FunctionContext, Lemma

class MemoryUpdates(BaseModel):
    new_identity_facts: List[str] = []
    new_drivers: List[str] = []
    new_objections: List[str] = []
    memory_confidence: Dict[str, float] = {}

class MilestoneItem(BaseModel):
    summary: str
    milestone_type: str
    importance_score: int
    evidence_quote: str

class CommitmentItem(BaseModel):
    owner: str
    description: str
    confidence: int
    due_date: Optional[str] = None
    evidence_quote: str

class ReconciliationItem(BaseModel):
    commitment_id: str
    reason: str
    evidence_quote: str

class ExtractedData(BaseModel):
    memory_updates: MemoryUpdates
    milestones: List[MilestoneItem] = []
    commitments: List[CommitmentItem] = []
    reconciliations: List[ReconciliationItem] = []

class AcceptedReconciliation(BaseModel):
    commitment_id: str
    reason: str
    evidence_quote: str
    reconciliation_timestamp: str

class RejectedReconciliation(BaseModel):
    commitment_id: str
    reason: str
    evidence_quote: str
    rejection_reason: str

class ReconciliationResult(BaseModel):
    accepted: List[AcceptedReconciliation] = []
    rejected: List[RejectedReconciliation] = []
    audit_entries: List[str] = []

class ApplyUpdatesInput(BaseModel):
    contact_id: str
    interaction_id: str
    extraction_result: ExtractedData
    reconciliation_result: ReconciliationResult

class ApplyUpdatesOutput(BaseModel):
    status: str
    updated_fields: List[str]
    priority_score: int

def calculate_contact_priority(
    contact: Dict[str, Any],
    commitments: List[Dict[str, Any]],
    current_date: date = None
) -> Dict[str, Any]:
    """Calculates contact priority score and explainability reasons deterministically."""
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

    score = min(100, max(0, score))
    return {
        "score": score,
        "reasons": reasons
    }

async def apply_updates_function(ctx: FunctionContext, data: ApplyUpdatesInput) -> ApplyUpdatesOutput:
    client = Lemma()
    pod = client.pod(str(ctx.pod_id))
    
    contact_id = data.contact_id
    interaction_id = data.interaction_id
    ext = data.extraction_result
    
    # 1. Fetch Contact
    contact = pod.table("contacts").get(contact_id)
    
    # Helper to parse list/JSON fields safely
    def get_list_field(field_name: str) -> List[str]:
        val = contact.get(field_name) or []
        if isinstance(val, str):
            try:
                return json.loads(val)
            except Exception:
                return [val]
        return list(val)
        
    who_are_they = contact.get("who_are_they") or ""
    why_talking = contact.get("why_talking") or ""
    key_drivers = get_list_field("key_drivers")
    objections = get_list_field("objections")
    
    # Merge new identity facts into who_are_they
    for fact in ext.memory_updates.new_identity_facts:
        if fact not in who_are_they:
            if who_are_they:
                who_are_they += f" {fact}"
            else:
                who_are_they = fact
                
    # Merge key drivers & objections (case-insensitive deduplication)
    for driver in ext.memory_updates.new_drivers:
        if not any(d.lower() == driver.lower() for d in key_drivers):
            key_drivers.append(driver)
            
    for obj in ext.memory_updates.new_objections:
        if not any(o.lower() == obj.lower() for o in objections):
            objections.append(obj)
            
    # 2. Insert milestones
    for mile in ext.milestones:
        pod.table("relationship_milestones").create({
            "id": str(uuid.uuid4()),
            "contact_id": contact_id,
            "interaction_id": interaction_id,
            "summary": mile.summary,
            "milestone_type": mile.milestone_type,
            "importance_score": mile.importance_score,
            "evidence_quote": mile.evidence_quote,
            "created_at": datetime.utcnow().isoformat() + "Z"
        })
        
    # 3. Insert commitments
    for comm in ext.commitments:
        pod.table("commitments").create({
            "id": str(uuid.uuid4()),
            "contact_id": contact_id,
            "interaction_id": interaction_id,
            "owner": comm.owner,
            "description": comm.description,
            "confidence": comm.confidence,
            "status": "open",
            "due_date": comm.due_date,
            "evidence_quote": comm.evidence_quote,
            "created_at": datetime.utcnow().isoformat() + "Z"
        })
        
    # 4. Reconcile open commitments (only accepted ones)
    for recon in data.reconciliation_result.accepted:
        try:
            pod.table("commitments").update(recon.commitment_id, {
                "status": "completed",
                "completed_at": recon.reconciliation_timestamp,
                "reconciliation_reason": recon.reason,
                "reconciliation_evidence": recon.evidence_quote
            })
        except Exception:
            # Skip if record doesn't exist
            pass
            
    for rej in data.reconciliation_result.rejected:
        print(f"Audit Log: Rejected reconciliation for commitment {rej.commitment_id}. Reason: {rej.rejection_reason}")
            
    # 5. Calculate Priority
    # Get all current commitments to pass to priority calculator
    comm_query = f"SELECT status, owner, confidence, due_date FROM commitments WHERE contact_id = '{contact_id}'"
    comm_res = pod.query(comm_query)
    current_commitments = comm_res.to_dict().get("items", [])
    
    # Update temporary contact dict for calculation
    calc_contact = dict(contact)
    calc_contact["who_are_they"] = who_are_they
    calc_contact["why_talking"] = why_talking
    calc_contact["key_drivers"] = key_drivers
    calc_contact["objections"] = objections
    
    priority_res = calculate_contact_priority(calc_contact, current_commitments)
    
    # Save back to Contacts
    pod.table("contacts").update(contact_id, {
        "who_are_they": who_are_they,
        "key_drivers": key_drivers,
        "objections": objections,
        "priority_score": priority_res["score"],
        "priority_reasons": priority_res["reasons"]
    })
    
    return ApplyUpdatesOutput(
        status="success",
        updated_fields=["who_are_they", "key_drivers", "objections", "priority_score", "priority_reasons"],
        priority_score=priority_res["score"]
    )
