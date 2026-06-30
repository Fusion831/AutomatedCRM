import logging
import json
from datetime import datetime, date
from uuid import UUID
from lemma_sdk import Pod
from backend.services.priority_service import calculate_contact_priority

logger = logging.getLogger(__name__)

def ingest_interaction(
    pod: Pod,
    contact_id: str,
    interaction_type: str,
    summary: str,
    occurred_at: str,
    transcript_path: str = None
) -> dict:
    """
    Orchestrates the ingestion of a raw interaction, calling the consolidated_extractor
    function, saving the outputs to database tables, and updating priority score.
    """
    logger.info(f"Ingesting interaction for contact {contact_id}")

    # 1. Fetch contact details
    contact_res = pod.query(f"SELECT * FROM contacts WHERE id = '{contact_id}'")
    contacts = contact_res.to_dict().get("items", [])
    if not contacts:
        raise ValueError(f"Contact with ID {contact_id} not found")
    contact = contacts[0]

    # 2. Fetch open commitments
    commitments_res = pod.query(f"SELECT * FROM commitments WHERE contact_id = '{contact_id}' AND status = 'open'")
    open_commitments = commitments_res.to_dict().get("items", [])

    # 3. Insert new interaction to interactions table
    new_int_data = {
        "contact_id": contact_id,
        "type": interaction_type,
        "summary": summary,
        "transcript_path": transcript_path,
        "occurred_at": occurred_at
    }
    interaction_row = pod.table("interactions").create(new_int_data)
    interaction_id = interaction_row.get("id")
    logger.info(f"Created interaction with ID: {interaction_id}")

    # 4. Invoke the consolidated_extractor function
    key_drivers_data = contact.get("key_drivers") or {}
    if isinstance(key_drivers_data, str):
        try:
            key_drivers_data = json.loads(key_drivers_data)
        except Exception:
            key_drivers_data = {}
    
    drivers = key_drivers_data.get("drivers", [])
    objections = key_drivers_data.get("objections", [])
    
    memory_confidence = contact.get("memory_confidence") or {}
    if isinstance(memory_confidence, str):
        try:
            memory_confidence = json.loads(memory_confidence)
        except Exception:
            memory_confidence = {}

    function_input = {
        "contact_memory": {
            "name": contact.get("name"),
            "company": contact.get("company", ""),
            "who_are_they": contact.get("who_are_they", ""),
            "why_talking": contact.get("why_talking", ""),
            "key_drivers": drivers,
            "objections": objections,
            "memory_confidence": memory_confidence
        },
        "open_commitments": [
            {
                "id": str(c.get("id")),
                "description": c.get("description"),
                "owner": c.get("owner"),
                "status": c.get("status")
            } for c in open_commitments
        ],
        "new_interaction": {
            "interaction_type": interaction_type,
            "content": summary
        }
    }

    logger.info(f"Running consolidated_extractor function for contact {contact['name']}...")
    try:
        run_res = pod.functions.run("consolidated_extractor", function_input)
        run_dict = run_res.to_dict()
    except Exception as e:
        logger.error(f"Failed to run consolidated_extractor: {e}")
        raise

    if run_dict.get("status") != "COMPLETED":
        error_msg = run_dict.get("error") or "Unknown platform execution error"
        raise RuntimeError(f"Consolidated extractor failed: {error_msg}")

    output_data = run_dict.get("output_data") or {}

    # 5. Apply Memory Updates to contacts table (incremental merge)
    memory_updates = output_data.get("memory_updates") or {}
    new_identity_facts = memory_updates.get("new_identity_facts", [])
    new_drivers = memory_updates.get("new_drivers", [])
    new_objections = memory_updates.get("new_objections", [])
    new_memory_confidence = memory_updates.get("memory_confidence") or {}

    existing_who = contact.get("who_are_they") or ""
    if new_identity_facts:
        facts_str = "\n".join(new_identity_facts)
        if existing_who:
            existing_who = f"{existing_who}\n{facts_str}"
        else:
            existing_who = facts_str

    existing_why = contact.get("why_talking") or ""
    updated_thesis = memory_updates.get("updated_thesis", "")
    if updated_thesis:
        if existing_why:
            existing_why = f"{existing_why}\n{updated_thesis}"
        else:
            existing_why = updated_thesis

    updated_drivers = list(set(drivers + new_drivers))
    updated_objections = list(set(objections + new_objections))
    updated_key_drivers = {
        "drivers": updated_drivers,
        "objections": updated_objections
    }

    updated_memory_confidence = {**memory_confidence, **new_memory_confidence}

    # 6. Apply reconciliations (update commitments table)
    reconciliations = output_data.get("reconciliations") or []
    for rec in reconciliations:
        commitment_id = rec.get("commitment_id")
        reason = rec.get("reason")
        logger.info(f"Reconciling commitment {commitment_id}: {reason}")
        try:
            pod.table("commitments").update(commitment_id, {
                "status": "completed"
            })
        except Exception as e:
            logger.warning(f"Could not reconcile commitment {commitment_id}: {e}")

    # 7. Insert new milestones
    milestones = output_data.get("milestones") or []
    for ms in milestones:
        ms_data = {
            "contact_id": contact_id,
            "interaction_id": interaction_id,
            "summary": ms.get("summary"),
            "importance_score": ms.get("importance_score"),
            "occurred_at": occurred_at,
            "evidence_quote": ms.get("evidence_quote")
        }
        pod.table("relationship_milestones").create(ms_data)
        logger.info(f"Created milestone: {ms.get('summary')}")

    # 8. Insert new commitments
    commitments = output_data.get("commitments") or []
    for com in commitments:
        com_data = {
            "contact_id": contact_id,
            "interaction_id": interaction_id,
            "owner": com.get("owner"),
            "description": com.get("description"),
            "status": "open",
            "confidence": com.get("confidence"),
            "due_date": com.get("due_date"),
            "evidence_quote": com.get("evidence_quote")
        }
        pod.table("commitments").create(com_data)
        logger.info(f"Created commitment: {com.get('description')}")

    # 9. Fetch updated open commitments list for priority recalculation
    updated_commitments_res = pod.query(f"SELECT * FROM commitments WHERE contact_id = '{contact_id}' AND status = 'open'")
    updated_commitments = updated_commitments_res.to_dict().get("items", [])

    # Assemble updated contact record dict for priority engine
    updated_contact_rec = {
        **contact,
        "who_are_they": existing_who,
        "why_talking": existing_why,
        "key_drivers": updated_key_drivers,
        "memory_confidence": updated_memory_confidence,
        "last_interaction": occurred_at
    }

    # 10. Recalculate deterministic priority score
    priority_res = calculate_contact_priority(updated_contact_rec, updated_commitments)
    new_priority_score = priority_res["score"]
    new_priority_reasons = priority_res["reasons"]

    # Write all updates back to contacts table
    contact_updates = {
        "who_are_they": existing_who,
        "why_talking": existing_why,
        "key_drivers": updated_key_drivers,
        "memory_confidence": updated_memory_confidence,
        "last_interaction": occurred_at,
        "priority_score": new_priority_score,
        "priority_reasons": new_priority_reasons
    }
    pod.table("contacts").update(contact_id, contact_updates)
    logger.info(f"Updated contact {contact['name']} priority score to {new_priority_score}")

    return {
        "interaction_id": interaction_id,
        "priority_score": new_priority_score,
        "priority_reasons": new_priority_reasons,
        "output_data": output_data
    }
