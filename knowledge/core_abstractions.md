# Core Abstractions and Codebase Mapping

This document maps the primary structural abstractions of the Lemma platform directly to the corresponding implementation files and directories within the backend codebase (`lemma-backend/app/modules/`).

---

## 1. Pods (The Multi-Tenant Workspace Boundary)

### Core Responsibility
The top-level container of all resources (tables, files, agents, workflows, permissions). It manages workspace tenancy, membership requests, organization bindings, and lifecycle events.

### Major Files & Paths
*   **Domain & Entities**:
    *   `lemma-backend/app/modules/pod/domain/role_entities.py` (Tenant member roles)
    *   `lemma-backend/app/modules/pod/domain/visibility.py` (Resource visibility boundaries)
*   **Infrastructure & Repositories**:
    *   `lemma-backend/app/modules/pod/infrastructure/pod_repositories.py`
    *   `lemma-backend/app/modules/pod/infrastructure/models/pod_models.py` (Database model mapping tables and memberships to Pods)
*   **Services**:
    *   `lemma-backend/app/modules/pod/services/pod_service.py` (CRUD operations for pods)
    *   `lemma-backend/app/modules/pod/services/pod_member_service.py` (Teammate onboarding and membership states)
*   **API & Controllers**:
    *   `lemma-backend/app/modules/pod/api/controllers/pod_controller.py` (External endpoint gateway)

---

## 2. Tables (Structured Data with Row-Level Security)

### Core Responsibility
Provides schema-typed database tables configured dynamically per Pod. Supports record query, creation, updates, and enforces Row-Level Security (RLS) so that agents and users can only interact with authorized records.

### Major Files & Paths
*   **Schema & SQL Management**:
    *   `lemma-backend/app/modules/datastore/infrastructure/schema_manager.py` (Handles dynamic Postgres schema creation per pod table)
    *   `lemma-backend/app/modules/datastore/infrastructure/sql_identifiers.py` (Guards against SQL injection in dynamic queries)
*   **Entities & Validation**:
    *   `lemma-backend/app/modules/datastore/domain/record_entities.py`
    *   `lemma-backend/app/modules/datastore/services/record_validator.py` (Enforces column types and schemas)
*   **Services & Repositories**:
    *   `lemma-backend/app/modules/datastore/services/table_service.py`
    *   `lemma-backend/app/modules/datastore/services/record_service.py` (Core record write/read logic)
    *   `lemma-backend/app/modules/datastore/infrastructure/repositories/table_repository.py`
*   **Controllers**:
    *   `lemma-backend/app/modules/datastore/api/controllers/table_controller.py`
    *   `lemma-backend/app/modules/datastore/api/controllers/record_controller.py`

---

## 3. Files (Unstructured Context and RAG Memory)

### Core Responsibility
Manages unstructured files (primarily Markdown) used as long-term context/knowledge by agents. Operates a pipeline that reads, chunks, generates vector embeddings, and performs reranked semantic searches.

### Major Files & Paths
*   **Storage & Ingestion Saga**:
    *   `lemma-backend/app/modules/datastore/services/files/storage_phase.py` (Saves files directly outside DB transactions to prevent connection pool locks)
    *   `lemma-backend/app/modules/datastore/services/files/writer.py` (Orchestrates folder and file record persistence)
    *   `lemma-backend/app/modules/datastore/services/files/reader.py` (Handles file streaming)
*   **Parsing & Vector Search (RAG)**:
    *   `lemma-backend/app/modules/datastore/infrastructure/kreuzberg_helper.py` (Text extraction wrapper)
    *   `lemma-backend/app/modules/datastore/infrastructure/reranker.py` (Refines vector results)
    *   `lemma-backend/app/modules/datastore/services/search/postgres_search_service.py` (Pgvector searches)
*   **Controllers**:
    *   `lemma-backend/app/modules/datastore/api/controllers/file_controller.py`

---

## 4. Agents (Role-Scoped Autonomous Workers)

### Core Responsibility
Executes LLM-driven runtime loops. Configures specific tools, prompts, target workspace paths (CWD), model configurations, and runs agent steps over an existing conversation thread.

### Major Files & Paths
*   **Execution & Core Runner**:
    *   `lemma-backend/app/modules/agent/services/agent_runner_service.py` (The agent loop orchestrator)
    *   `lemma-backend/app/modules/agent/infrastructure/harnesses/pydantic_ai.py` (Pydantic-AI framework wrapper)
*   **Runtime & Model Profiles**:
    *   `lemma-backend/app/modules/agent/services/runtime_profile_service.py` (Resolves Anthropic/OpenAI settings and keys)
    *   `lemma-backend/app/modules/agent/services/conversation_service.py` (Coordinates conversation messaging and runs)
*   **Tool Wiring**:
    *   `lemma-backend/app/modules/agent/tools/tool_assembler.py` (Dynamically packages tools based on agent capability grants)
    *   `lemma-backend/app/modules/agent/tools/workspace_cli/` (Grants agents command-line interface execution inside sandboxes)
*   **Controllers**:
    *   `lemma-backend/app/modules/agent/api/controllers/agent_controller.py`

---

## 5. Workflows (Execution Graph Engine)

