#input_type_name: ReconcileCommitmentsInput
#output_type_name: ReconcileCommitmentsResponse
#function_name: reconcile_commitments_function

import os
import json
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
import httpx
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

def load_llm_config(ctx: Optional[FunctionContext] = None) -> tuple[str, str, str]:
    # 1. Check ctx.config first
    if ctx and hasattr(ctx, "config") and ctx.config:
        api_key = getattr(ctx.config, "openai_api_key", None)
        base_url = getattr(ctx.config, "openai_base_url", None)
        model = getattr(ctx.config, "openai_default_model", None)

        if isinstance(ctx.config, dict):
            api_key = ctx.config.get("openai_api_key") or api_key
            base_url = ctx.config.get("openai_base_url") or base_url
            model = ctx.config.get("openai_default_model") or model

        if api_key:
            return api_key, base_url or "https://generativelanguage.googleapis.com/v1beta/openai/", model or "gemini-flash-lite-latest"

    # 2. Check direct env vars
    api_key = os.getenv("LEMMA_OPENAI_API_KEY")
    base_url = os.getenv("LEMMA_OPENAI_BASE_URL")
    model = os.getenv("LEMMA_OPENAI_DEFAULT_MODEL", "gemini-flash-lite-latest")

    if api_key and base_url:
        return api_key, base_url, model

    # 3. Try loading from ~/.lemma/local/config.toml
    try:
        home = Path.home()
        config_path = home / ".lemma" / "local" / "config.toml"
        if config_path.exists():
            in_backend = False
            with open(config_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line == "[backend.env]":
                        in_backend = True
                        continue
                    elif line.startswith("[") and line.endswith("]"):
                        in_backend = False
                        continue
                    
                    if in_backend and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k == "LEMMA_OPENAI_API_KEY":
                            api_key = v
                        elif k == "LEMMA_OPENAI_BASE_URL":
                            base_url = v
                        elif k == "LEMMA_OPENAI_DEFAULT_MODEL":
                            model = v
    except Exception:
        pass

    # Default fallbacks
    api_key = api_key or ""
    base_url = base_url or "https://generativelanguage.googleapis.com/v1beta/openai/"
    return api_key, base_url, model

async def check_semantic_match(quote: str, content: str, api_key: str, base_url: str, model: str) -> bool:
    if not quote or not content:
        return False
    if quote.lower() in content.lower():
        return True
        
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    system_prompt = (
        "You are a semantic text similarity scoring engine simulating Qdrant vector searches. Compare the 'quote' with the 'content'. "
        "Determine if the semantic meaning of the quote is present or paraphrased in the content. "
        "Return a JSON object matching this structure:\n"
        "{\n  \"similarity_score\": 0.85\n}"
    )
    prompt_payload = {
        "quote": quote,
        "content": content
    }
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(prompt_payload)}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1
    }
    try:
        async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
            url = f"{base_url.rstrip('/')}/chat/completions"
            response = await client.post(url, headers=headers, json=body)
            if response.status_code == 200:
                result_json = response.json()["choices"][0]["message"]["content"]
                raw_score = json.loads(result_json)
                score = float(raw_score.get("similarity_score", 0.0))
                # Cosine similarity threshold >= 0.70
                return score >= 0.70
    except Exception as e:
        print(f"[WARN] Semantic match exception: {e}")
    return quote.lower() in content.lower()

async def reconcile_commitments_function(ctx: FunctionContext, data: ReconcileCommitmentsInput) -> ReconcileCommitmentsResponse:
    client = Lemma()
    pod = client.pod(str(ctx.pod_id))
    
    accepted = []
    rejected = []
    audit_entries = []
    
    timestamp = datetime.utcnow().isoformat() + "Z"
    api_key, base_url, model = load_llm_config(ctx)
    
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
            
        is_match = await check_semantic_match(quote, data.new_interaction_content, api_key, base_url, model)
        if not is_match:
            rejection_reason = "Evidence quote not semantically found in new interaction content"
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
