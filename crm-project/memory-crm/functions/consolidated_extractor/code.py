#input_type_name: ConsolidatedExtractorInput
#output_type_name: ConsolidatedExtractorResponse
#config_type_name: ExtractorConfig
#function_name: consolidated_extractor

import os
import json
from pathlib import Path
from typing import List, Optional, Dict
from pydantic import BaseModel, Field
import httpx
# pyrefly: ignore [missing-import]
from lemma_sdk import FunctionContext, Pod

# --- CONFIG SCHEMA ---

class ExtractorConfig(BaseModel):
    openai_api_key: str
    openai_base_url: Optional[str] = "https://generativelanguage.googleapis.com/v1beta/openai/"
    openai_default_model: Optional[str] = "gemini-flash-lite-latest"

# --- INPUT SCHEMAS ---

class ContactMemory(BaseModel):
    name: str
    company: Optional[str] = None
    who_are_they: Optional[str] = None
    why_talking: Optional[str] = None
    key_drivers: List[str] = Field(default_factory=list)
    objections: List[str] = Field(default_factory=list)
    memory_confidence: Dict[str, float] = Field(default_factory=dict)

class OpenCommitment(BaseModel):
    id: str
    description: str
    owner: str
    status: str

class NewInteraction(BaseModel):
    interaction_type: str
    content: str

class ConsolidatedExtractorInput(BaseModel):
    contact_memory: ContactMemory
    open_commitments: List[OpenCommitment] = Field(default_factory=list)
    new_interaction: NewInteraction

# --- OUTPUT SCHEMAS ---

class MemoryUpdate(BaseModel):
    new_identity_facts: List[str] = Field(default_factory=list)
    new_drivers: List[str] = Field(default_factory=list)
    new_objections: List[str] = Field(default_factory=list)
    memory_confidence: Dict[str, float] = Field(default_factory=dict)

class Milestone(BaseModel):
    summary: str
    milestone_type: str
    importance_score: int = Field(..., ge=1, le=100)
    evidence_quote: str

class Commitment(BaseModel):
    owner: str # founder, contact, shared
    description: str
    confidence: int = Field(..., ge=0, le=100)
    due_date: Optional[str] = None # YYYY-MM-DD
    evidence_quote: str

class Reconciliation(BaseModel):
    commitment_id: str
    reason: str
    evidence_quote: str

class ConsolidatedExtractorResponse(BaseModel):
    memory_updates: MemoryUpdate
    milestones: List[Milestone] = Field(default_factory=list)
    commitments: List[Commitment] = Field(default_factory=list)
    reconciliations: List[Reconciliation] = Field(default_factory=list)

# --- UTILS FOR LOADING API KEYS ---

def load_llm_config(ctx: Optional[FunctionContext] = None) -> tuple[str, str, str]:
    """Loads default model, API key, and base URL from ctx.config, env, or fallback config.toml."""
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

# --- SYSTEM PROMPT ---

SYSTEM_PROMPT = """You are the core fact extraction engine for MemoryCRM (the Relationship Operating System).
Your job is to read a raw interaction (meeting transcript, note, email) and extract:
1. Incremental memory updates (new identity facts, drivers, objections, with confidence ratings).
2. Key milestones (only meaningful turning points, pricing discussions, or buying signals. Ignore greetings/scheduling. Score importance 1-100).
3. Commitments (action items or promises made by founder, contact, or shared. Assign confidence 0-100).
4. Reconciliations (if the interaction proves any of the open commitments are now completed or dismissed).

### CRITICAL RULES:
- NEVER overwrite or discard existing biography or thesis context. Only propose additions.
- EVERY milestone, commitment, and reconciliation MUST include an exact "evidence_quote" from the new interaction text. If there is no exact supporting quote in the text, you MUST NOT extract the item.
- Return your output strictly as a JSON object matching the following structure:

{
  "memory_updates": {
    "new_identity_facts": ["string"],
    "new_drivers": ["string"],
    "new_objections": ["string"],
    "memory_confidence": {}
  },
  "milestones": [
    {
      "summary": "string",
      "milestone_type": "string",
      "importance_score": 50,
      "evidence_quote": "string"
    }
  ],
  "commitments": [
    {
      "owner": "founder / contact / shared",
      "description": "string",
      "confidence": 85,
      "due_date": "YYYY-MM-DD or null",
      "evidence_quote": "string"
    }
  ],
  "reconciliations": [
    {
      "commitment_id": "string",
      "reason": "string",
      "evidence_quote": "string"
    }
  ]
}

Do not output markdown code blocks other than json.
"""

