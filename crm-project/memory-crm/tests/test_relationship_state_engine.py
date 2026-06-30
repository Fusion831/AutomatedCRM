import unittest
import asyncio
import uuid
import importlib.util
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
            "relationship_state_history": MockTable("relationship_state_history"),
            "interactions": MockTable("interactions")
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
            
        # state history query
        elif "FROM relationship_state_history" in sql_query:
            contact_id = sql_query.split("contact_id = '")[1].split("'")[0]
            results = []
            for h in self.tables["relationship_state_history"].list():
                if str(h.get("contact_id")) == contact_id:
                    results.append(h)
            return MockQueryResult(results)

        # interactions query
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

def load_module(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

state_engine_module = load_module("state_engine_module", "memory-crm/functions/determine_relationship_state_function/code.py")

class DummyContext:
    def __init__(self):
        self.pod_id = "test_pod_123"

# --- UNIT TESTS SUITE ---

class TestRelationshipStateEngine(unittest.TestCase):
    def setUp(self):
        global mock_pod_instance
        mock_pod_instance = MockPod()
        self.ctx = DummyContext()
        self.contact_id = "test_sarah"
        
        # Populate contact in the table
        mock_pod_instance.table("contacts").create({
            "id": self.contact_id,
            "name": "Sarah Jenkins",
            "company": "NextGen AI",
            "relationship_state": "mutual_exploration",
            "tier": "A",
            "who_are_they": "Founder and CEO of NextGen AI.",
            "why_talking": "Evaluating pre-Seed / Seed round leading options.",
            "key_drivers": [],
            "objections": []
        })

    @patch("state_engine_module.Lemma", MockLemma)
    def test_state_blocked_via_objections(self):
        # 1. Update contact to have a blocker objection
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "objections": ["We have a hiring blocker until Q4"]
        })
        
        input_data = state_engine_module.DetermineRelationshipStateInput(contact_id=self.contact_id)
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(state_engine_module.determine_relationship_state_function(self.ctx, input_data))
        
        self.assertEqual(res.new_state, "blocked")
        self.assertTrue(any("Objection blocker detected" in r for r in res.reasons))

    @patch("state_engine_module.Lemma", MockLemma)
    def test_state_blocked_via_milestone(self):
        # 1. Create a milestone with blocker text
        mock_pod_instance.table("relationship_milestones").create({
            "contact_id": self.contact_id,
            "summary": "procurement blocker encountered on pricing review",
            "importance_score": 85,
            "occurred_at": "2026-06-25T10:00:00Z"
        })
        
        input_data = state_engine_module.DetermineRelationshipStateInput(contact_id=self.contact_id)
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(state_engine_module.determine_relationship_state_function(self.ctx, input_data))
        
        self.assertEqual(res.new_state, "blocked")
        self.assertTrue(any("Milestone blocker detected" in r for r in res.reasons))

    @patch("state_engine_module.Lemma", MockLemma)
    def test_state_waiting_on_me_priority(self):
        # 1. Open commitments for founder AND contact (founder has priority)
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "description": "Send proposal doc",
            "owner": "founder",
            "status": "open"
        })
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "description": "Review proposal doc",
            "owner": "contact",
            "status": "open"
        })
        
        input_data = state_engine_module.DetermineRelationshipStateInput(contact_id=self.contact_id)
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(state_engine_module.determine_relationship_state_function(self.ctx, input_data))
        
        self.assertEqual(res.new_state, "waiting_on_me")
        self.assertTrue(any("Open founder commitment: Send proposal doc" in r for r in res.reasons))

    @patch("state_engine_module.Lemma", MockLemma)
    def test_state_waiting_on_them(self):
        # 1. Open commitment only for contact
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "description": "Review proposal doc",
            "owner": "contact",
            "status": "open"
        })
        
        input_data = state_engine_module.DetermineRelationshipStateInput(contact_id=self.contact_id)
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(state_engine_module.determine_relationship_state_function(self.ctx, input_data))
        
        self.assertEqual(res.new_state, "waiting_on_them")

    @patch("state_engine_module.Lemma", MockLemma)
    def test_state_mutual_exploration(self):
        # 1. Add a recent interaction within 14 days
        today = datetime.utcnow().date()
        mock_pod_instance.table("interactions").create({
            "contact_id": self.contact_id,
            "type": "email",
            "summary": "Great intro thread",
            "occurred_at": (today - timedelta(days=5)).isoformat() + "T12:00:00Z"
        })
        
        input_data = state_engine_module.DetermineRelationshipStateInput(
            contact_id=self.contact_id,
            current_date=today.isoformat()
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(state_engine_module.determine_relationship_state_function(self.ctx, input_data))
        
        self.assertEqual(res.new_state, "mutual_exploration")

    @patch("state_engine_module.Lemma", MockLemma)
    def test_state_cooling_due_to_inactivity(self):
        # 1. Inactivity for 20 days
        today = datetime.utcnow().date()
        mock_pod_instance.table("interactions").create({
            "contact_id": self.contact_id,
            "type": "email",
            "summary": "Intro meeting",
            "occurred_at": (today - timedelta(days=20)).isoformat() + "T12:00:00Z"
        })
        
        input_data = state_engine_module.DetermineRelationshipStateInput(
            contact_id=self.contact_id,
            current_date=today.isoformat()
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(state_engine_module.determine_relationship_state_function(self.ctx, input_data))
        
        self.assertEqual(res.new_state, "cooling")

    @patch("state_engine_module.Lemma", MockLemma)
    def test_state_reengagement_candidate(self):
        # 1. Dormant for >30 days (last interaction 35 days ago)
        # 2. Has important milestone (importance_score = 90)
        today = datetime.utcnow().date()
        mock_pod_instance.table("interactions").create({
            "contact_id": self.contact_id,
            "type": "meeting",
            "summary": "First pitch session",
            "occurred_at": (today - timedelta(days=35)).isoformat() + "T12:00:00Z"
        })
        mock_pod_instance.table("relationship_milestones").create({
            "contact_id": self.contact_id,
            "summary": "Signed term sheet proposal",
            "importance_score": 90,
            "occurred_at": (today - timedelta(days=35)).isoformat() + "T12:00:00Z"
        })
        
        input_data = state_engine_module.DetermineRelationshipStateInput(
            contact_id=self.contact_id,
            current_date=today.isoformat()
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(state_engine_module.determine_relationship_state_function(self.ctx, input_data))
        
        self.assertEqual(res.new_state, "reengagement_candidate")

    @patch("state_engine_module.Lemma", MockLemma)
    def test_anti_flapping_hysteresis(self):
        # 1. Setup contact starting in cooling state
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "relationship_state": "cooling"
        })
        
        # 2. Record a transition from mutual_exploration -> cooling today
        today = datetime.utcnow()
        mock_pod_instance.table("relationship_state_history").create({
            "contact_id": self.contact_id,
            "old_state": "mutual_exploration",
            "new_state": "cooling",
            "reason": "Conversation losing momentum",
            "changed_at": today.isoformat() + "Z"
        })
        
        # 3. Add an old interaction (15 days ago) to trigger mutual_exploration condition
        mock_pod_instance.table("interactions").create({
            "contact_id": self.contact_id,
            "type": "email",
            "summary": "Intro",
            "occurred_at": (today - timedelta(days=2)).isoformat() + "Z"
        })
        
        # Try to transition back to mutual_exploration on the same day (should be blocked by anti-flapping!)
        input_data = state_engine_module.DetermineRelationshipStateInput(
            contact_id=self.contact_id,
            current_date=today.date().isoformat()
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(state_engine_module.determine_relationship_state_function(self.ctx, input_data))
        
        # State should remain cooling because of anti-flapping rule
        self.assertEqual(res.new_state, "cooling")
        self.assertFalse(res.transition_recorded)
        self.assertTrue(any("Anti-flapping block" in r for r in res.reasons))

        # 4. Now add a new interaction occurred AFTER the state transition (cooldown bypass)
        mock_pod_instance.table("interactions").create({
            "contact_id": self.contact_id,
            "type": "email",
            "summary": "Catch-up email",
            "occurred_at": (today + timedelta(minutes=5)).isoformat() + "Z"
        })
        
        res_bypass = loop.run_until_complete(state_engine_module.determine_relationship_state_function(self.ctx, input_data))
        
        # Now transition is allowed due to the new interaction bypass
        self.assertEqual(res_bypass.new_state, "mutual_exploration")
        self.assertTrue(res_bypass.transition_recorded)

if __name__ == "__main__":
    unittest.main()
