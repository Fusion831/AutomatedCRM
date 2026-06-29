# MemoryCRM — Technical Setup & Developer Guide (Windows)

This directory holds the declarative configurations and code assets for implementing **MemoryCRM** on the **Lemma Platform** using **Google Gemini** on Windows.

---

## 1. Local Development Setup (Windows / PowerShell)

Follow these steps to run the local stack and deploy the pod:

### A. Environment Prerequisites
1. **Start Docker Desktop**: Ensure Docker Desktop is running on Windows (the engine status bar in the bottom left must be green).
2. **Install Python**: Ensure **Python >= 3.11** is installed.
3. Ensure **uv** is installed:
   ```powershell
   pip install uv
   ```

### B. Install CLI & Stack Manager
Run these commands in PowerShell to install the Lemma tools:
```powershell
# 1. Install the CLI controller
uv tool install --editable ./lemma-platform/lemma-cli

# 2. Install the containerized stack manager
uv tool install --editable ./lemma-platform/lemma-stack
```

### C. Spin Up the Local Stack (Containerized)
Instead of running `make dev` (which requires Make/Bash/Node compilation), use the pre-built Docker stack manager:
```powershell
# Installs postgres, redis, supertokens, and backend/frontend containers automatically
lemma-stack install --runtime docker -y
```
*Note: This starts all services under `~/.lemma/local`.*

### D. Configure Gemini API Credentials
Gemini is integrated via Lemma's `openai_compat` adapter. Run these commands in PowerShell:
```powershell
# 1. Route commands to the local stack manager
lemma-stack config set LEMMA_DEFAULT_MODEL_TYPE openai_compat

# 2. Register your Google Gemini API Key
lemma-stack config set LEMMA_OPENAI_API_KEY AIzaSyYourGeminiApiKeyHere

# 3. Direct requests to Gemini's OpenAI-compatible endpoint
lemma-stack config set LEMMA_OPENAI_BASE_URL https://generativelanguage.googleapis.com/v1beta/openai/

# 4. Set default model configuration
lemma-stack config set LEMMA_OPENAI_DEFAULT_MODEL gemini-1.5-pro
lemma-stack config set LEMMA_OPENAI_MODEL_NAMES gemini-1.5-pro,gemini-1.5-flash

# 5. Restart the containers to load the keys
lemma-stack restart
```

### E. Verify Environment & Database
Run the pre-flight validator to ensure databases are reachable:
```powershell
cd crm-project
python validate_env.py
```

### F. Authenticate the CLI
Log in to the local console gateway:
```powershell
lemma servers select local
lemma auth login
```

---

## 2. Pod Directory Structure

The declarative directory structure of the MemoryCRM Pod bundle on disk is laid out below:

```
crm-project/memory-crm/
├── pod.json                           # Pod Metadata
├── README.md                          # Operation instructions
├── AGENTS.md                          # Guides for agent developers
├── tables/
│   ├── contacts/
│   │   └── contacts.json              # Contacts (differentiated Memory Object)
│   ├── interactions/
│   │   └── interactions.json          # Interactions (timeline feeds)
│   └── commitments/
│       └── commitments.json           # Commitments (open loops & confidence levels)
├── functions/
│   └── calculate_priority/
│       ├── calculate_priority.json    # Permissions / triggers
│       └── code.py                    # Priority sorting + explainability generator
├── agents/
│   ├── promise-extractor/
│   │   ├── promise-extractor.json     # Permissions and configuration
│   │   └── instruction.md             # LLM prompt for promise extraction
│   └── resurrection-agent/
│       ├── resurrection-agent.json     # Permissions (grants on all tables)
│       └── instruction.md             # LLM prompt for reconnect strategies
└── workflows/
    └── process-interaction/
        └── process-interaction.json   # Event workflow mapping
```

---

## 3. Integration Targets & External Webhooks

To achieve "zero-burden" data capture, MemoryCRM integrates with external communications channels:

### A. Email Integration (Gmail / Outlook)
* **Mechanism**: Scheduled task via Composio or webhook triggers. Email threads involving the founder are pulled, and the sender, recipient, thread contents, and timestamps are written to the `interactions` table.

### B. Messaging Ingress (WhatsApp / Slack)
* **Slack**: An external Node.js/Python server hosts a Slack Events API listener. Messages containing "@crm" are forwarded as HTTP POST payloads to the Pod's ingress endpoint.
* **WhatsApp**: Twilio WhatsApp webhook targets the ingress endpoint to log texts, transcripts, or quick audio updates.

### C. Calendar & Meetings (Zoom Transcripts)
* **Mechanism**: When a calendar meeting ends (detected via Google Calendar/Outlook events), the ingress system downloads the transcript or summary, uploading it to the `/meetings/` folder inside the Pod Filesystem to trigger parsing.

---

## 4. Deploying the Pod

To import schemas, agents, and workflows into the local stack:

```powershell
# 1. Validate changes (Dry Run)
lemma pods import ./memory-crm --dry-run

# 2. Apply updates to the database
lemma pods import ./memory-crm --upsert
```

Verify the import:
```powershell
# Describe all active components
lemma pods describe
```
