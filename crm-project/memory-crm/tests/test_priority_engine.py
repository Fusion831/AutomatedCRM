import unittest
import asyncio
import uuid
import importlib.util
import json
import sys
from datetime import datetime, date, timedelta
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
            "interactions": MockTable("interactions"),
            "priority_history": MockTable("priority_history")
        }

    def table(self, name: str) -> MockTable:
        return self.tables[name]

    def query(self, sql_query: str) -> MockQueryResult:
        sql_query = sql_query.strip().replace('"', "'")
        
        # commitments query
        if "FROM commitments" in sql_query:
            contact_id = sql_query.split("contact_id = '")[1].split("'")[0]
            results = []
            for c in self.tables["commitments"].list():
                if str(c.get("contact_id")) == contact_id:
                    results.append(c)
            return MockQueryResult(results)
            
        # milestones query
        elif "FROM relationship_milestones" in sql_query:
            contact_id = sql_query.split("contact_id = '")[1].split("'")[0]
            results = []
            for m in self.tables["relationship_milestones"].list():
                if str(m.get("contact_id")) == contact_id:
                    results.append(m)
            return MockQueryResult(results)

        # interactions query
        elif "FROM interactions" in sql_query:
            contact_id = sql_query.split("contact_id = '")[1].split("'")[0]
            results = []
            for i in self.tables["interactions"].list():
                if str(i.get("contact_id")) == contact_id:
                    results.append(i)
            return MockQueryResult(results)

        # priority history query
        elif "FROM priority_history" in sql_query:
            contact_id = sql_query.split("contact_id = '")[1].split("'")[0]
            results = []
            for h in self.tables["priority_history"].list():
                if str(h.get("contact_id")) == contact_id:
                    results.append(h)
            # Sort by changed_at DESC (simplistic string sorting)
            results.sort(key=lambda x: x.get("changed_at", ""), reverse=True)
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

