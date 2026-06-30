import logging
import json
import uuid
from datetime import datetime, date, timedelta
from lemma_sdk import Pod
from backend.services.ingestion_service import ingest_interaction
from backend.services.priority_service import calculate_contact_priority

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("pipeline_demo")

def print_table_data(pod: Pod, table_name: str):
    res = pod.query(f"SELECT * FROM {table_name}")
    items = res.to_dict().get("items", [])
    print(f"\n=== Table: {table_name} ({len(items)} rows) ===")
    for item in items:
        print(json.dumps(item, indent=2, default=str))

def clear_table(pod: Pod, table_name: str):
    res = pod.table(table_name).list(limit=100)
    items = res.to_dict().get("items", [])
    for item in items:
        pod.table(table_name).delete(item["id"])

def main():
    logger.info("Starting MemoryCRM Pipeline Validation Demo...")
    
    with Pod.from_env() as pod:
        # --- CLEANUP PREVIOUS DATA ---
        logger.info("Cleaning up existing table data for a fresh run...")
        # Order of deletion matters due to foreign keys: milestones/commitments -> interactions -> contacts
        clear_table(pod, "relationship_milestones")
        clear_table(pod, "commitments")
        clear_table(pod, "interactions")
        clear_table(pod, "contacts")
        
        # --- STEP 1: CREATE CONTACT ---
        logger.info("Step 1: Creating fresh contact Rahul Sharma...")
        contact_data = {
            "name": "Rahul Sharma",
            "relationship_state": "mutual_exploration",
            "tier": "A",
            "who_are_they": "VP Engineering at Acme Corp.",
            "why_talking": "Looking to replace Datadog.",
            "key_drivers": {"drivers": ["observability tools"], "objections": []},
            "memory_confidence": {},
            "priority_score": 0,
            "priority_reasons": []
        }
        contact_row = pod.table("contacts").create(contact_data)
        contact_id = contact_row["id"]
        logger.info(f"Contact created with ID: {contact_id}")

        # --- STEP 2: CREATE INITIAL INTERACTION ---
        logger.info("Step 2: Creating initial interaction...")
        occurred_at_1 = (datetime.utcnow() - timedelta(days=2)).isoformat() + "Z"
        int_data_1 = {
            "contact_id": contact_id,
            "type": "meeting",
            "summary": "First call with Rahul. He is looking for observability tools to replace Datadog. I promised to send the pricing deck.",
            "occurred_at": occurred_at_1
        }
        int_row_1 = pod.table("interactions").create(int_data_1)
        int_id_1 = int_row_1["id"]
        logger.info(f"Initial interaction created with ID: {int_id_1}")

        # --- STEP 3: CREATE OPEN COMMITMENT ---
        logger.info("Step 3: Creating open commitment ('Send pricing deck') owned by founder...")
        # Make the commitment due yesterday so it triggers the overdue score heuristic (+50)
        due_date_yesterday = (date.today() - timedelta(days=1)).isoformat()
        commitment_data = {
            "contact_id": contact_id,
            "interaction_id": int_id_1,
            "owner": "founder",
            "description": "Send pricing deck",
            "status": "open",
            "confidence": 100,
            "due_date": due_date_yesterday,
            "evidence_quote": "I promised to send the pricing deck."
        }
        com_row = pod.table("commitments").create(commitment_data)
        logger.info(f"Open commitment created with ID: {com_row['id']}")

        # --- STEP 4: CALCULATE INITIAL DETERMINISTIC PRIORITY ---
        logger.info("Step 4: Calculating initial priority score...")
        # Let's fetch contact and commitments
        contacts_res = pod.query(f"SELECT * FROM contacts WHERE id = '{contact_id}'")
        contact_refetched = contacts_res.to_dict()["items"][0]
        
        commitments_res = pod.query(f"SELECT * FROM commitments WHERE contact_id = '{contact_id}' AND status = 'open'")
        open_coms = commitments_res.to_dict()["items"]

        initial_priority = calculate_contact_priority(contact_refetched, open_coms)
        logger.info(f"Initial score calculated: {initial_priority['score']}")
        logger.info(f"Reasons: {initial_priority['reasons']}")
        
        # Save initial priority
        pod.table("contacts").update(contact_id, {
            "priority_score": initial_priority["score"],
            "priority_reasons": initial_priority["reasons"]
        })

        print("\n=======================================================")
        print("INITIAL DATABASE STATE")
        print("=======================================================")
        print_table_data(pod, "contacts")
        print_table_data(pod, "interactions")
        print_table_data(pod, "commitments")

        # --- STEP 5: RUN INGESTION WORKFLOW FOR NEW INTERACTION ---
        logger.info("\nStep 5: Running Ingestion Workflow on new interaction...")
        new_interaction_text = "Rahul: We want to expand our observability suite. Thanks for sending the pricing deck, received it. I will review it soon."
        occurred_at_2 = datetime.utcnow().isoformat() + "Z"
        
        result = ingest_interaction(
            pod=pod,
            contact_id=contact_id,
            interaction_type="meeting",
            summary=new_interaction_text,
            occurred_at=occurred_at_2
        )
        
        logger.info("Ingestion completed successfully!")
        logger.info(f"New Priority Score: {result['priority_score']}")
        logger.info(f"New Priority Reasons: {result['priority_reasons']}")

        print("\n=======================================================")
        print("FINAL DATABASE STATE AFTER PIPELINE EXECUTION")
        print("=======================================================")
        print_table_data(pod, "contacts")
        print_table_data(pod, "interactions")
        print_table_data(pod, "commitments")
        print_table_data(pod, "relationship_milestones")

if __name__ == "__main__":
    main()
