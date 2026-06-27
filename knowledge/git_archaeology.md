# Git Archaeology: `lemma-platform` Repository

> **Analysis window:** Last 30 public commits (HEAD `5337e93` → `6e770eb`), plus
> the full `git log --all` branch history visible locally.
> **Scope:** Stability markers, WIP signals, stable SDK primitives, setup mechanics.

---

## 1. Stability Markers — Code Churn by Directory

### Top-Level Churn (by commit file-touch count, last 30 commits)

| Rank | Directory | Files Touched | Signal |
|------|-----------|--------------|--------|
| 1 | `lemma-backend/` | **354** | Highest velocity; active bug-patching |
| 2 | `agentbox/` | 60 | Fresh addition; whole codebase committed in one shot |
| 3 | `lemma-cli/` | 53 | Cross-platform fixes + daemon refactor |
| 4 | `desktop/` | 41 | UI asset/icon churn in release workflow |
| 5 | `agentbox-client/` | 28 | Added with agentbox drop |
| 6 | `lemma-frontend/` | 27 | Onboarding + design audit fixes |
| 7 | `lemma-python/` | 19 | Version bumps + spec regeneration; low churn |
| 8 | `lemma-typescript/` | 17 | Version bumps only |
| 9 | `lemma-stack/` | 16 | Manifest resolution fix |
| 10 | `.github/` | 15 | CI workflow stabilization |

### Sub-directory Hot-spots inside `lemma-backend/`

| Sub-path | Frequency | Pattern |
|----------|-----------|---------|
| `app/modules/datastore/` | **21 file-touches** | DB-session-held-during-I/O saga, delete saga refactor |
| `app/modules/function/` | high | Full module redesign in `aba98c3`; new use-case layer |
| `app/modules/agent/` | **23** | Capability assembly, DB-conn fixes during SSE |
| `app/modules/schedule/` | part of `a7529f6` | Consumer-group race fix |
| `app/modules/agent_surfaces/` | 12 (public commits only) | Surface platform fixes |
| `load_tests/` | 9 | Load test infrastructure added alongside DB-pool fixes |

---

## 2. Bugs Being Actively Patched

### 2a. WebSocket Accept Race — `6d68d57`
**File:** `lemma-backend/app/modules/datastore/api/controllers/changes_controller.py`

When a client disconnects immediately after initiating the WebSocket handshake,
uvicorn's ASGI state machine transitions past the accept window. Calling
`websocket.accept()` then raises `RuntimeError`. The fix catches `RuntimeError`
on accept and returns cleanly. Two new test files added:
- `datastore/tests/e2e/test_changes_ws_e2e.py`
- `datastore/tests/unit/test_changes_ws_controller.py`

**Status:** Patched. Tests cover both disconnect-before-accept and
disconnect-mid-stream paths.

---

### 2b. DB Connection Pool Exhaustion — multi-commit saga

Three distinct mechanisms were identified and fixed across commits `e96eee1`
through `a7529f6`:

| Root Cause | Commit | Files Changed |
|------------|--------|---------------|
| FastStream handlers held `provide_uow` session across external I/O (SMTP, file ingest, voice) | `e96eee1` | 8 handler files across `agent_surfaces/`, `pod/`, `schedule/`, `datastore/`, `function/` |
| LLM tasks held DB connection for full LLM round-trip (potentially tens of seconds) | `58eea5b` | `schedule/` handlers, `FunctionService` |
| SSE streaming endpoints held `ConversationServiceDep` → `UoWDep` for entire stream duration (~1 conn per concurrent SSE stream) | `708f47e` | `agent/` conversation controllers |
| `process_datastore_file_task`, `process_surface_message` still hold DB session during external I/O | **open** — commit body: "mitigated by semaphore"; "Full fix requires deep service refactoring" | — |

**Status:** Partially resolved. The `process_datastore_file_task` and
`process_surface_message` session-holding is an acknowledged open item
requiring deep service refactoring (commit `7a4ccfc` body).

---

### 2c. Redis Consumer-Group Race on Startup — `a7529f6`

**Pattern:** At `broker.start`, FastStream races to create consumer groups.
A subscriber that polls before its group exists gets `NOGROUP`; the supervisor
then storms/retries, and the reconcile loop only re-creates the group at `$`,
missing any in-flight messages.

**Fix 1 (`d6d57f1`):** Pre-create every registered group before `broker.start`
(idempotent, `mkstream`).