def load_module(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

priority_engine_module = load_module("priority_engine_module", "memory-crm/functions/calculate_contact_priority_function/code.py")

class DummyContext:
    def __init__(self):
        self.pod_id = "test_pod_123"

# --- UNIT TESTS SUITE ---

class TestPriorityEngine(unittest.TestCase):
    def setUp(self):
        global mock_pod_instance
        mock_pod_instance = MockPod()
        self.ctx = DummyContext()
        self.contact_id = "test_sarah"
        
        # Populate contact
        mock_pod_instance.table("contacts").create({
            "id": self.contact_id,
            "name": "Sarah Jenkins",
            "company": "NextGen AI",
            "relationship_state": "mutual_exploration",
            "tier": "B",
            "priority_score": 0,
            "priority_reasons": "[]",
            "attention_level": "LOW",
            "expected_next_touch_date": None
        })

    @patch("priority_engine_module.Lemma", MockLemma)
    def test_commitment_scoring(self):
        # 1. Overdue founder commitment (+50)
        # 2. Near due founder commitment (+30)
        # 3. Completed founder commitment (+0)
        today = date(2026, 7, 5)
        
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "description": "Send model projections",
            "owner": "founder",
            "status": "open",
            "due_date": "2026-07-03" # 2 days overdue
        })
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "description": "Intro email",
            "owner": "founder",
            "status": "open",
            "due_date": "2026-07-07" # due in 2 days
        })
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "description": "Past pitch deck",
            "owner": "founder",
            "status": "completed",
            "due_date": "2026-07-01"
        })

        input_data = priority_engine_module.CalculateContactPriorityInput(
            contact_id=self.contact_id,
            current_date="2026-07-05"
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(priority_engine_module.calculate_contact_priority_function(self.ctx, input_data))
        
        self.assertEqual(res.raw_score, 80)
        self.assertEqual(res.weighted_score, 80) # Tier B (1.0)
        self.assertEqual(res.attention_level, "CRITICAL")
        self.assertEqual(len(res.reasons), 2)
        self.assertTrue(any("overdue" in r.reason for r in res.reasons))
        self.assertTrue(any("due within 48h" in r.reason for r in res.reasons))

    @patch("priority_engine_module.Lemma", MockLemma)
    def test_state_waiting_on_me(self):
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "relationship_state": "waiting_on_me"
        })
        
        input_data = priority_engine_module.CalculateContactPriorityInput(
            contact_id=self.contact_id,
            current_date="2026-07-05"
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(priority_engine_module.calculate_contact_priority_function(self.ctx, input_data))
        
        self.assertEqual(res.raw_score, 20)
        self.assertEqual(res.weighted_score, 20)
        self.assertEqual(res.attention_level, "LOW")

    @patch("priority_engine_module.Lemma", MockLemma)
    def test_activity_scoring(self):
        # 1. Expected next touch date overdue by 5 days (+10 points)
        # 2. Mutual exploration state and inactive for 20 days (+15 points)
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "relationship_state": "mutual_exploration",
            "expected_next_touch_date": "2026-06-30"
        })
        # Last interaction occurred 20 days ago
        mock_pod_instance.table("interactions").create({
            "contact_id": self.contact_id,
            "type": "email",
            "occurred_at": "2026-06-15T12:00:00Z"
        })

        input_data = priority_engine_module.CalculateContactPriorityInput(
            contact_id=self.contact_id,
            current_date="2026-07-05"
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(priority_engine_module.calculate_contact_priority_function(self.ctx, input_data))
        
        self.assertEqual(res.raw_score, 25) # 10 + 15

    @patch("priority_engine_module.Lemma", MockLemma)
    def test_milestone_extensibility(self):
        # High value milestone in the last 4 days (+10 points)
        mock_pod_instance.table("relationship_milestones").create({
            "contact_id": self.contact_id,
            "summary": "Completed POC review with CTO",
            "importance_score": 85,
            "occurred_at": "2026-07-01T12:00:00Z"
        })

        input_data = priority_engine_module.CalculateContactPriorityInput(
            contact_id=self.contact_id,
            current_date="2026-07-05"
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(priority_engine_module.calculate_contact_priority_function(self.ctx, input_data))
        
        self.assertEqual(res.raw_score, 10)

    @patch("priority_engine_module.Lemma", MockLemma)
    def test_tier_multipliers_and_cap(self):
        # Setup overdue commitment (+50 points)
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "description": "Send proposal",
            "owner": "founder",
            "status": "open",
            "due_date": "2026-07-03"
        })

        # Test Tier A (1.5 multiplier) -> 50 * 1.5 = 75
        mock_pod_instance.table("contacts").update(self.contact_id, {"tier": "A"})
        input_data = priority_engine_module.CalculateContactPriorityInput(
            contact_id=self.contact_id,
            current_date="2026-07-05"
        )
        loop = asyncio.get_event_loop()
        res_a = loop.run_until_complete(priority_engine_module.calculate_contact_priority_function(self.ctx, input_data))
        self.assertEqual(res_a.weighted_score, 75)
        self.assertEqual(res_a.attention_level, "HIGH")

        # Test Tier C (0.4 multiplier) -> 50 * 0.4 = 20
        mock_pod_instance.table("contacts").update(self.contact_id, {"tier": "C"})
        res_c = loop.run_until_complete(priority_engine_module.calculate_contact_priority_function(self.ctx, input_data))
        self.assertEqual(res_c.weighted_score, 20)

        # Test Cap at 100
        # Tier A + 80 raw score -> 80 * 1.5 = 120 -> capped at 100
        mock_pod_instance.table("contacts").update(self.contact_id, {"tier": "A"})
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "description": "Another overdue",
            "owner": "founder",
            "status": "open",
            "due_date": "2026-07-01"
        }) # total raw score = 100
        
        res_capped = loop.run_until_complete(priority_engine_module.calculate_contact_priority_function(self.ctx, input_data))
        self.assertEqual(res_capped.weighted_score, 100)

    @patch("priority_engine_module.Lemma", MockLemma)
    def test_priority_history_recording(self):
        # 1. Start with 0 score (should save first material change since new_score > 0)
        mock_pod_instance.table("contacts").update(self.contact_id, {"tier": "B"})
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "description": "Send proposal",
            "owner": "founder",
            "status": "open",
            "due_date": "2026-07-03"
        }) # raw score 50

        input_data = priority_engine_module.CalculateContactPriorityInput(
            contact_id=self.contact_id,
            current_date="2026-07-05"
        )
        loop = asyncio.get_event_loop()
        res_first = loop.run_until_complete(priority_engine_module.calculate_contact_priority_function(self.ctx, input_data))
        self.assertTrue(res_first.history_recorded)
        self.assertEqual(len(mock_pod_instance.table("priority_history").list()), 1)

        # 2. Run again with minor change (e.g. +2 points, not crossing attention level threshold)
        # Add expected touch overdue by 1 day (+2 points) -> total 52 points
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "expected_next_touch_date": "2026-07-04"
        })
        res_minor = loop.run_until_complete(priority_engine_module.calculate_contact_priority_function(self.ctx, input_data))
        # Absolute difference is 2 points, same attention level (MEDIUM) -> immaterial
        self.assertFalse(res_minor.history_recorded)
        self.assertEqual(len(mock_pod_instance.table("priority_history").list()), 1)

        # 3. Run again with significant change (+10 points) -> total 62 points (diff is 10 > 5)
        # Expected touch overdue by 6 days (+12 points) -> total 62 points
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "expected_next_touch_date": "2026-06-29"
        })
        res_major = loop.run_until_complete(priority_engine_module.calculate_contact_priority_function(self.ctx, input_data))
        self.assertTrue(res_major.history_recorded)
        self.assertEqual(len(mock_pod_instance.table("priority_history").list()), 2)

if __name__ == "__main__":
    unittest.main()
