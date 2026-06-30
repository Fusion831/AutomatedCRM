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
            "commitments": MockTable("commitments"),
            "interactions": MockTable("interactions"),
            "open_loop_health": MockTable("open_loop_health"),
            "daily_briefs": MockTable("daily_briefs"),
            "command_center_snapshots": MockTable("command_center_snapshots")
        }

    def table(self, name: str) -> MockTable:
        return self.tables[name]

    def query(self, sql_query: str) -> MockQueryResult:
        sql_query = sql_query.strip().replace('"', "'")
        
        # commitments query
        if "FROM commitments" in sql_query:
            if "status = 'open'" in sql_query:
                results = [c for c in self.tables["commitments"].list() if c.get("status") == "open"]
                return MockQueryResult(results)
            return MockQueryResult(self.tables["commitments"].list())
            
        # interactions query
        elif "FROM interactions" in sql_query:
            if "id = '" in sql_query:
                int_id = sql_query.split("id = '")[1].split("'")[0]
                rec = self.tables["interactions"].get(int_id)
                return MockQueryResult([rec] if rec else [])
            return MockQueryResult(self.tables["interactions"].list())

        # open loop health query
        elif "FROM open_loop_health" in sql_query:
            if "commitment_id = '" in sql_query:
                comm_id = sql_query.split("commitment_id = '")[1].split("'")[0]
                results = [h for h in self.tables["open_loop_health"].list() if str(h.get("commitment_id")) == comm_id]
                return MockQueryResult(results)
            return MockQueryResult(self.tables["open_loop_health"].list())

        # contacts query
        elif "FROM contacts" in sql_query:
            return MockQueryResult(self.tables["contacts"].list())

        # daily briefs query
        elif "FROM daily_briefs" in sql_query:
            brief_date = sql_query.split("brief_date = '")[1].split("'")[0]
            results = [b for b in self.tables["daily_briefs"].list() if str(b.get("brief_date")) == brief_date]
            return MockQueryResult(results)

        # snapshots query
        elif "FROM command_center_snapshots" in sql_query:
            snapshot_date = sql_query.split("snapshot_date = '")[1].split("'")[0]
            results = [s for s in self.tables["command_center_snapshots"].list() if str(s.get("snapshot_date")) == snapshot_date]
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

loops_engine_module = load_module("loops_engine_module", "memory-crm/functions/evaluate_open_loops_function/code.py")
brief_engine_module = load_module("brief_engine_module", "memory-crm/functions/generate_daily_brief_function/code.py")

class DummyContext:
    def __init__(self):
        self.pod_id = "test_pod_123"

# --- UNIT TESTS SUITE ---

