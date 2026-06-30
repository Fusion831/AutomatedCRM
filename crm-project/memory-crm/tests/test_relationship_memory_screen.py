import unittest
import uuid
from datetime import datetime, date
from typing import Dict, List, Any

# Mock Datastore context matching Lemma Pod tables
class MockTable:
    def __init__(self, name: str):
        self.name = name
        self.records = {}

    def get(self, record_id: str) -> Dict[str, Any]:
        if record_id not in self.records:
            raise ValueError(f"Record {record_id} not found in {self.name}")
        return self.records[record_id]

    def create(self, record: Dict[str, Any]) -> Dict[str, Any]:
        record_id = record.get("id") or str(uuid.uuid4())
        record["id"] = record_id
        self.records[record_id] = record
        return record

    def update(self, record_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        record = self.get(record_id)
        record.update(updates)
        return record

    def list(self) -> List[Dict[str, Any]]:
        return list(self.records.values())

class MockPod:
    def __init__(self):
        self.tables = {
            "contacts": MockTable("contacts"),
            "relationship_milestones": MockTable("relationship_milestones"),
            "commitments": MockTable("commitments"),
            "interactions": MockTable("interactions")
        }

    def table(self, name: str) -> MockTable:
        return self.tables[name]

# Helper to calculate priority
def calculate_contact_priority(
    contact: Dict[str, Any],
    commitments: List[Dict[str, Any]],
    current_date: date = None
) -> Dict[str, Any]:
    if current_date is None:
        current_date = date.today()

    score = 0
    reasons = []

    if contact.get("is_muted"):
        return {"score": 0, "reasons": ["Contact is muted by founder"]}
    if contact.get("is_pinned"):
        return {"score": 100, "reasons": ["Contact is pinned to top by founder"]}

    has_overdue = False
    has_near_due = False

    for c in commitments:
        if c.get("status") != "open":
            continue
        
        if c.get("owner") == "founder" and c.get("confidence", 100) >= 70:
            due_date = c.get("due_date")
            if due_date:
                if isinstance(due_date, str):
                    try:
                        due_date = datetime.strptime(due_date[:10], "%Y-%m-%d").date()
                    except ValueError:
                        continue
                elif isinstance(due_date, datetime):
                    due_date = due_date.date()
                
                days_left = (due_date - current_date).days
                if days_left < 0:
                    has_overdue = True
                elif 0 <= days_left <= 2:
                    has_near_due = True

    if has_overdue:
        score += 50
        reasons.append("+50: Overdue promise to contact (confidence >= 70%)")
    elif has_near_due:
        score += 30
        reasons.append("+30: Promise due to contact within 48 hours")

    state = contact.get("relationship_state", "mutual_exploration")
    if state == "waiting_on_me":
        score += 20
        reasons.append("+20: Attention state is 'Waiting on Me'")

    tier = contact.get("tier", "B")
    multiplier = 1.0
    if tier == "A":
        multiplier = 1.5
    elif tier == "C":
        multiplier = 0.4

    score = int(score * multiplier)
    score = min(100, max(0, score))
    return {
        "score": score,
        "reasons": reasons
    }

class TestRelationshipMemoryScreen(unittest.TestCase):
    def setUp(self):
        self.pod = MockPod()
        
        # Populate initial test data
        self.contact_id = "test_sarah"
        self.pod.table("contacts").create({
            "id": self.contact_id,
            "name": "Sarah Jenkins",
            "company": "NextGen AI",
            "relationship_state": "waiting_on_me",
            "tier": "A",
            "who_are_they": "Founder and CEO of NextGen AI.",
            "why_talking": "Evaluating pre-Seed / Seed round leading options.",
            "key_drivers": ["fast scaling"],
            "objections": ["CAC overhead"],
            "priority_score": 0,
            "priority_reasons": []
        })

        # Add open commitment
        self.comm_id = "test_comm"
        self.pod.table("commitments").create({
            "id": self.comm_id,
            "contact_id": self.contact_id,
            "description": "Send financial model by Friday",
            "owner": "founder",
            "confidence": 95,
            "due_date": "2026-07-03",
            "status": "open"
        })

    def test_query_contact_data_flow(self):
        # 1. Fetch Contact
        contact = self.pod.table("contacts").get(self.contact_id)
        self.assertEqual(contact["name"], "Sarah Jenkins")
        self.assertEqual(contact["relationship_state"], "waiting_on_me")

        # 2. Fetch Commitments
        comms = [c for c in self.pod.table("commitments").list() if c["contact_id"] == self.contact_id]
        self.assertEqual(len(comms), 1)
        self.assertEqual(comms[0]["id"], self.comm_id)

    def test_complete_commitment_recalculation(self):
        # 1. Recalculate priority initially (with overdue/near due commitment)
        contact = self.pod.table("contacts").get(self.contact_id)
        comms = [c for c in self.pod.table("commitments").list() if c["contact_id"] == self.contact_id]
        
        # Assume today is 2026-07-05 (which makes due date 2026-07-03 overdue)
        current_date = date(2026, 7, 5)
        res = calculate_contact_priority(contact, comms, current_date=current_date)
        self.assertEqual(res["score"], 100) # (50 + 20) * 1.5 = 105 capped at 100

        # Update contact priority
        self.pod.table("contacts").update(self.contact_id, {
            "priority_score": res["score"],
            "priority_reasons": res["reasons"]
        })

        # 2. Mark commitment as completed
        self.pod.table("commitments").update(self.comm_id, {
            "status": "completed",
            "completed_at": "2026-07-05T12:00:00Z"
        })

        # 3. Recalculate priority
        updated_comms = [c for c in self.pod.table("commitments").list() if c["contact_id"] == self.contact_id]
        res_after = calculate_contact_priority(contact, updated_comms, current_date=current_date)
        
        # After completing the commitment, only state "waiting_on_me" applies: 20 * 1.5 = 30
        self.assertEqual(res_after["score"], 30)

if __name__ == "__main__":
    unittest.main()
