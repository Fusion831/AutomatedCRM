# Programmatic Primitive Catalog

This document details every programmatic primitive exposed by the Lemma Python SDK (`lemma-python/`) and platform API, including input/output schemas, lifecycle events, relationships, and code samples.

---

## 1. Tables (Structured Dynamic Relational Schemas)

### Purpose
Represents typed database tables configured per Pod. Exists to store structured business data (leads, tickets, event logs) with native Row-Level Security (RLS).

### Parameters & Types
*   `table_name` (str): Unique name identifier.
*   `schema` (dict): Column names mapping to types (`string`, `integer`, `boolean`, `datetime`, `json`).
*   `enable_rls` (bool, default `True`): Toggles whether non-admin creators are restricted to viewing only their own rows.

### Return Structure
*   Returns a Table detail metadata object:
    ```json
    {
      "name": "tickets",
      "columns": [{"name": "title", "type": "string"}],
      "enable_rls": true
    }
    ```

### Lifecycle Events
*   `table_created` / `table_updated` / `table_deleted`

### Direct Relationships
*   Belongs to a **Pod**.
*   Contains multiple **Records**.
*   Restricted by Pod **Permissions** (member roles).

### Python SDK Sample
```python
# Create table and inspect schema details
table_schema = {"title": "string", "status": "string"}
table = pod.tables.create("tickets", columns=table_schema, enable_rls=True)
print(table.to_dict()["name"])
```

---

## 2. Records (Structured Database Rows)

### Purpose
Represents single rows of dynamic data inside a Table. Read and written by agents and humans.

### Parameters & Types
*   `table_name` (str)
*   `data` (dict): Column-key values.
*   `filter` (list of dicts): List of filters (e.g. `{"field": "status", "op": "eq", "value": "new"}`).
*   `sort` (list of dicts): Sort parameters.

### Return Structure
*   Single CRUD: Bare JSON record dictionary (no envelope).
*   List CRUD: Envelope containing `{"items": [...], "total": N, "limit": N, "next_page_token": ...}`.
*   Bulk Operations: Simple integer count `{"count": N}`.

### Lifecycle Events
*   `record_created` / `record_updated` / `record_deleted`

### Direct Relationships
*   Belongs to a **Table**.
*   Written/Read by **Agents** and **Functions**.
*   Triggers **Workflows** (on record insertion/updates).

### Python SDK Sample
```python
# Create record, retrieve it, and update a specific field
t = pod.table("tickets")
row = t.create({"title": "Refund Issue", "status": "new"})
t.update(row["id"], {"status": "resolved"})
```

---

## 3. Agents (Role-Scoped Reasoning Workers)

### Purpose
Conversational LLM-powered workers that execute prompts, utilize tool sets, and maintain context across conversational turns.

### Parameters & Types
*   `agent_name` (str): Agent role identifier.
*   `prompt` (str): System guidance instructions.
*   `tool_grants` (list): Authorized tools/capabilities.
*   `output_schema` (dict, optional): Pydantic-compatible JSON schema for structured outputs.

### Return Structure
*   Agent configuration dictionary including metadata, prompt details, and version mappings.

### Lifecycle Events
*   `AgentRunStartedEvent` / `AgentRunTokenEvent` / `AgentRunCompletedEvent` / `AgentRunFailedEvent` / `AgentRunPausedEvent`

### Direct Relationships
*   Invoked inside **Workflows**.
*   Spawns child sessions via **Conversations**.
*   Uses **Functions** and **Connectors** as tool inputs.
*   Reads/Writes **Tables** and **Files**.

### Python SDK Sample
```python
# Retrieve agent, initialize conversation, and send message
agent = pod.agents.get("triage")
conv = pod.conversations.create_for_agent("triage", title="Triage Ticket")
pod.conversations.send(str(conv.to_dict()["id"]), "Classify refund request")
```

---

## 4. Workflows (Orchestration Graph Runs)

### Purpose
Defines execution graphs connecting multiple Agents, Functions, conditional decisions, and loops into single state-machines.

### Parameters & Types
*   `flow_name` (str): The template identifier.
*   `node_id` (str): Form node ID to submit values mid-run.
*   `inputs` (dict): Key-value schema values mapping to Form node schemas.

### Return Structure
*   Workflow run status metadata dictionary containing state progress (`RUNNING`, `WAITING`, `COMPLETED`, `FAILED`).

### Lifecycle Events
*   `workflow_started` / `workflow_suspended` (waiting for forms) / `workflow_completed` / `workflow_failed`

### Direct Relationships
*   Invokes **Agents** and **Functions**.
*   Triggers on **Table** events or **Schedules**.
*   Creates **Approvals** via Form node states.

### Python SDK Sample
```python
# Create workflow run instance and submit form inputs
wf_run = pod.workflows.create_run("nightly_review").to_dict()
run_id = wf_run["id"]
pod.workflows.submit_form(run_id, node_id="review_form", inputs={"approved": True})
```

---

## 5. Functions (Deterministic Sandboxed Scripts)

