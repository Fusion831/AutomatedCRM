from pydantic import BaseModel
from typing import List, Optional
from lemma_sdk import FunctionContext, Lemma

class FetchContextInput(BaseModel):
    interaction: dict

class ContactMemory(BaseModel):
    name: str
    company: Optional[str] = None
    who_are_they: Optional[str] = None
    why_talking: Optional[str] = None
    key_drivers: List[str] = []
    objections: List[str] = []

class OpenCommitment(BaseModel):
    id: str
    description: str
    owner: str
    status: str

class NewInteraction(BaseModel):
    interaction_type: str
    content: str

class FetchContextOutput(BaseModel):
    contact_id: str
    interaction_id: str
    contact_memory: ContactMemory
    open_commitments: List[OpenCommitment]
    new_interaction: NewInteraction

async def fetch_context_function(ctx: FunctionContext, data: FetchContextInput) -> FetchContextOutput:
    # Initialize client
    client = Lemma()
    pod = client.pod(str(ctx.pod_id))
    
    # Extract contact_id from interaction
    interaction_data = data.interaction
    contact_id = interaction_data.get("contact_id")
    interaction_id = interaction_data.get("id")
    
    # Query contact memory
    contact_record = pod.table("contacts").get(str(contact_id))
    
    # Map key_drivers / objections safely (handle JSON or list)
    key_drivers = contact_record.get("key_drivers") or []
    if isinstance(key_drivers, str):
        import json
        try:
            key_drivers = json.loads(key_drivers)
        except Exception:
            key_drivers = [key_drivers]
            
    objections = contact_record.get("objections") or []
    if isinstance(objections, str):
        import json
        try:
            objections = json.loads(objections)
        except Exception:
            objections = [objections]
    
    contact_memory = ContactMemory(
        name=contact_record.get("name", ""),
        company=contact_record.get("company"),
        who_are_they=contact_record.get("who_are_they"),
        why_talking=contact_record.get("why_talking"),
        key_drivers=key_drivers,
        objections=objections
    )
    
    # Query open commitments
    query_str = f"SELECT id, description, owner, status FROM commitments WHERE contact_id = '{contact_id}' AND status = 'open'"
    res = pod.query(query_str)
    
    open_commitments = []
    for item in res.to_dict().get("items", []):
        open_commitments.append(OpenCommitment(
            id=str(item.get("id")),
            description=item.get("description"),
            owner=item.get("owner"),
            status=item.get("status")
        ))
        
    new_interaction = NewInteraction(
        interaction_type=interaction_data.get("interaction_type", "note"),
        content=interaction_data.get("content", "")
    )
    
    return FetchContextOutput(
        contact_id=str(contact_id),
        interaction_id=str(interaction_id),
        contact_memory=contact_memory,
        open_commitments=open_commitments,
        new_interaction=new_interaction
    )
