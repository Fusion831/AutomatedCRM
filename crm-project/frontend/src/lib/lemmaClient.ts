// lemmaClient.ts - Typed client for interacting with the Lemma Pod Datastore

export interface DBContact {
  id: string;
  name: string;
  relationship_state: "waiting_on_me" | "waiting_on_them" | "mutual_exploration" | "blocked" | "cooling" | "reengagement_candidate";
  tier: "A" | "B" | "C";
  who_are_they: string | null;
  why_talking: string | null;
  key_drivers: any; // json object
  memory_confidence: any; // json object
  priority_score: number;
  priority_reasons: any; // json list of strings
  last_interaction: string | null;
  expected_next_touch_date: string | null;
  attention_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  recommended_action: string | null;
  recommendation_category: string | null;
  recommendation_urgency: string | null;
  recommendation_reasoning: string | null; // JSON string in DB
  recommendation_evidence: string | null;  // JSON string in DB
  recommendation_confidence: number | null;
}

export interface DBCommitment {
  id: string;
  contact_id: string;
  interaction_id: string;
  owner: "founder" | "contact" | "shared";
  description: string;
  status: "open" | "completed" | "dismissed";
  confidence: number;
  due_date: string | null;
  evidence_quote: string | null;
}

export interface DBMilestone {
  id: string;
  contact_id: string;
  interaction_id: string;
  summary: string;
  importance_score: number;
  occurred_at: string;
  evidence_quote: string | null;
}

export interface DBInteraction {
  id: string;
  contact_id: string;
  type: "email" | "meeting" | "slack" | "manual";
  summary: string;
  transcript_path: string | null;
  occurred_at: string;
}

export interface DBRecommendation {
  id: string;
  contact_id: string;
  rec_type: "reconnect_email" | "action_task";
  draft_content: string | null;
  reason_why: string;
  status: "pending" | "accepted" | "dismissed";
}

export interface DBStateHistory {
  id: string;
  contact_id: string;
  old_state: string;
  new_state: string;
  reason: string | null;
  changed_at: string;
}

export interface DBResurrectionSnapshot {
  id: string;
  contact_id: string;
  snapshot: string; // JSON string of snapshot
  confidence: number;
  generated_at: string;
}

export interface DBDailyBrief {
  brief_date: string;
  summary_text: string;
  brief_json: string; // JSON string of DailyBriefObject
}

// Caching pod ID
let cachedPodId: string | null = null;

async function getPodId(): Promise<string> {
  if (cachedPodId) return cachedPodId;
  try {
    const res = await fetch("/api/lemma-config");
    if (!res.ok) {
      throw new Error(`Failed to fetch pod ID: ${res.statusText}`);
    }
    const data = await res.json();
    cachedPodId = data.podId;
    return cachedPodId || "019f1423-2ff5-7723-a474-491307d7950e";
  } catch (err) {
    console.error("Error fetching config, falling back to default podId:", err);
    return "019f1423-2ff5-7723-a474-491307d7950e";
  }
}

// Generic query executor
export async function runQuery(sql: string): Promise<any[]> {
  const podId = await getPodId();
  const res = await fetch(`/api/lemma/pods/${podId}/datastore/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    throw new Error(`SQL query failed: ${res.statusText}`);
  }
  const data = await res.json();
  return data.items || [];
}

// Generic record CRUD
export async function createRecord(tableName: string, fields: Record<string, any>): Promise<any> {
  const podId = await getPodId();
  const res = await fetch(`/api/lemma/pods/${podId}/datastore/tables/${tableName}/records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: fields }),
  });
  if (!res.ok) {
    throw new Error(`Create record in ${tableName} failed: ${res.statusText}`);
  }
  return await res.json();
}

export async function updateRecord(tableName: string, id: string, fields: Record<string, any>): Promise<any> {
  const podId = await getPodId();
  const res = await fetch(`/api/lemma/pods/${podId}/datastore/tables/${tableName}/records/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ data: fields }),
  });
  if (!res.ok) {
    throw new Error(`Update record ${id} in ${tableName} failed: ${res.statusText}`);
  }
  return await res.json();
}

export async function deleteRecord(tableName: string, id: string): Promise<void> {
  const podId = await getPodId();
  const res = await fetch(`/api/lemma/pods/${podId}/datastore/tables/${tableName}/records/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`Delete record ${id} in ${tableName} failed: ${res.statusText}`);
  }
}

