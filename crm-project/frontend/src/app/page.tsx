"use client";
 
import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Inbox,
  Mail,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Send,
  X,
  FileText,
  Calendar,
  Sliders,
  ChevronRight,
  RefreshCw,
  Check,
  MessageSquare,
  Award,
  GitCompare,
  AlertTriangle
} from "lucide-react";
import { EvidenceDrawer, buildEvidence } from "../components/EvidenceDrawer";
 
import {
  fetchAllContacts,
  fetchAllCommitments,
  fetchAllInteractions,
  fetchLatestDailyBrief,
  ingestNewInteraction,
  updateCommitment,
  updateRecord,
  createRecord,
  recordRecommendationFeedback,
  triggerDailyBriefGeneration,
  triggerRecommendationGeneration,
  runQuery
} from "../lib/lemmaClient";
 
// ============================================================================
// TYPE DEFINITIONS
// ============================================================================
 
interface TimelineEvent {
  type: "milestone" | "interaction" | "state_change";
  title: string;
  timeframe: string;
  description: string;
  // evidence fields from relationship_milestones
  evidenceQuote?: string;
  evidenceSource?: string;
  occurredAt?: string;
  contactName?: string;
}

interface Contact {
  id: string;
  name: string;
  company: string;
  title: string;
  email: string;
  temperature: "Active" | "Cooling down" | "Cold" | "Reviving";
  state: "waiting_on_me" | "waiting_on_them" | "mutual_exploration";
  lastInteraction: string;
  priorityScore: number;
  summary: string;
  thesis: string;
  drivers: string[];
  objections: string[];
  timeline: TimelineEvent[];
  recommendedAction: string | null;
  // raw evidence fields from DB for traceability
  rawEvidenceQuote?: string;
  rawEvidenceSource?: string;
  rawLastInteraction?: string;
  rawRecommendationConfidence?: number;
}

interface Commitment {
  id: string;
  contactId: string;
  description: string;
  owner: "founder" | "contact";
  dueDate: string | null;
  status: "open" | "completed";
  // evidence for traceability
  evidenceQuote?: string;
  contactName?: string;
}

interface ProcessedLog {
  id: string;
  type: "zoom" | "slack" | "email" | "calendar";
  source: string;
  timestamp: string;
  status: "completed" | "processing";
}

interface StreamItem {
  id: string;
  contactId: string;
  type: "Commitment" | "Meeting Preparation" | "Waiting On Founder" | "Re-engagement";
  person: string;
  company: string;
  action: string;
  why: string;
  timing: string;
  context: string;
  btnLabel: string;
  // evidence for traceability
  rawEvidenceQuote?: string;
  rawEvidenceSource?: string;
  rawLastInteraction?: string;
  rawConfidence?: number;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return diffMins <= 1 ? "Just now" : `${diffMins} minutes ago`;
      }
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    }
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch (e) {
    return String(dateStr);
  }
}

const DEMO_SCENARIOS = [
  {
    id: 1,
    title: "Investor Follow-Up",
    contactName: "Sarah Jenkins",
    company: "Horizon Ventures",
    channel: "meeting" as const,
    description: "Sarah requests custom data after a partner meeting. Watch the engine extract commitments, increase priority score, and generate a recommended email draft.",
    transcript: `[Zoom call — June 30, 2026]\n\nDaksh: Sarah, thanks for making time. Did you get a chance to review the migration case study I sent?\n\nSarah: Yes! The Acme migration numbers were impressive. I shared them with my partners. We're ready to move to the next step. Can you send over the full financial model and a term sheet outline by Friday? If those look good, we'll book the formal partner meeting for next week.\n\nDaksh: Absolutely. I'll get the model and draft term sheet to you by Thursday EOD.\n\nSarah: Perfect. One more thing — our compliance team needs your SOC 2 report. Can you include that?\n\nDaksh: Will do. I'll package everything together.`
  },
  {
    id: 2,
    title: "Contract Negotiation",
    contactName: "Rahul Sharma",
    company: "Acme Corp",
    channel: "email" as const,
    description: "Rahul raises objections about SLAs and DPAs. Watch the reconciliation engine detect new open loops, transition the relationship state to waiting_on_them, and change the recommended action.",
    transcript: `From: rahul@acmecorp.com\nTo: daksh@memorycrm.com\nSubject: Re: Observability Proposal\n\nHi Daksh,\n\nTeam has reviewed the pricing deck — we're aligned on the Enterprise tier. A few things before we sign:\n\n1. We need a custom SLA with 99.95% uptime guarantee.\n2. Our legal team wants a data processing agreement (DPA) before contract sign-off.\n3. Can we schedule a technical deep-dive with your eng team next week?\n\nIf you can confirm these, we're ready to move to contract stage.\n\nBest,\nRahul`
  },
  {
    id: 3,
    title: "Re-engagement",
    contactName: "Elena Rostova",
    company: "CloudFlare",
    channel: "email" as const,
    description: "Elena replies to resurrection email, requesting a meeting. Watch the relationship state revive from cooling/reengagement_candidate, recalculate priority, and update the narrative timeline.",
    transcript: `From: elena@cloudflare.com\nTo: daksh@memorycrm.com\nSubject: Re: SDK Launch\n\nHi Daksh,\n\nSaw the Lemma SDK launch announcement — congratulations! The edge compute use case you described is exactly what we've been looking for.\n\nOur team has capacity to start a channel partnership evaluation in Q3. I'd like to set up a call with our VP of Partnerships. Are you available the week of July 14th?\n\nAlso, could you send over your partnership deck and pricing for volume resellers?\n\nLooking forward to reconnecting.\n\nElena`
  },
  {
    id: 4,
    title: "New Relationship",
    contactName: "Maya Lin",
    company: "Scale AI",
    channel: "meeting" as const,
    description: "Initialize a completely new relationship from a first-meeting transcript. Watch the system auto-create the contact, analyze motivators, and bootstrap the timeline.",
    transcript: `[Meeting notes — June 30, 2026]\nFirst intro call with Maya Lin, co-founder of Scale AI.\n\nMaya was interested in our relationship memory system. She mentioned that her team of 15 founders has been struggling with tracking investor follow-ups and keeping warm intros alive.\n\nMaya: I promised to send her our team pricing deck and schedule a demo for her co-founders next Tuesday.\n\nMaya mentioned they have a board meeting in two weeks where they'll decide on their CRM budget.`
  }
];