# --- MAIN HANDLER ---

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

async def consolidated_extractor(ctx: FunctionContext, data: ConsolidatedExtractorInput) -> ConsolidatedExtractorResponse:
    # 1. Fetch API settings
    api_key, base_url, model = load_llm_config(ctx)
    if not api_key:
        raise ValueError("LEMMA_OPENAI_API_KEY is not configured")

    # 2. Build model prompt context
    prompt_payload = {
        "existing_memory": {
            "name": data.contact_memory.name,
            "company": data.contact_memory.company,
            "who_are_they": data.contact_memory.who_are_they,
            "why_talking": data.contact_memory.why_talking,
            "key_drivers": data.contact_memory.key_drivers,
            "objections": data.contact_memory.objections
        },
        "open_commitments": [
            {
                "id": c.id,
                "description": c.description,
                "owner": c.owner,
                "status": c.status
            } for c in data.open_commitments
        ],
        "new_interaction": {
            "type": data.new_interaction.interaction_type,
            "content": data.new_interaction.content
        }
    }

    # 3. Call LLM
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    # Format OpenAI compat payload
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(prompt_payload)}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1
    }

    async with httpx.AsyncClient(verify=False, timeout=90.0) as client:
        url = f"{base_url.rstrip('/')}/chat/completions"
        response = await client.post(url, headers=headers, json=body)
        if response.status_code != 200:
            raise RuntimeError(f"LLM call failed with status {response.status_code}: {response.text}")
        
        result_json = response.json()["choices"][0]["message"]["content"]
        raw_data = json.loads(result_json)

    # 4. Programmatic Validation Layer (Evidence Verification)
    # Memory Updates
    memory_updates_raw = raw_data.get("memory_updates", {})
    verified_updates = MemoryUpdate(
        new_identity_facts=memory_updates_raw.get("new_identity_facts", []),
        new_drivers=memory_updates_raw.get("new_drivers", []),
        new_objections=memory_updates_raw.get("new_objections", []),
        memory_confidence=memory_updates_raw.get("memory_confidence", {})
    )

    # Milestones
    verified_milestones = []
    for ms in raw_data.get("milestones", []):
        quote = ms.get("evidence_quote", "")
        if quote:
            is_match = await check_semantic_match(quote, data.new_interaction.content, api_key, base_url, model)
            if is_match:
                verified_milestones.append(Milestone(**ms))

    # Commitments
    verified_commitments = []
    for com in raw_data.get("commitments", []):
        quote = com.get("evidence_quote", "")
        if quote:
            is_match = await check_semantic_match(quote, data.new_interaction.content, api_key, base_url, model)
            if is_match:
                # Handle default due_date = null / None
                due_date = com.get("due_date")
                if not due_date or due_date == "null":
                    com["due_date"] = None
                verified_commitments.append(Commitment(**com))

    # Reconciliations
    verified_reconciliations = []
    for rec in raw_data.get("reconciliations", []):
        quote = rec.get("evidence_quote", "")
        valid_id = any(c.id == rec.get("commitment_id") for c in data.open_commitments)
        if quote and valid_id:
            is_match = await check_semantic_match(quote, data.new_interaction.content, api_key, base_url, model)
            if is_match:
                verified_reconciliations.append(Reconciliation(**rec))

    # 5. Assemble response
    return ConsolidatedExtractorResponse(
        memory_updates=verified_updates,
        milestones=verified_milestones,
        commitments=verified_commitments,
        reconciliations=verified_reconciliations
    )