// Generic function runner
export async function runFunction(functionName: string, inputData: Record<string, any>): Promise<any> {
  const podId = await getPodId();
  const res = await fetch(`/api/lemma/pods/${podId}/functions/${functionName}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(inputData),
  });
  if (!res.ok) {
    throw new Error(`Function run failed: ${res.statusText}`);
  }
  const data = await res.json();
  return data.output_data;
}

// High-level CRM helpers

export async function fetchAllContacts(): Promise<DBContact[]> {
  return await runQuery("SELECT * FROM contacts ORDER BY priority_score DESC");
}

export async function fetchContactDetails(contactId: string) {
  const contactList = await runQuery(`SELECT * FROM contacts WHERE id = '${contactId}'`);
  if (!contactList || contactList.length === 0) {
    throw new Error(`Contact ${contactId} not found`);
  }
  const contact = contactList[0] as DBContact;
  
  const commitments = await runQuery(`SELECT * FROM commitments WHERE contact_id = '${contactId}'`);
  const milestones = await runQuery(`SELECT * FROM relationship_milestones WHERE contact_id = '${contactId}' ORDER BY occurred_at DESC`);
  const interactions = await runQuery(`SELECT * FROM interactions WHERE contact_id = '${contactId}' ORDER BY occurred_at DESC`);
  const stateHistory = await runQuery(`SELECT * FROM relationship_state_history WHERE contact_id = '${contactId}' ORDER BY changed_at DESC`);
  
  // Fetch resurrection snapshot cache
  const snapshots = await runQuery(`SELECT * FROM resurrection_snapshots WHERE contact_id = '${contactId}' ORDER BY generated_at DESC LIMIT 1`);
  const resurrectionSnapshot = snapshots.length > 0 ? snapshots[0] : null;

  return {
    contact,
    commitments: commitments as DBCommitment[],
    milestones: milestones as DBMilestone[],
    interactions: interactions as DBInteraction[],
    stateHistory: stateHistory as DBStateHistory[],
    resurrectionSnapshot: resurrectionSnapshot as DBResurrectionSnapshot | null
  };
}

export async function fetchAllCommitments(): Promise<(DBCommitment & { contact_name: string })[]> {
  const sql = `
    SELECT c.*, con.name as contact_name 
    FROM commitments c 
    JOIN contacts con ON c.contact_id = con.id 
    ORDER BY c.status ASC, c.due_date ASC
  `;
  return await runQuery(sql);
}

export async function fetchAllInteractions(): Promise<(DBInteraction & { contact_name: string; contact_who: string | null })[]> {
  const sql = `
    SELECT i.*, con.name as contact_name, con.who_are_they as contact_who
    FROM interactions i
    JOIN contacts con ON i.contact_id = con.id
    ORDER BY i.occurred_at DESC
  `;
  return await runQuery(sql);
}

export async function fetchLatestDailyBrief(): Promise<DBDailyBrief | null> {
  const briefs = await runQuery("SELECT * FROM daily_briefs ORDER BY brief_date DESC LIMIT 1");
  if (!briefs || briefs.length === 0) return null;
  return briefs[0] as DBDailyBrief;
}

export async function ingestNewInteraction(contactId: string, type: "email" | "meeting" | "slack" | "manual", summary: string) {
  const occurredAt = new Date().toISOString();
  
  // Creating the interaction automatically triggers the ingest-interaction-workflow due to DATASTORE_EVENT trigger
  return await createRecord("interactions", {
    contact_id: contactId,
    type,
    summary,
    occurred_at: occurredAt
  });
}

export async function updateCommitment(commitmentId: string, status: "open" | "completed" | "dismissed") {
  return await updateRecord("commitments", commitmentId, { status });
}

export async function triggerDailyBriefGeneration() {
  return await runFunction("generate_daily_brief_function", {});
}

export async function triggerRecommendationGeneration(contactId: string) {
  return await runFunction("generate_recommendation_function", { contact_id: contactId });
}

export async function triggerResurrectionSnapshotGeneration(contactId: string, forceRefresh: boolean = false) {
  return await runFunction("generate_resurrection_snapshot_function", {
    contact_id: contactId,
    force_refresh: forceRefresh
  });
}

// Handles accepting or rejecting recommendations by inserting feedback logs
export async function recordRecommendationFeedback(contactId: string, feedbackAction: "ACCEPTED" | "REJECTED", reason?: string) {
  const recHist = await runQuery(`
    SELECT id, new_recommendation 
    FROM recommendation_history 
    WHERE contact_id = '${contactId}' 
    ORDER BY created_at DESC 
    LIMIT 1
  `);
  
  if (!recHist || recHist.length === 0) {
    throw new Error("No recommendation history found for this contact.");
  }
  
  const recId = recHist[0].id;
  const recAction = recHist[0].new_recommendation;
  const feedbackId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
  const now = new Date().toISOString();

  // Create feedback record
  await createRecord("recommendation_feedback", {
    id: feedbackId,
    recommendation_id: recId,
    contact_id: contactId,
    feedback_action: feedbackAction,
    feedback_reason: reason || null,
    created_at: now
  });

  // Create decision audit event
  await createRecord("decision_events", {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
    contact_id: contactId,
    event_type: "RECOMMENDATION_CHANGE",
    event_source: "recommendation_engine",
    previous_value: recAction,
    new_value: feedbackAction,
    reason: reason || `Recommendation ${feedbackAction.toLowerCase()} by founder.`,
    evidence: JSON.stringify([recId]),
    metadata: JSON.stringify({
      feedback_id: feedbackId,
      recommendation_id: recId
    }),
    created_at: now
  });
}
