# Flow Trace: Workflow Execution

This document traces the workflow orchestration logic, queue/event starts, parallel step runs, state tracking, and persistence.

---

## Step 1: Triggering the Run
*   **Source File**: `lemma-platform/lemma-backend/app/modules/workflow/execution/engine.py`
*   **Method Signature**:
    ```python
    async def start_run(
        self,
        flow_id: UUID,
        user_id: UUID,
        *,
        trigger: TriggerContext | None = None,
        schedule_event_id: str | None = None,
        ctx: Context | None = None
    ) -> FlowRunEntity
    ```
*   **Details**: Workflows are triggered manually, scheduled by clock timers, or activated on events (like a record posted to a table). The start maps `TriggerContext` into the run scope.

---

## Step 2: Step Advancing Loop
*   **Source File**: `lemma-platform/lemma-backend/app/modules/workflow/execution/stepper.py`
*   **Method Signature**: 
    ```python
    async def advance(self, run: FlowRunEntity, flow: FlowEntity) -> StepResult
    ```
*   **Details**: The engine executes nodes iteratively in a `while run.status == FlowRunStatus.RUNNING:` loop.
    1. Fetches the active node schema.
    2. Evaluates the corresponding node executor from `EXECUTOR_REGISTRY` (e.g. `AgentExecutor`, `FunctionExecutor`, `DecisionExecutor`).
    3. Starts a step tracker:
       ```python
       step = run.begin_step(node.id)
       ```
    4. Runs node execution: `await executor.execute(node, self._step_context(run, flow))`.

---

## Step 3: Outcomes and State Suspends
*   **Source File**: `lemma-platform/lemma-backend/app/modules/workflow/execution/stepper.py` (inside `advance`)
*   **Details**:
    *   **Advance**: Node finishes instantly (e.g. decision routing). Records output, resolves next node ID, and continues loop:
        ```python
        run.record_node_output(node.id, outcome.output)
        ```
    *   **Suspend**: Async node started (e.g. an agent conversation, external API function, or timer).
        1. Suspends step tracking:
           ```python
           run.suspend_step(step, outcome.output, human_wait=...)
           ```
        2. Persists a `WaitRequest` tracking the async reference:
           ```python
           await self.wait_repo.create(self._wait_entity(run, result.wait))
           ```
        3. Returns `StepResult` to pause execution.

---

## Step 4: Loops and Graph Execution Stack
*   **Source File**: `lemma-platform/lemma-backend/app/modules/workflow/execution/stepper.py` -> `move_past` & `_seed_loop_scope`
*   **Details**:
    *   Iterative loops are managed via a stack of `LoopFrame` objects.
    *   When entering a loop, the engine pushes a new frame:
        ```python
        frame = LoopFrame(loop_node_id=node.id, body_node_id=body_id, index=0, items=items, ...)
        run.execution_stack.append(frame)
        ```
    *   `move_past` checks loop depletion, pops exhausted loops, restores parent frames, and aggregates results.

---

## Step 5: Resume & Event Synchronization
*   **Source Files**:
    *   `lemma-platform/lemma-backend/app/modules/workflow/services/run_resume_service.py`
    *   `lemma-platform/lemma-backend/app/modules/workflow/execution/engine.py` -> `resume_internal`
*   **Method Signature**: 
    ```python
    async def resume_internal(
        self,
        wait_type: WorkflowRunWaitType,
        external_ref: str,
        output: Dict[str, Any] | None = None,
        *,
        ctx: Context | None = None
    ) -> FlowRunEntity | None
    ```
*   **Details**:
    1. Listeners catch agent/function completions and route them to `RunResumeService`.
    2. Resolves the active wait record: `find_active_by_external_ref`.
    3. Acquires a database lock on the run: `get_for_update(run_id)`.
    4. Normalizes outputs, marks the wait completed, resumes the run, and triggers `stepper.continue_after(...)` to run the next node blocks.
    5. **Self-Healing Sweep**: A cron sweep (`reconcile_stale_waits`) identifies active waits older than 10 minutes, checks their source of truth statuses, and resolves them if they finished during network drops.
