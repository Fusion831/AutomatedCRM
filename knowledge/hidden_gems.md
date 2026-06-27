# Lemma Platform Hidden Gems, Undocumented Helpers, & CLI Tricks

This guide documents the hidden utilities, CLI features, and offline configurations built into the Lemma platform codebase to help accelerate local prototyping and integration testing.

---

## 1. Undocumented Helpers

These utility scripts and packages streamline schema generation, documentation compilation, and environment preparation.

### A. Schema Exporter (`export_agent_tool_schemas.py`)
*   **Location**: [export_agent_tool_schemas.py](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-backend/scripts/export_agent_tool_schemas.py)
*   **Purpose**: Dynamically imports and extracts all static, connector, and subagent tools resolved via the backend agent registry. Rather than parsing source files manually, it leverages the live `pydantic-ai` `ToolDefinition` objects to output canonical JSON schemas.
*   **How to Utilize**:
    Run it inside the backend virtual environment to output a complete JSON inventory of supported agent tools (`agent_tool_schemas.json`):
    ```bash
    uv run python scripts/export_agent_tool_schemas.py --output agent_tool_schemas.json
    ```

### B. Skill Doc Generator (`import_connector_catalog.py --generate-skills`)
*   **Location**: [import_connector_catalog.py](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-backend/scripts/import_connector_catalog.py#L1482-L1507)
*   **Purpose**: Auto-generates markdown skill guides for active connector apps. It parses the database-seeded connector schemas and queries a Fireworks DeepSeek LLM to generate scannable tutorials (`app/modules/connectors/skills/<app_id>.md`) showing realistic CLI inputs and tip registers.
*   **How to Utilize**:
    Ensure your Fireworks API key or Lemma OpenAI API key is set, then run:
    ```bash
    uv run python scripts/import_connector_catalog.py --generate-skills
    ```

### C. Bundled Skill Installer (`lemma_cli.cli_core.commands.skills`)
*   **Location**: [skills.py](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-cli/lemma_cli/cli_core/commands/skills.py)
*   **Purpose**: A CLI manager that automatically copies, symlinks, or updates bundled Agent Skill markdown files (supporting the standard Anthropic `SKILL.md` format) into specific directories read by coding assistants like Claude Code, Codex, OpenCode, and Cursor.
*   **How to Utilize**:
    Query bundled skills and deploy them to global user configuration scopes or local directory scopes:
    ```bash
    # List all bundled agent skills (e.g., lemma-builder, lemma-user, lemma-widget)
    lemma skill list
    
    # Auto-detect running coding agents and install curated skills to all of them globally
    lemma skill install
    
    # Install specific skills to Claude Code's user configuration folder
    lemma skill install lemma-builder --target claude --scope user
    
    # Install all skills to Cursor's project folder (.cursor/skills)
    lemma skill install --all-skills --target cursor --scope project
    ```

---

## 2. Built-in CLI Tricks

The Lemma CLI (`lemma-terminal`) contains undocumented commands and option flags that simplify database management, resource verification, and environment setup.

### A. Pod Wiring Diagnostics (`lemma pods doctor`)
*   **Location**: [pods.py](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-cli/lemma_cli/cli_core/commands/pods.py#L329-L434)
*   **Purpose**: Performs static analysis on the pod aggregate to diagnose wiring issues before deployment. It checks if ACL grants target non-existent tables/directories, confirms if agents are missing pinned runtimes, validates that workflow nodes refer to active agents/functions, and verifies surface integrations.
*   **How to Utilize**:
    ```bash
    # Verify the currently selected active pod
    lemma pods doctor
    
    # Verify a specific pod by slug or UUID
    lemma pods doctor --pod my-crm-pod
    ```

### B. Shell Environment Integration (`lemma pods select <name> --export`)
*   **Location**: [pods.py](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-cli/lemma_cli/cli_core/commands/pods.py#L128-L188)
*   **Purpose**: Sets the active pod variables in the *current shell session only*. Standard configurations overwrite the database defaults globally (affecting all terminals). Adding the `--export` or `-x` flag outputs clean shell commands suitable for subshell evaluations.
*   **How to Utilize**:
    Evaluate the output directly in your shell configuration or current terminal prompt:
    ```bash
    eval "$(lemma pods select my-crm-pod -x)"
    ```

### C. Live Datastore Watching & Querying
*   **Location**: [data.py](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-cli/lemma_cli/cli_core/commands/data.py)
*   **Purpose**: The CLI exposes two features for real-time state introspection: executing raw SELECT statements and watching changes streamed over WebSockets.
*   **How to Utilize**:
    ```bash
    # Execute raw read-only SQL SELECT statements directly against the selected pod's datastore schema
    lemma query run "SELECT id, name, status FROM crm_deals WHERE revenue > 5000 LIMIT 10"
    
    # Stream live insertion/updates/deletions from a table to stdout as newline-delimited JSON
    lemma datastore watch crm_deals --output json | jq .
    ```

### D. JSONC Scaffold Reference Generator (`lemma schema <resource>`)
*   **Location**: [app.py](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-cli/lemma_cli/cli_core/app.py#L161-L173)
*   **Purpose**: Instantly outputs the canonical JSONC template/schema mapping for creating pod components. Avoids having to search through documentation for exact configuration properties.
*   **How to Utilize**:
    ```bash
    lemma schema agent
    lemma schema workflow
    lemma schema table
    ```

---

## 3. Hidden Integrations & Offline Configurations

These built-in fallback modes enable offline, low-latency development without requiring Docker or active third-party cloud API credentials.

### A. In-Process Mock Sandbox Manager (`FakeAgentBoxState`)
*   **Location**: [fake_agentbox.py](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-backend/app/modules/workspace/testing/fake_agentbox.py)
*   **Purpose**: Runs sandboxed commands and Python executions directly in local subprocesses using temporary host directories instead of provisioning heavy Docker containers. Emulates the complete HTTP API protocol of the production AgentBox manager.
*   **How to Utilize**:
    Set the environment variable or update your backend `settings.py` parameters before booting the local API:
    ```bash
    # Set the test hook flag to bypass Docker manager
    export E2E_SANDBOX_MODE="fake"
    ```

### B. Filesystem Email Transport
*   **Location**: [config.py](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-backend/app/core/config.py#L380-L387)
*   **Purpose**: Avoids setting up local SMTP servers or linking external email delivery keys (e.g., Mailgun/SendGrid) during local testing. Sent emails are captured and saved as raw text files.
*   **How to Utilize**:
    Configure the backend settings in your `.env` file:
    ```ini
    EMAIL_TRANSPORT=filesystem
    EMAIL_OUTPUT_DIR=C:\Users\daksh\Projects\AutomatedlemmaCRM\.local\emails
    ```

### C. Offline Vector Embeddings & Rerankers
*   **Location**: [config.py](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-backend/app/core/config.py#L689-L730)
*   **Purpose**: Configures the platform to run vector operations entirely offline. It uses a lightweight CPU FastEmbed process and BAAI cross-encoders, skipping expensive OpenAI/Cohere network calls.
*   **How to Utilize**:
    Define local backends in the environment configuration:
    ```ini
    EMBEDDING_PROVIDER=local
    LOCAL_EMBEDDING_MODEL=BAAI/bge-base-en-v1.5
    
    RERANKER_MODE=local
    LOCAL_RERANKER_MODEL=BAAI/bge-reranker-v2-m3
    ```

### D. Offline LLM Emulation (`e2e_llm_mode`)
*   **Location**: [config.py](file:///c:/Users/daksh/Projects/AutomatedlemmaCRM/lemma-platform/lemma-backend/app/core/config.py#L564-L582)
*   **Purpose**: Replaces live LLM provider connections with a deterministic mock `FunctionModel` from `pydantic-ai`. It returns canned responses based on conversation history, permitting end-to-end flow tests without API keys.
*   **How to Utilize**:
    ```ini
    E2E_LLM_MODE=mock
    E2E_MOCK_LLM_LATENCY_MS=200
    ```
