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
            "recommendation_history": MockTable("recommendation_history")
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

        # recommendation history query
        elif "FROM recommendation_history" in sql_query:
            contact_id = sql_query.split("contact_id = '")[1].split("'")[0]
            results = []
            for h in self.tables["recommendation_history"].list():
                if str(h.get("contact_id")) == contact_id:
                    results.append(h)
            results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
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

rec_engine_module = load_module("rec_engine_module", "memory-crm/functions/generate_recommendation_function/code.py")

class DummyContext:
    def __init__(self):
        self.pod_id = "test_pod_123"

# --- UNIT TESTS SUITE ---

class TestRecommendationEngine(unittest.TestCase):
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
            "recommended_action": None,
            "recommendation_category": None,
            "recommendation_urgency": None,
            "recommendation_reasoning": "[]",
            "recommendation_evidence": "[]"
        })

    @patch("rec_engine_module.Lemma", MockLemma)
    def test_rec_resolve_blocker(self):
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "relationship_state": "blocked",
            "objections": ["We have a hiring blocker in Q4"]
        })
        
        input_data = rec_engine_module.GenerateRecommendationInput(contact_id=self.contact_id)
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(rec_engine_module.generate_recommendation_function(self.ctx, input_data))
        
        self.assertEqual(res.category, "RESOLVE_BLOCKER")
        self.assertEqual(res.urgency, "CRITICAL")
        self.assertTrue("hiring blocker" in res.action)
        self.assertEqual(res.evidence, ["We have a hiring blocker in Q4"])

    @patch("rec_engine_module.Lemma", MockLemma)
    def test_rec_respond(self):
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "relationship_state": "waiting_on_me"
        })
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "description": "email reply to Tom with pricing details",
            "owner": "founder",
            "status": "open",
            "evidence_quote": "I'll reply via email tomorrow"
        })
        
        input_data = rec_engine_module.GenerateRecommendationInput(contact_id=self.contact_id)
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(rec_engine_module.generate_recommendation_function(self.ctx, input_data))
        
        self.assertEqual(res.category, "RESPOND")
        self.assertEqual(res.urgency, "HIGH")

    @patch("rec_engine_module.Lemma", MockLemma)
    def test_rec_send_document(self):
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "relationship_state": "waiting_on_me"
        })
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "description": "Send proposal PDF slides",
            "owner": "founder",
            "status": "open",
            "evidence_quote": "I'll share the slides"
        })
        
        input_data = rec_engine_module.GenerateRecommendationInput(contact_id=self.contact_id)
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(rec_engine_module.generate_recommendation_function(self.ctx, input_data))
        
        self.assertEqual(res.category, "SEND_DOCUMENT")

    @patch("rec_engine_module.Lemma", MockLemma)
    def test_rec_schedule_meeting(self):
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "relationship_state": "waiting_on_me"
        })
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "description": "schedule demo Zoom call",
            "owner": "founder",
            "status": "open"
        })
        
        input_data = rec_engine_module.GenerateRecommendationInput(contact_id=self.contact_id)
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(rec_engine_module.generate_recommendation_function(self.ctx, input_data))
        
        self.assertEqual(res.category, "SCHEDULE_MEETING")

    @patch("rec_engine_module.Lemma", MockLemma)
    def test_rec_follow_up_overdue_commitment(self):
        # 1. Waiting on them
        # 2. Overdue contact commitment
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "relationship_state": "waiting_on_them"
        })
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "description": "Review terms",
            "owner": "contact",
            "status": "open",
            "due_date": "2026-07-01"
        })
        
        input_data = rec_engine_module.GenerateRecommendationInput(
            contact_id=self.contact_id,
            current_date="2026-07-05"
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(rec_engine_module.generate_recommendation_function(self.ctx, input_data))
        
        self.assertEqual(res.category, "FOLLOW_UP")
        self.assertEqual(res.urgency, "HIGH")

    @patch("rec_engine_module.Lemma", MockLemma)
    def test_rec_reengage(self):
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "relationship_state": "reengagement_candidate"
        })
        mock_pod_instance.table("relationship_milestones").create({
            "contact_id": self.contact_id,
            "summary": "CTO approved the tech demo",
            "importance_score": 80,
            "occurred_at": "2026-06-01T12:00:00Z"
        })
        
        input_data = rec_engine_module.GenerateRecommendationInput(contact_id=self.contact_id)
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(rec_engine_module.generate_recommendation_function(self.ctx, input_data))
        
        self.assertEqual(res.category, "REENGAGE")
        self.assertTrue("approved the tech demo" in res.action)

    @patch("rec_engine_module.Lemma", MockLemma)
    def test_rec_wait(self):
        # 1. Waiting on them
        # 2. Last interaction was 3 days ago (less than 7)
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "relationship_state": "waiting_on_them"
        })
        mock_pod_instance.table("interactions").create({
            "contact_id": self.contact_id,
            "type": "email",
            "occurred_at": "2026-07-02T12:00:00Z"
        })
        
        input_data = rec_engine_module.GenerateRecommendationInput(
            contact_id=self.contact_id,
            current_date="2026-07-05"
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(rec_engine_module.generate_recommendation_function(self.ctx, input_data))
        
        self.assertEqual(res.category, "WAIT")
        self.assertEqual(res.urgency, "LOW")

    @patch("rec_engine_module.Lemma", MockLemma)
    def test_priority_sorting_hierarchy(self):
        # Trigger blocked AND send_document commitment. Blocker must take priority.
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "relationship_state": "blocked",
            "objections": ["We have a hiring blocker in Q4"]
        })
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "description": "Send proposal PDF",
            "owner": "founder",
            "status": "open"
        })
        
        input_data = rec_engine_module.GenerateRecommendationInput(contact_id=self.contact_id)
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(rec_engine_module.generate_recommendation_function(self.ctx, input_data))
        
        self.assertEqual(res.category, "RESOLVE_BLOCKER")

    @patch("rec_engine_module.Lemma", MockLemma)
    def test_recommendation_history_recording(self):
        # First run generates NO_ACTION and records history
        input_data = rec_engine_module.GenerateRecommendationInput(contact_id=self.contact_id)
        loop = asyncio.get_event_loop()
        res_first = loop.run_until_complete(rec_engine_module.generate_recommendation_function(self.ctx, input_data))
        self.assertTrue(res_first.history_recorded)
        self.assertEqual(len(mock_pod_instance.table("recommendation_history").list()), 1)

        # Second run generates the same, should not record history
        res_second = loop.run_until_complete(rec_engine_module.generate_recommendation_function(self.ctx, input_data))
        self.assertFalse(res_second.history_recorded)
        self.assertEqual(len(mock_pod_instance.table("recommendation_history").list()), 1)

        # Third run with blocker (different rec) should record history
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "relationship_state": "blocked",
            "objections": ["budget blocker"]
        })
        res_third = loop.run_until_complete(rec_engine_module.generate_recommendation_function(self.ctx, input_data))
        self.assertTrue(res_third.history_recorded)
        self.assertEqual(len(mock_pod_instance.table("recommendation_history").list()), 2)

if __name__ == "__main__":
    unittest.main()
