#input_type_name: EvaluateOpenLoopsInput
#output_type_name: EvaluateOpenLoopsResponse
#function_name: evaluate_open_loops_function

import json
import uuid
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, date, timedelta
from lemma_sdk import FunctionContext, Lemma

class EvaluateOpenLoopsInput(BaseModel):
    contact_id: Optional[str] = None
    current_date: Optional[str] = None

class EvaluatedCommitment(BaseModel):
    commitment_id: str
    health: str
    risk_score: int
    reasons: List[str]
    effective_due_date: str

class EvaluateOpenLoopsResponse(BaseModel):
    evaluated_count: int
    commitments: List[EvaluatedCommitment]

async def evaluate_open_loops_function(ctx: FunctionContext, data: EvaluateOpenLoopsInput) -> EvaluateOpenLoopsResponse:
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
        
    # 2. Fetch Open Commitments
    if data.contact_id:
        comms_query = f"SELECT id, contact_id, interaction_id, owner, description, status, due_date FROM commitments WHERE contact_id = '{data.contact_id}' AND status = 'open'"
    else:
        comms_query = "SELECT id, contact_id, interaction_id, owner, description, status, due_date FROM commitments WHERE status = 'open'"
        
    comms_res = pod.query(comms_query)
    open_commitments = comms_res.to_dict().get("items", [])
    
    evaluated_list = []
    
    # Cache contacts to avoid redundant queries
    contact_cache = {}
    
    for comm in open_commitments:
        comm_id = comm["id"]
        contact_id = comm["contact_id"]
        
        # Fetch contact details
        if contact_id not in contact_cache:
            c = pod.table("contacts").get(contact_id)
            if c:
                contact_cache[contact_id] = c
                
        contact = contact_cache.get(contact_id)
        if not contact:
            continue
            
        # Fetch interaction details to get capture timestamp
        int_id = comm["interaction_id"]
        int_res = pod.query(f"SELECT occurred_at FROM interactions WHERE id = '{int_id}'")
        int_items = int_res.to_dict().get("items", [])
        
        occurred_date = curr_date - timedelta(days=1) # default fallback
        if int_items:
            occ_at = int_items[0].get("occurred_at")
            if occ_at:
                try:
                    occurred_date = datetime.fromisoformat(occ_at.replace("Z", "+00:00")).date()
                except ValueError:
                    pass
                    
        # 3. Determine Effective Due Date (explicit vs. SLA)
        explicit_due = comm.get("due_date")
        if explicit_due:
            try:
                effective_due = datetime.strptime(explicit_due[:10], "%Y-%m-%d").date()
            except ValueError:
                # SLA fallback on invalid date parse
                effective_due = None
        else:
            effective_due = None
            
        if not effective_due:
            tier = contact.get("tier") or "B"
            if tier == "A":
                effective_due = occurred_date + timedelta(days=7)
            elif tier == "C":
                effective_due = occurred_date + timedelta(days=30)
            else: # Tier B fallback
                effective_due = occurred_date + timedelta(days=14)
                
        # 4. Determine Health
        days_diff = (effective_due - curr_date).days
        health = "HEALTHY"
        
        if days_diff < 0:
            # Overdue
            if abs(days_diff) > 30:
                health = "ABANDONED"
            else:
                health = "OVERDUE"
        elif days_diff <= 2:
            health = "AT_RISK"
            
        # 5. Calculate Risk Score and Reasons
        risk = 0
        reasons = []
        
        # A: Owner weights
        owner = comm.get("owner")
        if owner == "founder":
            risk += 30
            reasons.append("Founder commitment owner (+30)")
        elif owner == "shared":
            risk += 15
            reasons.append("Shared commitment owner (+15)")
        else:
            risk += 5
            reasons.append("Contact commitment owner (+5)")
            
        # B: Due/health status weights
        if health == "OVERDUE":
            risk += 40
            reasons.append("Commitment is overdue (+40)")
        elif health == "ABANDONED":
            risk += 50
            reasons.append("Commitment is abandoned / highly overdue (+50)")
        elif health == "AT_RISK":
            risk += 20
            reasons.append("Commitment is due within 48 hours (+20)")
            
        # C: Contact Tier weights
        tier = contact.get("tier") or "B"
        if tier == "A":
            risk += 30
            reasons.append("High-value Tier A contact (+30)")
        elif tier == "B":
            risk += 15
            reasons.append("Medium-value Tier B contact (+15)")
            
        # D: Priority score influence (20% of priority)
        p_score = int(contact.get("priority_score") or 0)
        p_contrib = int(p_score * 0.2)
        if p_contrib > 0:
            risk += p_contrib
            reasons.append(f"Contact priority score weight (+{p_contrib})")
            
        # E: State considerations
        state = contact.get("relationship_state")
        if state == "blocked":
            risk += 15
            reasons.append("Relationship state is blocked (+15)")
        elif state == "waiting_on_me":
            risk += 10
            reasons.append("Waiting on founder response state (+10)")
            
        # Cap risk score
        risk = max(0, min(100, risk))
        
        # 6. Save back to open_loop_health table
        health_query = f"SELECT id FROM open_loop_health WHERE commitment_id = '{comm_id}'"
        health_res = pod.query(health_query)
        health_records = health_res.to_dict().get("items", [])
        
        updated_at_str = datetime.utcnow().isoformat() + "Z"
        effective_due_str = effective_due.isoformat()
        
        if health_records:
            record_id = health_records[0]["id"]
            pod.table("open_loop_health").update(record_id, {
                "health": health,
                "risk_score": risk,
                "risk_reasons": json.dumps(reasons),
                "effective_due_date": effective_due_str,
                "updated_at": updated_at_str
            })
        else:
            pod.table("open_loop_health").create({
                "id": str(uuid.uuid4()),
                "commitment_id": comm_id,
                "health": health,
                "risk_score": risk,
                "risk_reasons": json.dumps(reasons),
                "effective_due_date": effective_due_str,
                "updated_at": updated_at_str
            })
            
        evaluated_list.append(EvaluatedCommitment(
            commitment_id=comm_id,
            health=health,
            risk_score=risk,
            reasons=reasons,
            effective_due_date=effective_due_str
        ))
        
    return EvaluateOpenLoopsResponse(
        evaluated_count=len(evaluated_list),
        commitments=evaluated_list
    )
