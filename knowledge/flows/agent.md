# Flow Trace: Agent Execution

This document traces how an Agent instance is initialized, executes prompts/tools, and streams tokens and results.

---

## Step 1: Trigger & Invocation
*   **Source File**: `lemma-platform/lemma-backend/app/modules/agent/services/agent_runner_service.py`
*   **Method Signature**: 
    ```python
    async def execute(
        self,
        *,
        agent_run_id: UUID,
        user_id: UUID,
        pod_id: UUID,
        agent_name: str | None,
        observer: AgentRunObserver | None = None
    ) -> None
    ```
*   **Details**: Triggered asynchronously via worker queues when a user posts a message or a workflow triggers an agent run.

---

## Step 2: Context Construction & Variables Binding
*   **Source File**: `lemma-platform/lemma-backend/app/modules/agent/services/agent_runner_service.py` (inside `execute`)
*   **Details**:
    1. Loads the conversation history, agent prompt setup, and current message logs:
       ```python
       conversation, agent, agent_run, messages = await self._load_run_context(...)
       ```
    2. Resolves LLM runtime settings, capabilities, and system API credentials:
       ```python
       resolved_runtime = await self._resolve_agent_runtime(...)
       ```
    3. Builds the `ConversationContext` detailing workspace path directories, scopes, and account bindings.
    4. Generates dynamic system context injected briefs (RAG files details, table descriptions) via `AgentContextBriefBuilder().build(...)`.

---

## Step 3: Tool Grants & Capability Packaging
*   **Source File**: `lemma-platform/lemma-backend/app/modules/agent/services/agent_runner_service.py`
*   **Details**:
    1. Gathers authorized first-party and third-party tools via `RunToolAssembler.assemble(...)`.
    2. Packages tools into executable harness operations (checking LLM parameters like multimodal vision gates via `adapt_toolsets_for_vision`).
    3. Instantiates `HarnessOptions` configuring system boundaries, max usage limits, stop checking callbacks, and LLM overrides.

---

## Step 4: LLM Harness Execution
*   **Source File**: `lemma-platform/lemma-backend/app/modules/agent/infrastructure/harnesses/pydantic_ai.py` (for direct in-process calls) or external MCP daemon loops.
*   **Details**: Passes the combined prompt template, history context, and tools to the LLM. The runner listens to events yielded by the LLM stream.

---

## Step 5: Streaming Events and DB Persistence
*   **Source File**: `lemma-platform/lemma-backend/app/modules/agent/services/agent_runner_service.py` -> `_handle_harness_event`
*   **Details**:
    *   **Text/Token Outputs**: Streamed live to frontend surfaces over WebSockets:
        ```python
        await publish_conversation_event(conversation_id, token_payload(...))
        ```
    *   **Assistant/Tool Messages**: Persisted to the database mid-run:
        ```python
        await self.message_writer.persist(...)
        ```
    *   **Human Gating (Approval / Ask User)**: Pauses execution on `AgentEventType.WAITING`. The runner completes the run cleanly (`AgentRunStatus.COMPLETED`) but switches the conversation status to `WAITING` until resolved.
    *   **Execution Finalization**: Calculates token counts, checks usage caps, and registers completion statistics on finish.
