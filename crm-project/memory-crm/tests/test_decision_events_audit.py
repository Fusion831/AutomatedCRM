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
            "commitments": MockTable("commitments"),
            "interactions": MockTable("interactions"),
            "relationship_milestones": MockTable("relationship_milestones"),
            "relationship_state_history": MockTable("relationship_state_history"),
            "priority_history": MockTable("priority_history"),
            "recommendation_history": MockTable("recommendation_history"),
            "resurrection_snapshots": MockTable("resurrection_snapshots"),
            "open_loop_health": MockTable("open_loop_health"),
            "decision_events": MockTable("decision_events")
        }
        self.agents_mock = {}

    def table(self, name: str) -> MockTable:
        return self.tables[name]

    def agent(self, name: str) -> Any:
        return self.agents_mock.get(name)

    def query(self, sql_query: str) -> MockQueryResult:
        sql_query = sql_query.strip().replace('"', "'")
        
        # decision_events queries
        if "FROM decision_events" in sql_query:
            results = self.tables["decision_events"].list()
            
            # Filter by contact_id
            if "contact_id = '" in sql_query:
                c_id = sql_query.split("contact_id = '")[1].split("'")[0]
                results = [r for r in results if r.get("contact_id") == c_id]
                
            # Filter by event_type
            if "event_type = '" in sql_query:
                e_type = sql_query.split("event_type = '")[1].split("'")[0]
                results = [r for r in results if r.get("event_type") == e_type]
                
            # Order by created_at
            if "ORDER BY created_at DESC" in sql_query:
                results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            elif "ORDER BY created_at ASC" in sql_query:
                results.sort(key=lambda x: x.get("created_at", ""), reverse=False)
                
            # Limit
            if "LIMIT " in sql_query:
                try:
                    limit_val = int(sql_query.split("LIMIT ")[1].split()[0])
                    results = results[:limit_val]
                except ValueError:
                    pass
                    
            return MockQueryResult(results)
            
        # commitments query
        elif "FROM commitments" in sql_query:
            results = self.tables["commitments"].list()
            if "contact_id = '" in sql_query:
                c_id = sql_query.split("contact_id = '")[1].split("'")[0]
                results = [r for r in results if r.get("contact_id") == c_id]
            if "status = 'open'" in sql_query:
                results = [r for r in results if r.get("status") == "open"]
            return MockQueryResult(results)
            
        # interactions query
        elif "FROM interactions" in sql_query:
            results = self.tables["interactions"].list()
            if "contact_id = '" in sql_query:
                c_id = sql_query.split("contact_id = '")[1].split("'")[0]
                results = [r for r in results if r.get("contact_id") == c_id]
            results.sort(key=lambda x: x.get("occurred_at", ""), reverse=True)
            return MockQueryResult(results)
            
        # milestones query
        elif "FROM relationship_milestones" in sql_query:
            results = self.tables["relationship_milestones"].list()
            if "contact_id = '" in sql_query:
                c_id = sql_query.split("contact_id = '")[1].split("'")[0]
                results = [r for r in results if r.get("contact_id") == c_id]
            return MockQueryResult(results)
            
        # state history query
        elif "FROM relationship_state_history" in sql_query:
            results = self.tables["relationship_state_history"].list()
            if "contact_id = '" in sql_query:
                c_id = sql_query.split("contact_id = '")[1].split("'")[0]
                results = [r for r in results if r.get("contact_id") == c_id]
            results.sort(key=lambda x: x.get("changed_at", ""), reverse=True)
            return MockQueryResult(results)
            
        # priority history query
        elif "FROM priority_history" in sql_query:
            results = self.tables["priority_history"].list()
            if "contact_id = '" in sql_query:
                c_id = sql_query.split("contact_id = '")[1].split("'")[0]
                results = [r for r in results if r.get("contact_id") == c_id]
            results.sort(key=lambda x: x.get("changed_at", ""), reverse=True)
            return MockQueryResult(results)
            
        # snapshots query
        elif "FROM resurrection_snapshots" in sql_query:
            results = self.tables["resurrection_snapshots"].list()
            if "contact_id = '" in sql_query:
                c_id = sql_query.split("contact_id = '")[1].split("'")[0]
                results = [r for r in results if r.get("contact_id") == c_id]
            return MockQueryResult(results)
            
        # open loop health query
        elif "FROM open_loop_health" in sql_query:
            results = self.tables["open_loop_health"].list()
            if "commitment_id = '" in sql_query:
                c_id = sql_query.split("commitment_id = '")[1].split("'")[0]
                results = [r for r in results if r.get("commitment_id") == c_id]
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

state_engine = load_module("state_engine", "memory-crm/functions/determine_relationship_state_function/code.py")
priority_engine = load_module("priority_engine", "memory-crm/functions/calculate_contact_priority_function/code.py")
rec_engine = load_module("rec_engine", "memory-crm/functions/generate_recommendation_function/code.py")
apply_updates = load_module("apply_updates", "memory-crm/functions/apply_updates_function/code.py")
loops_engine = load_module("loops_engine", "memory-crm/functions/evaluate_open_loops_function/code.py")
resurrection_engine = load_module("resurrection_engine", "memory-crm/functions/generate_resurrection_snapshot_function/code.py")

