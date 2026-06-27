# Onboarding Playbook: Lemma Platform Development

This document serves as the primary onboarding and operational guide for developers building and extending the Lemma Platform, as well as those integrating client-side or agentic CRM workloads.

---

## 1. Local Runtime Pre-requisites

To ensure a consistent development experience and prevent dependency/runtime version conflicts, your machine must meet the following baseline requirements:

### Operating System Compatibility
*   **macOS / Linux**: Fully supported natively. Shell commands assume standard POSIX-compliant environments (`zsh`/`bash`).
*   **Windows 10 / 11**: Supported with **PowerShell 5.1+** and **WSL 2 (Windows Subsystem for Linux)**. The local containerized stack (`lemma-stack`) requires Docker Desktop configured with the WSL 2 backend.

### Python Version Requirements
*   **System Python**: **Python 3.14** (required when compiling the platform backend and running dev scripts from source).
*   **SDK & CLI Python**: **Python >= 3.11** (enforced by `lemma-sdk` and `lemma-terminal` dependencies).
*   **Package Manager**: [uv](https://docs.astral.sh/uv/) must be installed. It is used as the default virtual environment manager, package installer, and run tool.

### Node.js & Package Managers
*   **Node.js**: **Node.js >= 20.0.0** (required for compiling the Next.js frontend, `lemma-frontend/`).
*   **Package Manager**: `npm` or `yarn` (compatible with Next.js).

### Container Runtimes
*   **Docker Desktop** (version 4.x+) or **Podman** (version 4.x+) is required.
*   The platform utilizes containerized services for orchestrating infrastructure (Postgres, Redis, SuperTokens, Kreuzberg) and sandboxed worker runtimes (the `agentbox` engine).

### System Binaries
*   **make**: Required to run developers targets (`make dev`, `make test-unit`, etc.).
*   **git**: Required for source control and revision checks.
*   **mkcert**: Required to generate trusted local SSL certificates if testing complete OAuth/HTTPS authentication flows locally.
*   **libpq**: Required for compiling PostgreSQL connector binaries (e.g., `psycopg`).

---

## 2. Global Setup Key & Environment Inventory

The following table lists all key configurations, variables, and credentials read by different platform layers.

| Variable Name | Required / Optional | Provider / Retrieval Method | Role inside the System |
| :--- | :--- | :--- | :--- |
| **LEMMA_DEFAULT_MODEL_TYPE** | **Required** | Developer defined (`anthropic_compat` or `openai_compat`) | Identifies the default LLM driver configuration mapping for backend agents. |
| **LEMMA_ANTHROPIC_API_KEY** | Required if using Anthropic | Anthropic Console | Used by `lemma-backend` and sandbox agents to call Anthropic Claude API models (`claude-sonnet-4-5`, etc.). |
| **LEMMA_OPENAI_API_KEY** | Required if using OpenAI | OpenAI Platform API Dashboard | Used by the backend/agents to query GPT models or OpenAI-compatible gateways. |
| **LEMMA_OPENAI_BASE_URL** | Optional | Custom LLM gateway or provider (e.g., Together AI, Fireworks) | Overrides the endpoint when using an OpenAI-compatible third-party model registry. |
| **COMPOSIO_API_KEY** | **Recommended** | Composio Console | Powers out-of-the-box OAuth connector actions (Slack, Gmail, Notion, Salesforce). |
| **SECRET_ENCRYPTION_KEY** | **Required** (Production) | Generated Fernet key (`cryptography.fernet.Fernet.generate_key()`) | Encrypts database credentials, API tokens, and webhook secrets at rest. |
| **EMAIL_TRANSPORT** | Optional | Developer defined (`smtp` or `filesystem`) | Controls how system notifications are delivered. In local mode, set to `filesystem` to write emails to disk. |
| **EMAIL_OUTPUT_DIR** | Optional | Local path | Target folder where outbound emails are captured as text files when `EMAIL_TRANSPORT=filesystem`. |
| **DATABASE_URL** | Optional | Local postgres instance or docker connection string | Direct connection URI to the application PostgreSQL database. |
| **LEMMA_TOKEN** | Optional | Stored local CLI auth token | Bearer credentials injected into SDK workflows or custom script clients. |
| **LEMMA_POD_ID** | Optional | Stored pod identifier | Instructs the SDK's `Pod.from_env()` which workspace target to query. |

---

## 3. Step-by-Step Initial Bootstrapping Sequence

Follow these commands to initialize the Lemma workspace from a cold start:

### Step 1: Initialize the Local Infrastructure and Backend Services
For standard containerized deployment, run the one-line installer:
```bash
# macOS/Linux:
curl -fsSL https://raw.githubusercontent.com/lemma-work/lemma-platform/main/install.sh | bash

# Windows (WSL / Docker Desktop running):
Invoke-WebRequest https://raw.githubusercontent.com/lemma-work/lemma-platform/main/install.ps1 -OutFile install.ps1
Set-ExecutionPolicy -Scope Process Bypass
.\install.ps1
```

If developing directly from source, clone the platform and boot up the hot-reloading development services:
```bash
git clone https://github.com/lemma-work/lemma-platform.git
cd lemma-platform

# Boot up Postgres, Redis, SuperTokens, backend, frontend, and agentbox in hot-reload mode:
make dev
```

### Step 2: Configure System LLM Credentials
Add your default LLM configuration to the system environment:
```bash
# Set provider type
lemma-stack config set LEMMA_DEFAULT_MODEL_TYPE anthropic_compat
# Set API Key
lemma-stack config set LEMMA_ANTHROPIC_API_KEY sk-ant-your-api-key-here

# Restart the local stack to pick up new configurations
lemma-stack restart
```

### Step 3: Install and Configure the CLI Tool
Install the `lemma` terminal controller globally using `uv`:
```bash
# Install the CLI package
uv tool install lemma-terminal

# Direct the CLI to talk to the local stack
lemma servers select local

# Authenticate the terminal session
lemma auth login
```

### Step 4: Scaffold and Import your First Pod
Initialize a template workspace, populate resource schema files, and import them:
```bash
# Scaffold the starter crm pod directory structure
lemma pod init crm-workspace --starter

# Import the scaffolded assets (tables, agents, workflows) into the database
lemma pod import ./crm-workspace --pod crm-workspace
```

### Step 5: Test Connection and Runtime Sanity
Test that the SDK can successfully speak to the local backend and route sandbox tasks:
```bash
# Open interactive shell to query the pod agents
lemma chat "what can you do in this pod?"

# (Optional) Run the local test suites to verify that tests pass
make test-unit
make test-e2e
```