**Fix 2 (`e7e67f4`):** `schedule_events` group is destroyed by FastStream's
declare interaction within ~60ms of `broker.start`. The publisher now calls
`ensure_named_groups()` before every `XADD`, so the event always lands in a
group that will deliver it.

**Residual:** The commit body notes this does **not** fully cover the
`schedule_events` FastStream declare destruction (tracked as a FastStream-level
follow-up). The 4 schedule e2e tests were passing under mock mode after the fix.

---

### 2d. CLI Daemon Process Lifecycle — Windows Incompatibility — `d556871`

**Files:**
- `lemma-cli/lemma_cli/daemon/commands.py`
- `lemma-cli/lemma_cli/daemon/config.py`
- `lemma-cli/tests/test_daemon_process.py`

Two POSIX-only patterns broke on Windows:
1. `os.kill(pid, 0)` — signal 0 on Windows is `CTRL_C_EVENT`, not a no-op
   existence probe. Fixed with a Windows branch using `OpenProcess` +
   `WaitForSingleObject` via ctypes.
2. `start_new_session=True` in `Popen` — silently ignored on Windows, so the
   daemon never detached. Fixed via `_detach_kwargs()` returning
   `DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW` on Windows.

Also: `lemma-python/lemma_sdk/_spec_info.py` had a lazy-import fix for
`termios`/`tty` (POSIX-only modules), committed in `35f3214`.

---

### 2e. Local Stack & Release Plumbing Bugs

| Commit | Issue |
|--------|-------|
| `08f340f` | Docker build paths broken in `v0.5.0` release — `agentbox/Dockerfile` and `lemma-backend/Dockerfile` paths were wrong |
| `0cabb4f` | Release version tag double-prefixed (`vv0.5.0`); squashed 5 dev migrations into a fresh baseline (`0001_oss_baseline.py`) |
| `67f4b6c` | `DEFAULT_REPO` was wrong (`lemma-app` instead of `lemma-platform`) — manifest resolution broken for all release consumers |
| `c43eae3` | Agentbox manifest merge used `--` separator incorrectly, causing runtime digest cross-contamination |
| `8535731` | Install experience required GHCR auth (private); fixed to self-healing podman + public registry |

---

## 3. Work In Progress (WIP / Draft / Experimental)

### 3a. `lemma-cli/lemma_cli/cli_app/scaffold.py` — Template Markers (Intentional)

This is **intentional** WIP scaffold output — the generator for new pod
projects emits literal `TODO` strings as user-facing placeholders:

```
Line 83:   "description": "TODO: one line on what this pod does"
Line 106:  "description": "TODO: what this function does."
Line 143:  "description": "TODO: what this agent decides or drafts."
Line 180:  "description": "TODO: what this workflow orchestrates."
```

Not a code bug — these are template prompts for the user.

---

### 3b. `lemma-cli/lemma_cli/cli_app/apps.py` — Deprecated CLI Arguments

```python
Line 339:  help="Deprecated alias for the SOURCE argument."
Line 508:  help="Deprecated. Registry scaffolding is no longer installed by app init."
```

Two CLI flags are deprecated in place. No removal date is set.

---

### 3c. `lemma-backend/app/modules/agent_surfaces/platforms/platform_capabilities.py` — Native Interaction Incomplete

WhatsApp and Telegram do **not** yet have native choice/button rendering:

```python
# Line 113 (WhatsApp entry):
# TODO(follow-up): native interactive buttons/list + parse_inbound_interaction.
# Until then ask_user uses the formatted-text fallback + typed-reply resume.
supports_native_choices=False

# Line 126 (Telegram entry):
# TODO(follow-up): native inline-keyboard rendering + callback_query parse
# (needs a Redis short-token store for the 64-byte callback_data limit).
supports_native_choices=False
```

These are gated by `supports_native_choices=False`; the fallback path
(formatted-text + typed-reply) is operational. This file has had no commits
since the initial release (`61f005f`), confirming it is stale-open.

---

### 3d. `lemma-backend/app/modules/agent_surfaces/` — Composio Email Outbound Attachments

In the email surface service (`platforms/[email_platform]/service.py`):

```python
# Line 178: "Attachments were not included - outbound attachments are not yet"
# Line 188: "require the multi-step draft flow, not yet wired for Composio."
# Line 198: "not yet supported for Composio-connected Outlook accounts."
```

Outbound email attachment support for Composio-connected accounts (Outlook)
is explicitly not yet implemented. The test `test_email_composio.py:135`
asserts `"not yet supported" in response.message` confirming this is a known
limitation, not a bug.