### Purpose
Executes developer-authored scripts (Python/JS) inside isolated AgentBox sandbox containers to perform deterministic tasks (calculations, API fetches).

### Parameters & Types
*   `function_name` (str): Script identifier.
*   `data` (dict): Arguments matching the declared Pydantic input model.

### Return Structure
*   Returns run execution summary:
    ```json
    {
      "status": "COMPLETED",
      "output_data": {"result": 42},
      "logs": ["Starting execution...", "Success"]
    }
    ```

### Lifecycle Events
*   `function_run_started` / `function_run_completed` / `function_run_failed`

### Direct Relationships
*   Runs inside **AgentBox** containers.
*   Invoked by **Workflows** or called as tools by **Agents**.
*   Reads/Writes **Tables** and **Files**.

### Python SDK Sample
```python
# Execute sandboxed function with parameter inputs
args = {"ticket_id": "rec-9a2k"}
run = pod.functions.run("triage_ticket", args).to_dict()
print(run["status"], run["output_data"])
```

---

## 6. Approvals (Human-in-the-Loop Resumptions)

### Purpose
Suspends active agent or workflow runs, waiting for a human decision (Approve/Deny) before resuming execution.

### Parameters & Types
*   `conversation_id` (UUID): Target thread id.
*   `approval_id` (str): Unique tool call ID.
*   `decision` (AgentRunApprovalDecision): Either `APPROVE` or `DENY`.
*   `response` (dict, optional): Answers or payload mapping to user request.

### Return Structure
*   None (executes asynchronously and returns HTTP 204/200; resumes the parent run session).

### Lifecycle Events
*   `approval_created` / `approval_resolved` (resumes execution loop)

### Direct Relationships
*   Suspends **Workflows** (Form nodes) or **Agent** execution turns.
*   Resolved from **Apps** or **Surfaces** (Slack/WhatsApp).

### Python SDK Sample
```python
# Approve a pending agent tool call and resume the thread
conv_id = "4fc2061b-49b1-4419-b6f2-9765ccad3c13"
call_id = "call_u19k"
pod.conversations.resolve_user_approval(
    conversation_id=conv_id, approval_id=call_id, decision="APPROVE"
)
```

---

## 7. Apps (Custom Single-Page Interfaces)

### Purpose
Hosts single-page operator cockpit interfaces compiled within the Pod's subdomain routing space.

### Parameters & Types
*   `app_name` (str): Target sub-routing path.
*   `dist_path` (str): Local path containing HTML/JS assets to upload.

### Return Structure
*   App metadata dictionary including sub-domain deployment URLs.

### Lifecycle Events
*   `app_deployed` / `app_deleted`

### Direct Relationships
*   Displays **Table** records.
*   Triggers **Workflows** and **Agents**.
*   Surfaces pending **Approvals** (Form nodes).

### Python SDK Sample
```# Deploy custom HTML index bundle to Pod hosting
# (Invoking deployment endpoint using the generated API client facade)
app_payload = {"name": "crm-app", "description": "Dashboard"}
res = pod.generated.apps_create_or_update(app_payload)
print("Deployed to: ", res.to_dict().get("url"))
```

---

## 8. Files (Indexed Context Documents)

### Purpose
Maintains unstructured files (Markdown/PDF) automatically parsed, vector-embedded, and prepared for RAG search query tasks.

### Parameters & Types
*   `file_path` (str): Local path to file.
*   `directory_path` (str): Destination folder inside the Pod.
*   `query` (str): Semantic text query.
*   `search_method` (str): `TEXT`, `VECTOR`, or `HYBRID`.

### Return Structure
*   Search returns items list containing chunk extracts, matches, and similarity scores.

### Lifecycle Events
*   `file_uploaded` / `file_indexed` / `file_deleted`

### Direct Relationships
*   Used by **Agents** for knowledge injection.
*   Managed by **Functions**.
*   Inherits directory **Permissions** (member roles).

### Python SDK Sample
```python
# Upload report and execute hybrid search over the folder
pod.files.create_folder("/reports")
pod.files.upload("summary.pdf", directory_path="/reports")
hits = pod.files.search("Q3 forecast", scope_path="/reports", search_method="HYBRID")
```

---

## 9. Connectors (External System Operations)

### Purpose
Executes API actions against third-party software catalogs (Gmail, Slack, etc.) using stored organization credentials.

### Parameters & Types
*   `auth_config_name` (str): credential identification name.
*   `operation_id` (str): Action ID retrieved via schema discovery.
*   `payload` (dict): API payload keys matching the operation spec.

### Return Structure
*   Returns the JSON dictionary output matching the remote API response under `["result"]`.

### Lifecycle Events
*   `connector_executed` / `connector_failed`

### Direct Relationships
*   Used as tools by **Agents**.
*   Executed as steps within **Workflows**.

### Python SDK Sample
```python
# Send email using configured Slack/Gmail connectors
email_data = {"recipient_email": "client@org.com", "subject": "Alert", "body": "Update"}
res = pod.connectors.execute("workspace-gmail", "GMAIL_SEND_EMAIL", email_data)
print(res.to_dict()["result"])
```
