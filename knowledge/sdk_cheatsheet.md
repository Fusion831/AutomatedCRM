# Lemma Python SDK Cheatsheet & Developer Reference

This cheatsheet provides an actionable, syntax-accurate guide to the Lemma Python SDK (`lemma-sdk`), covering client initialization, core primitives, methods, common design patterns, and a standalone script.

> [!IMPORTANT]
> This guide is based directly on the Python SDK source code located in `lemma-python/lemma_sdk/`. Refer to [client.py](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-python/lemma_sdk/client.py), [pod.py](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-python/lemma_sdk/pod.py), and the resource modules under [resources](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-python/lemma_sdk/resources/) for implementation details.

---

## 1. Setup and Initialization

The Lemma SDK supports two entry points:
*   **`Lemma`**: Used for organization-level actions (e.g., organization management, tenant-wide connector configurations, global tools, and runtime profiles).
*   **`Pod`**: Scoped to a specific Pod. This is the main interface for data operations, file management, agent runs, functions, and workflows.

### Configuration Hierarchy
The SDK resolves base URLs, tokens, organization IDs, and Pod IDs in the following order:
1.  Explicit constructor arguments.
2.  Environment variables:
    *   `LEMMA_TOKEN`: The API key or workload JWT token (injected automatically in Lemma functions).
    *   `LEMMA_POD_ID`: The default Pod UUID (injected automatically in Lemma functions).
    *   `LEMMA_ORG_ID`: The target organization UUID.
    *   `LEMMA_BASE_URL`: Base API URL (defaults to `https://api.lemma.work`).
    *   `LEMMA_AUTH_URL`: Authentication portal (defaults to `https://lemma.work/auth`).
    *   `LEMMA_SSL_NO_VERIFY`: Disable SSL checks if set to `1`, `true`, `yes`, or `on` (useful for local development).
    *   `LEMMA_CONFIG_FILE`: Override path to CLI config.
3.  CLI config file (`~/.lemma/config.json`).

### Initialization Examples

```python
from lemma_sdk import Lemma, Pod

# 1. Pod-scoped initialization from environment variables / CLI session
pod = Pod.from_env()

# 2. Org-scoped initialization from environment variables / CLI session
lemma = Lemma.from_env(org_id="your-org-uuid")

# 3. Explicit instantiation (no environment variables required)
pod = Pod(
    pod_id="your-pod-uuid",
    org_id="your-org-uuid",
    token="your-api-token",
    base_url="http://127.0.0.1:8711",
    verify_ssl=False
)

# 4. Deriving a Pod instance from an existing Lemma client (shares transport)
pod = lemma.pod("your-pod-uuid")
```

---

## 2. Crucial Classes and Resource Facades

Resource modules are exposed as lazy-loaded `cached_property` descriptors on `Lemma` and `Pod` instances. This prevents loading the entire class/OpenAPI model hierarchy until a resource is accessed.

### Client-Level Resource Facades (`Lemma`)
*   `lemma.orgs`: Organization CRUD.
*   `lemma.org`: Bounds operations to the active organization (`lemma.org.get()`).
*   `lemma.pods`: CRUD and instantiation of Pods.
*   `lemma.user`: User profiles and settings.
*   `lemma.connectors`: Organization-level connector integrations, auth configs, and connected accounts.
*   `lemma.tools`: Standard platform tools (e.g., `lemma.tools.web_search()`).
*   `lemma.runtime` & `lemma.org_runtime`: System harnesses and execution profile management.

### Pod-Level Resource Facades (`Pod`)
*   `pod.tables`: Schema definition for datastores.
*   `pod.records`: Low-level record CRUD.
*   `pod.table(name)`: Returns a convenience wrapper class (`Table`) binding `PodRecords` to a specific table name.
*   `pod.queries` / `pod.query(sql)`: Executes read-only SQL queries across Pod tables.
*   `pod.files`: Manages document RAG, folders, public links, and binary streams.
*   `pod.functions`: Creates and runs serverless python functions.
*   `pod.agents`: Manages agent personas, configurations, and permissions.
*   `pod.conversations`: Sends messages, manages streaming, and processes user approvals for agents.
*   `pod.workflows`: Declares workflow graphs, manages runs, and submits interactive forms.
*   `pod.schedules`: Cron/interval schedulers.
*   `pod.apps`: Packages and uploads front-end bundles/UI widgets.
*   `pod.surfaces`: Connects third-party messaging channels (e.g., Slack, email).
*   `pod.connectors`: Scopes connector execution to the Pod.