export default function Page() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"today" | "people" | "inbox" | "import" | "demo">("today");

  // Core State
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [logs, setLogs] = useState<ProcessedLog[]>([]);
  
  // Attention Stream state
  const [streamItems, setStreamItems] = useState<StreamItem[]>([]);
  const [activeStreamIndex, setActiveStreamIndex] = useState(0);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Loading and refreshing states
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [briefSummaryText, setBriefSummaryText] = useState("Loading morning briefing...");

  // Quick Capture State
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [quickCaptureText, setQuickCaptureText] = useState("");
  const [quickCaptureContactId, setQuickCaptureContactId] = useState("");
  const [quickCaptureNewName, setQuickCaptureNewName] = useState("");
  const [isProcessingCapture, setIsProcessingCapture] = useState(false);

  // Follow-Up Composer State
  const [activeDraft, setActiveDraft] = useState<{
    contact: Contact;
    subject: string;
    body: string;
  } | null>(null);
  const [closureMessage, setClosureMessage] = useState<string | null>(null);

  // Import Conversation State
  const [importContactId, setImportContactId] = useState("");
  const [importChannel, setImportChannel] = useState<"meeting" | "email" | "slack" | "manual">("meeting");
  const [importText, setImportText] = useState("");
  const [importStage, setImportStage] = useState<"idle" | "processing" | "done">("idle");
  const [importDiff, setImportDiff] = useState<{
    contactName: string;
    before: { state: string; priority: number; commitments: number; recommendation: string };
    after:  { state: string; priority: number; commitments: number; recommendation: string };
  } | null>(null);

  // Demo Scenario State
  const [demoStage, setDemoStage] = useState<"idle" | "processing" | "done">("idle");
  const [activeDemoScenario, setActiveDemoScenario] = useState<number | null>(null);
  const [demoDiff, setDemoDiff] = useState<{
    contactName: string;
    before: { state: string; priority: number; commitments: number; recommendation: string };
    after:  { state: string; priority: number; commitments: number; recommendation: string };
    contactId: string;
  } | null>(null);

  const selectedContact = contacts.find(c => c.id === selectedContactId) || contacts[0];
  const streamRef = useRef<HTMLDivElement>(null);

  // Load all data from Lemma
  const loadAllData = async (selectContactId?: string) => {
    try {
      const dbContacts = await fetchAllContacts();
      if (dbContacts.length === 0) {
        setContacts([]);
        setCommitments([]);
        setStreamItems([]);
        setLogs([]);
        setBriefSummaryText("No contacts found in datastore. Create one to begin.");
        setIsLoading(false);
        return;
      }

      const dbCommitments = await fetchAllCommitments();
      const dbInteractions = await fetchAllInteractions();
      const dbBrief = await fetchLatestDailyBrief();
      
      if (dbBrief) {
        setBriefSummaryText(dbBrief.summary_text);
      } else {
        setBriefSummaryText("No morning briefing generated yet. Sync intelligence to compile.");
      }

      const allMilestones = await runQuery("SELECT * FROM relationship_milestones ORDER BY occurred_at DESC");
      let allStateHistory: any[] = [];
      try {
        allStateHistory = await runQuery("SELECT * FROM relationship_state_history ORDER BY changed_at DESC");
      } catch (e) {
        console.warn("Failed to fetch state history:", e);
      }
 
      const mappedContacts: Contact[] = dbContacts.map(c => {
        const who = c.who_are_they || "";
        const company = who.split(" at ")[1] || "Independent";
        const title = who.split(" at ")[0] || "Founder";
        
        let temp: Contact["temperature"] = "Active";
        if (c.relationship_state === "blocked") temp = "Cold";
        else if (c.relationship_state === "cooling") temp = "Cooling down";
        else if (c.relationship_state === "reengagement_candidate") temp = "Reviving";
 
        let state: Contact["state"] = "mutual_exploration";
        if (c.relationship_state === "waiting_on_me" || c.relationship_state === "waiting_on_them") {
          state = c.relationship_state;
        }
 
        let drivers: string[] = [];
        let objections: string[] = [];
        if (c.key_drivers) {
          try {
            const parsed = typeof c.key_drivers === "string" ? JSON.parse(c.key_drivers) : c.key_drivers;
            if (parsed && typeof parsed === "object") {
              if (Array.isArray(parsed)) {
                drivers = parsed;
              } else {
                drivers = parsed.drivers || [];
                objections = parsed.objections || [];
              }
            }
          } catch(e) {
            drivers = [String(c.key_drivers)];
          }
        }
 
        // Build unified event-based timeline
        const contactMilestones = allMilestones.filter((m: any) => m.contact_id === c.id);
        const contactInteractions = dbInteractions.filter((i: any) => i.contact_id === c.id);
        const contactStateHistory = allStateHistory.filter((h: any) => h.contact_id === c.id);
 
        const timelineEvents: TimelineEvent[] = [];
 
        // 1. Add Milestones
        contactMilestones.forEach((m: any) => {
          timelineEvents.push({
            type: "milestone",
            title: `Key Milestone (Importance: ${m.importance_score}/100)`,
            timeframe: formatRelativeTime(m.occurred_at),
            description: m.summary,
            evidenceQuote: m.evidence_quote || undefined,
            evidenceSource: m.source_type || "meeting",
            occurredAt: m.occurred_at || undefined,
            contactName: c.name,
          });
        });
 
        // 2. Add Interactions
        contactInteractions.forEach((i: any) => {
          timelineEvents.push({
            type: "interaction",
            title: `Interaction via ${i.type.toUpperCase()}`,
            timeframe: formatRelativeTime(i.occurred_at),
            description: i.summary,
            evidenceSource: i.type,
            occurredAt: i.occurred_at || undefined,
            contactName: c.name,
          });
        });
 
        // 3. Add State Changes
        contactStateHistory.forEach((h: any) => {
          const stateLabel = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, val => val.toUpperCase());
          timelineEvents.push({
            type: "state_change",
            title: `State Transition`,
            timeframe: formatRelativeTime(h.changed_at),
            description: `Moved from ${stateLabel(h.old_state)} to ${stateLabel(h.new_state)}${h.reason ? `: ${h.reason}` : ""}`,
            occurredAt: h.changed_at || undefined,
            contactName: c.name,
          });
        });
 
        // Sort by occurredAt descending
        timelineEvents.sort((a, b) => {
          const timeA = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
          const timeB = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
          return timeB - timeA;
        });
 
        const timeline = timelineEvents.length > 0 ? timelineEvents : [
          {
            type: "state_change" as const,
            title: "Relationship Initialized",
            timeframe: "Initial",
            description: "Contact added to MemoryCRM.",
            occurredAt: c.last_interaction || new Date().toISOString(),
            contactName: c.name
          }
        ];
 
        // Extract raw recommendation evidence
        const rawEvidenceArr = c.recommendation_evidence as any;
        let rawEvidenceQuote: string | undefined;
        if (typeof rawEvidenceArr === "string") {
          try { const p = JSON.parse(rawEvidenceArr); rawEvidenceQuote = Array.isArray(p) ? p[0] : rawEvidenceArr; }
          catch { rawEvidenceQuote = rawEvidenceArr; }
        } else if (Array.isArray(rawEvidenceArr) && rawEvidenceArr.length > 0) {
          rawEvidenceQuote = String(rawEvidenceArr[0]);
        }
 
        return {
          id: c.id,
          name: c.name,
          company,
          title,
          email: `${c.name.toLowerCase().replace(/\s+/g, "")}@example.com`,
          temperature: temp,
          state,
          lastInteraction: formatRelativeTime(c.last_interaction),
          priorityScore: c.priority_score || 0,
          summary: c.who_are_they || "No summary profile created yet.",
          thesis: c.why_talking || "No strategic thesis established.",
          drivers: drivers.length > 0 ? drivers : ["Relationship context established"],
          objections: objections,
          timeline,
          recommendedAction: c.recommended_action || "No immediate action required.",
          rawEvidenceQuote,
          rawEvidenceSource: c.recommendation_category?.toLowerCase() || "meeting",
          rawLastInteraction: c.last_interaction || undefined,
          rawRecommendationConfidence: c.recommendation_confidence ?? undefined,
        };
      });

      setContacts(mappedContacts);

      // Default selected contact selection
      const activeId = selectContactId || selectedContactId;
      if (activeId && mappedContacts.some(c => c.id === activeId)) {
        setSelectedContactId(activeId);
      } else if (mappedContacts.length > 0) {
        setSelectedContactId(mappedContacts[0].id);
        setQuickCaptureContactId(mappedContacts[0].id);
      }

      // Map commitments — also capture evidence_quote for traceability
      const mappedComms: Commitment[] = dbCommitments.map(c => {
        // Find the interaction this commitment came from to name the contact
        const linkedContact = dbContacts.find((con: any) => con.id === c.contact_id);
        return {
          id: c.id,
          contactId: c.contact_id,
          description: c.description,
          owner: c.owner === "contact" ? "contact" : "founder",
          dueDate: c.due_date ? c.due_date.substring(0, 10) : null,
          status: c.status === "open" ? "open" : "completed",
          evidenceQuote: c.evidence_quote || undefined,
          contactName: linkedContact?.name || undefined,
        };
      });
      setCommitments(mappedComms);

      // Map logs
      const mappedLogs: ProcessedLog[] = dbInteractions.map(i => {
        let type: ProcessedLog["type"] = "email";
        if (i.type === "meeting") type = "zoom";
        else if (i.type === "slack") type = "slack";
        else if (i.type === "email") type = "email";

        return {
          id: i.id,
          type,
          source: `${i.contact_name} (${i.contact_who ? i.contact_who.split(" at ")[1] || "Independent" : "Independent"})`,
          timestamp: formatRelativeTime(i.occurred_at),
          status: "completed"
        };
      });
      setLogs(mappedLogs);

      // Map stream items
      const activeRecs = dbContacts.filter(c => c.recommended_action && c.recommended_action !== "No action required");
      const mappedStream: StreamItem[] = activeRecs.map(c => {
        const reasoning = c.recommendation_reasoning as any;
        let why = "";
        if (typeof reasoning === "string") {
          why = reasoning;
          if (why.startsWith("[")) {
            try {
              const arr = JSON.parse(why);
              why = arr.join(". ");
            } catch(e) {}
          }
        } else if (Array.isArray(reasoning)) {
          why = reasoning.join(". ");
        } else if (reasoning) {
          why = String(reasoning);
        }

        const evidence = c.recommendation_evidence as any;
        let context = "";
        if (typeof evidence === "string") {
          context = evidence;
          if (context.startsWith("[")) {
            try {
              const arr = JSON.parse(context);
              context = arr.join(". ");
            } catch(e) {}
          }
        } else if (Array.isArray(evidence)) {
          context = evidence.join(". ");
        } else if (evidence) {
          context = String(evidence);
        }

        let type: StreamItem["type"] = "Commitment";
        if (c.recommendation_category === "RESPOND" || c.recommendation_category === "RESOLVE_BLOCKER") {
          type = "Waiting On Founder";
        } else if (c.recommendation_category === "SCHEDULE_MEETING") {
          type = "Meeting Preparation";
        } else if (c.recommendation_category === "REENGAGE") {
          type = "Re-engagement";
        }

        let timing = c.recommendation_urgency || "LOW";
        if (timing === "HIGH") timing = "Urgent";
        else if (timing === "CRITICAL") timing = "Immediate";

        // Raw evidence for traceability
        const rawEvidenceArr2 = c.recommendation_evidence as any;
        let rawEvidenceQuoteStream: string | undefined;
        if (typeof rawEvidenceArr2 === "string") {
          try { const p = JSON.parse(rawEvidenceArr2); rawEvidenceQuoteStream = Array.isArray(p) ? p[0] : rawEvidenceArr2; }
          catch { rawEvidenceQuoteStream = rawEvidenceArr2; }
        } else if (Array.isArray(rawEvidenceArr2) && rawEvidenceArr2.length > 0) {
          rawEvidenceQuoteStream = String(rawEvidenceArr2[0]);
        }

        return {
          id: c.id,
          contactId: c.id,
          type,
          person: c.name,
          company: (c.who_are_they || "").split(" at ")[1] || "Independent",
          action: c.recommended_action || "",
          why: why || "Action recommended by priorities engine.",
          timing,
          context: context || "Identified based on current relationship thread.",
          btnLabel: c.recommendation_category === "RESPOND" ? "Draft Response" :
                    c.recommendation_category === "SCHEDULE_MEETING" ? "Schedule Meeting" :
                    c.recommendation_category === "RESOLVE_BLOCKER" ? "Resolve Blocker" :
                    "Draft Follow-Up",
          rawEvidenceQuote: rawEvidenceQuoteStream,
          rawEvidenceSource: c.recommendation_category?.toLowerCase() || "meeting",
          rawLastInteraction: c.last_interaction || undefined,
          rawConfidence: c.recommendation_confidence ?? undefined,
        };
      });
      setStreamItems(mappedStream);

      setIsLoading(false);
    } catch(err) {
      console.error("Error loading Lemma datastore:", err);
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadAllData();
  }, []);

  // Update quick capture selection based on active contact selection
  useEffect(() => {
    if (selectedContactId) {
      setQuickCaptureContactId(selectedContactId);
    }
  }, [selectedContactId]);

  // Intercept scroll inside the stream queue container
  useEffect(() => {
    const el = streamRef.current;
    if (!el || activeTab !== "today" || streamItems.length === 0) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY > 15) {
        setActiveStreamIndex((prev) => Math.min(prev + 1, streamItems.length - 1));
      } else if (e.deltaY < -15) {
        setActiveStreamIndex((prev) => Math.max(prev - 1, 0));
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, [streamItems.length, activeTab]);

  // Keyboard navigation inside stream
  const handleStreamKeyDown = (e: React.KeyboardEvent) => {
    if (streamItems.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveStreamIndex((prev) => Math.min(prev + 1, streamItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveStreamIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  // Quick Capture submit: write interaction and trigger workflow
  const handleQuickCaptureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCaptureText.trim()) return;

    setIsProcessingCapture(true);

    try {
      let targetId = quickCaptureContactId;

      if (quickCaptureContactId === "new") {
        if (!quickCaptureNewName.trim()) {
          alert("Please enter a name for the new contact");
          setIsProcessingCapture(false);
          return;
        }

        const newRec = await createRecord("contacts", {
          name: quickCaptureNewName.trim(),
          relationship_state: "mutual_exploration",
          tier: "B",
          priority_score: 50,
          who_are_they: `${quickCaptureNewName.trim()} at Prospective Company`
        });
        targetId = newRec.id;
      }

      await ingestNewInteraction(targetId, "manual", quickCaptureText);

      // Ingesting automatically fires the pipeline. Wait for execution completion.
      setTimeout(async () => {
        await loadAllData(targetId);
        setIsProcessingCapture(false);
        setQuickCaptureText("");
        setQuickCaptureNewName("");
        setIsQuickCaptureOpen(false);

        const contactName = contacts.find(c => c.id === targetId)?.name || quickCaptureNewName || "Contact";
        setClosureMessage(`✓ Note ingested. ${contactName} intelligence regenerated.`);
        setTimeout(() => setClosureMessage(null), 4000);
      }, 3500);
    } catch (err) {
      console.error("Error submitting capture:", err);
      setIsProcessingCapture(false);
    }
  };

  // ── Import Conversation ─────────────────────────────────────────────────────

  const EXAMPLE_TRANSCRIPTS: { label: string; channel: "meeting" | "email" | "slack" | "manual"; contactKey: string; text: string }[] = [
    {
      label: "Series A Follow-Up (Sarah Jenkins)",
      channel: "meeting",
      contactKey: "Sarah",
      text: `[Zoom call — June 30, 2026]\n\nDaksh: Sarah, thanks for making time. Did you get a chance to review the migration case study I sent?\n\nSarah: Yes! The Acme migration numbers were impressive. I shared them with my partners. We're ready to move to the next step. Can you send over the full financial model and a term sheet outline by Friday? If those look good, we'll book the formal partner meeting for next week.\n\nDaksh: Absolutely. I'll get the model and draft term sheet to you by Thursday EOD.\n\nSarah: Perfect. One more thing — our compliance team needs your SOC 2 report. Can you include that?\n\nDaksh: Will do. I'll package everything together.`
    },
    {
      label: "Pricing Agreement (Rahul Sharma)",
      channel: "email",
      contactKey: "Rahul",
      text: `From: rahul@acmecorp.com\nTo: daksh@memorycrm.com\nSubject: Re: Observability Proposal\n\nHi Daksh,\n\nTeam has reviewed the pricing deck — we're aligned on the Enterprise tier. A few things before we sign:\n\n1. We need a custom SLA with 99.95% uptime guarantee.\n2. Our legal team wants a data processing agreement (DPA) before contract sign-off.\n3. Can we schedule a technical deep-dive with your eng team next week?\n\nIf you can confirm these, we're ready to move to contract stage.\n\nBest,\nRahul`
    },
    {
      label: "Integration Check-in (Michael Chen)",
      channel: "slack",
      contactKey: "Michael",
      text: `[Slack DM — #general]\n\nMichael: Hey Daksh! Sorry for the radio silence. We finally completed our security audit. Turns out we passed with flying colors.\n\nMichael: We're now unblocked on the webhook integration. Can you send over the API documentation and sandbox credentials? Our team wants to start a proof of concept this sprint.\n\nDaksh: That's great news! I'll send the docs and sandbox access today.\n\nMichael: Thanks. Also — we have a board review in 3 weeks. If the POC goes well, I'd love to include this in our infrastructure roadmap presentation.`
    },
    {
      label: "Re-engagement (Elena Rostova)",
      channel: "email",
      contactKey: "Elena",
      text: `From: elena@cloudflare.com\nTo: daksh@memorycrm.com\nSubject: Re: SDK Launch\n\nHi Daksh,\n\nSaw the Lemma SDK launch announcement — congratulations! The edge compute use case you described is exactly what we've been looking for.\n\nOur team has capacity to start a channel partnership evaluation in Q3. I'd like to set up a call with our VP of Partnerships. Are you available the week of July 14th?\n\nAlso, could you send over your partnership deck and pricing for volume resellers?\n\nLooking forward to reconnecting.\n\nElena`
    }
  ];

  const handleImportConversation = async () => {
    if (!importText.trim() || !importContactId) return;
    setImportStage("processing");
    setImportDiff(null);

    // Snapshot before-state
    const beforeContact = contacts.find(c => c.id === importContactId);
    const beforeCommitmentsCount = commitments.filter(c => c.contactId === importContactId && c.status === "open").length;
    const before = {
      state: beforeContact?.state ?? "mutual_exploration",
      priority: beforeContact?.priorityScore ?? 0,
      commitments: beforeCommitmentsCount,
      recommendation: beforeContact?.recommendedAction ?? "None"
    };

    try {
      await ingestNewInteraction(importContactId, importChannel, importText);

      // Wait for the Lemma workflow to propagate (ingest → extract → recommend → priority)
      await new Promise(r => setTimeout(r, 4500));
      await loadAllData(importContactId);

      // Snapshot after-state from freshly loaded data
      const afterContact = contacts.find(c => c.id === importContactId);
      const afterCommitmentsCount = commitments.filter(c => c.contactId === importContactId && c.status === "open").length;

      // contacts state may not be updated yet due to closure — re-fetch direct
      const freshContacts = await import("../lib/lemmaClient").then(m => m.fetchAllContacts());
      const freshContact = freshContacts.find((c: any) => c.id === importContactId);
      const freshCommitments = await import("../lib/lemmaClient").then(m => m.fetchAllCommitments());
      const freshCommCount = freshCommitments.filter((c: any) => c.contact_id === importContactId && c.status === "open").length;

      setImportDiff({
        contactName: beforeContact?.name ?? "Contact",
        before,
        after: {
          state: freshContact?.relationship_state ?? before.state,
          priority: freshContact?.priority_score ?? before.priority,
          commitments: freshCommCount,
          recommendation: freshContact?.recommended_action ?? before.recommendation
        }
      });

      setImportStage("done");
    } catch (err) {
      console.error("Import failed:", err);
      setImportStage("idle");
    }
  };

  const handleLoadExample = (ex: typeof EXAMPLE_TRANSCRIPTS[0]) => {
    const match = contacts.find(c => c.name.includes(ex.contactKey));
    if (match) setImportContactId(match.id);
    setImportChannel(ex.channel);
    setImportText(ex.text);
    setImportDiff(null);
    setImportStage("idle");
  };

  const handleRunDemoScenario = async (scenarioId: number) => {
    setDemoStage("processing");
    setActiveDemoScenario(scenarioId);
    setDemoDiff(null);

    const scenario = DEMO_SCENARIOS.find(s => s.id === scenarioId)!;

    let targetContactId = "";
    let beforeState = "None (New Contact)";
    let beforePriority = 0;
    let beforeCommitmentsCount = 0;
    let beforeRec = "None";

    if (scenarioId !== 4) {
      // Find existing contact
      const match = contacts.find(c => c.name.includes(scenario.contactName));
      if (match) {
        targetContactId = match.id;
        const contactComms = commitments.filter(c => c.contactId === targetContactId && c.status === "open").length;
        beforeState = match.state;
        beforePriority = match.priorityScore;
        beforeCommitmentsCount = contactComms;
        beforeRec = match.recommendedAction ?? "None";
      }
    }

    const before = {
      state: beforeState,
      priority: beforePriority,
      commitments: beforeCommitmentsCount,
      recommendation: beforeRec
    };

    try {
      if (scenarioId === 4) {
        // Create new contact first
        const newContact = await createRecord("contacts", {
          name: "Maya Lin",
          relationship_state: "mutual_exploration",
          tier: "B",
          priority_score: 50,
          who_are_they: "Maya Lin at Scale AI"
        });
        targetContactId = newContact.id;
      }

      await ingestNewInteraction(targetContactId, scenario.channel, scenario.transcript);

      // Wait 4.5 seconds for the extraction engine, priority, and workflows to propagate
      await new Promise(r => setTimeout(r, 4500));
      await loadAllData(targetContactId);

      // Query freshly updated values directly from DB to avoid closures
      const freshContacts = await import("../lib/lemmaClient").then(m => m.fetchAllContacts());
      const freshContact = freshContacts.find((c: any) => c.id === targetContactId);
      const freshCommitments = await import("../lib/lemmaClient").then(m => m.fetchAllCommitments());
      const freshCommCount = freshCommitments.filter((c: any) => c.contact_id === targetContactId && c.status === "open").length;

      setDemoDiff({
        contactName: scenario.contactName,
        before,
        after: {
          state: freshContact?.relationship_state ?? before.state,
          priority: freshContact?.priority_score ?? before.priority,
          commitments: freshCommCount,
          recommendation: freshContact?.recommended_action ?? before.recommendation
        },
        contactId: targetContactId
      });

      setDemoStage("done");
    } catch (err) {
      console.error("Demo scenario run failed:", err);
      setDemoStage("idle");
    }
  };

  // Compose Trigger
  const handleTriggerComposer = (contact: Contact) => {
    let draftBody = `Hi ${contact.name.split(" ")[0]},\n\nGreat speaking recently. I wanted to follow up on our discussion regarding ${contact.summary.toLowerCase()}.\n\nLet me know when you're free to catch up.\n\nBest,\nDaksh`;
    
    if (contact.id === "5bae59cb-25f5-472e-a4e3-3ff9e946efcc" || contact.name.includes("Rahul")) {
      draftBody = `Hi Rahul,\n\nGreat speaking yesterday. I wanted to follow up with the pricing proposal we discussed for Acme Corp's integration.\n\nLet me know if this works and if we're good to schedule the pilot deep-dive.\n\nBest,\nDaksh`;
    }

    setActiveDraft({
      contact,
      subject: `Follow up — ${contact.company}`,
      body: draftBody
    });
  };

  // Send Draft (Closure mechanism)
  const handleSendDraft = async () => {
    if (!activeDraft) return;

    const contactId = activeDraft.contact.id;

    try {
      const commsToComplete = commitments.filter(
        (c) => c.contactId === contactId && c.status === "open" && c.owner === "founder"
      );

      for (const com of commsToComplete) {
        await updateCommitment(com.id, "completed");
      }

      await ingestNewInteraction(contactId, "email", `Dispatched follow-up email: ${activeDraft.subject}`);

      await updateRecord("contacts", contactId, {
        relationship_state: "waiting_on_them"
      });

      try {
        await recordRecommendationFeedback(contactId, "ACCEPTED", "Follow-up email sent.");
      } catch(e) {
        console.warn("Could not record feedback logs:", e);
      }

      await loadAllData(contactId);

      setClosureMessage(`✓ Email dispatched. Status updated.`);
      setActiveDraft(null);

      setTimeout(() => {
        setClosureMessage(null);
      }, 4000);
    } catch(err) {
      console.error("Error finishing send flow:", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F5EF] text-[#1D1D1B] font-sans antialiased flex flex-col relative pb-24">
      
      {/* =========================================================================
          APPLICATION SHELL / TOP NAVIGATION
          ========================================================================= */}
      <header className="sticky top-0 z-40 bg-[#F8F5EF]/95 backdrop-blur-xs px-8 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between border-b border-[#EBE6D9] pb-4">
          <div className="flex items-baseline space-x-2">
            <span className="font-display font-medium text-[1.05rem] tracking-tight">MemoryCRM</span>
            <span className="text-[0.78rem] text-[#6B655E] font-light">for your relationships</span>
          </div>

          <nav className="flex items-center space-x-6">
            <button
              onClick={() => setActiveTab("today")}
              className={`text-[0.9rem] transition-colors relative py-1 ${
                activeTab === "today"
                  ? "text-[#1D1D1B] font-medium border-b border-[#1D1D1B]"
                  : "text-[#6B655E] hover:text-[#1D1D1B]"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setActiveTab("people")}
              className={`text-[0.9rem] transition-colors relative py-1 ${
                activeTab === "people"
                  ? "text-[#1D1D1B] font-medium border-b border-[#1D1D1B]"
                  : "text-[#6B655E] hover:text-[#1D1D1B]"
              }`}
            >
              People
            </button>
            <button
              onClick={() => setActiveTab("inbox")}
              className={`text-[0.9rem] transition-colors relative py-1 ${
                activeTab === "inbox"
                  ? "text-[#1D1D1B] font-medium border-b border-[#1D1D1B]"
                  : "text-[#6B655E] hover:text-[#1D1D1B]"
              }`}
            >
              Inbox
            </button>
            <button
              onClick={() => setActiveTab("import")}
              className={`text-[0.9rem] transition-colors relative py-1 ${
                activeTab === "import"
                  ? "text-[#1D1D1B] font-medium border-b border-[#1D1D1B]"
                  : "text-[#6B655E] hover:text-[#1D1D1B]"
              }`}
            >
              Import
            </button>
            <button
              onClick={() => setActiveTab("demo")}
              className={`text-[0.9rem] transition-colors relative py-1 ${
                activeTab === "demo"
                  ? "text-[#1D1D1B] font-medium border-b border-[#1D1D1B]"
                  : "text-[#6B655E] hover:text-[#1D1D1B]"
              }`}
            >
              Demo Scenarios
            </button>
          </nav>

          <button
            onClick={() => setIsQuickCaptureOpen(true)}
            className="text-[#A36A2B] hover:text-[#1D1D1B] text-[0.88rem] font-medium transition-colors flex items-center space-x-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Conversation</span>
          </button>
        </div>
      </header>

      {/* =========================================================================
          CLOSURE NOTIFICATION POPUP
          ========================================================================= */}
      {closureMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-[#FCFAF6] border border-[#D5CBB5] text-[#1D1D1B] px-4 py-2.5 rounded-lg shadow-sm flex items-center space-x-2 text-[0.88rem] animate-in fade-in slide-in-from-top-2 duration-200">
          <Check className="w-4 h-4 text-[#A36A2B]" />
          <span>{closureMessage}</span>
        </div>
      )}

      {/* =========================================================================
          MAIN PORT CONTAINER
          ========================================================================= */}
      <main className="flex-grow max-w-6xl w-full mx-auto px-8 py-10">
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-32">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-[#A36A2B] animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-2 h-2 rounded-full bg-[#A36A2B] animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-2 h-2 rounded-full bg-[#A36A2B] animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <p className="text-[0.9rem] text-[#6B655E] font-light">Retrieving relationship memory...</p>
          </div>
        ) : (
          <>
            {/* =====================================================================
                TODAY VIEW (EDITORIAL MORNING BRIEFING + DYNAMIC ATTENTION STREAM)
                ===================================================================== */}
            {activeTab === "today" && (
              <div className="space-y-16 animate-in fade-in duration-200">
                
                {/* Morning Briefing */}
                <section className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-[2.6rem] font-medium tracking-tight text-[#1D1D1B] leading-tight">
                      Good morning, Daksh.
                    </h2>
                    <button
                      onClick={async () => {
                        setIsRefreshing(true);
                        try {
                          setBriefSummaryText("Syncing relationship intelligence...");
                          for (const c of contacts) {
                            try {
                              await triggerRecommendationGeneration(c.id);
                            } catch(e) {}
                          }
                          await triggerDailyBriefGeneration();
                          await loadAllData();
                          setClosureMessage("✓ Intelligence updated successfully.");
                          setTimeout(() => setClosureMessage(null), 4000);
                        } catch(e) {
                          console.error(e);
                        } finally {
                          setIsRefreshing(false);
                        }
                      }}
                      disabled={isRefreshing}
                      className="flex items-center space-x-1.5 text-[0.8rem] text-[#A36A2B] hover:text-[#1D1D1B] transition-colors border border-[#EBE6D9] rounded-lg px-2.5 py-1 bg-[#FCFAF6] shadow-2xs disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                      <span>{isRefreshing ? "Updating..." : "Sync Intelligence"}</span>
                    </button>
                  </div>
                  <div className="space-y-2 text-[1.1rem] text-[#6B655E] font-light max-w-2xl whitespace-pre-line border-l border-[#EBE6D9] pl-4 leading-relaxed">
                    {briefSummaryText}
                  </div>
                </section>

                {/* Split layout: Needs Attention and Dynamic Attention Stream */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-12 items-start">
              
              {/* Needs Attention Column (3/5) */}
              <div className="md:col-span-3 space-y-8">
                <div className="border-b border-[#EBE6D9] pb-2">
                  <h3 className="text-[0.78rem] tracking-wider uppercase font-semibold text-[#6B655E]">
                    Needs Attention
                  </h3>
                </div>

                <div className="space-y-8">
                  {contacts.filter(c => c.state === "waiting_on_me").map(contact => (
                    <div key={contact.id} className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <div className="flex items-baseline space-x-2">
                          <h4 className="font-display font-medium text-[1.15rem] text-[#1D1D1B]">{contact.name}</h4>
                          <span className="text-[0.8rem] text-[#6B655E]">{contact.company}</span>
                        </div>
                        <span className={`text-[0.75rem] font-semibold px-2 py-0.5 rounded ${
                          contact.temperature === "Active" ? "bg-[#FCFAF6] text-[#A36A2B]" : "bg-[#FCFAF6] text-[#A14A3A]"
                        }`}>
                          {contact.temperature}
                        </span>
                      </div>

                      <p className="text-[0.92rem] text-[#6B655E] leading-relaxed font-light">
                        {contact.summary}
                      </p>

                      <div className="flex items-center space-x-4 pt-1 text-[0.82rem]">
                        <span className="text-[#6B655E]">Suggested action:</span>
                        <button
                          onClick={() => handleTriggerComposer(contact)}
                          className="text-[#A36A2B] hover:text-[#1D1D1B] font-medium underline underline-offset-2 transition-all"
                        >
                          Draft Follow-Up
                        </button>
                        <span className="text-[#EBE6D9]">•</span>
                        <button 
                          onClick={() => {
                            setSelectedContactId(contact.id);
                            setActiveTab("people");
                          }}
                          className="text-[#6B655E] hover:text-[#1D1D1B]"
                        >
                          View History
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dynamic Attention Stream Queue (2/5) */}
              <div className="md:col-span-2 space-y-6">
                <div className="border-b border-[#EBE6D9] pb-2 flex items-center justify-between">
                  <h3 className="text-[0.78rem] tracking-wider uppercase font-semibold text-[#6B655E]">
                    Your Attention Stream
                  </h3>
                  <span className="text-[0.72rem] text-[#9A9287] font-light">
                    {activeStreamIndex + 1} of {streamItems.length}
                  </span>
                </div>

                {/* Stream Queue Box - Intercepts scroll and keydown focus */}
                <div
                  ref={streamRef}
                  tabIndex={0}
                  onKeyDown={handleStreamKeyDown}
                  className="space-y-4 outline-none select-none cursor-ns-resize"
                  title="Scroll trackpad/wheel or use ArrowUp/Down to shift focus"
                >
                  {streamItems.map((item, idx) => {
                    const isFocused = idx === activeStreamIndex;
                    
                    return (
                      <div
                        key={item.id}
                        onClick={() => setActiveStreamIndex(idx)}
                        className={`transition-all duration-500 ease-out transform rounded-xl p-5 border ${
                          isFocused
                            ? "bg-[#FCFAF6] border-[#D5CBB5] shadow-sm translate-y-0 opacity-100 scale-100"
                            : "bg-[#FCFAF6]/40 border-[#EBE6D9] translate-y-4 opacity-30 scale-95 hover:opacity-60"
                        }`}
                      >
                        {/* Header preview row */}
                        <div className="flex items-center justify-between pb-1.5 border-b border-[#EBE6D9]/40 mb-2">
                          <span className="text-[0.8rem] text-[#6B655E] font-medium">
                            {item.person} • {item.company}
                          </span>
                          <span className={`text-[0.7rem] px-1.5 py-0.2 rounded font-semibold ${
                            isFocused ? "bg-[#F1ECE1] text-[#A36A2B]" : "bg-transparent text-[#6B655E]"
                          }`}>
                            {item.type}
                          </span>
                        </div>

                        {/* Action Title */}
                        <h4 className="font-display font-medium text-[1.12rem] text-[#1D1D1B]">
                          {item.action}
                        </h4>

                        {/* Timing indicator always visible */}
                        <span className="text-[0.78rem] text-[#9A9287] font-light mt-1 block">
                          Timing: {item.timing}
                        </span>

                        {/* PROGRESSIVE DISCLOSURE: Show only when focused */}
                        {isFocused && (
                          <div className="mt-3.5 space-y-3 animate-in fade-in duration-300">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[0.7rem] uppercase tracking-wider font-semibold text-[#A36A2B]">Why it matters</span>
                                <EvidenceDrawer
                                  label={item.action}
                                  variant="badge"
                                  evidence={buildEvidence({
                                    evidenceQuote: item.rawEvidenceQuote,
                                    sourceType: item.rawEvidenceSource,
                                    timestamp: item.rawLastInteraction ? formatRelativeTime(item.rawLastInteraction) : "Recently",
                                    contactName: item.person,
                                    confidence: item.rawConfidence,
                                  })}
                                />
                              </div>
                              <p className="text-[0.88rem] text-[#6B655E] leading-relaxed font-light">
                                {item.why}
                              </p>
                            </div>

                            <p className="text-[0.82rem] text-[#9A9287] italic font-light">
                              {item.context}
                            </p>

                            {/* Action Buttons row (Send Draft + View history redirect) */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-between gap-3 pt-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedContactId(item.contactId);
                                  setActiveTab("people");
                                }}
                                className="text-[0.82rem] text-[#A36A2B] hover:text-[#1D1D1B] font-semibold underline underline-offset-2 transition-all text-left"
                              >
                                View Relationship History
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const contact = contacts.find(c => c.id === item.contactId);
                                  if (contact) handleTriggerComposer(contact);
                                }}
                                className="bg-[#1D1D1B] hover:bg-[#2D2B28] text-[#FCFAF6] text-[0.82rem] font-semibold px-4.5 py-1.8 rounded transition-colors flex items-center justify-center space-x-1.5 shrink-0"
                              >
                                <Mail className="w-3.5 h-3.5" />
                                <span>{item.btnLabel}</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="text-center text-[0.75rem] text-[#9A9287] font-light">
                  Use your wheel, trackpad, or ↑↓ keys to step through items.
                </div>
              </div>

            </div>

            {/* Sync & Activity Logs */}
            <section className="pt-10 border-t border-[#EBE6D9] space-y-4 text-[0.85rem] text-[#6B655E]">
              <div className="flex items-center justify-between text-[#6B655E] font-medium text-[0.78rem] uppercase tracking-wider">
                <span>Sync Status</span>
                <span>Google & Zoom Synced</span>
              </div>
              <div className="space-y-2">
                {logs.slice(0, 3).map((log) => (
                  <p key={log.id} className="flex justify-between items-baseline font-light">
                    <span>✓ Processed {log.type} transcript with {log.source}</span>
                    <span className="text-[#6B655E] text-[0.8rem]">{log.timestamp}</span>
                  </p>
                ))}
              </div>
            </section>

          </div>
        )}

        {/* =====================================================================
            PEOPLE VIEW (SPLIT MASTER-DETAIL DOSSIER SYSTEM)
            ===================================================================== */}
        {activeTab === "people" && (
          <div className="space-y-8 animate-in fade-in duration-200">
            
            {/* Search Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EBE6D9] pb-4">
              <div>
                <h2 className="font-display text-[1.8rem] font-semibold tracking-tight">People</h2>
                <p className="text-[#6B655E] text-[0.9rem] font-light">Your relationship intelligence dossier.</p>
              </div>

              <div className="flex items-center bg-[#FCFAF6] border border-[#EBE6D9] px-3.5 py-1.5 rounded-lg w-full sm:max-w-xs">
                <Search className="w-4 h-4 text-[#6B655E] mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Search names, topics, drivers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent border-none text-[#1D1D1B] placeholder-[#6B655E] focus:outline-none text-[0.88rem] font-light"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="text-[#6B655E]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Split Screen Master-Detail Dossier Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch min-h-[500px]">
              
              {/* Left Column: Master Directory list */}
              <div className="lg:col-span-1 border-r border-[#EBE6D9] pr-6 space-y-4">
                <span className="text-[0.7rem] uppercase tracking-wider font-semibold text-[#6B655E] block">Directory</span>
                
                <div className="space-y-2 max-h-[550px] overflow-y-auto pr-2">
                  {contacts
                    .filter((c) => {
                      const query = searchQuery.toLowerCase();
                      return (
                        c.name.toLowerCase().includes(query) ||
                        c.company.toLowerCase().includes(query) ||
                        c.thesis.toLowerCase().includes(query) ||
                        c.drivers.some((d) => d.toLowerCase().includes(query)) ||
                        c.objections.some((o) => o.toLowerCase().includes(query))
                      );
                    })
                    .map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => setSelectedContactId(contact.id)}
                        className={`w-full text-left p-3.5 rounded-lg transition-all flex flex-col space-y-1 ${
                          selectedContactId === contact.id
                            ? "bg-[#FCFAF6] border border-[#D5CBB5] shadow-xs"
                            : "hover:bg-[#FCFAF6]/60 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-display font-medium text-[0.98rem] text-[#1D1D1B]">{contact.name}</span>
                          <span className={`text-[0.7rem] font-medium px-1.5 py-0.2 rounded ${
                            contact.temperature === "Active" ? "bg-[#FAF9F6] text-[#A36A2B]" :
                            contact.temperature === "Cooling down" ? "bg-[#FAF9F6] text-[#A14A3A]" :
                            "bg-[#FAF9F6] text-[#6A7C52]"
                          }`}>
                            {contact.temperature}
                          </span>
                        </div>
                        <span className="text-[0.82rem] text-[#6B655E]">{contact.company} • {contact.title}</span>
                        <span className="text-[0.78rem] text-[#9A9287] line-clamp-1 italic">"{contact.summary}"</span>
                      </button>
                    ))}
                </div>
              </div>

              {/* Right Column: Detailed Dossier */}
              <div className="lg:col-span-2 space-y-8 pl-2">
                {selectedContact ? (
                  <div className="space-y-8 animate-in fade-in duration-150">
                    
                    {/* Header */}
                    <div className="flex justify-between items-start border-b border-[#EBE6D9] pb-4">
                      <div>
                        <div className="flex items-baseline space-x-3">
                          <h3 className="font-display font-medium text-[1.6rem] text-[#1D1D1B]">{selectedContact.name}</h3>
                          <span className="text-[#6B655E] text-[0.9rem]">{selectedContact.title} at {selectedContact.company}</span>
                        </div>
                        <p className="text-[0.85rem] text-[#6B655E] mt-1">Primary Email: {selectedContact.email} • Last active: {selectedContact.lastInteraction}</p>
                      </div>

                      <span className={`text-[0.78rem] font-semibold px-2.5 py-0.5 rounded ${
                        selectedContact.temperature === "Active" ? "bg-[#FCFAF6] text-[#A36A2B] border border-[#D5CBB5]" :
                        selectedContact.temperature === "Cooling down" ? "bg-[#FCFAF6] text-[#A14A3A] border border-[#D5CBB5]" :
                        "bg-[#FCFAF6] text-[#6A7C52] border border-[#D5CBB5]"
                      }`}>
                        {selectedContact.temperature}
                      </span>
                    </div>

                    {/* Summary */}
                    <div className="space-y-2">
                      <h4 className="text-[0.72rem] uppercase tracking-widest font-semibold text-[#6B655E]">Relationship Summary</h4>
                      <p className="text-[1.02rem] text-[#1D1D1B] leading-relaxed font-light">
                        {selectedContact.summary}
                      </p>
                      <p className="text-[0.92rem] text-[#6B655E] leading-relaxed font-light italic">
                        <span className="font-medium text-[#1D1D1B] not-italic">Strategic thesis: </span>
                        {selectedContact.thesis}
                      </p>
                    </div>

                    {/* Commitments */}
                    <div className="space-y-3.5">
                      <h4 className="text-[0.72rem] uppercase tracking-widest font-semibold text-[#6B655E]">Current Focus</h4>
                      
                      <div className="space-y-2 bg-[#FCFAF6] border border-[#EBE6D9] rounded-lg p-4">
                        {commitments.filter(c => c.contactId === selectedContact.id && c.status === "open").length === 0 ? (
                          <p className="text-[0.85rem] text-[#6B655E] font-light">No outstanding promises. All loops are closed.</p>
                        ) : (
                          <div className="space-y-2">
                            {commitments.filter(c => c.contactId === selectedContact.id && c.status === "open").map(com => (
                              <div key={com.id} className="flex items-start space-x-2.5 text-[0.88rem]">
                                <span className={`w-1.5 h-1.5 rounded-full mt-1.8 shrink-0 ${com.owner === "founder" ? "bg-[#A14A3A]" : "bg-[#A36A2B]"}`} />
                                <div className="flex-1">
                                  <div className="flex justify-between gap-4">
                                    <span className="font-light text-[#1D1D1B]">
                                      {com.owner === "founder" ? "Awaiting your action: " : "Awaiting contact: "}
                                      {com.description}
                                    </span>
                                    {com.dueDate && <span className="text-[#9A9287] text-[0.8rem] shrink-0">Target: {com.dueDate}</span>}
                                  </div>
                                  <EvidenceDrawer
                                    label={com.description}
                                    evidence={buildEvidence({
                                      evidenceQuote: com.evidenceQuote,
                                      sourceType: "meeting",
                                      timestamp: selectedContact.lastInteraction,
                                      contactName: selectedContact.name,
                                    })}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Narrative Timeline */}
                    <div className="space-y-4">
                      <h4 className="text-[0.72rem] uppercase tracking-widest font-semibold text-[#6B655E]">Narrative Relationship Timeline</h4>
                      
                      <div className="relative pl-6 border-l-2 border-[#EBE6D9]/70 space-y-6">
                        {selectedContact.timeline.map((evt, idx) => {
                          let icon = <Clock className="w-3.5 h-3.5" />;
                          let iconBg = "bg-[#FCFAF6] border-[#D5CBB5]";
                          let iconColor = "text-[#6B655E]";
                          let tagText = "";
                          let tagStyle = "";

                          if (evt.type === "milestone") {
                            icon = <Award className="w-3.5 h-3.5" />;
                            iconBg = "bg-[#FDF9F2] border-[#EAD5C3]";
                            iconColor = "text-[#B36B2B]";
                            tagText = "Milestone";
                            tagStyle = "bg-[#FAF2E8] text-[#B36B2B]";
                          } else if (evt.type === "interaction") {
                            icon = <MessageSquare className="w-3.5 h-3.5" />;
                            iconBg = "bg-[#FAFBF9] border-[#D4DDD3]";
                            iconColor = "text-[#5B7850]";
                            tagText = "Interaction";
                            tagStyle = "bg-[#EFF4EE] text-[#5B7850]";
                          } else if (evt.type === "state_change") {
                            icon = <GitCompare className="w-3.5 h-3.5" />;
                            iconBg = "bg-[#FAF9FB] border-[#DDD3E8]";
                            iconColor = "text-[#7B5B9E]";
                            tagText = "State Change";
                            tagStyle = "bg-[#F4EEFA] text-[#7B5B9E]";
                          }

                          return (
                            <div key={idx} className="relative group">
                              {/* Timeline indicator node */}
                              <div className={`absolute -left-[35px] top-1.5 w-6 h-6 rounded-full border flex items-center justify-center shadow-xs transition-transform duration-200 group-hover:scale-110 ${iconBg} ${iconColor}`}>
                                {icon}
                              </div>
                              <div className="space-y-1.5 p-3 rounded-lg border border-transparent hover:border-[#EBE6D9]/55 hover:bg-[#FCFAF6]/40 transition-all duration-200">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center space-x-2">
                                    <span className="text-[0.82rem] font-medium text-[#1D1D1B]">{evt.title}</span>
                                    {tagText && (
                                      <span className={`text-[0.68rem] px-1.5 py-0.2 rounded-md font-medium uppercase tracking-wider ${tagStyle}`}>
                                        {tagText}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[0.78rem] text-[#9A9287] font-medium">{evt.timeframe}</span>
                                </div>
                                <p className="text-[0.88rem] text-[#6B655E] font-light leading-relaxed">{evt.description}</p>
                                {evt.evidenceQuote && (
                                  <div className="pt-0.5">
                                    <EvidenceDrawer
                                      label={evt.description}
                                      evidence={buildEvidence({
                                        evidenceQuote: evt.evidenceQuote,
                                        sourceType: evt.evidenceSource,
                                        timestamp: evt.timeframe,
                                        contactName: evt.contactName,
                                      })}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Next Action */}
                    <div className="pt-4 border-t border-[#EBE6D9] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1.5">
                        <span className="text-[0.72rem] uppercase tracking-widest font-semibold text-[#6B655E]">Suggested action</span>
                        <p className="text-[0.9rem] text-[#1D1D1B] font-medium">
                          {selectedContact.recommendedAction || "No immediate action required."}
                        </p>
                        <EvidenceDrawer
                          label={selectedContact.recommendedAction || "Recommendation"}
                          evidence={buildEvidence({
                            evidenceQuote: selectedContact.rawEvidenceQuote,
                            sourceType: selectedContact.rawEvidenceSource,
                            timestamp: selectedContact.lastInteraction,
                            contactName: selectedContact.name,
                            confidence: selectedContact.rawRecommendationConfidence,
                          })}
                        />
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          onClick={() => handleTriggerComposer(selectedContact)}
                          className="bg-[#1D1D1B] hover:bg-[#2D2B28] text-[#FCFAF6] text-[0.85rem] font-semibold px-4 py-2 rounded transition-colors flex items-center space-x-2 shadow-xs"
                        >
                          <Mail className="w-4.5 h-4.5" />
                          <span>Draft Follow-Up</span>
                        </button>
                      </div>
                    </div>

                    {/* Supporting Context */}
                    <div className="space-y-3 pt-2">
                      <h4 className="text-[0.72rem] uppercase tracking-widest font-semibold text-[#6B655E]">Supporting Context</h4>
                      <div className="flex flex-col gap-2">
                        {selectedContact.drivers.map((d, idx) => (
                          <div key={idx} className="flex items-center gap-2 flex-wrap">
                            <span className="bg-[#FCFAF6] border border-[#EBE6D9] text-[#6B655E] px-2 py-0.5 rounded text-[0.78rem]">
                              Motivator: {d}
                            </span>
                            <EvidenceDrawer
                              label={`Motivator: ${d}`}
                              evidence={buildEvidence({
                                evidenceQuote: selectedContact.rawEvidenceQuote || d,
                                sourceType: selectedContact.rawEvidenceSource || "meeting",
                                timestamp: selectedContact.lastInteraction,
                                contactName: selectedContact.name,
                              })}
                            />
                          </div>
                        ))}
                        {selectedContact.objections.map((o, idx) => (
                          <div key={idx} className="flex items-center gap-2 flex-wrap">
                            <span className="bg-[#FCFAF6] border border-[#EBE6D9] text-[#A14A3A] px-2 py-0.5 rounded text-[0.78rem]">
                              Objection: {o}
                            </span>
                            <EvidenceDrawer
                              label={`Objection: ${o}`}
                              evidence={buildEvidence({
                                evidenceQuote: o,
                                sourceType: selectedContact.rawEvidenceSource || "meeting",
                                timestamp: selectedContact.lastInteraction,
                                contactName: selectedContact.name,
                              })}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                ) : (
                  <p className="text-[#6B655E] text-[0.9rem] font-light py-8 text-center">Select a contact from the directory to review their dossier.</p>
                )}
              </div>

            </div>

          </div>
        )}

        {/* =====================================================================
            INBOX VIEW
            ===================================================================== */}
        {activeTab === "inbox" && (
          <div className="space-y-10 animate-in fade-in duration-200">
            <div className="space-y-1">
              <h2 className="font-display text-[1.8rem] font-semibold tracking-tight">Inbox</h2>
              <p className="text-[#6B655E] text-[0.9rem] font-light">Awaiting follow-up drafts and tasks to close loops.</p>
            </div>

            <div className="space-y-8 max-w-2xl">
              {commitments.filter(c => c.status === "open").length === 0 ? (
                <p className="text-[#6B655E] text-[0.9rem] font-light py-8">Your inbox is empty. All commitments are resolved.</p>
              ) : (
                contacts.map((contact) => {
                  const contactComms = commitments.filter(c => c.contactId === contact.id && c.status === "open");
                  if (contactComms.length === 0) return null;

                  return (
                    <div key={contact.id} className="flex justify-between items-start border-b border-[#EBE6D9] pb-6 last:border-0">
                      <div className="space-y-1.5">
                        <span className="font-medium text-[1.05rem]">{contact.name}</span>
                        <span className="text-[0.8rem] text-[#6B655E] ml-2">{contact.company}</span>
                        <div className="space-y-1">
                          {contactComms.map((com) => (
                            <p key={com.id} className="text-[0.9rem] text-[#6B655E] font-light">
                              • {com.description} {com.dueDate && `(Due ${com.dueDate})`}
                            </p>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => handleTriggerComposer(contact)}
                        className="text-[0.82rem] font-semibold text-[#A36A2B] hover:underline"
                      >
                        Draft Follow-Up
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            IMPORT CONVERSATION VIEW
            ===================================================================== */}
        {activeTab === "import" && (
          <div className="space-y-10 animate-in fade-in duration-200 max-w-3xl">

            {/* Header */}
            <div className="space-y-1">
              <h2 className="font-display text-[1.8rem] font-semibold tracking-tight">Import Conversation</h2>
              <p className="text-[#6B655E] text-[0.9rem] font-light">
                Paste a transcript and watch the full AI pipeline run — extraction, commitment detection, state transition, priority recalculation.
              </p>
            </div>

            {/* Example Transcripts */}
            <div className="space-y-2">
              <p className="text-[0.72rem] uppercase tracking-wider font-semibold text-[#6B655E]">Load Example Transcript</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_TRANSCRIPTS.map((ex) => (
                  <button
                    key={ex.label}
                    onClick={() => handleLoadExample(ex)}
                    className="text-[0.8rem] px-3 py-1.5 rounded-lg border border-[#EBE6D9] bg-[#FCFAF6] text-[#6B655E] hover:border-[#D5CBB5] hover:text-[#1D1D1B] transition-all"
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Form */}
            <div className="space-y-5 bg-[#FCFAF6] border border-[#EBE6D9] rounded-xl p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[0.72rem] uppercase tracking-wider font-semibold text-[#6B655E] block">Contact</label>
                  <select
                    value={importContactId}
                    onChange={e => { setImportContactId(e.target.value); setImportDiff(null); setImportStage("idle"); }}
                    disabled={importStage === "processing"}
                    className="w-full bg-[#F8F5EF] border border-[#EBE6D9] rounded-lg p-2.5 text-[0.88rem] text-[#1D1D1B] focus:outline-none focus:border-[#D5CBB5]"
                  >
                    <option value="">— Select a contact —</option>
                    {contacts.map(c => (
                      <option key={c.id} value={c.id}>{c.name} · {c.company}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[0.72rem] uppercase tracking-wider font-semibold text-[#6B655E] block">Channel</label>
                  <select
                    value={importChannel}
                    onChange={e => setImportChannel(e.target.value as any)}
                    disabled={importStage === "processing"}
                    className="w-full bg-[#F8F5EF] border border-[#EBE6D9] rounded-lg p-2.5 text-[0.88rem] text-[#1D1D1B] focus:outline-none focus:border-[#D5CBB5]"
                  >
                    <option value="meeting">Zoom / Meeting</option>
                    <option value="email">Email Thread</option>
                    <option value="slack">Slack / Chat</option>
                    <option value="manual">Manual Note</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[0.72rem] uppercase tracking-wider font-semibold text-[#6B655E] block">Conversation Text</label>
                <textarea
                  value={importText}
                  onChange={e => { setImportText(e.target.value); if (importStage === "done") { setImportStage("idle"); setImportDiff(null); } }}
                  placeholder="Paste a Zoom transcript, email thread, Slack conversation, or free-form note..."
                  rows={12}
                  disabled={importStage === "processing"}
                  className="w-full bg-[#F8F5EF] border border-[#EBE6D9] rounded-lg p-4 text-[0.88rem] leading-relaxed resize-none focus:outline-none focus:border-[#D5CBB5] font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => { setImportText(""); setImportDiff(null); setImportStage("idle"); }}
                  disabled={importStage === "processing"}
                  className="text-[0.82rem] text-[#6B655E] hover:text-[#1D1D1B] disabled:opacity-40"
                >
                  Clear
                </button>
                <button
                  onClick={handleImportConversation}
                  disabled={importStage === "processing" || !importText.trim() || !importContactId}
                  className="bg-[#1D1D1B] hover:bg-[#2D2B28] disabled:bg-[#9A9287] text-[#FCFAF6] text-[0.88rem] font-semibold px-5 py-2 rounded-lg transition-colors flex items-center space-x-2"
                >
                  {importStage === "processing" ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /><span>Processing Pipeline...</span></>
                  ) : (
                    <><FileText className="w-4 h-4" /><span>Process Conversation</span></>
                  )}
                </button>
              </div>
            </div>

            {/* Pipeline Progress */}
            {importStage === "processing" && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <p className="text-[0.72rem] uppercase tracking-wider font-semibold text-[#6B655E]">Pipeline Running</p>
                <div className="space-y-2">
                  {[
                    "Ingesting interaction record...",
                    "Extracting context and facts...",
                    "Detecting commitment changes...",
                    "Evaluating relationship state...",
                    "Recalculating priority score...",
                    "Generating new recommendation..."
                  ].map((step, i) => (
                    <div key={i} className="flex items-center space-x-3 text-[0.88rem]" style={{ animationDelay: `${i * 600}ms` }}>
                      <div className="w-1.5 h-1.5 rounded-full bg-[#A36A2B] animate-pulse" style={{ animationDelay: `${i * 400}ms` }} />
                      <span className="text-[#6B655E] font-light">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Change Summary Diff */}
            {importStage === "done" && importDiff && (
              <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between">
                  <p className="text-[0.72rem] uppercase tracking-wider font-semibold text-[#6B655E]">Change Summary — {importDiff.contactName}</p>
                  <span className="text-[0.72rem] bg-[#F1ECE1] text-[#A36A2B] px-2 py-0.5 rounded font-semibold border border-[#D5CBB5]">Pipeline Complete</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* State */}
                  <div className="bg-[#FCFAF6] border border-[#EBE6D9] rounded-xl p-4 space-y-2">
                    <p className="text-[0.7rem] uppercase tracking-wider font-semibold text-[#6B655E]">Relationship State</p>
                    <div className="flex items-center space-x-2 text-[0.88rem]">
                      <span className="line-through text-[#9A9287]">{importDiff.before.state.replace(/_/g, " ")}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#A36A2B] shrink-0" />
                      <span className={`font-semibold ${
                        importDiff.after.state !== importDiff.before.state ? "text-[#A36A2B]" : "text-[#1D1D1B]"
                      }`}>{importDiff.after.state.replace(/_/g, " ")}</span>
                    </div>
                  </div>

                  {/* Priority */}
                  <div className="bg-[#FCFAF6] border border-[#EBE6D9] rounded-xl p-4 space-y-2">
                    <p className="text-[0.7rem] uppercase tracking-wider font-semibold text-[#6B655E]">Priority Score</p>
                    <div className="flex items-center space-x-2 text-[0.88rem]">
                      <span className="line-through text-[#9A9287]">{importDiff.before.priority}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#A36A2B] shrink-0" />
                      <span className={`font-semibold ${
                        importDiff.after.priority > importDiff.before.priority ? "text-[#A36A2B]" : "text-[#1D1D1B]"
                      }`}>{importDiff.after.priority}</span>
                    </div>
                  </div>

                  {/* Commitments */}
                  <div className="bg-[#FCFAF6] border border-[#EBE6D9] rounded-xl p-4 space-y-2">
                    <p className="text-[0.7rem] uppercase tracking-wider font-semibold text-[#6B655E]">Open Commitments</p>
                    <div className="flex items-center space-x-2 text-[0.88rem]">
                      <span className="line-through text-[#9A9287]">{importDiff.before.commitments}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#A36A2B] shrink-0" />
                      <span className={`font-semibold ${
                        importDiff.after.commitments !== importDiff.before.commitments ? "text-[#A36A2B]" : "text-[#1D1D1B]"
                      }`}>{importDiff.after.commitments}</span>
                    </div>
                  </div>

                  {/* Recommendation */}
                  <div className="bg-[#FCFAF6] border border-[#EBE6D9] rounded-xl p-4 space-y-2">
                    <p className="text-[0.7rem] uppercase tracking-wider font-semibold text-[#6B655E]">Recommendation</p>
                    <div className="flex flex-col space-y-1 text-[0.82rem]">
                      <span className="line-through text-[#9A9287] leading-tight">{importDiff.before.recommendation?.substring(0, 55) ?? "None"}</span>
                      <span className={`font-semibold leading-tight ${
                        importDiff.after.recommendation !== importDiff.before.recommendation ? "text-[#A36A2B]" : "text-[#1D1D1B]"
                      }`}>{importDiff.after.recommendation?.substring(0, 55) ?? "None"}</span>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <div className="flex items-center space-x-3 pt-2">
                  <button
                    onClick={() => { setActiveTab("today"); loadAllData(importContactId); }}
                    className="bg-[#1D1D1B] hover:bg-[#2D2B28] text-[#FCFAF6] text-[0.85rem] font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    View in Today
                  </button>
                  <button
                    onClick={() => { setSelectedContactId(importContactId); setActiveTab("people"); }}
                    className="border border-[#EBE6D9] text-[#1D1D1B] text-[0.85rem] px-4 py-2 rounded-lg hover:border-[#D5CBB5] transition-colors"
                  >
                    Open Dossier
                  </button>
                  <button
                    onClick={() => { setImportText(""); setImportDiff(null); setImportStage("idle"); }}
                    className="text-[0.82rem] text-[#6B655E] hover:text-[#1D1D1B] ml-auto"
                  >
                    Import Another
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {/* =====================================================================
            DEMO SCENARIO CENTER VIEW
            ===================================================================== */}
        {activeTab === "demo" && (
          <div className="space-y-10 animate-in fade-in duration-200">
            {/* Header */}
            <div className="space-y-1">
              <h2 className="font-display text-[1.8rem] font-semibold tracking-tight">Demo Scenario Center</h2>
              <p className="text-[#6B655E] text-[0.9rem] font-light">
                Instantly trigger realistic business relationship changes and watch MemoryCRM adapt in real-time.
              </p>
            </div>

            {demoStage === "idle" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {DEMO_SCENARIOS.map((scenario) => (
                  <div key={scenario.id} className="bg-[#FCFAF6] border border-[#EBE6D9] rounded-xl p-6 flex flex-col justify-between space-y-4 hover:border-[#D5CBB5] transition-all">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display font-semibold text-[1.15rem] text-[#1D1D1B]">
                          {scenario.title}
                        </h3>
                        <span className="text-[0.72rem] bg-[#F1ECE1] text-[#A36A2B] px-2 py-0.5 rounded font-semibold border border-[#D5CBB5] capitalize">
                          {scenario.channel}
                        </span>
                      </div>
                      <p className="text-[0.85rem] text-[#6B655E] font-light leading-relaxed">
                        {scenario.description}
                      </p>
                      <div className="bg-[#F8F5EF]/60 p-3 rounded-lg border border-[#EBE6D9]/50">
                        <span className="text-[0.68rem] uppercase tracking-wider font-semibold text-[#6B655E] block mb-1">Target Contact</span>
                        <span className="text-[0.85rem] font-medium text-[#1D1D1B]">{scenario.contactName} ({scenario.company})</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleRunDemoScenario(scenario.id)}
                      className="w-full bg-[#1D1D1B] hover:bg-[#2D2B28] text-[#FCFAF6] text-[0.82rem] font-semibold py-2 rounded-lg transition-colors text-center"
                    >
                      Run Scenario
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Pipeline Progress */}
            {demoStage === "processing" && (
              <div className="bg-[#FCFAF6] border border-[#EBE6D9] rounded-xl p-8 space-y-6 max-w-xl mx-auto">
                <div className="flex items-center space-x-3">
                  <RefreshCw className="w-5 h-5 text-[#A36A2B] animate-spin" />
                  <h3 className="font-display font-semibold text-[1.1rem]">Running Cognitive Pipeline...</h3>
                </div>
                <div className="space-y-3">
                  {[
                    "Ingesting interaction transcript...",
                    "Extracting semantic commitments & facts...",
                    "Reconciling relationship states...",
                    "Updating target priority profile...",
                    "Re-evaluating follow-up recommendations..."
                  ].map((step, i) => (
                    <div key={i} className="flex items-center space-x-3 text-[0.88rem]">
                      <div className="w-2 h-2 rounded-full bg-[#A36A2B] animate-pulse" />
                      <span className="text-[#6B655E] font-light">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Change Summary Diff */}
            {demoStage === "done" && demoDiff && (
              <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-[#EBE6D9] pb-3">
                  <div>
                    <h3 className="font-display text-[1.3rem] font-semibold">Change Summary</h3>
                    <p className="text-[#6B655E] text-[0.82rem]">Scenario execution completed successfully.</p>
                  </div>
                  <span className="text-[0.72rem] bg-[#F1ECE1] text-[#A36A2B] px-2.5 py-1 rounded-full font-semibold border border-[#D5CBB5]">Pipeline Complete</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* State */}
                  <div className="bg-[#FCFAF6] border border-[#EBE6D9] rounded-xl p-4 space-y-2">
                    <p className="text-[0.7rem] uppercase tracking-wider font-semibold text-[#6B655E]">Relationship State</p>
                    <div className="flex items-center space-x-2 text-[0.88rem]">
                      <span className="line-through text-[#9A9287]">{demoDiff.before.state.replace(/_/g, " ")}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#A36A2B]" />
                      <span className={`font-semibold ${
                        demoDiff.after.state !== demoDiff.before.state ? "text-[#A36A2B]" : "text-[#1D1D1B]"
                      }`}>{demoDiff.after.state.replace(/_/g, " ")}</span>
                    </div>
                  </div>

                  {/* Priority */}
                  <div className="bg-[#FCFAF6] border border-[#EBE6D9] rounded-xl p-4 space-y-2">
                    <p className="text-[0.7rem] uppercase tracking-wider font-semibold text-[#6B655E]">Priority Score</p>
                    <div className="flex items-center space-x-2 text-[0.88rem]">
                      <span className="line-through text-[#9A9287]">{demoDiff.before.priority}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#A36A2B]" />
                      <span className={`font-semibold ${
                        demoDiff.after.priority !== demoDiff.before.priority ? "text-[#A36A2B]" : "text-[#1D1D1B]"
                      }`}>{demoDiff.after.priority}</span>
                    </div>
                  </div>

                  {/* Commitments */}
                  <div className="bg-[#FCFAF6] border border-[#EBE6D9] rounded-xl p-4 space-y-2">
                    <p className="text-[0.7rem] uppercase tracking-wider font-semibold text-[#6B655E]">Open Commitments</p>
                    <div className="flex items-center space-x-2 text-[0.88rem]">
                      <span className="line-through text-[#9A9287]">{demoDiff.before.commitments}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#A36A2B]" />
                      <span className={`font-semibold ${
                        demoDiff.after.commitments !== demoDiff.before.commitments ? "text-[#A36A2B]" : "text-[#1D1D1B]"
                      }`}>{demoDiff.after.commitments}</span>
                    </div>
                  </div>

                  {/* Recommendation */}
                  <div className="bg-[#FCFAF6] border border-[#EBE6D9] rounded-xl p-4 space-y-2">
                    <p className="text-[0.7rem] uppercase tracking-wider font-semibold text-[#6B655E]">Recommendation</p>
                    <div className="flex flex-col space-y-1 text-[0.82rem]">
                      <span className="line-through text-[#9A9287] leading-tight">{demoDiff.before.recommendation}</span>
                      <span className={`font-semibold leading-tight ${
                        demoDiff.after.recommendation !== demoDiff.before.recommendation ? "text-[#A36A2B]" : "text-[#1D1D1B]"
                      }`}>{demoDiff.after.recommendation}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-4 pt-4 border-t border-[#EBE6D9]">
                  <button
                    onClick={() => {
                      setActiveTab("today");
                      loadAllData(demoDiff.contactId);
                    }}
                    className="bg-[#1D1D1B] hover:bg-[#2D2B28] text-[#FCFAF6] text-[0.85rem] font-semibold px-5 py-2.5 rounded-lg transition-colors"
                  >
                    Go to Dashboard
                  </button>
                  <button
                    onClick={() => {
                      setSelectedContactId(demoDiff.contactId);
                      setActiveTab("people");
                    }}
                    className="border border-[#EBE6D9] text-[#1D1D1B] text-[0.85rem] px-5 py-2.5 rounded-lg hover:border-[#D5CBB5] transition-colors"
                  >
                    View Relationship Dossier
                  </button>
                  <button
                    onClick={() => {
                      setDemoDiff(null);
                      setDemoStage("idle");
                    }}
                    className="text-[0.82rem] text-[#6B655E] hover:text-[#1D1D1B] ml-auto font-medium"
                  >
                    Run Another Scenario
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </main>

      {/* =========================================================================
          BOTTOM-RIGHT SLIDE-UP EMAIL COMPOSER
          ========================================================================= */}
      {activeDraft && (
        <div className="fixed bottom-0 right-8 z-50 w-full max-w-md bg-[#FCFAF6] border border-[#D5CBB5] rounded-t-xl shadow-lg overflow-hidden animate-in slide-in-from-bottom duration-250">
          {/* Header */}
          <div className="bg-[#F1ECE1] border-b border-[#D5CBB5] px-4 py-3 flex items-center justify-between">
            <span className="font-display font-medium text-[0.9rem]">Email Draft</span>
            <button
              onClick={() => setActiveDraft(null)}
              className="text-[#6B655E] hover:text-[#1D1D1B]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <div className="p-5 space-y-4">
            <div className="flex items-center text-[0.85rem] pb-2 border-b border-[#EBE6D9]">
              <span className="text-[#6B655E] w-12">To:</span>
              <span className="font-medium text-[#1D1D1B]">{activeDraft.contact.email}</span>
            </div>
            
            <div className="flex items-center text-[0.85rem] pb-2 border-b border-[#EBE6D9]">
              <span className="text-[#6B655E] w-12">Subject:</span>
              <input
                type="text"
                value={activeDraft.subject}
                onChange={(e) => setActiveDraft({ ...activeDraft, subject: e.target.value })}
                className="font-medium text-[#1D1D1B] w-full bg-transparent"
              />
            </div>

            <textarea
              rows={8}
              value={activeDraft.body}
              onChange={(e) => setActiveDraft({ ...activeDraft, body: e.target.value })}
              className="w-full bg-[#FCFAF6] border border-[#EBE6D9] rounded-lg p-3 text-[0.9rem] text-[#1D1D1B] leading-relaxed resize-none"
            />

            {/* Helper box (Before You Send) */}
            <div className="bg-[#F1ECE1]/60 rounded-lg p-3 text-[0.8rem] space-y-1">
              <span className="font-semibold text-[#A36A2B] block uppercase tracking-wider text-[0.7rem]">Before You Send</span>
              <p className="text-[#6B655E] font-light">
                {activeDraft.contact.thesis}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => {
                  setActiveDraft({
                    ...activeDraft,
                    body: `Hi ${activeDraft.contact.name.split(" ")[0]},\n\nCasual follow up on our previous conversation. Let me know when you're free for a quick catch up.\n\nBest,\nDaksh`
                  });
                }}
                className="text-[0.82rem] text-[#A36A2B] hover:underline"
              >
                Make Casual
              </button>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setActiveDraft(null)}
                  className="text-[0.85rem] text-[#6B655E] hover:text-[#1D1D1B]"
                >
                  Discard
                </button>
                <button
                  onClick={handleSendDraft}
                  className="bg-[#1D1D1B] hover:bg-[#2D2B28] text-[#FCFAF6] text-[0.85rem] font-semibold px-4.5 py-1.8 rounded"
                >
                  Send via Gmail
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          QUICK CAPTURE SLIDE-OVER DRAWER
          ========================================================================= */}
      {isQuickCaptureOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            onClick={() => setIsQuickCaptureOpen(false)}
            className="absolute inset-0 bg-[#1D1D1B]/10 backdrop-blur-xs"
          />

          <div className="relative w-full max-w-md h-full bg-[#F8F5EF] border-l border-[#D5CBB5] shadow-xl flex flex-col animate-in slide-in-from-right duration-250">
            <div className="px-6 py-5 border-b border-[#EBE6D9] flex items-center justify-between bg-[#F1ECE1]/30">
              <h3 className="font-display font-semibold text-[1.1rem]">Add Conversation</h3>
              <button onClick={() => setIsQuickCaptureOpen(false)}>
                <X className="w-5 h-5 text-[#6B655E]" />
              </button>
            </div>

            <form onSubmit={handleQuickCaptureSubmit} className="flex-grow flex flex-col p-6 space-y-4 overflow-y-auto">
              <p className="text-[0.85rem] text-[#6B655E] font-light leading-relaxed">
                Paste meeting transcripts, email logs, or manual coffee notes. The assistant will parse context, extract milestones, and recompute priorities.
              </p>

              <div className="space-y-1.5">
                <label className="text-[0.72rem] uppercase tracking-wider font-semibold text-[#6B655E] block">
                  Associated Contact
                </label>
                <select
                  value={quickCaptureContactId}
                  onChange={(e) => setQuickCaptureContactId(e.target.value)}
                  disabled={isProcessingCapture}
                  className="w-full bg-[#FCFAF6] border border-[#EBE6D9] rounded-lg p-2.5 text-[0.9rem] text-[#1D1D1B] focus:outline-none focus:border-[#D5CBB5]"
                >
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.company})
                    </option>
                  ))}
                  <option value="new">+ Create new contact...</option>
                </select>
              </div>

              {quickCaptureContactId === "new" && (
                <div className="space-y-1.5 animate-in fade-in duration-200">
                  <label className="text-[0.72rem] uppercase tracking-wider font-semibold text-[#6B655E] block">
                    New Contact Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Tom Henderson"
                    value={quickCaptureNewName}
                    onChange={(e) => setQuickCaptureNewName(e.target.value)}
                    required
                    disabled={isProcessingCapture}
                    className="w-full bg-[#FCFAF6] border border-[#EBE6D9] rounded-lg p-2.5 text-[0.9rem] text-[#1D1D1B] focus:outline-none focus:border-[#D5CBB5]"
                  />
                </div>
              )}

              <div className="space-y-1.5 flex-grow flex flex-col">
                <label className="text-[0.72rem] uppercase tracking-wider font-semibold text-[#6B655E] block">
                  Conversation / Meeting transcript / Note
                </label>
                <textarea
                  value={quickCaptureText}
                  onChange={(e) => setQuickCaptureText(e.target.value)}
                  placeholder="Met for coffee. Discussed pricing timelines and key drivers..."
                  rows={8}
                  required
                  disabled={isProcessingCapture}
                  className="w-full bg-[#FCFAF6] border border-[#EBE6D9] rounded-lg p-4 text-[0.9rem] leading-relaxed resize-none flex-grow focus:outline-none focus:border-[#D5CBB5]"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-[#EBE6D9] shrink-0">
                <button
                  type="button"
                  onClick={() => setIsQuickCaptureOpen(false)}
                  disabled={isProcessingCapture}
                  className="text-[0.85rem] text-[#6B655E]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingCapture || !quickCaptureText.trim()}
                  className="bg-[#1D1D1B] hover:bg-[#2D2B28] disabled:bg-[#6B655E] text-[#FCFAF6] text-[0.85rem] font-semibold px-4.5 py-1.8 rounded"
                >
                  {isProcessingCapture ? "Parsing..." : "Add to memory"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
