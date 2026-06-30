#input_type_name: ReconcileCommitmentsInput
#output_type_name: ReconcileCommitmentsResponse
#function_name: reconcile_commitments_function

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from lemma_sdk import FunctionContext, Lemma

class ProposedReconciliation(BaseModel):
    commitment_id: str
    reason: str
    evidence_quote: str

class ReconcileCommitmentsInput(BaseModel):
    reconciliations: List[ProposedReconciliation] = Field(default_factory=list)
    new_interaction_content: str

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

class ReconcileCommitmentsResponse(BaseModel):
    accepted: List[AcceptedReconciliation] = Field(default_factory=list)
    rejected: List[RejectedReconciliation] = Field(default_factory=list)
    audit_entries: List[str] = Field(default_factory=list)

async def reconcile_commitments_function(ctx: FunctionContext, data: ReconcileCommitmentsInput) -> ReconcileCommitmentsResponse:
    # Initialize Lemma client
    client = Lemma()
    pod = client.pod(str(ctx.pod_id))
    
    accepted = []
    rejected = []
    audit_entries = []
    
    timestamp = datetime.utcnow().isoformat() + "Z"
    content_lower = data.new_interaction_content.lower()
    
    for recon in data.reconciliations:
        c_id = recon.commitment_id
        reason = recon.reason
        quote = recon.evidence_quote
        
        # 1. Fetch commitment
        commitment = None
        try:
            commitment = pod.table("commitments").get(c_id)
        except Exception:
            pass
            
        # 2. Perform validations
        if not commitment:
            rejection_reason = "Commitment does not exist in datastore"
            rejected.append(RejectedReconciliation(
                commitment_id=c_id,
                reason=reason,
                evidence_quote=quote,
                rejection_reason=rejection_reason
            ))
            audit_entries.append(f"[{timestamp}] REJECTED reconciliation for commitment {c_id}: {rejection_reason}")
            continue
            
        status = commitment.get("status")
        if status != "open":
            rejection_reason = f"Commitment is already in status '{status}'"
            rejected.append(RejectedReconciliation(
                commitment_id=c_id,
                reason=reason,
                evidence_quote=quote,
                rejection_reason=rejection_reason
            ))
            audit_entries.append(f"[{timestamp}] REJECTED reconciliation for commitment {c_id}: {rejection_reason}")
            continue
            
        if not quote:
            rejection_reason = "Evidence quote is missing"
            rejected.append(RejectedReconciliation(
                commitment_id=c_id,
                reason=reason,
                evidence_quote=quote,
                rejection_reason=rejection_reason
            ))
            audit_entries.append(f"[{timestamp}] REJECTED reconciliation for commitment {c_id}: {rejection_reason}")
            continue
            
        if quote.lower() not in content_lower:
            rejection_reason = "Evidence quote not found in new interaction content"
            rejected.append(RejectedReconciliation(
                commitment_id=c_id,
                reason=reason,
                evidence_quote=quote,
                rejection_reason=rejection_reason
            ))
            audit_entries.append(f"[{timestamp}] REJECTED reconciliation for commitment {c_id}: {rejection_reason} (Quote: '{quote}')")
            continue
            
        # 3. Accept reconciliation
        accepted.append(AcceptedReconciliation(
            commitment_id=c_id,
            reason=reason,
            evidence_quote=quote,
            reconciliation_timestamp=timestamp
        ))
        audit_entries.append(f"[{timestamp}] ACCEPTED reconciliation for commitment {c_id}: {reason}")
        
    return ReconcileCommitmentsResponse(
        accepted=accepted,
        rejected=rejected,
        audit_entries=audit_entries
    )
