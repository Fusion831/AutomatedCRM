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
            "relationship_milestones": MockTable("relationship_milestones"),
            "recommendation_history": MockTable("recommendation_history"),
            "recommendation_feedback": MockTable("recommendation_feedback"),
            "decision_events": MockTable("decision_events")
        }

    def table(self, name: str) -> MockTable:
        return self.tables[name]

    def query(self, sql_query: str) -> MockQueryResult:
        sql_query = sql_query.strip().replace('"', "'")
        # print("MOCK QUERY:", sql_query)
        # recommendation_feedback queries
        if "FROM recommendation_feedback" in sql_query:
            results = self.tables["recommendation_feedback"].list()
            if "recommendation_id = '" in sql_query:
                r_id = sql_query.split("recommendation_id = '")[1].split("'")[0]
                results = [r for r in results if str(r.get("recommendation_id")) == r_id]
            if "contact_id = '" in sql_query:
                c_id = sql_query.split("contact_id = '")[1].split("'")[0]
                results = [r for r in results if str(r.get("contact_id")) == c_id]
            return MockQueryResult(results)

        # recommendation_history queries
        elif "FROM recommendation_history" in sql_query:
            results = self.tables["recommendation_history"].list()
            if "contact_id = '" in sql_query:
                c_id = sql_query.split("contact_id = '")[1].split("'")[0]
                results = [r for r in results if str(r.get("contact_id")) == c_id]
            elif "id = '" in sql_query:
                r_id = sql_query.split("id = '")[1].split("'")[0]
                results = [r for r in results if str(r.get("id")) == r_id]
            
            if "created_at < '" in sql_query:
                cutoff = sql_query.split("created_at < '")[1].split("'")[0]
                results = [r for r in results if r.get("created_at") < cutoff]
            
            if "ORDER BY created_at DESC" in sql_query:
                results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
            return MockQueryResult(results)
            
        # contacts queries
        elif "FROM contacts" in sql_query:
            results = self.tables["contacts"].list()
            if "id = '" in sql_query:
                c_id = sql_query.split("id = '")[1].split("'")[0]
                results = [r for r in results if str(r.get("id")) == c_id]
            return MockQueryResult(results)

        # commitments queries
        elif "FROM commitments" in sql_query:
            results = self.tables["commitments"].list()
            if "contact_id = '" in sql_query:
                c_id = sql_query.split("contact_id = '")[1].split("'")[0]
                results = [r for r in results if str(r.get("contact_id")) == c_id]
            if "status = 'open'" in sql_query:
                results = [r for r in results if r.get("status") == "open"]
            return MockQueryResult(results)

        # milestones queries
        elif "FROM relationship_milestones" in sql_query:
            results = self.tables["relationship_milestones"].list()
            if "contact_id = '" in sql_query:
                c_id = sql_query.split("contact_id = '")[1].split("'")[0]
                results = [r for r in results if str(r.get("contact_id")) == c_id]
            return MockQueryResult(results)

        # interactions queries
        elif "FROM interactions" in sql_query:
            results = self.tables["interactions"].list()
            if "contact_id = '" in sql_query:
                c_id = sql_query.split("contact_id = '")[1].split("'")[0]
                results = [r for r in results if str(r.get("contact_id")) == c_id]
            return MockQueryResult(results)

        return MockQueryResult([])

class MockLemma:
    def __init__(self):
        pass

    def pod(self, pod_id: str) -> MockPod:
        return mock_pod_instance

# Global mock pod instance shared between tests and code runs
mock_pod_instance = MockPod()

