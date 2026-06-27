# AI Agent Development Rules (`CLAUDE.md`)

This document establishes the development practices, programmatic pre-flight checks, and environment boundaries for AI agents (Cursor, Claude Code) working on the CRM repository.

---

## 1. Mandatory Pre-Flight Validation Checks

Before executing any script, importing table schemas, or triggering workflows, agents **must** run an environment validation check. Prepend or import this validation sequence to prevent silent configuration fallbacks or API connection errors.

### Python Environment Validator
Create a file named `validate_env.py` (or embed this logic) and run it before any execution run:

```python
import os
import sys

REQUIRED_ENV_VARS = [
    "LEMMA_DEFAULT_MODEL_TYPE",
]

def check_environment():
    missing = []
    
    # 1. Check basic provider configurations
    model_type = os.getenv("LEMMA_DEFAULT_MODEL_TYPE")
    if not model_type:
        missing.append("LEMMA_DEFAULT_MODEL_TYPE")
    else:
        if model_type == "anthropic_compat" and not os.getenv("LEMMA_ANTHROPIC_API_KEY"):
            missing.append("LEMMA_ANTHROPIC_API_KEY (required for default model type 'anthropic_compat')")
        elif model_type == "openai_compat" and not os.getenv("LEMMA_OPENAI_API_KEY"):
            missing.append("LEMMA_OPENAI_API_KEY (required for default model type 'openai_compat')")

    # 2. Check general required variables
    for var in REQUIRED_ENV_VARS:
        if not os.getenv(var):
            missing.append(var)
            
    if missing:
        print("[ERROR] Environment validation failed. Missing variables:")
        for var in missing:
            print(f"  - {var}")
        print("\nPlease run 'lemma-stack config set <VARIABLE> <VALUE>' or configure your environment variables.")
        sys.exit(1)
        
    print("[OK] Pre-flight environment validation passed.")

if __name__ == "__main__":
    check_environment()
```

---

## 2. Cost-Effective Tooling Trade-offs

To minimize LLM token spend and operational overhead, adhere to the following architectural hierarchy:

### Database: Docker Postgres vs. Cloud-Hosted (Supabase) Postgres
*   **Default Option**: **Local PostgreSQL** (in Docker/Podman via the local stack). Always default to the local stack databases for testing, local script executions, and database-scoped tests.
*   **Cloud Option**: Use **Supabase Free Tier / Cloud Postgres** only if deploying a prototype that requires external webhook integration, where cloud-based agents need a persistent synchronized state.

### Transactional Alerts: Filesystem Email vs. Resend/SMTP
*   **Default Option**: Set `EMAIL_TRANSPORT=filesystem`. This stores all outgoing notification emails as raw text files inside your local workspace or temporary directory (e.g., `EMAIL_OUTPUT_DIR=./.local/emails`), avoiding external network requests and SMTP keys.
*   **Cloud Option**: Use **Resend (Free Tier)** for SMTP delivery when validating real human-in-the-loop email notifications in production.

### Tools: Composio vs. Custom SDK Tools
*   **Default Option**: Always check **Composio / Connectors Catalog** first (configured via `COMPOSIO_API_KEY`) to leverage out-of-the-box OAuth app triggers (Slack, Gmail, Notion, Salesforce).
*   **Custom Option**: Implement custom Python/TS functions under `lemma-skills/` only if working with unique local datasets, proprietary APIs, or files, saving code and prompt overhead.

### LLM Token Spend: Local Mock Services
*   **Default Option**: Set `E2E_LLM_MODE=mock` in the configuration. This routes all LLM prompts to a deterministic mock `FunctionModel` mapping that returns simulated text, preventing real token costs.
*   **Default Sandbox Option**: Set `E2E_SANDBOX_MODE=fake`. This runs sandboxed python operations in local subprocesses instead of spinning up Docker containers, reducing execution latency.

---

## 3. Error Handling and Defensive Coding Boundaries

All code generated must follow strict defensive structures to ensure data consistency and sandboxed security:

### Database & SDK Operations
All `LemmaClient` or `Pod` database calls must be wrapped in explicit try-except statements with logging:
```python
import logging
from lemma_sdk import Pod
from lemma_sdk.errors import APIError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def upsert_crm_lead(lead_data: dict):
    try:
        with Pod.from_env() as pod:
            result = pod.records.create("crm_leads", data=lead_data)
            logger.info(f"Successfully upserted CRM lead: {result}")
            return result
    except APIError as api_exc:
        logger.error(f"API Error communicating with Lemma backend: {api_exc.message} (Status: {api_exc.status_code})")
        raise
    except Exception as exc:
        logger.error(f"Unexpected error during lead processing: {exc}")
        raise
```

### Dry-Run Safeguards
For workflow deployment and critical migrations, mandate options to test imports and executions without applying permanent state:
*   Pass `dry_run=True` to the `import_pod_bundle` / `lemma pod import` routines before deploying live schemas.

### Sandbox Isolation
*   **DO NOT** write code that invokes arbitrary subprocesses or shell calls on the host machine.
*   All agent-initiated file operations, command lines, and tool calls must execute within the sandboxed boundaries of `agentbox`.
