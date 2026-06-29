# 🧠 MemoryCRM
### *The AI-First Relationship Memory Layer for Founders*

Traditional CRMs (like HubSpot or Salesforce) are built for sales forecasting, not relationship building. They force humans to act like data-entry clerks, resulting in fragmented context, forgotten promises, and lost opportunities. 

**MemoryCRM** changes the paradigm: **AI owns relationship memory; humans own relationship building.** It runs as a local-first, multi-agent workspace (Pod) on the Lemma Platform, automatically transforming raw transcripts and emails into structured, explainable context.

---

## 🚀 Key Product Differentiators

### 1. The First-Class "Relationship Memory" Object
Instead of unstructured text notes or dry contact cards, MemoryCRM maintains a structured thesis on every contact:
*   **Who are they?** ➔ High-fidelity biographical context (e.g. *"Stripe dev lead, ex-YC, hates SOAP"*).
*   **Why are we talking?** ➔ The fundamental premise of the connection.
*   **What do they care about?** ➔ A JSON map of obsessions, pain points, and blockers.
*   **What happened?** ➔ A chronological timeline of decisive milestones.
*   **What is unresolved?** ➔ Inbound and outbound promises.
*   **What should happen next?** ➔ Agent-suggested re-engagement actions.

### 2. Human Attention States (Not Sales Pipelines)
Relationships do not move in a straight line through a sales pipeline. We track attention states:
*   `waiting_on_me` ➔ Founder owes a deliverable, email, or intro.
*   `waiting_on_them` ➔ Founder is waiting for a reply or feedback.
*   `mutual_exploration` ➔ Active, high-velocity conversation.
*   `blocked` ➔ The connection has stalled due to a specific objection or constraint.
*   `cooling` ➔ Engagement velocity is dropping.
*   `reengagement_candidate` ➔ Dead connection flagged for resurrection by the agent.

### 3. The Explainable Priority Queue
Founders shouldn't have to guess why a contact is ranked #1. MemoryCRM surfaces the explicit reasons for priority:
> **Why is Rahul #1?**  
> `["Requested pricing (5 days ago)", "Founder owes response", "Opened proposal twice"]`

### 4. Commitment Confidence
Agents capture commitments (promises made by the founder or the client) and rate them with a confidence level (e.g. `95%` for *"I will send the deck by Friday"* vs `45%` for *"Let's talk soon"*).

---

## 🛠️ Database Schema & Architecture

Our database architecture is optimized for low-latency list loading and seamless evidence click-throughs:

```
                    ┌────────────────────────┐
                    │        CONTACTS        │ (First-class Memory Card)
                    └───────────┬────────────┘
                                │
                  ┌─────────────┴─────────────┐
                  ▼                           ▼
      ┌───────────────────────┐   ┌───────────────────────┐
      │     INTERACTIONS      ├──►│      COMMITMENTS      │ (Open Loops)
      │ (Raw Email/Transcript)│   │ (Outbound vs Inbound) │
      └───────────▲───────────┘   └───────────────────────┘
                  │
      ┌───────────┴───────────┐
      │      MILESTONES       │ (High-fidelity summaries)
      │ (Linked back to logs) │
      └───────────────────────┘
```

1.  **`contacts`**: Holds the core relationship memory, attention states, priority scores, and reason logs.
2.  **`relationship_state_history`**: Logs state transitions (e.g. `exploration` ➔ `cooling`) to analyze relationship velocity.
3.  **`interactions`**: The timeline feed. *To prevent query latency, raw meeting transcripts are stored as files on disk, referenced via `transcript_path`.*
4.  **`relationship_milestones`**: Summary highlights (e.g. *"Agreed to pilot pricing"*) with a foreign key back to the proving `interactions` record.
5.  **`commitments`**: Active loops (promises) with owner directions and confidence scores.
6.  **`recommendations`**: Stored AI re-engagement drafts and advice history.

---

## 📂 Repository Structure

*   `crm-project/` — Main development workspace.
    *   `memory-crm/` — Declarative Pod configurations (table schemas, agent instructions, functions).
        *   `pod.json` — Pod descriptor.
        *   `schemas.py` — Pydantic validation models.
        *   `tables/` — Database schemas for PostgreSQL.
    *   `validate_env.py` — Pre-flight environment check.
*   `lemma-platform/` — The local runtime stack (FastAPI backend, Postgres, Redis, sandbox).
*   `knowledge/` — Platform onboarding and SDK documentation.

---

## ⚡ Local Development Quickstart

### Prerequisites
*   Docker & Docker Compose
*   Python 3.10+ (and `uv` package manager)
*   A Gemini API Key (set up via `lemma-stack`)

### Booting the Environment (Windows / PowerShell)

1.  **Start the local Lemma Platform**:
    ```powershell
    cd lemma-platform
    .\install.ps1
    lemma-stack start
    ```
2.  **Login & Set Context**:
    ```powershell
    lemma auth login
    # Select MemoryCRM Organization & Pod
    ```
3.  **Validate Environment & Postgres Connection**:
    ```powershell
    cd ../crm-project
    python validate_env.py
    ```
4.  **Import the Pod Schemas**:
    ```powershell
    lemma pods import ./memory-crm --upsert
    ```
5.  **Verify Setup**:
    ```powershell
    lemma pods describe
    ```

---

## 🎯 Implementation Status

| Feature | Scope / Details | Status |
| :--- | :--- | :---: |
| **Relationship Memory** | Custom schema containing bio, drivers, priority, next actions | **Must Ship (Done)** |
| **Timeline Feed** | Chronological interactions linked to transcripts | **Must Ship (Done)** |
| **Promise Extraction** | Automatic commitment tracker with direction & confidence | **Must Ship** |
| **Open Loops Cockpit** | View for active commitments | **Must Ship** |
| **Priority Queue** | Explainable priority calculation | **Must Ship** |
| **Context Resurrection** | Dead deal scanner and reconnect email draft generation | **Must Ship** |
