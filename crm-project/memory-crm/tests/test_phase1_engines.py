import unittest
import asyncio
import uuid
import importlib.util
from datetime import datetime
from typing import Dict, List, Any
from unittest.mock import patch

# --- LEMMA SDK MOCKING LAYER ---

class MockTable:
    def __init__(self, name: str):
        self.name = name
        self.records = {}

    def get(self, record_id: str) -> Dict[str, Any]:
        return self.records.get(str(record_id))

    def create(self, record: Dict[str, Any]) -> Dict[str, Any]:
        r_id = record.get("id") or str(uuid.uuid4())
        record["id"] = r_id
        self.records[str(r_id)] = record
        return record

    def update(self, record_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        record = self.get(record_id)
        if record:
            record.update(updates)
            return record
        raise ValueError(f"Record {record_id} not found in {self.name}")

    def list(self) -> List[Dict[str, Any]]:
        return list(self.records.values())

class MockQueryResult:
    def __init__(self, items: List[Dict[str, Any]]):
        self.items = items

    def to_dict(self) -> Dict[str, Any]:
        return {"items": self.items}

class MockPod:
    def __init__(self):
        self.tables = {
            "contacts": MockTable("contacts"),
            "relationship_milestones": MockTable("relationship_milestones"),
            "commitments": MockTable("commitments"),
            "relationship_state_history": MockTable("relationship_state_history"),
            "interactions": MockTable("interactions")
        }

    def table(self, name: str) -> MockTable:
        return self.tables[name]

    def query(self, sql_query: str) -> MockQueryResult:
        # Simplistic in-memory SQL parser for test queries
        sql_query = sql_query.strip().replace('"', "'")
        
        # Check Commitments Query: SELECT ... FROM commitments WHERE contact_id = '...' AND status = 'open'
        if "FROM commitments" in sql_query:
            contact_id = sql_query.split("contact_id = '")[1].split("'")[0]
            status_filter = "status = 'open'" in sql_query
            results = []
            for c in self.tables["commitments"].list():
                if str(c.get("contact_id")) == contact_id:
                    if not status_filter or c.get("status") == "open":
                        results.append(c)
            return MockQueryResult(results)
            
        # Check Milestones Query: SELECT ... FROM relationship_milestones WHERE contact_id = '...'
        elif "FROM relationship_milestones" in sql_query:
            contact_id = sql_query.split("contact_id = '")[1].split("'")[0]
            results = []
            for m in self.tables["relationship_milestones"].list():
                if str(m.get("contact_id")) == contact_id:
                    results.append(m)
            return MockQueryResult(results)
            
        # Check State History Query: SELECT ... FROM relationship_state_history WHERE contact_id = '...'
        elif "FROM relationship_state_history" in sql_query:
            contact_id = sql_query.split("contact_id = '")[1].split("'")[0]
            results = []
            for h in self.tables["relationship_state_history"].list():
                if str(h.get("contact_id")) == contact_id:
                    results.append(h)
            return MockQueryResult(results)

        # Check Interactions Query: SELECT ... FROM interactions WHERE contact_id = '...'
        elif "FROM interactions" in sql_query:
            contact_id = sql_query.split("contact_id = '")[1].split("'")[0]
            results = []
            for i in self.tables["interactions"].list():
                if str(i.get("contact_id")) == contact_id:
                    results.append(i)
            return MockQueryResult(results)

        return MockQueryResult([])

class MockLemma:
    def __init__(self):
        pass

    def pod(self, pod_id: str) -> MockPod:
        return mock_pod_instance

# Global mock pod instance shared between tests and code runs
mock_pod_instance = MockPod()

# --- LOAD ENGINES DYNAMICALLY ---

import sys

def load_module(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

fetch_ctx_module = load_module("fetch_ctx_module", "memory-crm/functions/fetch_context_function/code.py")
reconcile_module = load_module("reconcile_module", "memory-crm/functions/reconcile_commitments_function/code.py")

class DummyContext:
    def __init__(self):
        self.pod_id = "test_pod_123"

# --- UNIT TESTS SUITE ---

class TestPhase1Engines(unittest.TestCase):
    def setUp(self):
        global mock_pod_instance
        mock_pod_instance = MockPod()
        self.ctx = DummyContext()
        
        # Populate contact
        self.contact_id = "sarah_jenkins"
        mock_pod_instance.table("contacts").create({
            "id": self.contact_id,
            "name": "Sarah Jenkins",
            "company": "NextGen AI",
            "relationship_state": "waiting_on_me",
            "tier": "A",
            "who_are_they": "Founder and CEO of NextGen AI.",
            "why_talking": "Evaluating pre-Seed round leading options.",
            "key_drivers": '{"drivers": ["fast scaling", "technical advisory"], "objections": ["CAC overhead"]}',
            "memory_confidence": '{"name": 1.0, "company": 0.95}'
        })

    @patch("fetch_ctx_module.Lemma", MockLemma)
    def test_context_resurrection_engine(self):
        # 1. Setup mock records in pod
        # Commitments (1 open, 1 completed)
        mock_pod_instance.table("commitments").create({
            "id": "c1",
            "contact_id": self.contact_id,
            "description": "Send financial model by Friday",
            "owner": "founder",
            "status": "open",
            "confidence": 95,
            "due_date": "2026-07-03",
            "evidence_quote": "I will send it by Friday"
        })
        mock_pod_instance.table("commitments").create({
            "id": "c2",
            "contact_id": self.contact_id,
            "description": "Initial intro email",
            "owner": "founder",
            "status": "completed",
            "confidence": 99,
            "due_date": None,
            "evidence_quote": None
        })

        # Milestones (2 milestones, unsorted)
        mock_pod_instance.table("relationship_milestones").create({
            "id": "m1",
            "contact_id": self.contact_id,
            "summary": "Pitch deck received",
            "milestone_type": "deck_received",
            "importance_score": 60,
            "evidence_quote": "Here is our deck",
            "occurred_at": "2026-06-25T10:00:00Z"
        })
        mock_pod_instance.table("relationship_milestones").create({
            "id": "m2",
            "contact_id": self.contact_id,
            "summary": "Technical architecture approved",
            "milestone_type": "tech_approved",
            "importance_score": 90,
            "evidence_quote": "The architecture looks sound",
            "occurred_at": "2026-06-28T14:30:00Z"
        })

        # State History (2 items)
        mock_pod_instance.table("relationship_state_history").create({
            "id": "h1",
            "contact_id": self.contact_id,
            "old_state": "mutual_exploration",
            "new_state": "waiting_on_me",
            "reason": "Founder needs to send model",
            "changed_at": "2026-06-28T14:30:00Z"
        })

        # Recent Interactions (6 items, we expect max 5)
        for idx in range(6):
            mock_pod_instance.table("interactions").create({
                "id": f"i_{idx}",
                "contact_id": self.contact_id,
                "type": "email",
                "summary": f"Interaction summary {idx}",
                "occurred_at": f"2026-06-{20+idx}T12:00:00Z"
            })

        # 2. Invoke context resurrection function
        input_data = fetch_ctx_module.FetchContextInput(
            interaction={
                "id": "new_int_99",
                "contact_id": self.contact_id,
                "type": "meeting",
                "summary": "We had a call. Sarah is waiting on the financials.",
                "occurred_at": "2026-06-29T10:00:00Z"
            }
        )
        
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(fetch_ctx_module.fetch_context_function(self.ctx, input_data))
        
        # 3. Assertions
        # Check Contact Memory
        self.assertEqual(res.contact_memory.name, "Sarah Jenkins")
        self.assertEqual(res.contact_memory.company, "NextGen AI")
        self.assertEqual(res.contact_memory.relationship_thesis, "Evaluating pre-Seed round leading options.")
        self.assertEqual(res.contact_memory.memory_confidence, {"name": 1.0, "company": 0.95})
        
        # Check Drivers & Objections (extracted from JSON field)
        self.assertIn("fast scaling", res.key_drivers)
        self.assertIn("CAC overhead", res.objections)
        self.assertIn("fast scaling", res.contact_memory.key_drivers)
        self.assertIn("CAC overhead", res.contact_memory.objections)

        # Check open commitments (only 'c1' should be returned because 'c2' is completed)
        self.assertEqual(len(res.open_commitments), 1)
        self.assertEqual(res.open_commitments[0].id, "c1")
        self.assertEqual(res.open_commitments[0].description, "Send financial model by Friday")

        # Check Milestones (must be sorted by importance_score DESC: m2 first, then m1)
        self.assertEqual(len(res.milestones), 2)
        self.assertEqual(res.milestones[0].id, "m2")
        self.assertEqual(res.milestones[0].importance_score, 90)
        self.assertEqual(res.milestones[1].id, "m1")
        self.assertEqual(res.milestones[1].importance_score, 60)

        # Check State History
        self.assertEqual(len(res.state_history), 1)
        self.assertEqual(res.state_history[0].new_state, "waiting_on_me")

        # Check Recent Interactions (must be capped at 5 recent)
        self.assertEqual(len(res.recent_interactions), 5)
        # Verify ordering (reverse chronological based on occurred_at string sort)
        self.assertEqual(res.recent_interactions[0].id, "i_5")
        self.assertEqual(res.recent_interactions[4].id, "i_1")

        # Check new interaction mapping
        self.assertEqual(res.new_interaction.interaction_type, "meeting")
        self.assertEqual(res.new_interaction.content, "We had a call. Sarah is waiting on the financials.")

    @patch("reconcile_module.Lemma", MockLemma)
    def test_commitment_reconciliation_engine(self):
        # 1. Setup mock records in pod
        # Open commitment
        mock_pod_instance.table("commitments").create({
            "id": "c1",
            "contact_id": self.contact_id,
            "description": "Send financial model by Friday",
            "owner": "founder",
            "status": "open",
            "confidence": 95,
            "due_date": "2026-07-03"
        })
        # Completed commitment
        mock_pod_instance.table("commitments").create({
            "id": "c2",
            "contact_id": self.contact_id,
            "description": "Set up intro call",
            "owner": "founder",
            "status": "completed",
            "confidence": 99,
            "due_date": None
        })

        # 2. Test scenarios
        reconciliations = [
            # A: Valid reconciliation (accepted)
            reconcile_module.ProposedReconciliation(
                commitment_id="c1",
                reason="Founder shared the financial model projections sheet",
                evidence_quote="Here is the link to our financial model projections."
            ),
            # B: Commitment already completed (rejected)
            reconcile_module.ProposedReconciliation(
                commitment_id="c2",
                reason="Intro call set up",
                evidence_quote="Let's do a call"
            ),
            # C: Commitment does not exist (rejected)
            reconcile_module.ProposedReconciliation(
                commitment_id="nonexistent_id",
                reason="Random resolution",
                evidence_quote="Some quote"
            ),
            # D: Evidence quote not in interaction content (rejected)
            reconcile_module.ProposedReconciliation(
                commitment_id="c1",
                reason="Wrong resolution quote",
                evidence_quote="This quote does not exist in interaction text"
            )
        ]

        input_data = reconcile_module.ReconcileCommitmentsInput(
            reconciliations=reconciliations,
            new_interaction_content="Thanks for connecting. Here is the link to our financial model projections. Let's do a call."
        )

        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(reconcile_module.reconcile_commitments_function(self.ctx, input_data))

        # 3. Assertions
        # Accepted matches
        self.assertEqual(len(res.accepted), 1)
        self.assertEqual(res.accepted[0].commitment_id, "c1")
        self.assertEqual(res.accepted[0].reason, "Founder shared the financial model projections sheet")
        self.assertEqual(res.accepted[0].evidence_quote, "Here is the link to our financial model projections.")

        # Rejected matches
        self.assertEqual(len(res.rejected), 3)
        
        # Nonexistent commitment rejection assertion
        c_nonexist = next(r for r in res.rejected if r.commitment_id == "nonexistent_id")
        self.assertEqual(c_nonexist.rejection_reason, "Commitment does not exist in datastore")
        
        # Already completed commitment rejection assertion
        c_completed = next(r for r in res.rejected if r.commitment_id == "c2")
        self.assertEqual(c_completed.rejection_reason, "Commitment is already in status 'completed'")

        # Missing quote verification rejection assertion
        c_wrong_quote = next(r for r in res.rejected if r.commitment_id == "c1" and "Wrong" in r.reason)
        self.assertEqual(c_wrong_quote.rejection_reason, "Evidence quote not found in new interaction content")

        # Audit logs verification
        self.assertEqual(len(res.audit_entries), 4)
        self.assertTrue(any("ACCEPTED reconciliation for commitment c1" in entry for entry in res.audit_entries))
        self.assertTrue(any("REJECTED reconciliation for commitment nonexistent_id" in entry for entry in res.audit_entries))
        self.assertTrue(any("REJECTED reconciliation for commitment c2" in entry for entry in res.audit_entries))

if __name__ == "__main__":
    unittest.main()
