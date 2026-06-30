# MemoryCRM

### AI Relationship Operating System

CRMs store contacts. MemoryCRM remembers relationships.

---

## The Problem

Founders do not lose opportunities because they forget to send emails.

They lose opportunities because relationship context becomes fragmented. A conversation starts in an email, moves to a Zoom call, continues in a Slack thread, and gets referenced in a LinkedIn message weeks later. By the time you need to follow up, the full picture only exists across a dozen disconnected places — most of which you will not search before writing that follow-up.

The result is predictable:

- Follow-ups are missed
- Commitments are forgotten
- Conversations restart from scratch
- High-value relationships quietly stall

The problem is not contact management. The problem is relationship memory.

---

## What MemoryCRM Does

Every time you have a conversation — email, call, meeting, message — MemoryCRM reads it, extracts what matters, and updates its understanding of the relationship.

It tracks:

- Who the person is, and what they care about
- Why you are talking to them
- What was promised, by whom, and when
- What is still unresolved
- What you should do next

Then, when you return to a conversation after two weeks on product work, or three months of silence, it tells you everything you need to know before you type the first word.

---

## How It Works

Interactions come in — emails, meeting transcripts, notes. An AI reads them and extracts structured facts: commitments, blockers, key moments, relationship signals. That is the only thing the AI does.

Everything else — determining relationship state, calculating priority, generating recommendations — is done by deterministic code. Rules. Not inference.

This means every output is explainable:

> Rahul is ranked first because he requested pricing five days ago, the founder still owes a response, and the proposal has been viewed twice.

No black boxes. Every decision traces back to a specific fact in the system.

---

## The Core Questions

The product is designed to answer five questions for every relationship:

1. Who is this person?
2. Why are we talking?
3. What do they care about?
4. What is unresolved?
5. What should happen next?

When a founder opens any contact, those five questions are answered immediately — without searching email, without reading notes, without asking a colleague what happened.

---

## Relationship States

Instead of a sales pipeline, MemoryCRM tracks human attention states.

| State | Meaning |
|---|---|
| waiting on me | The founder owes a response, document, or introduction |
| waiting on them | The founder has acted and is waiting |
| mutual exploration | Active, ongoing engagement |
| blocked | Progress is stopped by a known obstacle |
| cooling | Momentum is decreasing |
| reengagement candidate | The relationship has stalled and may be worth revisiting |

---

## Key Features

### Relationship Memory Screen

The core screen. Opens any relationship and immediately surfaces: who the person is, why they matter, what happened, what was promised, and what should happen next. Designed for the moment you return to a dormant conversation.

### Commitment Tracking

Every promise made in a conversation is extracted automatically — who made it, what it was, when it is due, and how confident the system is that it was a real commitment. These are surfaced as open loops until they are resolved.

### Priority Queue

All relationships ranked by urgency, with explicit reasons for each ranking. The queue answers one question: what should I work on right now? Every rank position is justified.

### Context Resurrection

For relationships that have gone quiet, the system reconstructs the full history: what the relationship was about, the last point of real engagement, what was left unresolved, and what re-entry looks like. A founder can recover months of context in seconds.

### Open Loops Dashboard

Every unfulfilled commitment, across all relationships, in one place. Nothing slips through.

### Decision Audit Trail

Every state change, priority change, and recommendation is logged with the reason it was made. If the system says a relationship is blocked, you can see exactly which fact triggered that determination and when.

### Recommendation Feedback

When the system recommends an action, the founder can mark it accepted, rejected, or completed. The system learns which types of recommendations are acted on and adjusts confidence accordingly over time.

---

## What It Is Not

MemoryCRM is not a sales pipeline tool. It does not do revenue forecasting, lead scoring, outbound sequencing, or email automation.

It does one thing: remember relationships so founders do not have to.

---

## Project Layout

```
AutomatedlemmaCRM/
├── crm-project/          # Main codebase
│   ├── memory-crm/       # The intelligence layer (tables, engines, agents)
│   └── backend/          # Service layer wrapping the intelligence APIs
├── lemma-platform/       # Local runtime (Postgres, Redis, API server)
└── knowledge/            # Platform documentation
```

The intelligence layer lives in `memory-crm/`. It contains fourteen data tables, ten deterministic engine functions, two LLM agents, and ten test suites. None of the engines that make decisions call an LLM. The LLM is only used to read conversations and extract structured facts.

---

## Setup

Detailed setup instructions are in [crm-project/README.md](crm-project/README.md).

You will need Docker, Python 3.11+, and a Gemini API key.

---

## Status

The intelligence backend is complete. What exists:

- Full relationship memory system with extraction, state determination, priority scoring, and recommendations
- Context resurrection agent
- Commitment tracking and open loop monitoring
- Recommendation feedback loop with confidence adjustment
- Complete decision audit trail
- Ten test suites covering all engines

What does not yet exist:

- A frontend
- Live integrations (Gmail, Slack, WhatsApp, Zoom)
- HTTP API endpoints for the feedback and analytics services
