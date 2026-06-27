# Architectural Comparison Matrix

This document provides a technical, architecture-first comparison between the Lemma platform and related systems across stateful orchestration, multi-agent frameworks, integration engines, database managers, and tool hubs.

---

## 1. vs. LangGraph (Stateful Agent Graphs)

### Common Ground
Both platforms represent executions as directed graphs (nodes representing agents, functions, or decisions; edges representing control flow, conditional routing, or loops). Both support stateful cycles, parallel execution branches, and human-in-the-loop pauses.

### Displacements
*   **Thread Checkpointers**: Obsoletes LangGraph’s memory/Postgres checkpoint savers. In Lemma, workflow state, execution step contexts, and inputs/outputs are saved natively as structured database entities (`UoW` transactions in `workflow/infrastructure/repositories/`).
*   **Pause-and-Resume Loop Wrappers**: Obsoletes custom webhook callback handlers needed to resume suspended graphs. Lemma handles graph resume natively via the Flow Run Controller and the Stepper engine.

### Structural Differences

| Metric | LangGraph | Lemma |
|---|---|---|
| **State Storage** | Serialized state dictionary (`StateDict`) stored as serialized blob checkpoints. | Structured database records (`Table` / `Record`) and indexed Markdown files (`Files`) with Postgres Row-Level Security (RLS). |
| **Workflow Definition** | Code-first Python/JS graph builder API. | Declarative JSON/YAML schemas (`modules/workflow/domain/flow.py`) that can be exported, modified, and checked into version control. |
| **Tool Execution** | Runs tools directly within the main application process. | Executes code and tools inside an isolated sandbox container manager (`AgentBox`). |

### Concepts to Unlearn
*   **Discard In-Memory/Transient Graph State**: In LangGraph, developers routinely mutate a state dict passed between nodes. In Lemma, all business state must be written to **Tables** or **Files**. Storing key-value state in transient variables will result in data loss when a workflow pauses for an approval or form input (which shuts down the active execution process).

---

## 2. vs. CrewAI / AutoGen (Multi-Agent Frameworks)

### Common Ground
Both systems orchestrate collaboration between role-specific LLM workers, allowing agents to execute toolsets, delegate subtasks, and solve problems using specialized prompts.

### Displacements
*   **Runtime Memory RAG Code**: Obsoletes hand-rolled vector database client setups for agent memory. In Lemma, full-text vector indexing (via pgvector + Kreuzberg) is built directly into the file storage layer.
*   **Local Process Code Runner**: Obsoletes the insecure run-local scripting interpreters or custom Docker manager wrappers used in AutoGen.

### Structural Differences

| Metric | CrewAI / AutoGen | Lemma |
|---|---|---|
| **Agent Boundary** | Runtime objects inside a single script execution. | DB-backed entities (`Agent`) belonging to a **Pod** container, with explicit role-based access control (RBAC). |
| **Security Controls** | Run-time API key environment variables; no isolation between agent instances. | Scoped permissions. Agents hold specific database roles and must present a delegation token to execute tools. |
| **Code Execution** | Local shell executes directly in host OS (unless configured with heavy container wrappers). | The `workspace` module manages sandboxed containers (`AgentBox`), mapping execution to `/workspace/conversations/{id}`. |

### Concepts to Unlearn
*   **Discard Arbitrary File I/O & Process Spawning**: In CrewAI or AutoGen, agents are written assuming full access to the host file system. In Lemma, agents execute tools inside strict sandboxes. All file operations must go through the scoped datastore reader/writer services, enforcing RLS at the database layer.

---

## 3. vs. N8N / Zapier (Linear Integration Engines)

### Common Ground
Both platforms implement event-driven automations, triggering tasks via webhooks, schedules, or database events, and connecting to third-party APIs using OAuth credentials.

