#input_type_name: FetchContextInput
#output_type_name: FetchContextOutput
#function_name: fetch_context_function

import json
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from lemma_sdk import FunctionContext, Lemma

class FetchContextInput(BaseModel):
    interaction: dict

class ContactMemory(BaseModel):
    name: str
    company: Optional[str] = None
    who_are_they: Optional[str] = None
    why_talking: Optional[str] = None
    relationship_thesis: Optional[str] = None
    memory_confidence: Dict[str, float] = Field(default_factory=dict)
    key_drivers: List[str] = Field(default_factory=list)
    objections: List[str] = Field(default_factory=list)

class Milestone(BaseModel):
    id: str
    summary: str
    milestone_type: str
    importance_score: int
    evidence_quote: Optional[str] = None
    date: str

class OpenCommitment(BaseModel):
    id: str
    description: str
    owner: str
    status: str
    due_date: Optional[str] = None
    confidence: int = 100
    evidence_quote: Optional[str] = None

class StateHistoryEntry(BaseModel):
    id: str
    old_state: str
    new_state: str
    reason: Optional[str] = None
    changed_at: str

class RecentInteraction(BaseModel):
    id: str
    interaction_type: str
    summary: str
    occurred_at: str

class NewInteraction(BaseModel):
    interaction_type: str
    content: str

class FetchContextOutput(BaseModel):
    contact_id: str
    interaction_id: str
    contact_memory: ContactMemory
    key_drivers: List[str] = Field(default_factory=list)
    objections: List[str] = Field(default_factory=list)
    milestones: List[Milestone] = Field(default_factory=list)
    open_commitments: List[OpenCommitment] = Field(default_factory=list)
    state_history: List[StateHistoryEntry] = Field(default_factory=list)
    recent_interactions: List[RecentInteraction] = Field(default_factory=list)
    new_interaction: NewInteraction

async def fetch_context_function(ctx: FunctionContext, data: FetchContextInput) -> FetchContextOutput:
    # Initialize Lemma client
    client = Lemma()
    pod = client.pod(str(ctx.pod_id))
    
    # Extract details from input interaction
    interaction_data = data.interaction
    contact_id = interaction_data.get("contact_id")
    interaction_id = interaction_data.get("id")
    
    if not contact_id:
        raise ValueError("Missing contact_id in the input interaction")
    
    # 1. Fetch Contact
    contact_record = pod.table("contacts").get(str(contact_id))
    if not contact_record:
        raise ValueError(f"Contact {contact_id} not found in database")
        
    # Map key_drivers / objections safely
    raw_key_drivers = contact_record.get("key_drivers") or {}
    if isinstance(raw_key_drivers, str):
        try:
            raw_key_drivers = json.loads(raw_key_drivers)
        except Exception:
            raw_key_drivers = {}
            
    drivers = []
    objections = []
    
    if isinstance(raw_key_drivers, dict):
        drivers = raw_key_drivers.get("drivers") or []
        objections = raw_key_drivers.get("objections") or []
    elif isinstance(raw_key_drivers, list):
        drivers = raw_key_drivers
        
    # Map memory_confidence safely
    raw_confidence = contact_record.get("memory_confidence") or {}
    if isinstance(raw_confidence, str):
        try:
            raw_confidence = json.loads(raw_confidence)
        except Exception:
            raw_confidence = {}
            
    contact_memory = ContactMemory(
        name=contact_record.get("name", ""),
        company=contact_record.get("company"),
        who_are_they=contact_record.get("who_are_they"),
        why_talking=contact_record.get("why_talking"),
        relationship_thesis=contact_record.get("why_talking"), # Thesis and why_talking are unified
        memory_confidence=raw_confidence,
        key_drivers=drivers,
        objections=objections
    )
    
    # 2. Query Milestones (sorted by importance_score DESC)
    milestones_query = f"SELECT id, summary, milestone_type, importance_score, evidence_quote, occurred_at FROM relationship_milestones WHERE contact_id = '{contact_id}'"
    milestones_res = pod.query(milestones_query)
    raw_milestones = milestones_res.to_dict().get("items", [])
    
    # Sort in memory since SQL order support may vary across pod adapters
    raw_milestones.sort(key=lambda x: x.get("importance_score", 0), reverse=True)
    
    milestones = []
    for m in raw_milestones:
        occ_at = m.get("occurred_at")
        if occ_at and not isinstance(occ_at, str):
            occ_at = str(occ_at)
        milestones.append(Milestone(
            id=str(m.get("id")),
            summary=m.get("summary", ""),
            milestone_type=m.get("milestone_type", ""),
            importance_score=int(m.get("importance_score", 50)),
            evidence_quote=m.get("evidence_quote"),
            date=occ_at[:10] if occ_at else ""
        ))
        
    # 3. Query Open Commitments (status = 'open')
    commitments_query = f"SELECT id, description, owner, status, due_date, confidence, evidence_quote FROM commitments WHERE contact_id = '{contact_id}' AND status = 'open'"
    commitments_res = pod.query(commitments_query)
    
    open_commitments = []
    for c in commitments_res.to_dict().get("items", []):
        due = c.get("due_date")
        if due and not isinstance(due, str):
            due = str(due)
        open_commitments.append(OpenCommitment(
            id=str(c.get("id")),
            description=c.get("description", ""),
            owner=c.get("owner", "founder"),
            status=c.get("status", "open"),
            due_date=due[:10] if due else None,
            confidence=int(c.get("confidence", 100)),
            evidence_quote=c.get("evidence_quote")
        ))
        
    # 4. Query State History
    state_history_query = f"SELECT id, old_state, new_state, reason, changed_at FROM relationship_state_history WHERE contact_id = '{contact_id}'"
    state_history_res = pod.query(state_history_query)
    raw_history = state_history_res.to_dict().get("items", [])
    raw_history.sort(key=lambda x: x.get("changed_at", ""), reverse=True)
    
    state_history = []
    for h in raw_history:
        chg = h.get("changed_at")
        if chg and not isinstance(chg, str):
            chg = str(chg)
        state_history.append(StateHistoryEntry(
            id=str(h.get("id")),
            old_state=h.get("old_state", ""),
            new_state=h.get("new_state", ""),
            reason=h.get("reason"),
            changed_at=chg or ""
        ))
        
    # 5. Query Recent Interactions (limit 5 to avoid token bloat)
    interactions_query = f"SELECT id, type, summary, occurred_at FROM interactions WHERE contact_id = '{contact_id}'"
    interactions_res = pod.query(interactions_query)
    raw_interactions = interactions_res.to_dict().get("items", [])
    raw_interactions.sort(key=lambda x: x.get("occurred_at", ""), reverse=True)
    
    recent_interactions = []
    for i in raw_interactions[:5]:
        occ = i.get("occurred_at")
        if occ and not isinstance(occ, str):
            occ = str(occ)
        recent_interactions.append(RecentInteraction(
            id=str(i.get("id")),
            interaction_type=i.get("type", "note"),
            summary=i.get("summary", ""),
            occurred_at=occ or ""
        ))
        
    new_interaction = NewInteraction(
        interaction_type=interaction_data.get("type") or interaction_data.get("interaction_type") or "note",
        content=interaction_data.get("summary") or interaction_data.get("content") or ""
    )
    
    return FetchContextOutput(
        contact_id=str(contact_id),
        interaction_id=str(interaction_id),
        contact_memory=contact_memory,
        key_drivers=drivers,
        objections=objections,
        milestones=milestones,
        open_commitments=open_commitments,
        state_history=state_history,
        recent_interactions=recent_interactions,
        new_interaction=new_interaction
    )