---

## 3. Core Synchronous & Asynchronous Methods

The primary client (`Lemma`/`Pod`) executes synchronous HTTP requests. For asynchronous operation, the underlying generated client exposes async methods (e.g., `asyncio_detailed()` / `asyncio()`).

### Table & Record CRUD
```python
# Create a table wrapper
table = pod.table("customers")

# Create a record (returns the bare dict, no nested envelope)
customer = table.create({
    "name": "Jane Doe",
    "email": "jane@example.com",
    "tier": "enterprise"
})
customer_id = customer["id"]

# Retrieve a single record
customer_row = table.get(customer_id)

# Update a record (only the specified fields are mutated)
table.update(customer_id, {"tier": "vip"})

# List records with filters and sort
list_response = table.list(
    limit=50,
    filter=[{"field": "tier", "op": "eq", "value": "vip"}],
    sort=[{"field": "created_at", "direction": "desc"}]
)
records = list_response.items  # list of models

# Execute a SQL query (Joins, aggregates)
query_response = pod.query("SELECT tier, count(*) as count FROM customers GROUP BY tier")
results = query_response.items  # list of dict-like structures
```

### Files & Document Search (RAG)
```python
# Upload local file & create folders
pod.files.create_folder("/knowledge/billing", description="Invoices and Billing Guidelines")
file_detail = pod.files.upload("runbook.pdf", directory_path="/knowledge/billing")

# Retrieve converted markdown representations of documents
markdown_bytes = pod.files.download_markdown("/knowledge/billing/runbook.pdf")
markdown_text = markdown_bytes.decode("utf-8")

# Search over files (semantic and text vector search)
search_response = pod.files.search(
    "invoice net payment terms",
    scope_path="/knowledge",
    scope_mode="SUBTREE",       # SUBTREE (default) or DIRECT
    search_method="HYBRID"      # HYBRID, VECTOR, or TEXT
)
for hit in search_response.items:
    print(f"File: {hit.path} | Score: {hit.score} | Fragment: {hit.content_fragment}")
```

### Agents & Interactive Conversations
```python
# Send a message to an agent (creates a conversation and returns a handle)
conv = pod.agents.run("support_bot", message="How do I request a refund?")
conversation_id = str(conv.id)

# Retrieve message history
history = pod.conversations.messages(conversation_id, limit=50)
for msg in history.items:
    print(f"{msg.sender_type}: {msg.content}")

# Resolving User Approvals (for human-in-the-loop workflows)
approvals = pod.conversations.approvals(conversation_id)
for approval in approvals.items:
    if approval.status == "PENDING":
        pod.conversations.resolve_approval(
            conversation_id=conversation_id,
            approval_id=approval.id,
            request={"decision": "APPROVED", "reason": "Authorized by administrator"}
        )
```

### Serverless Functions
```python
# Synchronously invoke a python function
run_response = pod.functions.run("process_refund", {"ticket_id": "rec-123"})
print(f"Status: {run_response.status} | Output: {run_response.output_data}")
```

### Workflows
```python
# Create workflow run
run = pod.workflows.create_run("nightly_reconciliation")
run_id = str(run.id)

# If the run halts at a user-facing FORM node, submit the input fields
if run.status == "WAITING" and run.active_wait:
    pod.workflows.submit_form(
        run_id=run_id,
        node_id=run.active_wait.node_id,
        inputs={"review_approved": True, "notes": "Looks solid"}
    )
```

---

## 4. Common Design Patterns

### Pattern A: Streaming Agent Responses
To consume tokens dynamically as they are generated by an agent:

```python
# Call run with stream=True to receive a raw streaming HTTPX response
stream_response = pod.agents.run("customer_concierge", "Summarize ticket #445", stream=True)

try:
    for chunk in stream_response.iter_bytes():
        if chunk:
            print(chunk.decode("utf-8", errors="replace"), end="", flush=True)
finally:
    stream_response.close()
```