# Import Query API
sys.path.append("backend")
import services.audit_service as audit_service

class DummyContext:
    def __init__(self):
        self.pod_id = "test_pod_123"

# --- UNIT & INTEGRATION TESTS ---

class TestDecisionEventsAudit(unittest.TestCase):
    def setUp(self):
        global mock_pod_instance
        mock_pod_instance = MockPod()
        self.ctx = DummyContext()
        self.contact_id = "test_john"
        
        # Populate base contact details
        mock_pod_instance.table("contacts").create({
            "id": self.contact_id,
            "name": "John Doe",
            "company": "SaaS Corp",
            "relationship_state": "mutual_exploration",
            "tier": "B",
            "priority_score": 0,
            "attention_level": "LOW",
            "recommended_action": "No action required",
            "recommendation_category": "NO_ACTION",
            "expected_next_touch_date": None
        })

    @patch("state_engine.Lemma", MockLemma)
    def test_state_change_audit_event(self):
        # Trigger blocked state by adding objection with blocker keyword
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "objections": json.dumps(["budget blocker: cannot afford ($50k/yr)"])
        })
        
        input_data = state_engine.DetermineRelationshipStateInput(
            contact_id=self.contact_id,
            current_date="2026-07-01"
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(state_engine.determine_relationship_state_function(self.ctx, input_data))
        
        # Verify state transition occurred
        self.assertEqual(res.new_state, "blocked")
        self.assertTrue(res.transition_recorded)
        
        # Verify event logged in decision_events
        events = mock_pod_instance.table("decision_events").list()
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["event_type"], "STATE_CHANGE")
        self.assertEqual(event["event_source"], "relationship_state_engine")
        self.assertEqual(event["previous_value"], "mutual_exploration")
        self.assertEqual(event["new_value"], "blocked")
        self.assertTrue("budget blocker" in event["reason"])

    @patch("priority_engine.Lemma", MockLemma)
    def test_priority_change_audit_event(self):
        # Trigger priority change >= 5 points by adding overdue commitment
        mock_pod_instance.table("interactions").create({
            "contact_id": self.contact_id,
            "occurred_at": "2026-06-25T12:00:00Z"
        })
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "owner": "founder",
            "description": "Send proposal doc",
            "status": "open",
            "due_date": "2026-06-29"
        })
        
        # Set old priority history record so we have a reference
        mock_pod_instance.table("priority_history").create({
            "contact_id": self.contact_id,
            "new_score": 0,
            "changed_at": "2026-06-25T12:00:00Z"
        })
        
        input_data = priority_engine.CalculateContactPriorityInput(
            contact_id=self.contact_id,
            current_date="2026-07-01"
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(priority_engine.calculate_contact_priority_function(self.ctx, input_data))
        
        self.assertEqual(res.weighted_score, 50)
        self.assertTrue(res.priority_changed)
        
        # Verify event logged in decision_events
        events = mock_pod_instance.table("decision_events").list()
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["event_type"], "PRIORITY_CHANGE")
        self.assertEqual(event["event_source"], "priority_engine")
        self.assertEqual(event["previous_value"], "0")
        self.assertEqual(event["new_value"], "50")

    @patch("rec_engine.Lemma", MockLemma)
    def test_recommendation_change_audit_event(self):
        # Change relationship state to waiting_on_me and add open founder commitment to send slides
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "relationship_state": "waiting_on_me"
        })
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "owner": "founder",
            "description": "Send doc deck slides",
            "status": "open"
        })
        
        input_data = rec_engine.GenerateRecommendationInput(
            contact_id=self.contact_id,
            current_date="2026-07-01"
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(rec_engine.generate_recommendation_function(self.ctx, input_data))
        
        self.assertEqual(res.category, "SEND_DOCUMENT")
        self.assertTrue(res.rec_changed)
        
        # Verify event logged in decision_events
        events = mock_pod_instance.table("decision_events").list()
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["event_type"], "RECOMMENDATION_CHANGE")
        self.assertEqual(event["event_source"], "recommendation_engine")
        self.assertEqual(event["new_value"], "SEND_DOCUMENT (Send document: 'Send doc deck slides')")

    @patch("apply_updates.Lemma", MockLemma)
    def test_commitment_resolved_audit_event(self):
        comm_id = "comm_123"
        mock_pod_instance.table("commitments").create({
            "id": comm_id,
            "contact_id": self.contact_id,
            "owner": "founder",
            "description": "Email proposal slides",
            "status": "open"
        })
        
        input_data = apply_updates.ApplyUpdatesInput(
            contact_id=self.contact_id,
            interaction_id="int_123",
            extraction_result=apply_updates.ExtractedData(
                memory_updates=apply_updates.MemoryUpdates()
            ),
            reconciliation_result=apply_updates.ReconciliationResult(
                accepted=[
                    apply_updates.AcceptedReconciliation(
                        commitment_id=comm_id,
                        reason="Sent the proposal slides in email",
                        evidence_quote="here are the slides",
                        reconciliation_timestamp="2026-07-01T12:00:00Z"
                    )
                ]
            )
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(apply_updates.apply_updates_function(self.ctx, input_data))
        
        # Verify commitment status updated
        updated_comm = mock_pod_instance.table("commitments").get(comm_id)
        self.assertEqual(updated_comm["status"], "completed")
        
        # Verify event logged in decision_events
        events = mock_pod_instance.table("decision_events").list()
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["event_type"], "COMMITMENT_RESOLVED")
        self.assertEqual(event["event_source"], "reconciliation_engine")
        self.assertEqual(event["previous_value"], "open")
        self.assertEqual(event["new_value"], "completed")

    @patch("loops_engine.Lemma", MockLemma)
    def test_open_loop_escalation_audit_event(self):
        # Create an open commitment that becomes overdue (Tier B SLA = 14 days)
        int_row = mock_pod_instance.table("interactions").create({
            "contact_id": self.contact_id,
            "occurred_at": "2026-06-10T12:00:00Z" # 21 days ago
        })
        comm_row = mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "interaction_id": int_row["id"],
            "owner": "founder",
            "description": "Verify compliance sheet",
            "status": "open"
        })
        
        # Run loops evaluation
        input_data = loops_engine.EvaluateOpenLoopsInput(
            current_date="2026-07-01"
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(loops_engine.evaluate_open_loops_function(self.ctx, input_data))
        
        # Verify event logged in decision_events
        events = mock_pod_instance.table("decision_events").list()
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["event_type"], "OPEN_LOOP_ESCALATION")
        self.assertEqual(event["event_source"], "open_loop_engine")
        self.assertEqual(event["new_value"], "OVERDUE")

    @patch("resurrection_engine.Lemma", MockLemma)
    def test_resurrection_generated_audit_event(self):
        mock_agent = MagicMock()
        mock_agent.run.return_value = {
            "relationship_summary": "Summary details",
            "relationship_thesis": "Thesis details",
            "key_moments": [],
            "current_blockers": [],
            "open_loops": [],
            "why_momentum_stopped": "Stop details",
            "recommended_reentry_strategy": "Strategy details",
            "evidence": []
        }
        mock_pod_instance.agents_mock["resurrection-agent"] = mock_agent
        
        input_data = resurrection_engine.GenerateResurrectionSnapshotInput(
            contact_id=self.contact_id,
            force_refresh=True
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(resurrection_engine.generate_resurrection_snapshot_function(self.ctx, input_data))
        
        # Verify event logged in decision_events
        events = mock_pod_instance.table("decision_events").list()
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["event_type"], "RESURRECTION_GENERATED")
        self.assertEqual(event["event_source"], "resurrection_agent")
        self.assertEqual(event["new_value"], "Fresh Snapshot")

    def test_audit_trail_query_apis(self):
        # Seed Mock decision events
        mock_pod_instance.table("decision_events").create({
            "contact_id": self.contact_id,
            "event_type": "STATE_CHANGE",
            "event_source": "relationship_state_engine",
            "previous_value": "mutual_exploration",
            "new_value": "blocked",
            "reason": "Procurement blocker",
            "evidence": "[]",
            "created_at": "2026-07-01T12:00:00Z"
        })
        mock_pod_instance.table("decision_events").create({
            "contact_id": self.contact_id,
            "event_type": "PRIORITY_CHANGE",
            "event_source": "priority_engine",
            "previous_value": "0",
            "new_value": "50",
            "reason": "Overdue promise",
            "evidence": "[]",
            "created_at": "2026-07-01T12:05:00Z"
        })
        
        # 1. get_contact_decision_history
        history = audit_service.get_contact_decision_history(mock_pod_instance, self.contact_id)
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["event_type"], "PRIORITY_CHANGE") # Ordered DESC
        
        # 2. get_recent_decisions
        recent = audit_service.get_recent_decisions(mock_pod_instance, limit=1)
        self.assertEqual(len(recent), 1)
        self.assertEqual(recent[0]["event_type"], "PRIORITY_CHANGE")
        
        # 3. get_decisions_by_type
        by_type = audit_service.get_decisions_by_type(mock_pod_instance, "STATE_CHANGE")
        self.assertEqual(len(by_type), 1)
        self.assertEqual(by_type[0]["reason"], "Procurement blocker")
        
        # 4. get_decision_timeline
        timeline = audit_service.get_decision_timeline(mock_pod_instance, self.contact_id)
        self.assertEqual(len(timeline), 2)
        self.assertEqual(timeline[0]["event_type"], "STATE_CHANGE") # Ordered ASC (chronological)

if __name__ == "__main__":
    unittest.main()
