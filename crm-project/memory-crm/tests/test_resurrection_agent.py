import unittest
import asyncio
import uuid
import importlib.util
import json
import sys
from datetime import datetime, date, timedelta
from typing import Dict, List, Any
from unittest.mock import patch, MagicMock

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
            "resurrection_snapshots": MockTable("resurrection_snapshots"),
            "decision_events": MockTable("decision_events")
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
            results.sort(key=lambda x: x.get("occurred_at", ""), reverse=True)
            return MockQueryResult(results)

        # resurrection snapshots query
        elif "FROM resurrection_snapshots" in sql_query:
            contact_id = sql_query.split("contact_id = '")[1].split("'")[0]
            results = []
            for s in self.tables["resurrection_snapshots"].list():
                if str(s.get("contact_id")) == contact_id:
                    results.append(s)
            return MockQueryResult(results)

        return MockQueryResult([])

    def agent(self, agent_name: str):
        return mock_agent_instance

class MockAgentInstance:
    def __init__(self):
        self.mock_return = {
            "relationship_summary": "Active early stage startup founder evaluation.",
            "relationship_thesis": "Potential fit for Series Seed round.",
            "key_moments": [
                {
                    "summary": "Completed tech demo",
                    "importance_score": 85,
                    "evidence": "Demo went extremely well"
                }
            ],
            "current_blockers": ["CTO review pending"],
            "open_loops": [
                {
                    "description": "Send projections doc",
                    "owner": "founder",
                    "evidence": "I will send details"
                }
            ],
            "why_momentum_stopped": "Awaiting tech stack verification from engineering team.",
            "recommended_reentry_strategy": "Send deck projections and invite CTO to technical deep-dive.",
            "evidence": ["CTO approved the demo", "Send projections"]
        }

    def run(self, input_data: Any) -> Dict[str, Any]:
        return self.mock_return

class MockLemma:
    def __init__(self):
        pass

    def pod(self, pod_id: str) -> MockPod:
        return mock_pod_instance

# Global mock pod and agent instances shared between tests and code runs
mock_pod_instance = MockPod()
mock_agent_instance = MockAgentInstance()

# --- LOAD ENGINES DYNAMICALLY ---