### Pattern B: Polling Workflow/Function Execution Status
Since functions and workflow nodes can run asynchronously:

```python
import time

def wait_for_function_completion(pod, func_name: str, run_id: str, timeout: int = 60) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        run = pod.functions.run_get(func_name, run_id)
        if run.status in {"COMPLETED", "FAILED", "CANCELLED"}:
            return run.to_dict()
        time.sleep(1)
    raise TimeoutError("Function run timed out")
```

### Pattern C: High-Throughput Bulk Operations
Always use bulk endpoints when writing or deleting more than a few rows to avoid network bottlenecks:

```python
# Bulk create
inserted_count = pod.records.bulk_create("logs", [
    {"level": "info", "message": "Initialized system"},
    {"level": "warning", "message": "High memory consumption detected"}
], upsert=True) # upsert=True reconciles primary key conflicts

# Bulk update (each row dict MUST contain the primary key)
updated_count = pod.records.bulk_update("logs", [
    {"id": "log-uuid-1", "resolved": True},
    {"id": "log-uuid-2", "resolved": True}
])

# Bulk delete
deleted_count = pod.records.bulk_delete("logs", ["log-uuid-1", "log-uuid-2"])
```

---

## 5. Minimum Viable Script

Here is a complete, runnable script demonstrating authenticated client initialization, schema creation, record insertion, and agent invocation.

```python
#!/usr/bin/env python3
import os
from lemma_sdk import Lemma, Pod
from lemma_sdk.openapi_client.models.create_table_request import CreateTableRequest
from lemma_sdk.openapi_client.models.column_schema import ColumnSchema
from lemma_sdk.openapi_client.models.datastore_data_type import DatastoreDataType

def main():
    # 1. Initialize Clients (configured from environment variables)
    # Ensure LEMMA_TOKEN, LEMMA_ORG_ID, and LEMMA_POD_ID are set.
    token = os.environ.get("LEMMA_TOKEN", "mock-token-for-dev")
    org_id = os.environ.get("LEMMA_ORG_ID", "your-org-uuid")
    pod_id = os.environ.get("LEMMA_POD_ID", "your-pod-uuid")
    base_url = os.environ.get("LEMMA_BASE_URL", "http://127.0.0.1:8711")

    # Connect to the Pod
    pod = Pod(
        pod_id=pod_id,
        org_id=org_id,
        token=token,
        base_url=base_url,
        verify_ssl=False
    )

    table_name = "incidents"

    # 2. Check if table exists, or create a schema-backed Table
    try:
        pod.tables.get(table_name)
        print(f"Table '{table_name}' already exists.")
    except Exception:
        print(f"Creating table '{table_name}'...")
        pod.tables.create(
            CreateTableRequest(
                name=table_name,
                columns=[
                    ColumnSchema(name="title", type_=DatastoreDataType.TEXT, required=True),
                    ColumnSchema(name="severity", type_=DatastoreDataType.TEXT, default="medium"),
                    ColumnSchema(name="status", type_=DatastoreDataType.TEXT, default="open")
                ],
                enable_rls=False # Shared team table
            )
        )

    # 3. Insert a Record (returns bare dict containing auto-generated ID)
    table = pod.table(table_name)
    record = table.create({
        "title": "Database connection timeout during routine backup",
        "severity": "high",
        "status": "open"
    })
    record_id = record["id"]
    print(f"Inserted record with ID: {record_id}")

    # 4. Invoke an Agent
    agent_name = "triage_agent"
    try:
        # Send a message to the agent about the incident
        conv = pod.agents.run(
            name_or_id=agent_name,
            message=f"Triage incident: {record['title']} (ID: {record_id})"
        )
        print(f"Started conversation {conv.id} with agent '{agent_name}'.")
    except Exception as exc:
        print(f"Agent invocation failed: {exc} (Ensure '{agent_name}' exists in the Pod).")

    # Cleanup connection pools
    pod.close()

if __name__ == "__main__":
    main()
```
