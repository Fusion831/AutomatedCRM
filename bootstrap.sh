#!/usr/bin/env bash
set -euo pipefail

echo "==> Scaffolding Hackathon Directory Structure..."
mkdir -p knowledge/flows experiments crm-project prompts

echo "==> Cloning lemma-platform repository..."
if [ ! -d "lemma-platform" ]; then
    git clone https://github.com/lemma-work/lemma-platform.git
else
    echo "    Repository folder 'lemma-platform' already exists. Skipping clone."
fi

echo "==> Setting up Repomix Config inside lemma-platform..."
cd lemma-platform

cat << 'EOF' > repomix.config.json
{
  "output": {
    "filePath": "repomix-output.xml",
    "style": "xml",
    "headerText": "Lemma Platform Context Codebase Map"
  },
  "include": [
    "lemma-python/**/*",
    "agentbox/**/*",
    "agentbox-client/**/*",
    "lemma-cli/**/*",
    "lemma-backend/app/**/*",
    "docs/**/*"
  ],
  "exclude": [
    "**/node_modules/**",
    "**/venv/**",
    "**/.venv/**",
    "**/dist/**",
    "**/.next/**",
    "**/__pycache__/**",
    "**/tests/**",
    "lemma-frontend/**",
    "*.lock",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock"
  ]
}
EOF

echo "==> Compiling codebase mapping with Repomix..."
# Check if npx is installed
if command -v npx &> /dev/null; then
    npx repomix --config repomix.config.json
else
    echo "WARNING: 'npx' is not installed. Run 'npx repomix' manually inside lemma-platform/ once Node is available."
fi

cd ..

echo "==> Creating empty knowledge base structures..."
TOUCH_FILES=(
    "knowledge/platform_mental_model.md"
    "knowledge/core_abstractions.md"
    "knowledge/primitive_catalog.md"
    "knowledge/developer_journey.md"
    "knowledge/schema_blueprints.md"
    "knowledge/git_archaeology.md"
    "knowledge/sdk_failures.md"
    "knowledge/execution_boundaries.md"
    "knowledge/concurrency_model.md"
    "knowledge/agent_runtime.md"
    "knowledge/workflow_engine.md"
    "knowledge/event_architecture.md"
    "knowledge/tool_ecosystem.md"
    "knowledge/capability_map.md"
    "knowledge/hidden_gems.md"
    "knowledge/flows/pod.md"
    "knowledge/flows/table.md"
    "knowledge/flows/record.md"
    "knowledge/flows/agent.md"
    "knowledge/flows/workflow.md"
)

for file in "${TOUCH_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        touch "$file"
    fi
done

echo "==> Scaffolding Completed Successfully."