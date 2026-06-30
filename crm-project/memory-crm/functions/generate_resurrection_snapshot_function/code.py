#input_type_name: GenerateResurrectionSnapshotInput
#output_type_name: GenerateResurrectionSnapshotResponse
#function_name: generate_resurrection_snapshot_function

import json
import uuid
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from lemma_sdk import FunctionContext, Lemma

class GenerateResurrectionSnapshotInput(BaseModel):
    contact_id: str
    force_refresh: bool = False
    current_date: Optional[str] = None

class KeyMoment(BaseModel):
    summary: str
    importance_score: int
    evidence: str

class OpenLoop(BaseModel):
    description: str
    owner: str
    evidence: str

class ResurrectionSnapshot(BaseModel):
    relationship_summary: str
    relationship_thesis: str
    key_moments: List[KeyMoment]
    current_blockers: List[str]
    open_loops: List[OpenLoop]
    why_momentum_stopped: str
    recommended_reentry_strategy: str
    evidence: List[str]

class GenerateResurrectionSnapshotResponse(BaseModel):
    contact_id: str
    snapshot: ResurrectionSnapshot
    confidence: int
    generated_at: str
    cache_hit: bool

async def generate_resurrection_snapshot_function(ctx: FunctionContext, data: GenerateResurrectionSnapshotInput) -> GenerateResurrectionSnapshotResponse:
    client = Lemma()
    pod = client.pod(str(ctx.pod_id))
    
    contact_id = data.contact_id
    
    # 1. Fetch Contact
    contact = pod.table("contacts").get(contact_id)
    if not contact:
        raise ValueError(f"Contact {contact_id} not found")
        
    # 2. Fetch recent interactions to compare timestamps for cache freshness
    ints_query = f"SELECT id, type, summary, occurred_at FROM interactions WHERE contact_id = '{contact_id}'"
    ints_res = pod.query(ints_query)
    interactions = ints_res.to_dict().get("items", [])
    interactions.sort(key=lambda x: x.get("occurred_at", ""), reverse=True)
    
    latest_interaction_time = None
    if interactions:
        occ = interactions[0].get("occurred_at")
        if occ:
            try:
                latest_interaction_time = datetime.fromisoformat(occ.replace("Z", "+00:00"))
            except ValueError:
                pass
                
    # 3. Check Cache
    cache_query = f"SELECT id, snapshot, confidence, generated_at FROM resurrection_snapshots WHERE contact_id = '{contact_id}'"
    cache_res = pod.query(cache_query)
    cache_records = cache_res.to_dict().get("items", [])
    
    cached_snapshot = None
    if cache_records and not data.force_refresh:
        rec = cache_records[0]
        gen_at_str = rec.get("generated_at")
        if gen_at_str:
            try:
                gen_at = datetime.fromisoformat(gen_at_str.replace("Z", "+00:00"))
                # If cached after latest interaction, it is valid!
                if not latest_interaction_time or gen_at >= latest_interaction_time:
                    cached_snapshot = rec
            except ValueError:
                pass
                
    if cached_snapshot:
        snap_data = json.loads(cached_snapshot["snapshot"])
        return GenerateResurrectionSnapshotResponse(
            contact_id=contact_id,
            snapshot=ResurrectionSnapshot(**snap_data),
            confidence=int(cached_snapshot.get("confidence", 0)),
            generated_at=cached_snapshot.get("generated_at"),
            cache_hit=True
        )
        
    # Cache miss - compile input and call LLM agent
    # 4. Fetch commitments and milestones
    comms_query = f"SELECT id, description, owner, status, due_date, evidence_quote FROM commitments WHERE contact_id = '{contact_id}'"
    comms_res = pod.query(comms_query)
    all_commitments = comms_res.to_dict().get("items", [])
    open_commitments = [c for c in all_commitments if c.get("status") == "open"]
    
    milestones_query = f"SELECT id, summary, importance_score, evidence_quote, occurred_at FROM relationship_milestones WHERE contact_id = '{contact_id}'"
    milestones_res = pod.query(milestones_query)
    milestones = milestones_res.to_dict().get("items", [])
    
    # Parse priority reasons
    priority_reasons_raw = contact.get("priority_reasons") or "[]"
    try:
        priority_reasons = json.loads(priority_reasons_raw)
    except Exception:
        priority_reasons = []
        
    # Build recommendation object
    rec_reasoning = []
    rec_reasoning_raw = contact.get("recommendation_reasoning") or "[]"
    try:
        rec_reasoning = json.loads(rec_reasoning_raw)
    except Exception:
        pass
        
    rec_evidence = []
    rec_evidence_raw = contact.get("recommendation_evidence") or "[]"
    try:
        rec_evidence = json.loads(rec_evidence_raw)
    except Exception:
        pass
        
    recommendation = {
        "action": contact.get("recommended_action") or "No action",
        "category": contact.get("recommendation_category") or "NO_ACTION",
        "urgency": contact.get("recommendation_urgency") or "LOW",
        "reasoning": rec_reasoning,
        "evidence": rec_evidence
    }
    
    # Parse key drivers & objections list
    key_drivers = contact.get("key_drivers") or []
    if isinstance(key_drivers, str):
        try:
            key_drivers = json.loads(key_drivers)
        except Exception:
            key_drivers = [key_drivers] if key_drivers else []
            
    objections = contact.get("objections") or []
    if isinstance(objections, str):
        try:
            objections = json.loads(objections)
        except Exception:
            objections = [objections] if objections else []

    # Compile contact details
    contact_details = {
        "name": contact.get("name"),
        "company": contact.get("company") or "",
        "who_are_they": contact.get("who_are_they") or "",
        "why_talking": contact.get("why_talking") or "",
        "key_drivers": key_drivers,
        "objections": objections
    }
    
    # 5. Call Resurrection Agent
    agent_input = {
        "contact": contact_details,
        "relationship_state": contact.get("relationship_state") or "mutual_exploration",
        "priority_score": int(contact.get("priority_score") or 0),
        "priority_reasons": priority_reasons,
        "open_commitments": open_commitments,
        "milestones": milestones,
        "recent_interactions": interactions[:5],
        "recommendation": recommendation
    }
    
    agent_res = pod.agent("resurrection-agent").run(agent_input)
    
    # 6. Calculate Confidence Score Deterministically
    # Max confidence = 100.
    conf = 0
    if contact.get("who_are_they"): conf += 10
    if contact.get("why_talking"): conf += 10
    if key_drivers: conf += 20
    if objections: conf += 20
    
    m_count = len(milestones)
    if m_count >= 2: conf += 20
    elif m_count == 1: conf += 10
    
    c_count = len(all_commitments)
    if c_count >= 2: conf += 10
    elif c_count == 1: conf += 5
    
    i_count = len(interactions)
    if i_count >= 2: conf += 10
    elif i_count == 1: conf += 5
    
    # 7. Write to cache
    generated_at_str = datetime.utcnow().isoformat() + "Z"
    
    # Check if record already exists to overwrite or create new
    if cache_records:
        cache_id = cache_records[0]["id"]
        pod.table("resurrection_snapshots").update(cache_id, {
            "snapshot": json.dumps(agent_res),
            "confidence": conf,
            "generated_at": generated_at_str
        })
    else:
        pod.table("resurrection_snapshots").create({
            "id": str(uuid.uuid4()),
            "contact_id": contact_id,
            "snapshot": json.dumps(agent_res),
            "confidence": conf,
            "generated_at": generated_at_str
        })
        
    return GenerateResurrectionSnapshotResponse(
        contact_id=contact_id,
        snapshot=ResurrectionSnapshot(**agent_res),
        confidence=conf,
        generated_at=generated_at_str,
        cache_hit=False
    )
