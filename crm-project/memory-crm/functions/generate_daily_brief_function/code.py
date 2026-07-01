#input_type_name: GenerateDailyBriefInput
#output_type_name: GenerateDailyBriefResponse
#function_name: generate_daily_brief_function

import json
import uuid
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from lemma_sdk import FunctionContext, Lemma

class GenerateDailyBriefInput(BaseModel):
    current_date: Optional[str] = None

class ContactBrief(BaseModel):
    contact_id: str
    name: str
    company: str
    relationship_state: str
    priority_score: int
    attention_level: str
    recommended_action: Optional[str]

class CommitmentBrief(BaseModel):
    commitment_id: str
    contact_name: str
    description: str
    owner: str
    health: str
    effective_due_date: str
    risk_score: int

class DailyBriefObject(BaseModel):
    urgent_actions: List[ContactBrief]
    overdue_commitments: List[CommitmentBrief]
    waiting_on_me: List[ContactBrief]
    cooling_relationships: List[ContactBrief]
    reengagement_candidates: List[ContactBrief]
    recommended_actions: List[ContactBrief]

class GenerateDailyBriefResponse(BaseModel):
    brief_date: str
    summary_text: str
    daily_brief: DailyBriefObject
    snapshot: Dict[str, Any]

async def generate_daily_brief_function(ctx: FunctionContext, data: GenerateDailyBriefInput) -> GenerateDailyBriefResponse:
    client = Lemma()
    pod = client.pod(str(ctx.pod_id))
    
    # 1. Parse current date
    if data.current_date:
        try:
            curr_date = datetime.strptime(data.current_date[:10], "%Y-%m-%d").date()
        except ValueError:
            curr_date = datetime.utcnow().date()
    else:
        curr_date = datetime.utcnow().date()
        
    curr_date_str = curr_date.isoformat()
    
    # 2. Fetch all contacts
    contacts_res = pod.query("SELECT id, name, who_are_they, relationship_state, priority_score, attention_level, recommended_action FROM contacts")
    contacts = contacts_res.to_dict().get("items", [])
    
    contacts_map = {c["id"]: c for c in contacts}
    
    # 3. Fetch all open commitments
    comms_res = pod.query("SELECT id, contact_id, owner, description, status, due_date FROM commitments WHERE status = 'open'")
    open_commitments = comms_res.to_dict().get("items", [])
    
    # 4. Fetch all open loop health records
    health_res = pod.query("SELECT commitment_id, health, risk_score, risk_reasons, effective_due_date FROM open_loop_health")
    health_records = health_res.to_dict().get("items", [])
    
    health_map = {h["commitment_id"]: h for h in health_records}
    
    # 5. Build sub-lists
    urgent_actions = []
    waiting_on_me = []
    cooling_relationships = []
    reengagement_candidates = []
    recommended_actions = []
    
    for c in contacts:
        c_id = c["id"]
        who_are_they = c.get("who_are_they") or ""
        company = who_are_they.split(" at ")[1] if " at " in who_are_they else ""
        c_brief = ContactBrief(
            contact_id=c_id,
            name=c.get("name") or "Unknown",
            company=company,
            relationship_state=c.get("relationship_state") or "mutual_exploration",
            priority_score=int(c.get("priority_score") or 0),
            attention_level=c.get("attention_level") or "LOW",
            recommended_action=c.get("recommended_action")
        )
        
        # A: Urgent Actions (priority score >= 60 or Attention CRITICAL/HIGH)
        if c_brief.priority_score >= 60 or c_brief.attention_level in ["CRITICAL", "HIGH"]:
            urgent_actions.append(c_brief)
            
        # B: Waiting on Me
        if c_brief.relationship_state == "waiting_on_me":
            waiting_on_me.append(c_brief)
            
        # C: Cooling Relationships
        if c_brief.relationship_state in ["cooling", "reengagement_candidate"]:
            cooling_relationships.append(c_brief)
            
        # D: Re-engagement Candidates
        if c_brief.relationship_state == "reengagement_candidate":
            reengagement_candidates.append(c_brief)
            
        # E: Recommended Actions
        if c_brief.recommended_action and c_brief.recommended_action != "No action required":
            recommended_actions.append(c_brief)
            
    # Sort lists by priority score descending
    urgent_actions.sort(key=lambda x: x.priority_score, reverse=True)
    waiting_on_me.sort(key=lambda x: x.priority_score, reverse=True)
    cooling_relationships.sort(key=lambda x: x.priority_score, reverse=True)
    reengagement_candidates.sort(key=lambda x: x.priority_score, reverse=True)
    recommended_actions.sort(key=lambda x: x.priority_score, reverse=True)
    
    # Compile commitments health list
    overdue_commitments = []
    for comm in open_commitments:
        c_id = comm["id"]
        contact_id = comm["contact_id"]
        c_info = contacts_map.get(contact_id, {})
        contact_name = c_info.get("name") or "Unknown"
        
        health_info = health_map.get(c_id, {})
        health_status = health_info.get("health") or "HEALTHY"
        effective_due = health_info.get("effective_due_date") or comm.get("due_date") or curr_date_str
        risk_score = int(health_info.get("risk_score") or 0)
        
        c_brief = CommitmentBrief(
            commitment_id=c_id,
            contact_name=contact_name,
            description=comm.get("description") or "",
            owner=comm.get("owner") or "founder",
            health=health_status,
            effective_due_date=effective_due,
            risk_score=risk_score
        )
        
        if health_status in ["OVERDUE", "ABANDONED"]:
            overdue_commitments.append(c_brief)
            
    overdue_commitments.sort(key=lambda x: x.risk_score, reverse=True)
    
    # 6. Generate Deterministic Brief Summary String
    summary_text = (
        f"Today:\n"
        f"* {len(overdue_commitments)} commitments overdue / abandoned\n"
        f"* {len(waiting_on_me)} relationships waiting on you\n"
        f"* {len(cooling_relationships)} relationships cooling down\n"
        f"* {len(reengagement_candidates)} re-engagement opportunities detected"
    )
    
    # 7. Construct response payloads
    daily_brief = DailyBriefObject(
        urgent_actions=urgent_actions,
        overdue_commitments=overdue_commitments,
        waiting_on_me=waiting_on_me,
        cooling_relationships=cooling_relationships,
        reengagement_candidates=reengagement_candidates,
        recommended_actions=recommended_actions
    )
    
    snapshot_json = {
        "snapshot_date": curr_date_str,
        "metrics": {
            "urgent_count": len(urgent_actions),
            "overdue_count": len(overdue_commitments),
            "waiting_count": len(waiting_on_me),
            "cooling_count": len(cooling_relationships),
            "reengage_count": len(reengagement_candidates)
        },
        "summary": summary_text
    }
    
    # 8. Save/Overwrite daily_briefs
    created_at_str = datetime.utcnow().isoformat() + "Z"
    
    briefs_check = pod.query(f"SELECT id FROM daily_briefs WHERE brief_date = '{curr_date_str}'")
    brief_records = briefs_check.to_dict().get("items", [])
    
    if brief_records:
        record_id = brief_records[0]["id"]
        pod.table("daily_briefs").update(record_id, {
            "summary_text": summary_text,
            "brief_json": daily_brief.json(),
            "created_at": created_at_str
        })
    else:
        pod.table("daily_briefs").create({
            "id": str(uuid.uuid4()),
            "brief_date": curr_date_str,
            "summary_text": summary_text,
            "brief_json": daily_brief.json(),
            "created_at": created_at_str
        })
        
    # 9. Save/Overwrite command_center_snapshots
    snap_check = pod.query(f"SELECT id FROM command_center_snapshots WHERE snapshot_date = '{curr_date_str}'")
    snap_records = snap_check.to_dict().get("items", [])
    
    if snap_records:
        record_id = snap_records[0]["id"]
        pod.table("command_center_snapshots").update(record_id, {
            "snapshot_json": json.dumps(snapshot_json),
            "created_at": created_at_str
        })
    else:
        pod.table("command_center_snapshots").create({
            "id": str(uuid.uuid4()),
            "snapshot_date": curr_date_str,
            "snapshot_json": json.dumps(snapshot_json),
            "created_at": created_at_str
        })
        
    return GenerateDailyBriefResponse(
        brief_date=curr_date_str,
        summary_text=summary_text,
        daily_brief=daily_brief,
        snapshot=snapshot_json
    )