def load_module(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

resurrection_orchestrator_module = load_module("resurrection_orchestrator_module", "memory-crm/functions/generate_resurrection_snapshot_function/code.py")

class DummyContext:
    def __init__(self):
        self.pod_id = "test_pod_123"

# --- UNIT TESTS SUITE ---

class TestResurrectionAgent(unittest.TestCase):
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
            "who_are_they": "Founder and CEO of NextGen AI.",
            "why_talking": "Series Seed pitch evaluations.",
            "key_drivers": json.dumps(["Faster developer productivity", "Better datastore consistency"]),
            "objections": json.dumps(["Pricing concerns"])
        })

    @patch("resurrection_orchestrator_module.Lemma", MockLemma)
    def test_cache_hit(self):
        # 1. Create a snapshot in cache generated at 2026-07-05
        snapshot_data = {
            "relationship_summary": "Cached overview",
            "relationship_thesis": "Cached thesis",
            "key_moments": [{"summary": "Cached moment", "importance_score": 90, "evidence": "quote"}],
            "current_blockers": ["None"],
            "open_loops": [],
            "why_momentum_stopped": "None",
            "recommended_reentry_strategy": "Send email",
            "evidence": []
        }
        mock_pod_instance.table("resurrection_snapshots").create({
            "contact_id": self.contact_id,
            "snapshot": json.dumps(snapshot_data),
            "confidence": 85,
            "generated_at": "2026-07-05T12:00:00Z"
        })
        
        # 2. Add an older interaction (occurred 2026-07-04)
        mock_pod_instance.table("interactions").create({
            "contact_id": self.contact_id,
            "type": "email",
            "occurred_at": "2026-07-04T12:00:00Z"
        })

        input_data = resurrection_orchestrator_module.GenerateResurrectionSnapshotInput(
            contact_id=self.contact_id,
            force_refresh=False
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(resurrection_orchestrator_module.generate_resurrection_snapshot_function(self.ctx, input_data))
        
        self.assertTrue(res.cache_hit)
        self.assertEqual(res.confidence, 85)
        self.assertEqual(res.snapshot.relationship_summary, "Cached overview")

    @patch("resurrection_orchestrator_module.Lemma", MockLemma)
    def test_cache_miss_due_to_stale_data(self):
        # 1. Create a snapshot in cache generated at 2026-07-01
        snapshot_data = {
            "relationship_summary": "Old overview",
            "relationship_thesis": "Old thesis",
            "key_moments": [],
            "current_blockers": [],
            "open_loops": [],
            "why_momentum_stopped": "None",
            "recommended_reentry_strategy": "None",
            "evidence": []
        }
        mock_pod_instance.table("resurrection_snapshots").create({
            "contact_id": self.contact_id,
            "snapshot": json.dumps(snapshot_data),
            "confidence": 60,
            "generated_at": "2026-07-01T12:00:00Z"
        })
        
        # 2. Add a newer interaction (occurred 2026-07-02) -> stale cache!
        mock_pod_instance.table("interactions").create({
            "contact_id": self.contact_id,
            "type": "email",
            "occurred_at": "2026-07-02T12:00:00Z"
        })

        input_data = resurrection_orchestrator_module.GenerateResurrectionSnapshotInput(
            contact_id=self.contact_id,
            force_refresh=False
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(resurrection_orchestrator_module.generate_resurrection_snapshot_function(self.ctx, input_data))
        
        self.assertFalse(res.cache_hit)
        # Should overwrite cache and fetch from MockAgent
        self.assertEqual(res.snapshot.relationship_summary, "Active early stage startup founder evaluation.")
        self.assertEqual(len(mock_pod_instance.table("resurrection_snapshots").list()), 1)

    @patch("resurrection_orchestrator_module.Lemma", MockLemma)
    def test_cache_miss_force_refresh(self):
        # Cache is fresh but force_refresh is True
        snapshot_data = {
            "relationship_summary": "Cached overview",
            "relationship_thesis": "Cached thesis",
            "key_moments": [],
            "current_blockers": [],
            "open_loops": [],
            "why_momentum_stopped": "None",
            "recommended_reentry_strategy": "None",
            "evidence": []
        }
        mock_pod_instance.table("resurrection_snapshots").create({
            "contact_id": self.contact_id,
            "snapshot": json.dumps(snapshot_data),
            "confidence": 85,
            "generated_at": "2026-07-05T12:00:00Z"
        })

        input_data = resurrection_orchestrator_module.GenerateResurrectionSnapshotInput(
            contact_id=self.contact_id,
            force_refresh=True
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(resurrection_orchestrator_module.generate_resurrection_snapshot_function(self.ctx, input_data))
        
        self.assertFalse(res.cache_hit)
        self.assertEqual(res.snapshot.relationship_summary, "Active early stage startup founder evaluation.")

    @patch("resurrection_orchestrator_module.Lemma", MockLemma)
    def test_confidence_scoring_model(self):
        # fully populated contact, 2 milestones, 2 commitments, 2 interactions -> should give 100 confidence
        # setUp already gives: who_are_they (+10), why_talking (+10), key_drivers (+20), objections (+20) -> 60 points
        
        # Add 2 milestones (+20)
        mock_pod_instance.table("relationship_milestones").create({"contact_id": self.contact_id, "summary": "M1", "importance_score": 50})
        mock_pod_instance.table("relationship_milestones").create({"contact_id": self.contact_id, "summary": "M2", "importance_score": 60})
        
        # Add 2 commitments (+10)
        mock_pod_instance.table("commitments").create({"contact_id": self.contact_id, "description": "C1", "owner": "founder", "status": "open"})
        mock_pod_instance.table("commitments").create({"contact_id": self.contact_id, "description": "C2", "owner": "contact", "status": "open"})
        
        # Add 2 interactions (+10)
        mock_pod_instance.table("interactions").create({"contact_id": self.contact_id, "type": "call", "occurred_at": "2026-07-01T10:00:00Z"})
        mock_pod_instance.table("interactions").create({"contact_id": self.contact_id, "type": "email", "occurred_at": "2026-07-02T10:00:00Z"})

        input_data = resurrection_orchestrator_module.GenerateResurrectionSnapshotInput(
            contact_id=self.contact_id,
            force_refresh=True
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(resurrection_orchestrator_module.generate_resurrection_snapshot_function(self.ctx, input_data))
        
        # Total = 60 + 20 + 10 + 10 = 100
        self.assertEqual(res.confidence, 100)

if __name__ == "__main__":
    unittest.main()
