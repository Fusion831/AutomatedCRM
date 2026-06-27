# Lemma Platform Capability & Boundary Map

This capability map defines the structural boundaries, optimal integration zones, and architectural limitations of the Lemma platform, outlining how developers can maximize their leverage when prototyping applications.

---

## 1. Natural Integrations (Optimal Fit)
The architecture of Lemma natively supports specific patterns of asynchronous, stateful, and integrated workflows:

- **Asynchronous, Human-in-the-Loop Orchestrators**: Applications requiring multi-stage human approval, validation, or manual input (e.g., expense approval portals, content moderation queues, document editing loops). The `FormNode` and `WorkflowEngine` suspend/resume lifecycle makes this trivial to implement.
- **Stateful Multi-Agent Networks**: Multi-agent task delegation systems where a coordinator agent spawns, awaits, and processes outputs from specialized sub-agents. The parent-child conversation tracking and `SubAgentService` support this naturally.
- **SaaS Event-Driven Integrations**: Event-driven automation bridging SaaS tools (e.g., Slack, GitHub, HubSpot, Calendars) using either Lemma's native `Connector` system or the Composio Action network.
- **Database-Driven Assistants**: Agents that read, write, and react to structured schemas. The real-time updates and schema-backed `Table` / `Record` primitives allow agents to serve as autonomous database operators.

---

## 2. Awkward Configurations (Architectural Anti-Patterns)
Certain requirements will be highly complex or unworkable within Lemma's current constraints:

- **Sub-Second Interactive Loops**: Lemma is not designed for low-latency operations. Sandbox orchestration, container overhead, database transaction locking, and agent model invocation mean execution loops are measured in seconds. Real-time gaming, high-frequency trading, or instant messaging filters are not viable.
- **Persistent Web Daemons in Sandbox**: Running long-lived background listener processes (e.g., hosting an express web server inside the `AgentBox` container) is fragile. The sandbox is built to execute ephemeral CLI commands and synchronize file outputs.
- **Heavy Local Compute / GPU Workloads**: The sandbox runs in isolated Docker containers with limited resources. Fine-tuning models, rendering 3D graphics, or processing large-scale video files locally in `AgentBox` will fail or hit resource ceilings.
- **Custom Collaborative UI Canvases**: While the platform supports JSON-schema forms, it has no built-in frontend canvas rendering. Complex graphical workspaces (like whiteboards or Figma-like editors) require building a custom external frontend that hooks into Lemma’s WebSocket table feeds.

---

## 3. Developer Leverage Zones (Hackathon Power-Ups)
To construct a high-impact demo quickly, leverage these pre-built capabilities rather than writing custom boilerplate:

- **Dynamic Schema Forms**: Instead of building custom user input screens, use a `FormNode` with a resolved `input_schema` and `ui_schema`. The platform renders the form in the UI automatically and blocks the execution path until it's completed.
- **Workspace File Management**: The platform automatically synchronizes files between the host script and the isolated agent workspace. Let agents generate markdown, charts, or CSVs inside the sandbox, then fetch them via the `WorkspaceFileManager`.
- **Shared Pod Datastore**: Since both the local script and the sandboxed agent read from/write to the same Pod tables, you can use the database as a shared state pool. The local script can monitor tables for changes and instantly trigger front-end updates.
- **Self-Healing Reconciler**: Rely on the `RunResumeService` sweep. If your agent or function tool executes a long-running job and the connection drops, the reconciler automatically self-heals and continues the workflow run.

---

## 4. Architectural Prototypes
The following three prototype patterns maximize the use of SDK primitives and show how diverse systems can be composed:

### Prototype 1: Autonomous CRM pipeline with Human Gatekeeping
* **Concept**: An agent automatically monitors a lead signup table, evaluates lead quality using external tools, executes a sub-agent to draft a personalized sales deck, and suspends for a manager to approve the pitch before emailing the client.
* **Primitives Used**: `Pod`, `Table`, `Record`, `Agent` (Parent and Sub-Agent), `Workflow` (`FormNode`, `AgentNode`), `Connector` (Composio Email/Slack).
* **Rankings**:
  * **Execution Difficulty**: **Medium** (requires coordinating parent/sub-agent state and setting up the workflow graph).
  * **Reliance on SDK**: **High** (highly dependent on workflow stepping, form suspension, and dynamic schema rendering).
  * **Potential Demo Impact**: **Very High** (clearly demonstrates the human-in-the-loop transition and autonomous tool utilization).

### Prototype 2: Multi-Source Market Intelligence Compiler
* **Concept**: A scheduled workflow scrapes web search results, compiles competitor pricing into a PDF inside `AgentBox`, pushes the file to the Pod workspace, and updates a tracking table with summarized stats.
* **Primitives Used**: `Pod`, `Table`, `Agent`, `Function` (Web Scraper), `File`, `Connector` (Search/Notion).
* **Rankings**:
  * **Execution Difficulty**: **Low-Medium** (mostly relies on file I/O operations and model execution).
  * **Reliance on SDK**: **Medium** (utilizes file synchronizer and table insertions).
  * **Potential Demo Impact**: **Medium** (excellent utility demo, showing how files move in and out of sandboxes).

### Prototype 3: Automated Employee Onboarding & Asset Provisioner
* **Concept**: Upon a new row in the `employees` table, a loop node processes a list of default accounts to provision (Slack, GitHub, Gmail) via Composio, creates a calendar invite, and requests physical asset verification from IT.
* **Primitives Used**: `Pod`, `Table`, `Workflow` (`LoopNode`, `DecisionNode`, `FormNode`), `Connector` (Composio Integrations).
* **Rankings**:
  * **Execution Difficulty**: **High** (requires complex JSON graph configurations, parallel loop execution, and multiple external authentications).
  * **Reliance on SDK**: **Very High** (extensively exercises loops, conditional routing, and connector credentials).
  * **Potential Demo Impact**: **High** (impressive automation pipeline executing real-world API tasks).
