# Lemma Platform Execution Boundaries

This document details the security, networking, and execution boundaries between the host machine, the `lemma-backend` service, and the isolated `agentbox` runtime run containers.

---

## 1. Host vs. Container File Allocation & Synchronization

```
+-------------------------------------------------------------------------+
|                              HOST MACHINE                               |
|                                                                         |
|  +-----------------------+              +----------------------------+  |
|  |     Local Script      |              |         Local SDK          |  |
|  |                       |              |     (e.g., Python Client)  |  |
|  +-----------+-----------+              +-------------+--------------+  |
|              |                                        |                 |
+--------------|----------------------------------------|-----------------+
               |                                        |
               | [HTTP/WS API Requests]                 | [File Upload/Download]
               v                                        v
+-------------------------------------------------------------------------+
|                         LEMMA PLATFORM BACKEND                          |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |                      FastAPI API Controllers                      |  |
|  |  * Authenticates calls, enforces RLS, & performs grant checks.    |  |
|  +--------------------+--------------------------------+-------------+  |
|                       |                                |                |
|  [PydanticAI / LLM]   | [Manages permanent files]      | [AgentBox API] |
|  * Runs in-process    v                                v                |
|  * Uses revealed     +-----------------+              +--------------+  |
|    API keys (never   | Pod Datastore   |              | AgentBox     |  |
|    sent to sandbox)  | (S3/MinIO/DB)   |              | Client       |  |
|                      +--------+--------+              +------+-------+  |
+-------------------------------|------------------------------|----------+
                                |                              |
                                | [File Sync via CLI]          | [exec_command / base64]
                                v                              v
+-------------------------------------------------------------------------+
|                            AGENTBOX RUNTIME                            |
|                                                                         |
|   +------------------------------------------------------------------+  |
|   |                    Isolated Sandbox Container                    |  |
|   |                                                                  |  |
|   |   +-------------------+              +------------------------+  |  |
|   |   | Ephemeral Env     |              | Working Directory      |  |  |
|   |   |                   |              | (/workspace/conv/...)  |  |  |
|   |   | * LEMMA_TOKEN     |              |                        |  |  |
|   |   | * LEMMA_BASE_URL  |              | * Stores output files. |  |  |
|   |   | * LEMMA_POD_ID    |              | * Runs Python kernels. |  |  |
|   |   +---------+---------+              | * Completely wiped on  |  |  |
|   |             |                        |   container reap/OOM.  |  |  |
|   |             |                        +------------------------+  |  |
|   |             | [lemma files download/upload]                      |  |
|   |             v                                                    |  |
|   |       [Lemma CLI Binary] <=======================================+  |  |
|   +------------------------------------------------------------------+  |
|                                                                         |
+-------------------------------------------------------------------------+
```

### File Allocation
When an agent executes code or commands (e.g., via `execute_python` or `exec_command`) that produce files, they land in the **workspace sandbox** directory inside the container, typically at `/workspace/conversations/{conversation_id}`.

These files are local to the container filesystem and are **not** directly visible or exposed to the user or the host filesystem.

### File Synchronization Mechanics
Lemma does not mount a shared network folder or volume between the host and the sandbox container. Instead, synchronization is bridged through:

1. **Backend-to-Sandbox (WorkspaceFileManager)**:
   - When the backend needs to write a scratch file into the sandbox, the `WorkspaceFileManager` converts the content into a Base64 string and schedules an `exec_command` API request to the `AgentBoxClient`:
     ```bash
     mkdir -p <directory> && printf %s <base64_payload> | base64 -d > <file_path>
     ```
   - When reading a file from the sandbox, it executes a command to print the Base64 representation of the file and decodes it on the backend:
     ```bash
     base64 -w 0 <file_path>
     ```

2. **Sandbox-to-Datastore (Lemma CLI)**:
   - The workspace container has the `lemma` CLI binary pre-installed.
   - To make a generated file accessible to the user, the agent invokes `lemma files upload <path>` from inside the sandbox container. This command uses the container's environment configuration to upload the file back to the Pod Datastore (`/me/...` or `/pod/...`).

---

## 2. Environment Pass-through & Secret Protection

### Isolation of Foundation Model Credentials
To prevent key leakage, API credentials (e.g., Anthropic, OpenAI, or Google Vertex keys) are **never exposed to the AgentBox container**:

- **In-process execution**: The local `LEMMA` (PydanticAI) harness runs directly in the `lemma-backend` process. The backend resolves secrets from the `AgentRuntimeProfile` (using `reveal_credentials`) and sends requests to the LLM providers over HTTPS.
- **Daemon execution**: For external daemons (like `CLAUDE_CODE` or `CODEX`), credentials are passed directly over the WebSocket to the user's secure host-side daemon process, keeping them isolated from the tool execution sandbox.

### Sandbox Environment Injection
When an `AgentBoxWorkspaceSession` is established, only delegated platform variables are injected:

- `LEMMA_TOKEN`: A short-lived JSON Web Token (JWT) minted specifically for the run using `build_delegation_claims()`. It restricts authorization to the active pod, workload, and conversation session.
- `LEMMA_BASE_URL`: The platform's internal API route (e.g., `http://host.docker.internal:8711` or a custom container callback URL).
- `LEMMA_USER_ID`, `LEMMA_POD_ID`, and `LEMMA_ORG_ID`: Contextual UUIDs allowing internal tools to automatically scope requests without hardcoding IDs.

---

## 3. Networking Limitations & Sandboxing Policies

AgentBox containers execute arbitrary user and agent-generated scripts, introducing security risks. Egress and ingress are bounded by the following policies:

1. **Search Offloading**:
   - Outbound web searches are offloaded to the backend via the `web_search` tool, which queries external APIs (e.g., Tavily or Google Search) and feeds clean summaries back to the LLM. This keeps the container from directly crawling public pages.
2. **Container Network Isolation**:
   - Outbound traffic is restricted at the container network namespace level (via Docker network settings or Kubernetes `NetworkPolicies`).
   - In production, outbound access to ports such as SMTP (Port 25) is blocked to prevent spamming, and connections to internal corporate subnets (RFC 1918 addresses) are firewalled to prevent Server-Side Request Forgery (SSRF) and intranet port scanning.
   - Incoming connections to ports inside the sandbox are blocked; communication is strictly outbound-polling from the sandbox to the AgentBox manager or via established WebSocket tunnels.

---

## 4. Workspace State Persistence

### Ephemeral Filesystem vs. User Session Lifetime
The state inside the container is split into two layers:

- **Ephemeral filesystem**: Files created on the container filesystem are ephemeral. If the container crashes, hits an Out-Of-Memory (OOM) limit, or is reaped due to inactivity, the entire container is destroyed and replaced with a clean image.
- **User-Scoped Lifecycle**:
  - To minimize cold starts, sandboxes are pooled and mapped to individual users (the container is named `agentbox-{user_id.hex}`).
  - Consecutive agent runs for the same user will reuse the same container, meaning local files and packages installed via `pip install` will persist between quick, sequential turns.
  - An idle reaper cron (`reconcile_orphaned_agent_runs`) sweeps containers that have been inactive for longer than `JOB_TIMEOUT_SECONDS + 300` seconds, destroying all unpersisted changes.

### Explicit State Persistence
To guarantee that files survive container teardowns:
- **Upload to Pod Files**: The agent or script must explicitly save deliverables to the Pod Datastore using the CLI:
  ```bash
  lemma files upload /workspace/my_report.pdf --directory /me/reports
  ```
- **Write to Tables**: Data should be structured and persisted to relational tables using `pod_write_record` or `lemma db` commands.
