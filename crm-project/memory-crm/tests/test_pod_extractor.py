import asyncio
import json
import os
import sys
import importlib.util
from pathlib import Path

# Load code.py dynamically
spec = importlib.util.spec_from_file_location(
    "extractor_code",
    "memory-crm/functions/consolidated_extractor/code.py"
)
extractor_code = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor_code)

class DummyContext:
    def __init__(self):
        self.config = None

async def run_scenarios():
    # Load env/config settings
    api_key = os.getenv("LEMMA_OPENAI_API_KEY")
    if not api_key:
        try:
            import toml
            config_path = Path.home() / ".lemma" / "local" / "config.toml"
            if config_path.exists():
                config_data = toml.load(config_path)
                api_key = config_data.get("openai_api_key") or config_data.get("LEMMA_OPENAI_API_KEY")
        except Exception:
            pass

    if api_key:
        os.environ["LEMMA_OPENAI_API_KEY"] = api_key
    os.environ["LEMMA_OPENAI_BASE_URL"] = "https://generativelanguage.googleapis.com/v1beta/openai/"
    os.environ["LEMMA_OPENAI_DEFAULT_MODEL"] = "gemini-flash-lite-latest"

    # Load fixtures
    fixtures_path = Path("memory-crm/tests/transcripts_fixtures.json")
    if not fixtures_path.exists():
        print(f"Error: Fixtures file not found at {fixtures_path}")
        return

    with open(fixtures_path, "r", encoding="utf-8") as f:
        scenarios = json.load(f)

    ctx = DummyContext()
    success_count = 0

    print(f"Loaded {len(scenarios)} testing scenarios. Starting execution...\n")

    for scenario in scenarios:
        s_id = scenario["id"]
        desc = scenario["description"]
        print(f"--- Running Scenario: {s_id} ({desc}) ---")

        # Map to inputs
        inp_data = scenario["input"]
        contact = inp_data["contact_memory"]
        commitments = inp_data["open_commitments"]
        new_int = inp_data["new_interaction"]

        # Instantiate Pydantic input models
        input_data = extractor_code.ConsolidatedExtractorInput(
            contact_memory=extractor_code.ContactMemory(
                name=contact["name"],
                company=contact.get("company"),
                who_are_they=contact.get("who_are_they"),
                why_talking=contact.get("why_talking"),
                key_drivers=contact.get("key_drivers", []),
                objections=contact.get("objections", [])
            ),
            open_commitments=[
                extractor_code.OpenCommitment(
                    id=c["id"],
                    description=c["description"],
                    owner=c["owner"],
                    status=c["status"]
                ) for c in commitments
            ],
            new_interaction=extractor_code.NewInteraction(
                interaction_type=new_int["interaction_type"],
                content=new_int["content"]
            )
        )

        try:
            res = await extractor_code.consolidated_extractor(ctx, input_data)
            print(f"Result for {s_id}: SUCCESS")
            print(res.model_dump_json(indent=2))
            
            # Simple assertions to ensure quotes match
            content = new_int["content"]
            for mile in res.milestones:
                assert mile.evidence_quote in content, f"Milestone quote '{mile.evidence_quote}' not found in transcript!"
            for comm in res.commitments:
                assert comm.evidence_quote in content, f"Commitment quote '{comm.evidence_quote}' not found in transcript!"
            for recon in res.reconciliations:
                assert recon.evidence_quote in content, f"Reconciliation quote '{recon.evidence_quote}' not found in transcript!"
                
            print("Quote validations passed.")
            success_count += 1
        except Exception as e:
            print(f"Result for {s_id}: FAILED")
            import traceback
            traceback.print_exc()

        print("-" * 50 + "\n")

    print(f"Completed: {success_count}/{len(scenarios)} passed.")

if __name__ == "__main__":
    asyncio.run(run_scenarios())
