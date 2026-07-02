import logging
import json
from datetime import datetime, date, timedelta
from lemma_sdk import Pod

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed_db")

def clear_table(pod: Pod, table_name: str):
    try:
        res = pod.table(table_name).list(limit=100)
        items = res.to_dict().get("items", [])
        for item in items:
            pod.table(table_name).delete(item["id"])
        logger.info(f"Cleared table: {table_name}")
    except Exception as e:
        logger.warn(f"Failed to clear table {table_name}: {e}")

def main():
    logger.info("Initializing rich founder CRM seed data...")
    
    with Pod.from_env() as pod:
        # 1. Clean previous data
        logger.info("Cleaning up existing datastore tables...")
        clear_table(pod, "relationship_milestones")
        clear_table(pod, "commitments")
        clear_table(pod, "interactions")
        clear_table(pod, "recommendation_feedback")
        clear_table(pod, "recommendation_history")
        clear_table(pod, "decision_events")
        clear_table(pod, "daily_briefs")
        clear_table(pod, "contacts")

        # 2. Seed contacts
        logger.info("Seeding 4 realistic founder contacts...")
        
        contacts_to_create = [
            {
                "id": "5bae59cb-25f5-472e-a4e3-3ff9e946efcc",
                "name": "Rahul Sharma",
                "relationship_state": "waiting_on_them",
                "tier": "A",
                "who_are_they": "VP Engineering at Acme Corp.",
                "why_talking": "Evaluating observability solutions to replace Datadog.",
                "key_drivers": json.dumps({
                    "drivers": ["Wants to expand their observability suite", "observability tools"],
                    "objections": []
                }),
                "memory_confidence": json.dumps({"Wants to expand their observability suite": 0.95}),
                "priority_score": 50,
                "priority_reasons": json.dumps([
                    "Applied Relationship Tier A multiplier (x1.5)",
                    "Open loop commitment from contact"
                ]),
                "last_interaction": (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z",
                "expected_next_touch_date": (date.today() + timedelta(days=3)).isoformat(),
                "attention_level": "LOW",
                "recommendation_category": "NO_ACTION",
                "recommendation_confidence": 85,
                "recommendation_evidence": json.dumps([
                    "Relationship state is waiting_on_them. commitments are clear."
                ]),
                "recommendation_reasoning": json.dumps([
                    "Relationship is active and has no open loop commitments or blockers."
                ]),
                "recommendation_urgency": "LOW",
                "recommended_action": "No action required"
            },
            {
                "id": "a9f8b7c6-d5e4-4c3b-2a1b-0f9e8d7c6b5a",
                "name": "Sarah Jenkins",
                "relationship_state": "waiting_on_me",
                "tier": "A",
                "who_are_they": "Partner at Horizon Ventures",
                "why_talking": "Pitching for Series A investment.",
                "key_drivers": json.dumps({
                    "drivers": ["Keen on developer infrastructure space", "Looking for strong founder team"],
                    "objections": ["Migration risk for large legacy customers"]
                }),
                "memory_confidence": json.dumps({"Series A interest": 0.90}),
                "priority_score": 95,
                "priority_reasons": json.dumps([
                    "Needs response: Open commitment owned by founder",
                    "Tier A relationship priority"
                ]),
                "last_interaction": (datetime.utcnow() - timedelta(days=2)).isoformat() + "Z",
                "expected_next_touch_date": (date.today() + timedelta(days=1)).isoformat(),
                "attention_level": "HIGH",
                "recommendation_category": "RESPOND",
                "recommendation_confidence": 95,
                "recommendation_evidence": json.dumps([
                    "Sarah: Please send your customer migration data by Friday."
                ]),
                "recommendation_reasoning": json.dumps([
                    "Sarah requested follow-up projections.",
                    "Partner meeting scheduled soon."
                ]),
                "recommendation_urgency": "HIGH",
                "recommended_action": "Send updated financial projections and migration case study."
            },
            {
                "id": "c7b6a5d4-e3f2-4a1b-0c9b-8a7f6e5d4c3b",
                "name": "Michael Chen",
                "relationship_state": "mutual_exploration",
                "tier": "B",
                "who_are_they": "CTO at ByteSize",
                "why_talking": "Exploratory integration partnership.",
                "key_drivers": json.dumps({
                    "drivers": ["Wants to reduce infrastructure latency", "Looking for custom webhook relays"],
                    "objections": ["Security compliance certification check"]
                }),
                "memory_confidence": json.dumps({"Latency reduction interest": 0.80}),
                "priority_score": 30,
                "priority_reasons": json.dumps([
                    "Tier B relationship",
                    "Regular follow-up cadence"
                ]),
                "last_interaction": (datetime.utcnow() - timedelta(days=10)).isoformat() + "Z",
                "expected_next_touch_date": (date.today() - timedelta(days=2)).isoformat(),
                "attention_level": "MEDIUM",
                "recommendation_category": "FOLLOW_UP",
                "recommendation_confidence": 75,
                "recommendation_evidence": json.dumps([
                    "Last interaction: Call on June 21."
                ]),
                "recommendation_reasoning": json.dumps([
                    "No contact for 10 days.",
                    "Cadence is cooling down."
                ]),
                "recommendation_urgency": "MEDIUM",
                "recommended_action": "Ping casually to warm contact."
            },
            {
                "id": "d5c4b3a2-f1e0-4d9c-8b7a-6a5b4c3d2e1f",
                "name": "Elena Rostova",
                "relationship_state": "reengagement_candidate",
                "tier": "C",
                "who_are_they": "VP Product at CloudFlare",
                "why_talking": "Possible channel partnership.",
                "key_drivers": json.dumps({
                    "drivers": ["Edge compute integrations"],
                    "objections": ["Resource constraints on their integration team"]
                }),
                "memory_confidence": json.dumps({"Edge compute integration interest": 0.70}),
                "priority_score": 15,
                "priority_reasons": json.dumps([
                    "Re-engagement opportunity",
                    "Cold relationship category"
                ]),
                "last_interaction": (datetime.utcnow() - timedelta(days=35)).isoformat() + "Z",
                "expected_next_touch_date": (date.today() - timedelta(days=5)).isoformat(),
                "attention_level": "LOW",
                "recommendation_category": "REENGAGE",
                "recommendation_confidence": 70,
                "recommendation_evidence": json.dumps([
                    "Elena: Ping me when the new SDK is publicly launched."
                ]),
                "recommendation_reasoning": json.dumps([
                    "Relationship is reviving.",
                    "Product alignment on edge computing is strong."
                ]),
                "recommendation_urgency": "LOW",
                "recommended_action": "Share recent SDK launch announcement."
            },
            {
                "id": "8a8a8a8a-8a8a-4a8a-aa8a-8a8a8a8a8a8a",
                "name": "Lina Alvarez",
                "relationship_state": "waiting_on_me",
                "tier": "A",
                "who_are_they": "Lead Product Manager at ScaleAI",
                "why_talking": "Evaluating real-time webhook routing for LLM outputs.",
                "key_drivers": json.dumps({
                    "drivers": ["Real-time webhook latency guarantees", "Highly reliable event dispatching"],
                    "objections": ["Integration schema complexity"]
                }),
                "memory_confidence": json.dumps({"Webhook routing evaluation": 0.92}),
                "priority_score": 80,
                "priority_reasons": json.dumps([
                    "Awaiting founder action: share API credentials",
                    "Tier A priority"
                ]),
                "last_interaction": (datetime.utcnow() - timedelta(hours=12)).isoformat() + "Z",
                "expected_next_touch_date": (date.today() + timedelta(days=1)).isoformat(),
                "attention_level": "HIGH",
                "recommendation_category": "RESPOND",
                "recommendation_confidence": 90,
                "recommendation_evidence": json.dumps([
                    "Lina: Let me know when we can get our sandbox tokens to test the relays."
                ]),
                "recommendation_reasoning": json.dumps([
                    "ScaleAI needs to run validation tests this week."
                ]),
                "recommendation_urgency": "HIGH",
                "recommended_action": "Send webhook API documentation and sandbox access credentials."
            },
            {
                "id": "7c7c7c7c-7c7c-4c7c-ac7c-7c7c7c7c7c7c",
                "name": "Marcus Vance",
                "relationship_state": "mutual_exploration",
                "tier": "B",
                "who_are_they": "CEO at CyberFlow",
                "why_talking": "Exploring strategic developer tools collaboration.",
                "key_drivers": json.dumps({
                    "drivers": ["Toolchain integrations", "Leveraging open-source ecosystem"],
                    "objections": ["Overlapping features in developer SDKs"]
                }),
                "memory_confidence": json.dumps({"Developer ecosystem partnership": 0.85}),
                "priority_score": 45,
                "priority_reasons": json.dumps([
                    "Tier B relationship partnership opportunity",
                    "Introduce to engineering leads"
                ]),
                "last_interaction": (datetime.utcnow() - timedelta(days=4)).isoformat() + "Z",
                "expected_next_touch_date": (date.today() + timedelta(days=5)).isoformat(),
                "attention_level": "MEDIUM",
                "recommendation_category": "FOLLOW_UP",
                "recommendation_confidence": 80,
                "recommendation_evidence": json.dumps([
                    "Marcus: Let's loop in our tech leads next time we speak."
                ]),
                "recommendation_reasoning": json.dumps([
                    "Need to schedule intro call for engineering sync."
                ]),
                "recommendation_urgency": "MEDIUM",
                "recommended_action": "Introduce Marcus to the engineering team and schedule a sync."
            }
        ]
        
        for c in contacts_to_create:
            pod.table("contacts").create(c)
        logger.info("Contacts seeded.")

        # 3. Seed interactions (using valid UUID formats)
        logger.info("Seeding interaction history logs...")
        
        interactions = [
            # Rahul Sharma
            {
                "id": "1a1a1a1a-1a1a-1a1a-1a1a-1a1a1a1a1a1a",
                "contact_id": "5bae59cb-25f5-472e-a4e3-3ff9e946efcc",
                "type": "meeting",
                "summary": "First call with Rahul. He is looking for observability tools to replace Datadog. I promised to send the pricing deck.",
                "occurred_at": (datetime.utcnow() - timedelta(days=3)).isoformat() + "Z"
            },
            {
                "id": "2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b2b",
                "contact_id": "5bae59cb-25f5-472e-a4e3-3ff9e946efcc",
                "type": "meeting",
                "summary": "Rahul: We want to expand our observability suite. Thanks for sending the pricing deck, received it. I will review it soon.",
                "occurred_at": (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z"
            },
            # Sarah Jenkins
            {
                "id": "3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c3c",
                "contact_id": "a9f8b7c6-d5e4-4c3b-2a1b-0f9e8d7c6b5a",
                "type": "meeting",
                "summary": "Pitch presentation with Sarah. She showed positive response and asked to see customer migration details and financial projections for Series A prep.",
                "occurred_at": (datetime.utcnow() - timedelta(days=2)).isoformat() + "Z"
            },
            # Michael Chen
            {
                "id": "4d4d4d4d-4d4d-4d4d-4d4d-4d4d-4d4d-4d4d",
                "contact_id": "c7b6a5d4-e3f2-4a1b-0c9b-8a7f6e5d4c3b",
                "type": "email",
                "summary": "Sent webhook relays specs. Michael replied noting interest, but pointed out they need security audit reports beforehand.",
                "occurred_at": (datetime.utcnow() - timedelta(days=10)).isoformat() + "Z"
            },
            # Lina Alvarez
            {
                "id": "8c8c8c8c-8c8c-4c8c-ac8c-8c8c8c8c8c8c",
                "contact_id": "8a8a8a8a-8a8a-4a8a-aa8a-8a8a8a8a8a8a",
                "type": "slack",
                "summary": "Lina: We want to evaluate the real-time webhook routing sandbox. Can you share API docs and credentials? I said I will send it by tomorrow.",
                "occurred_at": (datetime.utcnow() - timedelta(hours=12)).isoformat() + "Z"
            },
            # Marcus Vance
            {
                "id": "7d7d7d7d-7d7d-4d7d-ad7d-7d7d7d7d7d7d",
                "contact_id": "7c7c7c7c-7c7c-4c7c-ac7c-7c7c7c7c7c7c",
                "type": "meeting",
                "summary": "Intro meeting with Marcus. Discussed potential toolchain integration and ecosystem partnerships. He requested to loop in tech leads.",
                "occurred_at": (datetime.utcnow() - timedelta(days=4)).isoformat() + "Z"
            }
        ]
        
        for idx, i in enumerate(interactions):
            pod.table("interactions").create(i)
        logger.info("Interactions seeded.")

        # 4. Seed commitments
        logger.info("Seeding commitments...")
        commitments = [
            # Rahul Sharma
            {
                "id": "c8ff4c07-9f15-4aba-a846-6eb916f4276e",
                "contact_id": "5bae59cb-25f5-472e-a4e3-3ff9e946efcc",
                "interaction_id": "2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b2b",
                "owner": "founder",
                "description": "Send pricing deck",
                "status": "completed",
                "confidence": 100,
                "due_date": (date.today() - timedelta(days=1)).isoformat(),
                "evidence_quote": "I promised to send the pricing deck."
            },
            {
                "id": "5c0ca702-7f58-401c-938c-90c22cddf9bb",
                "contact_id": "5bae59cb-25f5-472e-a4e3-3ff9e946efcc",
                "interaction_id": "2b2b2b2b-2b2b-2b2b-2b2b-2b2b2b2b2b2b",
                "owner": "contact",
                "description": "Review the pricing deck",
                "status": "open",
                "confidence": 90,
                "due_date": None,
                "evidence_quote": "I will review it soon."
            },
            # Sarah Jenkins
            {
                "id": "e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1",
                "contact_id": "a9f8b7c6-d5e4-4c3b-2a1b-0f9e8d7c6b5a",
                "interaction_id": "3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c3c",
                "owner": "founder",
                "description": "Send customer migration details and financial projections",
                "status": "open",
                "confidence": 100,
                "due_date": (date.today() + timedelta(days=2)).isoformat(),
                "evidence_quote": "Sarah: Please send your customer migration data by Friday."
            },
            # Michael Chen
            {
                "id": "f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2",
                "contact_id": "c7b6a5d4-e3f2-4a1b-0c9b-8a7f6e5d4c3b",
                "interaction_id": "4d4d4d4d-4d4d-4d4d-4d4d-4d4d-4d4d-4d4d",
                "owner": "founder",
                "description": "Share security audit reports",
                "status": "open",
                "confidence": 95,
                "due_date": (date.today() + timedelta(days=4)).isoformat(),
                "evidence_quote": "need security audit reports beforehand"
            },
            # Lina Alvarez
            {
                "id": "8d8d8d8d-8d8d-4d8d-ad8d-8d8d8d8d8d8d",
                "contact_id": "8a8a8a8a-8a8a-4a8a-aa8a-8a8a8a8a8a8a",
                "interaction_id": "8c8c8c8c-8c8c-4c8c-ac8c-8c8c8c8c8c8c",
                "owner": "founder",
                "description": "Send webhook API documentation and sandbox access credentials",
                "status": "open",
                "confidence": 95,
                "due_date": (date.today() + timedelta(days=1)).isoformat(),
                "evidence_quote": "Lina: Let me know when we can get our sandbox tokens to test the relays."
            }
        ]
        
        for c in commitments:
            pod.table("commitments").create(c)
        logger.info("Commitments seeded.")

        # 5. Seed milestones
        logger.info("Seeding milestones...")
        milestones = [
            {
                "id": "7a7a7a7a-7a7a-7a7a-7a7a-7a7a7a7a7a7a",
                "contact_id": "5bae59cb-25f5-472e-a4e3-3ff9e946efcc",
                "interaction_id": "1a1a1a1a-1a1a-1a1a-1a1a-1a1a1a1a1a1a",
                "summary": "First observability replacement discovery call.",
                "importance_score": 75,
                "occurred_at": (datetime.utcnow() - timedelta(days=3)).isoformat() + "Z",
                "evidence_quote": "He is looking for observability tools to replace Datadog."
            },
            {
                "id": "8b8b8b8b-8b8b-8b8b-8b8b-8b8b8b8b8b8b",
                "contact_id": "a9f8b7c6-d5e4-4c3b-2a1b-0f9e8d7c6b5a",
                "interaction_id": "3c3c3c3c-3c3c-3c3c-3c3c-3c3c3c3c3c3c",
                "summary": "Completed Series A pitch deck walkthrough.",
                "importance_score": 85,
                "occurred_at": (datetime.utcnow() - timedelta(days=2)).isoformat() + "Z",
                "evidence_quote": "She showed positive response."
            }
        ]
        for m in milestones:
            pod.table("relationship_milestones").create(m)
        logger.info("Milestones seeded.")

        # 6. Seed recommendation history
        logger.info("Seeding recommendation histories...")
        rec_histories = [
            {
                "id": "9a9a9a9a-9a9a-9a9a-9a9a-9a9a9a9a9a9a",
                "contact_id": "5bae59cb-25f5-472e-a4e3-3ff9e946efcc",
                "previous_recommendation": "None",
                "new_recommendation": "No action required",
                "reason": "Relationship is active and has no open loop commitments.",
                "created_at": (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z"
            },
            {
                "id": "9b9b9b9b-9b9b-9b9b-9b9b-9b9b9b9b9b9b",
                "contact_id": "a9f8b7c6-d5e4-4c3b-2a1b-0f9e8d7c6b5a",
                "previous_recommendation": "None",
                "new_recommendation": "Send updated financial projections and migration case study.",
                "reason": "Sarah requested follow-up customer migration details.",
                "created_at": (datetime.utcnow() - timedelta(days=2)).isoformat() + "Z"
            },
            {
                "id": "9c9c9c9c-9c9c-9c9c-9c9c-9c9c-9c9c-9c9c",
                "contact_id": "c7b6a5d4-e3f2-4a1b-0c9b-8a7f6e5d4c3b",
                "previous_recommendation": "None",
                "new_recommendation": "Ping casually to warm contact.",
                "reason": "Cadence has cooled down with no updates for 10 days.",
                "created_at": (datetime.utcnow() - timedelta(days=10)).isoformat() + "Z"
            },
            {
                "id": "9d9d9d9d-9d9d-9d9d-9d9d-9d9d-9d9d-9d9d",
                "contact_id": "d5c4b3a2-f1e0-4d9c-8b7a-6a5b4c3d2e1f",
                "previous_recommendation": "None",
                "new_recommendation": "Share recent SDK launch announcement.",
                "reason": "Elena requested public launch ping.",
                "created_at": (datetime.utcnow() - timedelta(days=35)).isoformat() + "Z"
            },
            {
                "id": "9e9e9e9e-9e9e-9e9e-9e9e-9e9e-9e9e-9e9e",
                "contact_id": "8a8a8a8a-8a8a-4a8a-aa8a-8a8a8a8a8a8a",
                "previous_recommendation": "None",
                "new_recommendation": "Send webhook API documentation and sandbox access credentials.",
                "reason": "Lina requested sandbox tokens to validate webhook routing relays.",
                "created_at": (datetime.utcnow() - timedelta(hours=12)).isoformat() + "Z"
            },
            {
                "id": "9f9f9f9f-9f9f-9f9f-9f9f-9f9f-9f9f-9f9f",
                "contact_id": "7c7c7c7c-7c7c-4c7c-ac7c-7c7c7c7c7c7c",
                "previous_recommendation": "None",
                "new_recommendation": "Introduce Marcus to the engineering team and schedule a sync.",
                "reason": "Marcus requested to loop in tech leads next time.",
                "created_at": (datetime.utcnow() - timedelta(days=4)).isoformat() + "Z"
            }
        ]
        for rh in rec_histories:
            pod.table("recommendation_history").create(rh)
        logger.info("Recommendation history seeded.")

        # 7. Seed daily briefs
        logger.info("Seeding morning briefing...")
        brief_summary = (
            "### Morning Intelligence Summary\n\n"
            "* **Sarah Jenkins (Horizon Ventures)** is waiting on you for Series A financial projections. Action required today.\n"
            "* **Lina Alvarez (ScaleAI)** is waiting on you for webhook API credentials. Action required today.\n"
            "* **Michael Chen (ByteSize)** contact is cooling down (no interaction for 10 days). Consider a casual catch-up ping.\n"
            "* **Rahul Sharma (Acme Corp.)** is waiting on their review of your pricing deck. Status: Waiting on Them.\n"
            "* **Elena Rostova (CloudFlare)** is a candidate for re-engagement with your public SDK launch details.\n"
            "* **Marcus Vance (CyberFlow)** is exploring developer toolchain partnerships. Status: Mutual Exploration."
        )
        pod.table("daily_briefs").create({
            "id": "08a52e92-0921-4191-bf90-d727cace8f1a",
            "brief_date": date.today().isoformat(),
            "summary_text": brief_summary,
            "brief_json": json.dumps({"brief_date": date.today().isoformat()})
        })
        logger.info("Morning brief seeded.")
        
    logger.info("Database seeding completed successfully!")

if __name__ == "__main__":
    main()