---

### 3e. `lemma-backend/app/modules/agent/` — v1 Agent Executor Deprecated

In `lemma-backend/app/modules/agent/__init__.py` line 3:
```
"This module is intentionally independent from the deprecated v1 agent executor"
```

The v1 executor has been deprecated but the note lives only in a module
docstring; no active removal is tracked in the last 30 commits.

---

### 3f. `lemma-backend/app/modules/function/` — Use-Case Layer Partially Landed

Commit `aba98c3` introduced a full redesign of the function module with a new
use-case layer:
- `function/application/function_run_executor.py` (919 lines, new)
- `function/application/function_use_cases.py` (273 lines, new)

`function_service.py` was restructured (from ~1217 lines down), with comment
blocks noting the DB session held during sandbox round-trips is addressed.
This is a **large in-flight refactor** that landed in `aba98c3` and was
folded into `a7529f6`.

---

### 3g. `lemma-backend/app/modules/identity/` — Phase 4 Encryption Refactor Not Started

`lemma-backend/app/modules/identity/infrastructure/rotation.py:44`:
```python
#: Every encrypted column. Phase 4 appends agent_surfaces.webhook_secret once...
```

`signer.py:10`:
```python
# keep a small legacy fallback for their grace window (see Phase 4 refactor).
```

A pending "Phase 4" encryption/key-rotation refactor is referenced in at
least two identity-infrastructure files. No Phase 4 commits appear in the
full visible git history — it is planned but not started.

---

## 4. Stable Primitives in `lemma-python/`

### SDK Module Change Frequency (all history, modified files only)

| File | Commits Touching It | Assessment |
|------|--------------------|-|
| `lemma_sdk/openapi_spec.json` | 2 (spec regenerations) | Stable; changes only on API surface changes |
| `lemma_sdk/openapi_client/models/__init__.py` | 2 (same regenerations) | Generated; stable |
| `lemma_sdk/resources/tools.py` | 2 (same regenerations) | Generated from spec; stable |
| `lemma_sdk/_spec_info.py` | 2 (`35f3214`, `0e618f2`) | Version stamp only |
| `lemma_sdk/transport.py` | **0** | Untouched in all history |
| `lemma_sdk/auth.py` | **0** | Untouched in all history |
| `lemma_sdk/client.py` | **0** | Untouched in all history |
| `lemma_sdk/config.py` | **0** | Untouched in all history |
| `lemma_sdk/errors.py` | **0** | Untouched in all history |
| `lemma_sdk/pod.py` | **0** | Untouched in all history |
| `lemma_sdk/settings.py` | **0** | Untouched in all history |
| `lemma_sdk/models.py` | **0** | Untouched in all history |
| `pyproject.toml` | 4 (version bumps only) | Stable structure |
| `tests/` | 3 (lint fix, integration test, docs test) | Low churn |

### Verdict: Safe to Build On

The following files have **zero** modifications since initial release and
contain no TODO/FIXME/DEPRECATED markers:

- **`lemma_sdk/transport.py`** — Retry logic, error mapping, raw request
  escape hatch. Clean, production-grade, no open items.
- **`lemma_sdk/auth.py`** — Authentication primitives.
- **`lemma_sdk/client.py`** — Top-level `Lemma` client entry point.
- **`lemma_sdk/config.py`** — Configuration parsing.
- **`lemma_sdk/errors.py`** — Error hierarchy (`LemmaAPIError`,
  `LemmaTimeoutError`, `LemmaConnectionError`, `LemmaNotFoundError`, etc.).
- **`lemma_sdk/pod.py`** — `Pod` resource wrapper.
- **`lemma_sdk/settings.py`** — Settings management.
- **`lemma_sdk/models.py`** — Data model types.

The only SDK `TODO` in the codebase is:
```python
# lemma_sdk/resources/agent_toolset.py line 9:
TODO = "TODO"
```
This is a **string constant** (an enum value for the `TODO` toolset ID — it
maps to the in-agent todo/task-list capability), not a code-quality marker.

---

## 5. Setup Mechanics & Documented Issues

### 5a. Package Version Pins

