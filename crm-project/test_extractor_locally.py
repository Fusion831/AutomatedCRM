import asyncio
import os
import sys
import importlib.util

# Load code.py dynamically to avoid conflict with Python's built-in 'code' module
spec = importlib.util.spec_from_file_location(
    "extractor_code",
    "memory-crm/functions/consolidated_extractor/code.py"
)
extractor_code = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor_code)

class DummyContext:
    def __init__(self):
        self.config = None

async def test_local():
    ctx = DummyContext()
    # Configure the environment variables for local execution matching the stack config
    # Try loading from home config.toml if not in env
    api_key = os.getenv("LEMMA_OPENAI_API_KEY")
    if not api_key:
        try:
            from pathlib import Path
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

    input_data = extractor_code.ConsolidatedExtractorInput(
        contact_memory=extractor_code.ContactMemory(
            name="Rahul Sharma",
            who_are_they="VP Engineering at Acme Corp.",
            why_talking="Looking to replace Datadog.",
            key_drivers=["observability tools"],
            objections=[]
        ),
        open_commitments=[
            extractor_code.OpenCommitment(
                id="8de8d9e2-cbb1-49db-96e3-14f24f9bd245",
                description="Send pricing deck",
                owner="founder",
                status="open"
            )
        ],
        new_interaction=extractor_code.NewInteraction(
            interaction_type="meeting",
            content="Rahul: We want to expand our observability suite. Thanks for sending the pricing deck, received it. I will review it soon."
        )
    )

    print("Running extractor locally...")
    try:
        res = await extractor_code.consolidated_extractor(ctx, input_data)
        print("\n=== SUCCESS ===")
        print(res.model_dump_json(indent=2))
    except Exception as e:
        print("\n=== FAILURE ===")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_local())
