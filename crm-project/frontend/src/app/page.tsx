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
  Check
} from "lucide-react";

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
  timeframe: string;
  description: string;
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
}

interface Commitment {
  id: string;
  contactId: string;
  description: string;
  owner: "founder" | "contact";
  dueDate: string | null;
  status: "open" | "completed";
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

export default function Page() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<"today" | "people" | "inbox">("today");

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

        const contactMilestones = allMilestones.filter((m: any) => m.contact_id === c.id);
        const timeline = contactMilestones.map((m: any) => ({
          timeframe: formatRelativeTime(m.occurred_at),
          description: m.summary
        }));

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
          timeline: timeline.length > 0 ? timeline : [{ timeframe: "Initial", description: "Contact added to MemoryCRM." }],
          recommendedAction: c.recommended_action || "No immediate action required."
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

      // Map commitments
      const mappedComms: Commitment[] = dbCommitments.map(c => ({
        id: c.id,
        contactId: c.contact_id,
        description: c.description,
        owner: c.owner === "contact" ? "contact" : "founder",
        dueDate: c.due_date ? c.due_date.substring(0, 10) : null,
        status: c.status === "open" ? "open" : "completed"
      }));
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
                    "Draft Follow-Up"
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
                              <span className="text-[0.7rem] uppercase tracking-wider font-semibold text-[#A36A2B] block">Why it matters</span>
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
                                <span className={`w-1.5 h-1.5 rounded-full mt-1.8 ${com.owner === "founder" ? "bg-[#A14A3A]" : "bg-[#A36A2B]"}`} />
                                <div className="flex-1 flex justify-between">
                                  <span className="font-light text-[#1D1D1B]">
                                    {com.owner === "founder" ? "Awaiting your action: " : "Awaiting contact: "}
                                    {com.description}
                                  </span>
                                  {com.dueDate && <span className="text-[#9A9287] text-[0.8rem] ml-4 shrink-0">Target: {com.dueDate}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Narrative Timeline */}
                    <div className="space-y-4">
                      <h4 className="text-[0.72rem] uppercase tracking-widest font-semibold text-[#6B655E]">Recent Activity</h4>
                      
                      <div className="relative pl-4 border-l border-[#EBE6D9] space-y-6">
                        {selectedContact.timeline.map((evt, idx) => (
                          <div key={idx} className="relative">
                            <span className="absolute -left-[20px] top-1.5 w-2 h-2 rounded-full bg-[#D5CBB5] border border-[#F8F5EF]" />
                            <div className="space-y-0.5">
                              <span className="text-[0.8rem] font-semibold text-[#A36A2B]">{evt.timeframe}</span>
                              <p className="text-[0.9rem] text-[#6B655E] font-light">{evt.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Next Action */}
                    <div className="pt-4 border-t border-[#EBE6D9] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <span className="text-[0.72rem] uppercase tracking-widest font-semibold text-[#6B655E]">Suggested action</span>
                        <p className="text-[0.9rem] text-[#1D1D1B] font-medium">
                          {selectedContact.recommendedAction || "No immediate action required."}
                        </p>
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
                    <div className="space-y-2 pt-2">
                      <h4 className="text-[0.72rem] uppercase tracking-widest font-semibold text-[#6B655E]">Supporting Context</h4>
                      <div className="flex flex-wrap gap-2 text-[0.78rem]">
                        {selectedContact.drivers.map((d, idx) => (
                          <span key={idx} className="bg-[#FCFAF6] border border-[#EBE6D9] text-[#6B655E] px-2 py-0.5 rounded">
                            Motivator: {d}
                          </span>
                        ))}
                        {selectedContact.objections.map((o, idx) => (
                          <span key={idx} className="bg-[#FCFAF6] border border-[#EBE6D9] text-[#A14A3A] px-2 py-0.5 rounded">
                            Objection: {o}
                          </span>
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
