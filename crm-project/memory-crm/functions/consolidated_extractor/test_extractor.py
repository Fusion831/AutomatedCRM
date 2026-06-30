import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
from code import (
    consolidated_extractor,
    ConsolidatedExtractorInput,
    ContactMemory,
    OpenCommitment,
    NewInteraction,
    ConsolidatedExtractorResponse
)

# Mock response data representing LLM return payload
MOCK_LLM_RESPONSE = {
    "memory_updates": {
        "new_identity_facts": ["Wants to expand Observability tools to DevOps teams."],
        "new_drivers": ["observability tools", "hiring devops engineers"],
        "new_objections": ["onboarding is too slow"],
        "memory_confidence": {"who_are_they": 0.9, "why_talking": 0.85}
    },
    "milestones": [
        {
            "summary": "Shared observablity tool needs",
            "milestone_type": "buying_signal",
            "importance_score": 50,
            "evidence_quote": "We want to expand our observability suite to the broader DevOps team next quarter."
        },
        {
            "summary": "Scheduling talk",
            "milestone_type": "noise",
            "importance_score": 10,
            "evidence_quote": "Let's catch up tomorrow."  # This quote is NOT in the transcript, should be filtered out by validation!
        }
    ],
    "commitments": [
        {
            "owner": "founder",
            "description": "Send pricing deck",
            "confidence": 95,
            "due_date": "2026-07-02",
            "evidence_quote": "I will send over the pricing deck by Thursday morning."
        },
        {
            "owner": "contact",
            "description": "Evaluate proposal",
            "confidence": 80,
            "due_date": None,
            "evidence_quote": "I will review the pricing once received."
        }
    ],
    "reconciliations": [
        {
            "commitment_id": "com-12345",
            "reason": "pricing proposal sent",
            "evidence_quote": "Thanks for sending the observability deck, received it."
        }
    ]
}

# Mock raw interaction text
MOCK_INTERACTION_CONTENT = """
Rahul: We want to expand our observability suite to the broader DevOps team next quarter.
Founder: I will send over the pricing deck by Thursday morning.
Rahul: I will review the pricing once received. Thanks for sending the observability deck, received it.
"""

async def run_tests():
    print("=== RUNNING CONSOLIDATED EXTRACTOR TESTS ===")

    # 1. Prepare Input Data
    input_data = ConsolidatedExtractorInput(
        contact_memory=ContactMemory(
            name="Rahul Sharma",
            company="Acme Corp",
            who_are_they="VP Engineering evaluating monitoring platforms.",
            why_talking="Looking to replace Datadog due to high bills.",
            key_drivers=["observability tools"],
            objections=[],
            memory_confidence={}
        ),
        open_commitments=[
            OpenCommitment(id="com-12345", description="Send pricing deck", owner="founder", status="open"),
            OpenCommitment(id="com-99999", description="Unrelated promise", owner="contact", status="open")
        ],
        new_interaction=NewInteraction(
            interaction_type="meeting",
            content=MOCK_INTERACTION_CONTENT
        )
    )

    # Mock response object for HTTPX call
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json = lambda: {
        "choices": [
            {
                "message": {
                    "content": json.dumps(MOCK_LLM_RESPONSE)
                }
            }
        ]
    }

    # 2. Run extractor with patched HTTPX request
    with patch("httpx.AsyncClient.post", return_value=mock_response):
        # We patch load_llm_config to bypass key requirements
        with patch("code.load_llm_config", return_value=("mock-key", "https://api.openai.com/v1", "gpt-4")):
            result = await consolidated_extractor(None, input_data)

    # 3. Assertions and Verification
    print("Testing Evidence Validation layer...")
    
    # Milestone verification (The 'Let's catch up tomorrow' milestone must be discarded due to lack of transcript evidence)
    assert len(result.milestones) == 1, f"Expected 1 milestone, got {len(result.milestones)}"
    assert result.milestones[0].summary == "Shared observablity tool needs"
    print("[OK] Discarded milestone without exact transcript quote match.")

    # Commitments verification (Both commitments are present in the mock interaction transcript)
    assert len(result.commitments) == 2, f"Expected 2 commitments, got {len(result.commitments)}"
    assert result.commitments[0].due_date == "2026-07-02"
    assert result.commitments[1].due_date is None
    print("[OK] Correctly parsed and validated commitments with exact quotes.")

    # Reconciliations verification (Reconciled commitment com-12345 because it was in the input list and quote matches)
    assert len(result.reconciliations) == 1
    assert result.reconciliations[0].commitment_id == "com-12345"
    print("[OK] Reconciled active open commitment successfully.")

    print("\nALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(run_tests())