### Core Responsibility
Parses, validates, and runs directed execution graphs (Workflow Templates). Handles loops, decision blocks, execution contexts, and orchestrates the serial/parallel calling of Agents and Functions.

### Major Files & Paths
*   **Graph Engine**:
    *   `lemma-backend/app/modules/workflow/execution/engine.py` (Drives the workflow run states)
    *   `lemma-backend/app/modules/workflow/execution/stepper.py` (Advances execution node-by-node)
*   **Nodes**:
    *   `lemma-backend/app/modules/workflow/domain/nodes/` (Individual Node definitions: `agent.py`, `function.py`, `decision.py`, `form.py`, `loop.py`, `wait_until.py`)
*   **Executors**:
    *   `lemma-backend/app/modules/workflow/execution/executors/` (Runtime logic for running each node class)
*   **Controllers**:
    *   `lemma-backend/app/modules/workflow/api/flow_controller.py` (Manage workflow templates)
    *   `lemma-backend/app/modules/workflow/api/flow_run_controller.py` (Control active workflow run instances)

---

## 6. Functions (Deterministic Sandboxed Logic)

### Core Responsibility
Executes developer-authored code files (Python/JS scripts) dynamically. These are run inside the AgentBox container sandbox to guarantee host isolation.

### Major Files & Paths
*   **Execution & Sandbox Integration**:
    *   `lemma-backend/app/modules/function/application/function_run_executor.py` (Validates input/output schemas and monitors execution)
    *   `lemma-backend/app/modules/function/services/function_runtime_command.py` (Synthesizes CLI arguments and container start commands)
    *   `lemma-backend/app/modules/function/services/function_service.py` (Manages function scripts stored inside the pod)
*   **Controllers**:
    *   `lemma-backend/app/modules/function/api/controllers/function_controller.py`

---

## 7. Permissions (Unified RBAC / Resource Controls)

### Core Responsibility
Validates authorization across human operators, external surface webhooks, and AI agent workloads. Ensures that agent tool executions do not leak credentials or bypass file/table access restrictions.

### Major Files & Paths
*   **Core Authorization**:
    *   `lemma-backend/app/modules/pod/services/authorization_factory.py` (Main authorization service wrapper)
    *   `lemma-backend/app/modules/pod/domain/roles.py` (Default role actions: `MEMBER`, `ADMIN`, `OWNER`, `AGENT`)
*   **Workload Checks**:
    *   `lemma-backend/app/modules/datastore/services/authorization.py` (RLS checks on table records and folder pathways)
    *   `lemma-backend/app/modules/connectors/infrastructure/adapters/organization_access_adapter.py` (Guards API keys and OAuth tokens)

---

## 8. Approvals (Pause-and-Resume Human Gating)

### Core Responsibility
Coordinates human-in-the-loop validation. Halts execution, generates an approval request, and handles asynchronous resumption once a decision is submitted.

### Major Files & Paths
*   **Agent Interaction Approvals**:
    *   `lemma-backend/app/modules/agent/services/conversation_service.py` (`resolve_user_approval_internal` - handles synthesized return injection and triggers the resume agent run)
    *   `lemma-backend/app/modules/agent/tools/approval/executor.py` (Runs the approved action tool using the user's delegate credentials)
*   **Workflow Gating**:
    *   `lemma-backend/app/modules/workflow/execution/executors/form.py` (Suspends workflow execution until a structured form/approval is completed by the assignee)
*   **DB Locking**:
    *   `lemma-backend/app/modules/agent/infrastructure/repositories.py` (`record_approval_decision` - ensures single-resolve lock)

---

## 9. Apps (Frontend Operator Cockpits)

### Core Responsibility
Hosts and serves HTML/JS and static assets configured for a Pod, enabling custom single-page user interfaces.

### Major Files & Paths
*   **Asset Hosting**:
    *   `lemma-backend/app/modules/apps/services/app_dist_bundle.py` (Handles zip bundle unpacking and asset resolution)
    *   `lemma-backend/app/modules/apps/api/host_routing.py` (Decodes subdomains to map custom App URLs to target Pod resources)
    *   `lemma-backend/app/modules/apps/services/app_html_validation.py` (Sanitizes index.html files before deployment)
*   **Controllers**:
    *   `lemma-backend/app/modules/apps/api/controllers/app_controller.py`

---

## 10. Surfaces (External Communication Channels)

### Core Responsibility
Handles multi-platform webhook ingress (Slack, Teams, Telegram, WhatsApp, Gmail, Outlook). Resolves external identities to internal user identities, formats platform-specific cards for questions and approvals, and broadcasts progress updates.

### Major Files & Paths
*   **Ingress & Identity Mapping**:
    *   `lemma-backend/app/modules/agent_surfaces/services/ingress_service.py` (Receives inbound webhooks)
    *   `lemma-backend/app/modules/agent_surfaces/services/identity_resolution_service.py` (Resolves phone numbers/emails to Pod users)
*   **Platform Modules**:
    *   `lemma-backend/app/modules/agent_surfaces/platforms/[platform_name]/` (Platform adapters containing clients, tools, message parsers, and services)
*   **Egress Delivery**:
    *   `lemma-backend/app/modules/agent_surfaces/services/surface_display_delivery.py` (Broadcasts agent tokens and message bubbles back to platforms)
