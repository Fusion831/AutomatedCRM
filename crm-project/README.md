# MemoryCRM

A deterministic relationship intelligence system for founders, built on the Lemma Platform.

---

## What It Does

MemoryCRM tracks relationships across interactions, extracts structured facts using an LLM, and makes all consequential decisions — state, priority, recommendations — using deterministic Python code. Every output is explainable and reproducible.

The core product moment: a founder re-opens a dormant conversation and immediately understands who the person is, what was promised, why momentum stopped, and what to do next — without reading a single email.

**Design principle:** AI extracts facts. Code makes decisions.

---

## Architecture

The project has two layers:

```
crm-project/
├── memory-crm/          # Lemma Pod: tables, functions, agents, workflows
│   ├── tables/          # 14 datastore schemas
│   ├── functions/       # 10 deterministic engine functions
│   ├── agents/          # consolidated-extractor, resurrection-agent
│   └── tests/           # 10 test files, mock-based, no network
└── backend/
    └── services/        # Python service layer wrapping Pod APIs
```

---

## Intelligence Engines

All engines are pure Python functions deployed to the Lemma Pod. No engine calls an LLM.

### Consolidated Extractor
The only LLM component in the pipeline. Reads a raw interaction and existing contact memory. Extracts: identity facts, relationship thesis updates, drivers, objections, new commitments with evidence quotes, commitment reconciliations, and milestones. Output is structured JSON consumed by downstream engines.

### Relationship State Engine
Determines the current state of a relationship from stored facts. Six states: `waiting_on_me`, `waiting_on_them`, `mutual_exploration`, `blocked`, `cooling`, `reengagement_candidate`. Uses anti-flapping rules to prevent thrash. Every transition is logged to the audit trail.

### Priority Engine
Produces a 0-100 priority score for every contact using additive scoring rules: overdue commitments (+50), upcoming commitments (+30), tier (+10/20), blocked state (+25), inactivity (+10-15), expected touch date overdue (+20). Scores are capped at 100. Changes of 5+ points are logged as audit events.

### Recommendation Engine
Generates a single deterministic next-action recommendation per contact traced to a specific fact. Categories: `RESOLVE_BLOCKER`, `RESPOND`, `SEND_DOCUMENT`, `SCHEDULE_MEETING`, `FOLLOW_UP`, `REENGAGE`, `CLOSE_LOOP`, `WAIT`, `NO_ACTION`. Outputs include action text, category, reasoning list, evidence list, urgency, and a confidence score. Confidence is adjusted by historical feedback for each category. Superseded recommendations are automatically expired.

### Context Resurrection Agent
Assembles full relationship context from all tables and passes it to the LLM resurrection agent, which produces a structured snapshot: relationship summary, thesis, key moments, blockers, open loops, why momentum stopped, and a re-entry strategy. Output is cached. This is the Relationship Memory Screen.

### Commitment Reconciliation Engine
Applies extractor output to the datastore: marks resolved commitments as completed, merges memory updates, creates milestones and new commitments. Every resolution is logged as an audit event.

### Open Loop Engine
Monitors all open commitments against tier-based SLAs. Computes health per commitment: `HEALTHY`, `AT_RISK`, `OVERDUE`, `ABANDONED`. Escalations are logged to the audit trail. SLA defaults: Tier A 7 days, Tier B 14 days, Tier C 21 days.

### Founder Command Center
Aggregates the daily action queue by priority tier, surfaces overdue commitments, open loops at risk, and relationship state summary. Answers: "What am I dropping right now?" Snapshots persist to `command_center_snapshots` and `daily_briefs`.

### Decision Event Audit Trail
Every consequential decision from any engine — state changes, priority changes, recommendation changes, commitment resolutions, open loop escalations, resurrection events, feedback lifecycle events — is written to `decision_events` with source, previous value, new value, reason, and evidence. Four query APIs: by contact, by type, recent, and chronological timeline.

### Recommendation Feedback Loop
Tracks the lifecycle of every recommendation. States: `ACCEPTED`, `REJECTED`, `COMPLETED`, `EXPIRED`, `IGNORED`. APIs: `accept_recommendation`, `reject_recommendation`, `complete_recommendation`, `auto_ignore_recommendations`, `calculate_feedback_analytics`. Completion and rejection rates per category feed back into the recommendation confidence score.

---

## Datastore

| Table | Purpose |
|---|---|
| `contacts` | Core memory object. Holds all intelligence fields per relationship. |
| `interactions` | Immutable log of every communication event. |
| `commitments` | Open loops with owner, due date, status, and evidence quote. |
| `relationship_milestones` | Significant events used by the Resurrection Agent and Recommendation Engine. |
| `relationship_state_history` | Audit log of every state transition. |
| `priority_history` | Audit log of every priority score change. |
| `recommendation_history` | Log of every recommendation generated. |
| `recommendation_feedback` | Lifecycle tracking per recommendation. |
| `recommendations` | Current recommendation per contact (denormalized). |
| `resurrection_snapshots` | Cached Resurrection Agent output per contact. |
| `open_loop_health` | Per-commitment health status. |
| `command_center_snapshots` | Daily action queue snapshots. |
| `daily_briefs` | Founder-facing daily summaries. |
| `decision_events` | System-wide audit trail of all decisions. |

---

## Local Setup

### Prerequisites

- Docker Desktop running
- Python 3.11 or higher
- `uv` installed: `pip install uv`

### Install Lemma Tools

```powershell
uv tool install --editable ./lemma-platform/lemma-cli
uv tool install --editable ./lemma-platform/lemma-stack
```

### Start Local Stack

```powershell
lemma-stack install --runtime docker -y
```

### Configure Gemini

```powershell
lemma-stack config set LEMMA_DEFAULT_MODEL_TYPE openai_compat
lemma-stack config set LEMMA_OPENAI_API_KEY YOUR_GEMINI_API_KEY
lemma-stack config set LEMMA_OPENAI_BASE_URL https://generativelanguage.googleapis.com/v1beta/openai/
lemma-stack config set LEMMA_OPENAI_DEFAULT_MODEL gemini-1.5-pro
lemma-stack config set LEMMA_OPENAI_MODEL_NAMES gemini-1.5-pro,gemini-1.5-flash
lemma-stack restart
```

### Validate Environment

```powershell
cd crm-project
python validate_env.py
```

### Authenticate

```powershell
lemma servers select local
lemma auth login
```

### Deploy Pod

```powershell
# Dry run
lemma pods import ./memory-crm --dry-run

# Apply
lemma pods import ./memory-crm --upsert

# Verify
lemma pods describe
```

---

## Tests

```powershell
cd crm-project

# Run a specific suite
python -m unittest memory-crm/tests/test_recommendation_feedback.py -v
python -m unittest memory-crm/tests/test_decision_events_audit.py -v

# Run all owned suites together
python -m unittest memory-crm/tests/test_recommendation_feedback.py memory-crm/tests/test_decision_events_audit.py -v
```

Tests use a handwritten `MockPod` with in-memory tables and a SQL-parsing query method. No network calls. No Lemma SDK required to run tests.

---

## What Is Not Built

- Frontend: no UI exists
- API gateway: feedback and analytics APIs are not exposed over HTTP
- Live integrations: Gmail, Slack, WhatsApp, Zoom webhook handlers
- Recommendation Accept/Reject controls on the Relationship Memory Screen
- Analytics dashboard in the Founder Command Center
- State history pruning policy
