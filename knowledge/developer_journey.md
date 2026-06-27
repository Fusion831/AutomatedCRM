# Developer Onboarding Journey

This guide maps out the absolute shortest path for a junior engineer to go from a blank environment to a fully functioning local build of the Lemma platform, detailing the recommended learning order and identifying systems that can be safely bypassed during initial prototyping.

---

## 1. Installation Steps (Local Development Setup)

To configure the Lemma platform locally for active development and prototyping, follow this exact sequence:

### Step 1: Install Package Manager & Runtimes
Ensure you have Python 3.11+, Git, Docker or Podman, and the `uv` package manager installed.
```bash
# Verify Python version
python --version  # Must be >= 3.11

# Install uv (if not already installed)
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### Step 2: Install Local Stack (from source)
Since the `lemma-stack` tool is not yet published on PyPI, it must be installed directly from the local repository directory:
```bash
# Clone the repository
git clone https://github.com/lemma-work/lemma-platform.git
cd lemma-platform

# Install the stack management tool using uv
uv tool install ./lemma-stack
```

### Step 3: Configure Infrastructure & LLM Keys
Run the installer to pull system images (Postgres, Redis, Supertokens, Kreuzberg) and configure the default model configurations.
```bash
# Pull and prepare the local runtime stack
lemma-stack install

# Set your model provider and API key
lemma-stack config set LEMMA_DEFAULT_MODEL_TYPE anthropic_compat
lemma-stack config set LEMMA_ANTHROPIC_API_KEY sk-ant-your-key-here

# Restart the local stack services
lemma-stack restart
```
*Note: The stack will run the API server at `http://127-0-0-1.sslip.io:8711` and the frontend at `http://127-0-0-1.sslip.io:3711`.*

### Step 4: Install the CLI and Test
Install the CLI tool to create and manage Pods:
```bash
# Install the CLI tool
uv tool install ./lemma-cli

# Verify installation
lemma --version

# Log in to your local server instance
lemma servers select local
lemma auth login

# Scaffold a new starter Pod
lemma pod create onboarding-pod --with-starter
lemma chat "Hello, are you operational?"
```

---

## 2. Minimal Onboarding Checklist (Recommended Learning Order)

To build a solid understanding of the architecture, read and inspect the codebase files in this order:

- [ ] **Phase 1: SDK Interfaces (The Consumer view)**
  *   [`lemma-python/README.md`](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-python/README.md) — Explains the client model.
  *   [`lemma-python/lemma_sdk/client.py`](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-python/lemma_sdk/client.py) — The main library entry point.
  *   [`lemma-python/lemma_sdk/transport.py`](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-python/lemma_sdk/transport.py) — Understand how connection retry logic and error mapping are structured.

- [ ] **Phase 2: CLI Scaffolding (How pods are created)**
  *   [`lemma-cli/lemma_cli/cli_app/scaffold.py`](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-cli/lemma_cli/cli_app/scaffold.py) — Inspect how files, agents, and tables are structured inside local directory templates.

- [ ] **Phase 3: Backend Tenancy & Datastore**
  *   [`lemma-backend/app/modules/pod/services/pod_service.py`](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-backend/app/modules/pod/services/pod_service.py) — Understand pod boundary rules.
  *   [`lemma-backend/app/modules/datastore/infrastructure/schema_manager.py`](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-backend/app/modules/datastore/infrastructure/schema_manager.py) — See how dynamic SQL table schemas are compiled and created.
  *   [`lemma-backend/app/modules/datastore/services/authorization.py`](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-backend/app/modules/datastore/services/authorization.py) — Read how Row-Level Security (RLS) restricts folder and record access.

- [ ] **Phase 4: Agent Execution Loop**
  *   [`lemma-backend/app/modules/agent/services/agent_runner_service.py`](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-backend/app/modules/agent/services/agent_runner_service.py) — The main LLM execution loop and tool dispatcher.

- [ ] **Phase 5: Workflow State Machine**
  *   [`lemma-backend/app/modules/workflow/execution/engine.py`](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-backend/app/modules/workflow/execution/engine.py) — The core step coordinator that runs node logic.

---

## 3. Essential Working Files (The Core 10% Code Hot-spots)

As a backend/agent developer on this platform, you will spend 90% of your coding time modifying or extending these specific files:

| File path | Purpose | Why it is a hot-spot |
|---|---|---|
| `lemma-backend/app/modules/agent/services/agent_runner_service.py` | Agent Loop Orchestrator | Controls how prompts are built, LLMs are called, and tools are dispatched. |
| `lemma-backend/app/modules/agent/services/conversation_service.py` | Conversation & Approval Controller | Coordinates user interaction approvals, runs, and conversation structures. |
| `lemma-backend/app/modules/datastore/services/record_service.py` | Table Record Access | The data access service used when writing database query integrations. |
| `lemma-backend/app/modules/datastore/services/files/writer.py` | Knowledge Base ingestion | The storage phase pipeline where files are indexed, chunked, and saved. |
| `lemma-backend/app/modules/workflow/execution/engine.py` | Workflow Graph Executor | Manages workflow execution states and resumes. |
| `lemma-backend/app/modules/workflow/execution/stepper.py` | Workflow Stepper | Defines step transitions, loop bounds, and graph traversal. |
| `lemma-backend/app/modules/function/application/function_run_executor.py` | Sandboxed execution | Coordinates how developer-provided python scripts run inside AgentBox. |
| `lemma-python/lemma_sdk/pod.py` | Python SDK resource | Handles table and agent API operations for python application developers. |

---

## 4. Distraction Map (Subsystems to Ignore During Prototyping)

When building initial prototypes or scoping out simple workflows, you can safely skip these directories to avoid getting bogged down in platform architecture details:

*   **`lemma-backend/app/modules/identity/` (Auth & User lifecycle)**:
    *   *Why you can ignore it:* Uses Supertokens logic to handle user registrations, invitations, and auth callbacks. For prototyping, you'll be operating with the default local session and bypass identity invitations completely.
*   **`lemma-backend/app/modules/agent_surfaces/` (Messaging Channels)**:
    *   *Why you can ignore it:* Manages Slack webhook connections, WhatsApp adapters, and email rendering. During prototyping, interact with the system using `lemma chat` or the API directly instead of setting up external webhooks.
*   **`lemma-backend/app/modules/connectors/` (Third-Party Integrations)**:
    *   *Why you can ignore it:* Contains OAuth flow configurations for Composio tools. You can run custom Python code inside sandboxes or query tables directly without loading third-party integrations.
*   **`desktop/` & `lemma-frontend/` (Tauri & NextJS layout shells)**:
    *   *Why you can ignore it:* Thin Tauri desktop window wrappers and Next.js React templates. Focus on modifying backend logic, running test suites, or writing pod template files rather than UI styles.
