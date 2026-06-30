from typing import List, Dict, Any

def get_contact_decision_history(pod: Any, contact_id: str) -> List[Dict[str, Any]]:
    """Retrieves all decision events for a given contact, ordered by created_at DESC."""
    query = f"SELECT id, contact_id, event_type, event_source, previous_value, new_value, reason, evidence, metadata, created_at FROM decision_events WHERE contact_id = '{contact_id}' ORDER BY created_at DESC"
    res = pod.query(query)
    return res.to_dict().get("items", [])

def get_recent_decisions(pod: Any, limit: int = 50) -> List[Dict[str, Any]]:
    """Retrieves the most recent decision events across all contacts, ordered by created_at DESC."""
    query = f"SELECT id, contact_id, event_type, event_source, previous_value, new_value, reason, evidence, metadata, created_at FROM decision_events ORDER BY created_at DESC LIMIT {limit}"
    res = pod.query(query)
    return res.to_dict().get("items", [])

def get_decisions_by_type(pod: Any, event_type: str) -> List[Dict[str, Any]]:
    """Retrieves all decision events of a specific type, ordered by created_at DESC."""
    query = f"SELECT id, contact_id, event_type, event_source, previous_value, new_value, reason, evidence, metadata, created_at FROM decision_events WHERE event_type = '{event_type}' ORDER BY created_at DESC"
    res = pod.query(query)
    return res.to_dict().get("items", [])

def get_decision_timeline(pod: Any, contact_id: str) -> List[Dict[str, Any]]:
    """
    Returns a chronological list of decision events for a contact (oldest to newest),
    formatted specifically as a timeline.
    """
    query = f"SELECT id, event_type, event_source, previous_value, new_value, reason, created_at FROM decision_events WHERE contact_id = '{contact_id}' ORDER BY created_at ASC"
    res = pod.query(query)
    return res.to_dict().get("items", [])