### Displacements
*   **Webhook Listener Microservices**: Obsoletes independent HTTP endpoints. Lemma incorporates long-polling and socket interfaces (e.g. Telegram long-polling, Slack Socket Mode) directly in the app code, bypassing public ingress requirements for local dev.
*   **Credential / Secrets Managers**: Obsoletes external vaults. OAuth credentials and API keys are stored in encrypted columns (via Fernet) directly in the Pod's database namespace.

### Structural Differences

| Metric | N8N / Zapier | Lemma |
|---|---|---|
| **Orchestration Logic** | Linear execution paths with simple conditional branches. | Dynamic state machine that combines deterministic scripts (**Functions**) and non-deterministic LLM loops (**Agents**). |
| **Ingress Resolution** | Static webhook mappings to input JSON. | Ingress engine with built-in **Identity Resolution** (maps phone numbers, Slack IDs, and emails to internal Pod user identities). |
| **Failure Recovery** | Restarts the execution sequence from the beginning. | Steps enter `WAITING` or `FAILED` state durably, allowing a user to adjust credentials or fix code in the sandbox and resume. |

### Concepts to Unlearn
*   **Discard Stateless Linear Pipelines**: In Zapier, a run executes within seconds and ceases. If it fails, the run is abandoned. In Lemma, workflows are persistent. If a network call fails, the transaction is safely rolled back, and the workflow enters a suspended state, maintaining its execution context for manual resumption.

---

## 4. vs. Notion / Airtable (Collaborative Databases)

### Common Ground
Both serve as relational, collaborative datastores where teams can define structured records (leads, tasks, tickets) alongside unstructured documentation (markdown files, playbooks).

### Displacements
*   **Custom CRM API Glue**: Obsoletes the need to write backend API layers to connect agent execution tools to standard corporate tables.
*   **External Vector Search Layers**: Obsoletes indexing pipelines that sync table/document contents into a separate vector database (e.g. Pinecone).

### Structural Differences

| Metric | Notion / Airtable | Lemma |
|---|---|---|
| **Database Architecture** | Proprietary document store / NoSQL engine. | Compiles Pod schemas directly into standard PostgreSQL schemas with dynamic DDL generation. |
| **Agent Membership** | Agents act as external integrations via API tokens. | Agents are first-class peers with their own DB roles, RLS policies, and file-access grants. |
| **Policy Enforcement** | Checked at the API/Client layer. | Compiled into native Postgres Row-Level Security (RLS) policies at the database layer. |

### Concepts to Unlearn
*   **Discard Client-Side Security Assumptions**: Collaborative database platforms often manage permissions by hiding UI elements. In Lemma, permissions are hard security boundaries. An agent trying to read a table without an explicit grant will trigger a native database permission error.

---

## 5. vs. Composio (Tool Delivery Hubs)

### Common Ground
Both compile third-party API specs (OpenAPI JSON/YAML) into structured tool schemas that LLMs can invoke, managing OAuth handshake redirects.

### Displacements
*   **Eager Tool Loading**: Obsoletes python modules that eagerly import dozens of heavy client libraries, which slows down process startup.
*   **Remote Tool SaaS Gateways**: Obsoletes the requirement to send data through an external service to execute local actions.

### Structural Differences

| Metric | Composio | Lemma |
|---|---|---|
| **Execution Topology** | Remote SaaS-centric routing. | Local-first; can execute tools completely offline within the local stack sandbox. |
| **Tool Loading** | Heavy upfront registration. | Lazy-loaded tool catalogs (`lemma_connectors_laziness.py`) to keep startup times low. |
| **Secrets Tenancy** | Stored in Composio’s cloud vault. | Decrypted locally in memory, keeping credentials bounded by the Pod's database. |

### Concepts to Unlearn
*   **Discard Synchronous Credential Assumptions**: In standard tool hubs, credentials are assumed to be loaded into environment variables globally. In Lemma, connectors resolve credentials on a per-run basis using delegation tokens. An agent executes a tool using the caller's specific token, preventing session-hijacking or privilege escalation.