# --- LOAD ENGINE DYNAMICALLY ---
def load_module(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module

rec_engine_module = load_module("rec_engine_module", "memory-crm/functions/generate_recommendation_function/code.py")

# Import the service module directly
sys.path.append("backend")
import services.recommendation_feedback_service as fb_service

class DummyContext:
    def __init__(self):
        self.pod_id = "test_pod_123"

# --- UNIT & INTEGRATION TESTS ---

class TestRecommendationFeedback(unittest.TestCase):
    def setUp(self):
        global mock_pod_instance
        mock_pod_instance = MockPod()
        self.ctx = DummyContext()
        self.contact_id = "test_contact_456"
        
        # Populate contact
        mock_pod_instance.table("contacts").create({
            "id": self.contact_id,
            "name": "Alex Mercer",
            "company": "BioTech",
            "relationship_state": "waiting_on_me",
            "tier": "A",
            "recommended_action": "No action required",
            "recommendation_category": "NO_ACTION",
            "recommendation_urgency": "LOW",
            "recommendation_reasoning": "[]",
            "recommendation_evidence": "[]"
        })

    def test_feedback_apis_and_decision_events(self):
        # 1. Generate a recommendation history entry
        rec_id = "rec_history_1"
        mock_pod_instance.table("recommendation_history").create({
            "id": rec_id,
            "contact_id": self.contact_id,
            "previous_recommendation": "None",
            "new_recommendation": "Send proposal PDF",
            "reason": "Founder promised to send slides.",
            "created_at": datetime.utcnow().isoformat() + "Z"
        })

        # 2. Accept Recommendation
        fb_service.accept_recommendation(mock_pod_instance, rec_id, "Agreed, looks valid.")
        
        fbs = mock_pod_instance.table("recommendation_feedback").list()
        self.assertEqual(len(fbs), 1)
        self.assertEqual(fbs[0]["feedback_action"], "ACCEPTED")
        self.assertEqual(fbs[0]["feedback_reason"], "Agreed, looks valid.")

        events = mock_pod_instance.table("decision_events").list()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["event_type"], "RECOMMENDATION_ACCEPTED")
        self.assertEqual(events[0]["event_source"], "recommendation_engine")
        self.assertEqual(events[0]["new_value"], "ACCEPTED")

        # 3. Complete Recommendation
        fb_service.complete_recommendation(mock_pod_instance, rec_id, "Proposal sent via email.")
        fbs = mock_pod_instance.table("recommendation_feedback").list()
        self.assertEqual(len(fbs), 2)
        self.assertEqual(fbs[1]["feedback_action"], "COMPLETED")
        self.assertEqual(fbs[1]["feedback_reason"], "Proposal sent via email.")

        events = mock_pod_instance.table("decision_events").list()
        self.assertEqual(len(events), 2)
        self.assertEqual(events[1]["event_type"], "RECOMMENDATION_COMPLETED")

    def test_feedback_rejection_and_expiration(self):
        rec_id = "rec_history_2"
        mock_pod_instance.table("recommendation_history").create({
            "id": rec_id,
            "contact_id": self.contact_id,
            "new_recommendation": "Schedule follow up Zoom call",
            "created_at": datetime.utcnow().isoformat() + "Z"
        })

        # Reject recommendation (requires reason)
        fb_service.reject_recommendation(mock_pod_instance, rec_id, "Already scheduled in calendar.")
        
        fbs = mock_pod_instance.table("recommendation_feedback").list()
        self.assertEqual(fbs[0]["feedback_action"], "REJECTED")

        events = mock_pod_instance.table("decision_events").list()
        self.assertEqual(events[0]["event_type"], "RECOMMENDATION_REJECTED")

        # Reject recommendation without reason should fail
        with self.assertRaises(ValueError):
            fb_service.reject_recommendation(mock_pod_instance, rec_id, "")

    def test_auto_ignore_recommendations(self):
        # 1. Create an old recommendation (10 days old) with no feedback
        old_rec_id = "old_rec_999"
        old_time = (datetime.utcnow() - timedelta(days=10)).isoformat() + "Z"
        mock_pod_instance.table("recommendation_history").create({
            "id": old_rec_id,
            "contact_id": self.contact_id,
            "new_recommendation": "Follow up with Alex",
            "created_at": old_time
        })

        # 2. Create a new recommendation (1 day old) with no feedback
        new_rec_id = "new_rec_111"
        new_time = (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z"
        mock_pod_instance.table("recommendation_history").create({
            "id": new_rec_id,
            "contact_id": self.contact_id,
            "new_recommendation": "Follow up with Alex",
            "created_at": new_time
        })

        # Run auto-ignore (older than 7 days)
        ignored = fb_service.auto_ignore_recommendations(mock_pod_instance, ignore_after_days=7)
        self.assertEqual(len(ignored), 1)
        self.assertEqual(ignored[0], old_rec_id)

        fbs = mock_pod_instance.table("recommendation_feedback").list()
        self.assertEqual(len(fbs), 1)
        self.assertEqual(fbs[0]["feedback_action"], "IGNORED")

        events = mock_pod_instance.table("decision_events").list()
        self.assertEqual(events[0]["event_type"], "RECOMMENDATION_IGNORED")

    def test_analytics_calculation(self):
        # Seed 3 recommendations
        r1 = "rec_a"
        r2 = "rec_b"
        r3 = "rec_c"
        
        now = datetime.utcnow()
        mock_pod_instance.table("recommendation_history").create({
            "id": r1,
            "contact_id": self.contact_id,
            "new_recommendation": "Send slides PDF",
            "created_at": (now - timedelta(minutes=60)).isoformat() + "Z"
        })
        mock_pod_instance.table("recommendation_history").create({
            "id": r2,
            "contact_id": self.contact_id,
            "new_recommendation": "Follow up with email",
            "created_at": (now - timedelta(minutes=30)).isoformat() + "Z"
        })
        mock_pod_instance.table("recommendation_history").create({
            "id": r3,
            "contact_id": self.contact_id,
            "new_recommendation": "Schedule sync meeting",
            "created_at": (now - timedelta(minutes=10)).isoformat() + "Z"
        })

        # r1 is accepted then completed in 30 minutes (1800 seconds)
        fb_service.accept_recommendation(mock_pod_instance, r1)
        # Record completion 30 mins after creation
        comp_time = (now - timedelta(minutes=30)).isoformat() + "Z"
        mock_pod_instance.table("recommendation_feedback").create({
            "id": "comp_fb_1",
            "recommendation_id": r1,
            "contact_id": self.contact_id,
            "feedback_action": "COMPLETED",
            "created_at": comp_time
        })

        # r2 is rejected
        fb_service.reject_recommendation(mock_pod_instance, r2, "Not needed.")

        # r3 remains pending (no feedback)

        analytics = fb_service.calculate_feedback_analytics(mock_pod_instance)
        
        self.assertEqual(analytics["total_recommendations"], 3)
        self.assertEqual(analytics["acceptance_rate"], round(1/3, 4)) # r1 is accepted/completed
        self.assertEqual(analytics["completion_rate"], round(1/3, 4)) # r1 is completed
        self.assertEqual(analytics["rejection_rate"], round(1/3, 4))  # r2 is rejected
        self.assertEqual(analytics["ignore_rate"], 0.0)
        self.assertEqual(analytics["average_completion_time_seconds"], 1800.0)
        
        # Check success rate per category
        # r1 maps to SEND_DOCUMENT, successful -> 100%
        # r2 maps to FOLLOW_UP, failed -> 0%
        # r3 maps to SCHEDULE_MEETING, pending -> 0%
        self.assertEqual(analytics["success_rate_by_category"]["SEND_DOCUMENT"], 1.0)
        self.assertEqual(analytics["success_rate_by_category"]["FOLLOW_UP"], 0.0)
        self.assertEqual(analytics["success_rate_by_category"]["SCHEDULE_MEETING"], 0.0)

    @patch("rec_engine_module.Lemma", MockLemma)
    def test_engine_integration_confidence_and_auto_expire(self):
        # 1. Populate recommendation history with a previous recommendation
        prev_rec_id = "prev_rec_1"
        mock_pod_instance.table("recommendation_history").create({
            "id": prev_rec_id,
            "contact_id": self.contact_id,
            "new_recommendation": "Reach out to check in", # maps to FOLLOW_UP
            "created_at": (datetime.utcnow() - timedelta(hours=1)).isoformat() + "Z"
        })
        mock_pod_instance.table("contacts").update(self.contact_id, {
            "recommended_action": "Reach out to check in",
            "recommendation_category": "FOLLOW_UP"
        })

        # 2. Record historical positive feedback for FOLLOW_UP category (but do not mark it final, i.e., completed)
        fb_service.accept_recommendation(mock_pod_instance, prev_rec_id)

        # 3. Add an overdue commitment to trigger a SEND_DOCUMENT recommendation
        mock_pod_instance.table("commitments").create({
            "contact_id": self.contact_id,
            "owner": "founder",
            "description": "Send proposal deck slides",
            "status": "open"
        })

        # Run recommendation generator (should trigger category change from FOLLOW_UP to SEND_DOCUMENT)
        input_data = rec_engine_module.GenerateRecommendationInput(
            contact_id=self.contact_id,
            current_date="2026-07-01"
        )
        loop = asyncio.get_event_loop()
        res = loop.run_until_complete(rec_engine_module.generate_recommendation_function(self.ctx, input_data))

        self.assertEqual(res.category, "SEND_DOCUMENT")
        self.assertTrue(res.rec_changed)
        
        # Baseline confidence should be 85 because SEND_DOCUMENT has no prior feedback
        self.assertEqual(res.recommendation_confidence, 85)

        # 4. The previous FOLLOW_UP recommendation should have been automatically EXPIRED
        fbs = mock_pod_instance.table("recommendation_feedback").list()
        # Should have 2 feedback entries: 1 accepted from step 2, and 1 auto-expired
        self.assertEqual(len(fbs), 2)
        expired_fb = next(f for f in fbs if f["feedback_action"] == "EXPIRED")
        self.assertEqual(expired_fb["recommendation_id"], prev_rec_id)

        # There should also be a RECOMMENDATION_EXPIRED event in decision_events
        events = mock_pod_instance.table("decision_events").list()
        self.assertTrue(any(e["event_type"] == "RECOMMENDATION_EXPIRED" for e in events))

        # 5. Let's run it again, but this time with a history of positive feedback for SEND_DOCUMENT
        # Find the newly generated recommendation ID
        history_recs = mock_pod_instance.table("recommendation_history").list()
        new_rec_row = next(r for r in history_recs if r["id"] != prev_rec_id)
        
        # Record positive feedback for the SEND_DOCUMENT recommendation
        fb_service.complete_recommendation(mock_pod_instance, new_rec_row["id"])

        # Run engine again
        res_high_confidence = loop.run_until_complete(rec_engine_module.generate_recommendation_function(self.ctx, input_data))
        # Confidence should increase to 90 (85 + 5 points for 1 COMPLETED)
        self.assertEqual(res_high_confidence.recommendation_confidence, 90)

if __name__ == "__main__":
    unittest.main()