| Package | Pin | Location |
|---------|-----|----------|
| `lemma-sdk` | `>=0.5.3` (floor, mono-version) | `lemma-cli/pyproject.toml` |
| `click` | `>=8.3.0` | `lemma-cli/pyproject.toml` |
| `typer` | `>=0.12.5` | `lemma-cli/pyproject.toml` |
| `rich` | `>=13.9.4` | `lemma-cli/pyproject.toml` |
| `textual` | `>=8.0` | `lemma-cli/pyproject.toml` |
| `websockets` | `>=14.0` | `lemma-cli/pyproject.toml` |
| `requests` | `>=2.31.0` | `lemma-python/pyproject.toml` |
| `httpx` | `>=0.28.0` | `lemma-python/pyproject.toml` |
| `pydantic` | `>=2.11.0` | `lemma-python/pyproject.toml` |
| Python | `>=3.11` | All SDK components |

### 5b. Infrastructure Image Pins (local stack)

From `lemma-stack/lemma_stack/release/manifest.py`:

```python
"postgres":     "docker.io/pgvector/pgvector:0.8.3-pg16"
"redis":        "docker.io/redis/redis-stack:7.2.0-v19"
"supertokens":  "docker.io/supertokens/supertokens-postgresql:11.1.0"
"kreuzberg":    "ghcr.io/kreuzberg-dev/kreuzberg:4.9.9"
```

Application images (`backend`, `frontend`, `agentbox`, `agentbox-runtime`)
are versioned dynamically via the release manifest JSON (resolved from
`ghcr.io/lemma-work/lemma-*`).

### 5c. CLI Version Requirement

The install path is:
```
curl | bash → uv tool install lemma-stack (from git, not PyPI) → lemma-stack install
```

**Critical note (install.sh comment):** `lemma-stack` is **not on PyPI yet**.
It is installed directly from the git repository:
```
git+https://github.com/lemma-work/lemma-platform.git#subdirectory=lemma-stack
```

`lemma-terminal` (`lemma-cli` wheel) is published on PyPI (commit `2421c79`:
"Always install latest lemma-cli from PyPI for end-users") with the constraint
`lemma-sdk>=0.5.3`.

### 5d. Local Stack Known Issues (from commit history)

| Issue | Commit | Resolution |
|-------|--------|------------|
| GHCR auth required for private Kreuzberg image | `8535731` | Self-healing podman + public-registry alternative added |
| Agentbox manifest merge caused runtime digest cross-contamination | `c43eae3` | Fixed via `--` separator |
| Release image build paths broken | `08f340f` | Dockerfile paths corrected |
| Double-prefixed version tag `vv0.5.0` | `0cabb4f` | Release workflow fixed |
| Podman not auto-detected; install experience incomplete | `8535731` | Self-healing detection added |
| Windows: `bash`/`sh` required for `install.sh` | `35f3214` | `install.ps1` added as Windows alternative |
| `lemma-stack` not on PyPI | `install.sh` comments | Installer uses git source; documented in script |

### 5e. CI/Test Gates

- **Fast mocked e2e** (`make test-e2e`) — mock LLM + in-process fake AgentBox,
  no Docker, runs in ~7.5 minutes. Default CI gate since `a7529f6`.
- **Real e2e** (`make test-e2e-real`) — requires real OpenAI key + Docker.
  Flag-gated via `E2E_LLM_MODE=real` / `E2E_SANDBOX_MODE=docker`.
- **4 schedule e2e tests** are known-flaky under the real runner due to the
  FastStream declare/consumer-group interaction (tracked in `a7529f6` commit
  body as an open follow-up).
- **Windows daemon CI** added in `d556871` as a separate workflow
  (`.github/workflows/windows-daemon.yml`) — triggers on `windows-ci` label
  or push to `main` touching CLI files.

---

## Summary Table

| Area | Stability | Action |
|------|-----------|--------|
| `lemma-python/lemma_sdk/transport.py` | Frozen | Safe to depend on |
| `lemma-python/lemma_sdk/{auth,client,config,errors,pod,settings,models}.py` | Frozen | Safe to depend on |
| `lemma-backend/app/modules/datastore/` | Active churn | DB session refactor ongoing |
| `lemma-backend/app/modules/function/` | Major refactor landed | New use-case layer; may shift further |
| `lemma-backend/app/modules/schedule/` | Race fix residual | FastStream follow-up open |
| `lemma-backend/app/modules/agent_surfaces/` | Partial features | WhatsApp/Telegram native buttons, Composio outbound attachments not implemented |
| `lemma-cli/` daemon | Cross-platform fixes | Windows path just patched |
| `lemma-stack/` install | Not on PyPI | Must install from git |
| `lemma-python/` spec/generated | Regenerated on API change | Generated; don't edit manually |