class TestOpenLoopsAndCommandCenter(unittest.TestCase):
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
            "tier": "A",
            "priority_score": 50,
            "attention_level": "MEDIUM",
            "recommended_action": "Reach out to check in"
        })

    @patch("loops_engine_module.Lemma", MockLemma)
    def test_open_loops_sla_and_health(self):
        # 1. Tier A SLA test: commitment captured 8 days ago -> overdue SLA
        int_1 = mock_pod_instance.table("interactions").create({
            "contact_id": self.contact_id,
            "occurred_at": "2026-06-27T12:00:00Z"
        })
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "interaction_id": int_1["id"],
            "owner": "founder",
            "description": "Send doc proposal",
            "status": "open",
            "due_date": None
        })

        # 2. Due soon (AT_RISK) test: explicit due date in 1 day
        int_2 = mock_pod_instance.table("interactions").create({
            "contact_id": self.contact_id,
            "occurred_at": "2026-07-04T12:00:00Z"
        })
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "interaction_id": int_2["id"],
            "owner": "founder",
            "description": "Zoom call setup",
            "status": "open",
            "due_date": "2026-07-06"
        })

        input_data = loops_engine_module.EvaluateOpenLoopsInput(
            current_date="2026-07-05"
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(loops_engine_module.evaluate_open_loops_function(self.ctx, input_data))
        
        self.assertEqual(res.evaluated_count, 2)
        
        # Verify SLA overdue item (Tier A SLA = 7 days -> due 2026-07-04 -> overdue by 1 day on 2026-07-05)
        overdue_item = next(c for c in res.commitments if "Send doc proposal" in c.reasons[0] or c.health == "OVERDUE")
        self.assertEqual(overdue_item.health, "OVERDUE")
        self.assertEqual(overdue_item.effective_due_date, "2026-07-04")
        
        # Verify At Risk item
        at_risk_item = next(c for c in res.commitments if c.health == "AT_RISK")
        self.assertEqual(at_risk_item.health, "AT_RISK")

    @patch("loops_engine_module.Lemma", MockLemma)
    def test_open_loops_risk_scoring(self):
        # Overdue founder commitment for a Tier A contact, priority 50, state mutual_exploration
        # Expected points:
        # Founder owner: 30
        # Health OVERDUE: 40
        # Tier A: 30
        # Priority weight (50 * 0.2): 10
        # Total points = 110 -> capped at 100
        int_1 = mock_pod_instance.table("interactions").create({
            "contact_id": self.contact_id,
            "occurred_at": "2026-06-27T12:00:00Z"
        })
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "interaction_id": int_1["id"],
            "owner": "founder",
            "description": "Send proposal deck",
            "status": "open",
            "due_date": None
        })

        input_data = loops_engine_module.EvaluateOpenLoopsInput(
            current_date="2026-07-05"
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(loops_engine_module.evaluate_open_loops_function(self.ctx, input_data))
        
        self.assertEqual(res.commitments[0].risk_score, 100)
        self.assertTrue(any("Founder commitment owner" in r for r in res.commitments[0].reasons))
        self.assertTrue(any("Commitment is overdue" in r for r in res.commitments[0].reasons))

    @patch("loops_engine_module.Lemma", MockLemma)
    @patch("brief_engine_module.Lemma", MockLemma)
    def test_daily_brief_and_command_center_generation(self):
        # 1. Populate tables with diverse states
        # Contact 1: high priority, waiting_on_me
        c1_id = "contact_c1"
        mock_pod_instance.table("contacts").create({
            "id": c1_id,
            "name": "Alice Smith",
            "company": "Alpha Corp",
            "relationship_state": "waiting_on_me",
            "tier": "A",
            "priority_score": 75,
            "attention_level": "HIGH",
            "recommended_action": "Send security terms PDF"
        })
        # Contact 2: cooling candidate
        c2_id = "contact_c2"
        mock_pod_instance.table("contacts").create({
            "id": c2_id,
            "name": "Bob Miller",
            "company": "Beta Inc",
            "relationship_state": "cooling",
            "tier": "B",
            "priority_score": 25,
            "attention_level": "LOW",
            "recommended_action": "No action required"
        })
        
        # 2. Open Loop Health row (overdue)
        mock_pod_instance.table("commitments").create({
            "id": "comm_c1",
            "contact_id": c1_id,
            "owner": "founder",
            "description": "Send security details",
            "status": "open"
        })
        mock_pod_instance.table("open_loop_health").create({
            "commitment_id": "comm_c1",
            "health": "OVERDUE",
            "risk_score": 90,
            "risk_reasons": "[]",
            "effective_due_date": "2026-07-01",
            "updated_at": "2026-07-05T12:00:00Z"
        })

        # 3. Generate Daily Brief
        input_data = brief_engine_module.GenerateDailyBriefInput(
            current_date="2026-07-05"
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(brief_engine_module.generate_daily_brief_function(self.ctx, input_data))
        
        self.assertEqual(res.brief_date, "2026-07-05")
        self.assertEqual(len(res.daily_brief.urgent_actions), 1) # Alice
        self.assertEqual(len(res.daily_brief.overdue_commitments), 1) # Send security details
        self.assertEqual(len(res.daily_brief.waiting_on_me), 1) # Alice
        self.assertEqual(len(res.daily_brief.cooling_relationships), 1) # Bob
        
        # Verify text summary contains correct counts
        self.assertTrue("1 commitments overdue" in res.summary_text)
        self.assertTrue("1 relationships waiting on you" in res.summary_text)
        self.assertTrue("1 relationships cooling down" in res.summary_text)
        
        # Verify table entries created
        self.assertEqual(len(mock_pod_instance.table("daily_briefs").list()), 1)
        self.assertEqual(len(mock_pod_instance.table("command_center_snapshots").list()), 1)

if __name__ == "__main__":
    unittest.main()
