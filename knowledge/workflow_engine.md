# Lemma Workflow Engine Architecture

This document describes the platform's core Workflow engine, covering the definition schema, processing models, state persistence, human-in-the-loop approvals, and failure-handling strategies.

---

## 1. Workflow Definition

Workflows in Lemma are defined as **JSON Directed Acyclic Graphs (DAGs)**. The main structure is managed by the `FlowEntity` aggregate root:

- **Nodes (`nodes: list[WorkflowNode]`)**: A list of typed steps that represent actions in the flow. Supported node types include:
  - `FormNode`: Suspends execution for human input or approval.
  - `AgentNode`: Invokes a sandboxed agent within a conversation lifecycle.
  - `FunctionNode`: Runs a python backend or worker task.
  - `DecisionNode`: Evaluates conditional branching rules.
  - `LoopNode`: Iterates over an array of items.
  - `WaitUntilNode`: Suspends execution until a timer or cron schedule is satisfied.
  - `EndNode`: Marks the successful completion of a graph path.
- **Edges (`edges: list[WorkflowEdge]`)**: Edges connect a source node to a target node. Edge transitions are linear: non-decision nodes can have at most one outgoing edge. Branching decisions are configured inside the `DecisionNode` rules rather than using multiple outgoing edges.
- **Validation**: When a graph is saved, the `FlowGraphValidator` runs compile-time checks to ensure:
  - Only one entry candidate node exists.
  - All nodes are reachable from the entry node.
  - No cyclic branches exist without a suspend/wait node.
  - All JMESPath expressions inside bindings compile syntactically.

---

## 2. Processing & Scale Model

- **Step-by-Step Advancements**: The workflow engine is built around the `RunStepper` and the `WorkflowEngine` services. Execution runs synchronously in-process inside `RunStepper.advance(...)`. The stepper advances the graph sequentially until it hits:
  - A `Suspend` outcome (timer wait, agent run completion, backend function wait, or human form submission).
  - A `Halt` outcome (completion of the run).
  - A runtime step failure.
- **Concurrency & Scaling**:
  - While individual step resolution runs in a synchronous loop, it is designed for asynchronous scheduling.
  - Worker threads run the stepper in **short-lived database transactions**. The run state and wait conditions commit atomically via `SqlAlchemyUnitOfWork`.
  - To scale and protect against parallel execution conflicts (e.g. double-resumes), the engine uses PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) on the `flow_run` row during resume operations.

---

## 3. State Persistence & Data Flow

- **FlowRunEntity (`flow_run`)**: Stores overall execution status (`status: FlowRunStatus`), the current node ID, the loop execution stack (`LoopFrame` list), and the execution history list of `StepRecord`.
- **RunContext (`execution_context`)**: Stored as a JSON column containing:
  - `start`: Trigger inputs (payload, metadata, and LLM output).
  - `nodes`: Outputs from completed nodes, stored as a dictionary under each node ID namespace: `nodes[node_id] = output`.
  - `loop`: Innermost loop iterator data.
- **Data Flow (Step A -> Step B)**:
  - When Step A finishes, its output is normalized to a dictionary and written to `execution_context.nodes[step_a_id]`.
  - Step B defines input parameters using `ExpressionInputBinding`.
  - When Step B begins, the context reader resolves the JMESPath expressions (e.g. `step_a_id.result_field`) against the flattened view of the run context, feeding concrete parameters to the node executor.

---

## 4. Interrupts & Human Approvals

The platform handles "human-in-the-loop" states using the `FormNode`:

1. **Suspension**: When the stepper hits a `FormNode`, the `FormExecutor` runs:
   - It resolves the assigned member ID (from expression or literal).
   - It resolves the dynamic input and UI schemas against the current context.
   - It yields a `Suspend` outcome carrying a `WaitRequest` of type `WorkflowRunWaitType.HUMAN`.
2. **Persistence**: The stepper marks the step status as `WAITING`, transitions the run status to `FlowRunStatus.WAITING`, and commits a `WorkflowRunWaitEntity` containing the resolved schema and assignment details.
3. **Resumption**:
   - A user or external interface submits form inputs via `submit_form(run_id, node_id, inputs)`.
   - The engine validates permissions and checks if the requester matches the assignee.
   - The inputs are validated against the stored JSON schema.
   - The wait record is marked as complete, the run status returns to `RUNNING`, the input payload is written to the node's output context, and the stepper resumes execution via `continue_after(...)`.

---

## 5. Failures & Recovery

- **Node Exceptions**: If an executor raises an exception, the current step is marked `FAILED` and its `error` field is set to a summarized message. The overall run status is updated to `FlowRunStatus.FAILED`, storing the `failed_node_id` and the truncated traceback.
- **Reconciler Sweep**:
  - Active `AGENT` or `FUNCTION` waits can get orphaned if the system crashes or message callbacks fail.
  - The `RunResumeService` runs a cron job (`reconcile_stale_waits`) every few minutes to sweep active waits older than 10 minutes.
  - It queries the source of truth (the conversation state or the function execution worker) to automatically resume or fail stale workflow runs.

---

## Step-by-Step Workflow Lifecycle Sequence

The following diagram illustrates the lifecycle of a workflow containing an automated step, a human approval suspend point, and final step completion.

```
Trigger / Caller        WorkflowEngine          RunStepper           FormExecutor          Human Actor
      |                       |                     |                     |                     |
      |--- start_run -------->|                     |                     |                     |
      |    (Manual/Event)     |--- advance -------->|                     |                     |
      |                       |    (Loop starts)    |                     |                     |
      |                       |                     |--- execute node --->|                     |
      |                       |                     |    (FormNode)       |                     |
      |                       |                     |<-- Suspend (HUMAN) -|                     |
      |                       |<-- StepResult ------|                     |                     |
      |                       |    (Wait request)   |                     |                     |
      |                       |                     |                     |                     |
      |                       |-- persist Wait -----|                     |                     |
      |                       |   and commit UoW    |                     |                     |
      |                       |                     |                     |                     |
      |                       |===================== Workflow Run Suspended (WAITING) ==========|
      |                       |                     |                     |                     |
      |                       |                     |                     |                     |   [Submit Form]
      |                       |                     |                     |                     |-----+
      |                       |                     |                     |                     |     | Authorize
      |                       |                     |                     |                     |<----+ & Validate
      |                       |<----------------------------------------------------------------|
      |                       |                     |                     |                     |
      |                       |--- continue_after ->|                     |                     |
      |                       |    (Loop resumes)   |                     |                     |
      |                       |                     |--- next node ------>|                     |
      |                       |                     |    (EndNode)        |                     |
      |                       |                     |<-- Halt (Complete)-|                     |
      |                       |<-- StepResult ------|                     |                     |
      |                       |    (No waits left)  |                     |                     |
      |                       |                     |                     |                     |
      |                       |-- commit UoW -------|                     |                     |
      v                       v                     v                     v                     v
```
