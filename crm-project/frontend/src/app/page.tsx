"use client";

import React, { useState, useEffect } from "react";
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

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Contact {
  id: string;
  name: string;
  company: string;
  email: string;
  temperature: "Active" | "Cooling down" | "Cold" | "Reviving";
  state: string; // waiting_on_me, waiting_on_them, mutual_exploration
  lastInteraction: string;
  priorityScore: number;
  priorityReasons: string[];
  summary: string;
  thesis: string;
  drivers: string[];
  objections: string[];
}

interface Commitment {
  id: string;
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

// ============================================================================
// HIGH-FIDELITY MOCK DATABASES (REWRITTEN WITH HUMAN COPY)
// ============================================================================

const INITIAL_CONTACTS: Contact[] = [
  {
    id: "rahul-sharma",
    name: "Rahul Sharma",
    company: "Acme Corp",
    email: "rahul@acmecorp.com",
    temperature: "Active",
    state: "waiting_on_me",
    lastInteraction: "Tuesday, 2:15 PM",
    priorityScore: 85,
    priorityReasons: [
      "Overdue promise to send the pricing deck.",
      "Awaiting your reply."
    ],
    summary: "VP Engineering. Evaluating observability tool integration to replace Datadog.",
    thesis: "Rahul is a highly technical decision-maker focused on migration overhead. Latency validation cleared initial objection; waiting on pricing proposal.",
    drivers: ["Latency under 2ms", "SOC2 compliance", "Developer ergonomics"],
    objections: ["Migration complexity", "Datadog transition overlap cost"]
  },
  {
    id: "sarah-jenkins",
    name: "Sarah Jenkins",
    company: "NextGen AI",
    email: "sarah@nextgen.ai",
    temperature: "Active",
    state: "waiting_on_me",
    lastInteraction: "Yesterday, 11:30 AM",
    priorityScore: 78,
    priorityReasons: [
      "Promise due to send financial models and projections."
    ],
    summary: "CEO & Founder. Seeking technical advisory and lead investment round.",
    thesis: "Sarah has a strong NLP track record. High conviction on product velocity; waiting to send financial model and CAC projections.",
    drivers: ["Rapid fundraising roadmap", "GTM scalability", "Advisory support"],
    objections: ["Customer Acquisition Cost margins"]
  },
  {
    id: "marcus-aurelius",
    name: "Marcus Aurelius",
    company: "Rome Ventures",
    email: "marcus@romeventures.vc",
    temperature: "Cooling down",
    state: "waiting_on_them",
    lastInteraction: "16 days ago",
    priorityScore: 40,
    priorityReasons: [
      "Active relationship with no touch for 14+ days."
    ],
    summary: "Managing Partner. Focuses on developer tools and Series A growth rounds.",
    thesis: "Marcus is conservative on team expansion pace. Shared Head of Sales job description to warm relationship for upcoming Series A.",
    drivers: ["Developer community growth", "Sales pipeline velocity"],
    objections: ["GTM execution speed"]
  },
  {
    id: "elena-rostova",
    name: "Elena Rostova",
    company: "SecureAuth",
    email: "elena@secureauth.io",
    temperature: "Reviving",
    state: "waiting_on_them",
    lastInteraction: "3 days ago",
    priorityScore: 65,
    priorityReasons: [
      "High momentum relationship. Awaiting security review."
    ],
    summary: "Director of Security. Validating identity sync architectures.",
    thesis: "Elena represents a strategic enterprise partner. Demo went exceptionally well. Awaiting introduction to VP of Infrastructure.",
    drivers: ["AES-256 rest encryption", "SAML token security"],
    objections: ["SAML raw metadata token storage"]
  }
];

const INITIAL_COMMITMENTS: Commitment[] = [
  {
    id: "c1",
    description: "Send detailed financial model and CAC projections",
    owner: "founder",
    dueDate: "2026-07-03",
    status: "open"
  },
  {
    id: "c2",
    description: "Review security token documentation",
    owner: "contact",
    dueDate: null,
    status: "open"
  }
];

const INITIAL_LOGS: ProcessedLog[] = [
  {
    id: "l1",
    type: "email",
    source: "Elena Rostova (SecureAuth)",
    timestamp: "Today, 8:22 AM",
    status: "completed"
  },
  {
    id: "l2",
    type: "slack",
    source: "Marcus Aurelius (Rome Ventures)",
    timestamp: "Yesterday, 4:08 PM",
    status: "completed"
  },
  {
    id: "l3",
    type: "zoom",
    source: "Rahul Sharma (Acme Corp)",
    timestamp: "Yesterday, 3:15 PM",
    status: "completed"
  }
];

export default function Page() {
  // Navigation State (Editorial tabs)
  const [activeTab, setActiveTab] = useState<"today" | "people" | "inbox">("today");

  // Core State
  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);
  const [commitments, setCommitments] = useState<Commitment[]>(INITIAL_COMMITMENTS);
  const [logs, setLogs] = useState<ProcessedLog[]>(INITIAL_LOGS);
  const [lastVisitedAt, setLastVisitedAt] = useState<string>("yesterday at 4:30 PM");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Quick Capture State
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [quickCaptureText, setQuickCaptureText] = useState("");
  const [isProcessingCapture, setIsProcessingCapture] = useState(false);

  // Follow-Up Composer State
  const [activeDraft, setActiveDraft] = useState<{
    contact: Contact;
    subject: string;
    body: string;
  } | null>(null);
  const [closureMessage, setClosureMessage] = useState<string | null>(null);

  // Quick Capture submission
  const handleQuickCaptureSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCaptureText.trim()) return;

    setIsProcessingCapture(true);

    setTimeout(() => {
      const newContact: Contact = {
        id: "tom-henderson",
        name: "Tom Henderson",
        company: "Cascade Ventures",
        email: "tom@cascade.vc",
        temperature: "Active",
        state: "mutual_exploration",
        lastInteraction: "Just now",
        priorityScore: 50,
        priorityReasons: ["Casual coffee notes parsed."],
        summary: "Investment Associate. Met at Blue Bottle Coffee for relationship building.",
        thesis: "Tom recently moved from NY to SF. Focuses on dev tools. Casually staying in touch.",
        drivers: ["Developer tools", "Database infrastructure"],
        objections: ["No immediate deals in timeline"]
      };

      setContacts((prev) => [newContact, ...prev]);
      setLogs((prev) => [
        {
          id: `l-capture-${Date.now()}`,
          type: "zoom",
          source: "Pasted note",
          timestamp: "Just now",
          status: "completed"
        },
        ...prev
      ]);

      setIsProcessingCapture(false);
      setQuickCaptureText("");
      setIsQuickCaptureOpen(false);

      setClosureMessage("✓ Note parsed. Tom Henderson added to your relationships.");
      setTimeout(() => setClosureMessage(null), 4000);
    }, 1500);
  };

  // Compose Trigger
  const handleTriggerComposer = (contact: Contact) => {
    let draftBody = "";
    if (contact.id === "rahul-sharma") {
      draftBody = `Hi Rahul,\n\nGreat speaking yesterday. I wanted to follow up with the pricing proposal we discussed for Acme Corp's integration.\n\nLet me know if this works and if we're good to schedule the pilot deep-dive.\n\nBest,\nDaksh`;
    } else if (contact.id === "sarah-jenkins") {
      draftBody = `Hi Sarah,\n\nFollowing up on our sync. Attached are the detailed financial model and CAC projections for NextGen AI.\n\nLooking forward to aligning on next steps.\n\nBest,\nDaksh`;
    } else {
      draftBody = `Hi ${contact.name.split(" ")[0]},\n\nCassual follow up on our previous conversation. Let me know when you're free for a quick catch up.\n\nBest,\nDaksh`;
    }

    setActiveDraft({
      contact,
      subject: `Follow up — ${contact.company}`,
      body: draftBody
    });
  };

  // Send Draft (Closure feedback loop)
  const handleSendDraft = () => {
    if (!activeDraft) return;

    const contactId = activeDraft.contact.id;

    // Shifting state and updating temperature
    setContacts((prev) =>
      prev.map((c) => {
        if (c.id === contactId) {
          return {
            ...c,
            state: "waiting_on_them",
            temperature: "Reviving",
            lastInteraction: "Today (Follow-up sent)"
          };
        }
        return c;
      })
    );

    // Mark outstanding founder commitments resolved
    setCommitments((prev) =>
      prev.map((com) => {
        if (com.status === "open" && com.owner === "founder") {
          return { ...com, status: "completed" };
        }
        return com;
      })
    );

    setClosureMessage(`✓ Email dispatched. Rahul's status updated.`);
    setActiveDraft(null);

    setTimeout(() => {
      setClosureMessage(null);
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1C1B19] font-sans antialiased flex flex-col relative pb-24">
      
      {/* =========================================================================
          APPLICATION SHELL / TOP NAVIGATION (REFINED)
          ========================================================================= */}
      <header className="sticky top-0 z-40 bg-[#FAF9F6]/95 backdrop-blur-xs px-8 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between border-b border-[#E2DDD3]/40 pb-4">
          <div className="flex items-baseline space-x-2">
            <span className="font-display font-medium text-[1.05rem] tracking-tight">MemoryCRM</span>
            <span className="text-[0.78rem] text-[#8E877E] font-light">for your relationships</span>
          </div>

          <nav className="flex items-center space-x-6">
            <button
              onClick={() => setActiveTab("today")}
              className={`text-[0.9rem] transition-colors relative py-1 ${
                activeTab === "today"
                  ? "text-[#1C1B19] font-medium border-b border-[#1C1B19]"
                  : "text-[#8E877E] hover:text-[#1C1B19]"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setActiveTab("people")}
              className={`text-[0.9rem] transition-colors relative py-1 ${
                activeTab === "people"
                  ? "text-[#1C1B19] font-medium border-b border-[#1C1B19]"
                  : "text-[#8E877E] hover:text-[#1C1B19]"
              }`}
            >
              People
            </button>
            <button
              onClick={() => setActiveTab("inbox")}
              className={`text-[0.9rem] transition-colors relative py-1 ${
                activeTab === "inbox"
                  ? "text-[#1C1B19] font-medium border-b border-[#1C1B19]"
                  : "text-[#8E877E] hover:text-[#1C1B19]"
              }`}
            >
              Inbox
            </button>
          </nav>

          <button
            onClick={() => setIsQuickCaptureOpen(true)}
            className="text-[#8C6239] hover:text-[#1C1B19] text-[0.88rem] font-medium transition-colors flex items-center space-x-1"
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
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-[#F3F1EB] border border-[#C8BFB0] text-[#1C1B19] px-4 py-2.5 rounded-lg shadow-sm flex items-center space-x-2 text-[0.88rem] animate-in fade-in slide-in-from-top-2 duration-200">
          <Check className="w-4 h-4 text-[#8C6239]" />
          <span>{closureMessage}</span>
        </div>
      )}

      {/* =========================================================================
          MAIN PORT (RESTRUCTURED AND CLEAN)
          ========================================================================= */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-8 py-10">
        
        {/* =====================================================================
            TODAY VIEW (EDITORIAL MORNING BRIEFING)
            ===================================================================== */}
        {activeTab === "today" && (
          <div className="space-y-16 animate-in fade-in duration-200">
            
            {/* Morning Briefing Section */}
            <section className="space-y-6">
              <h2 className="font-display text-[2.6rem] font-medium tracking-tight text-[#1C1B19] leading-tight">
                Good morning, Daksh.
              </h2>
              <div className="space-y-2 text-[1.1rem] text-[#5C5852] font-light max-w-2xl">
                <p>Since you checked in yesterday:</p>
                <div className="space-y-1 pl-4 border-l border-[#E2DDD3] mt-3">
                  <p className="flex items-center space-x-2 text-[#1C1B19]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8C6239]" />
                    <span>2 relationships are <span className="text-[#8C6239] font-medium">cooling down</span></span>
                  </p>
                  <p className="flex items-center space-x-2 text-[#1C1B19]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8C6239]" />
                    <span>1 commitment became <span className="text-[#8C6239] font-medium">overdue</span></span>
                  </p>
                  <p className="flex items-center space-x-2 text-[#1C1B19]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8C6239]" />
                    <span>3 new actions have been suggested</span>
                  </p>
                </div>
              </div>
            </section>

            {/* Split layout: Needs Attention (Left) and Your Next Step (Right) */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-12 items-start">
              
              {/* Needs Attention Column (3/5) - Borderless rows */}
              <div className="md:col-span-3 space-y-8">
                <div className="border-b border-[#E2DDD3]/40 pb-2">
                  <h3 className="text-[0.78rem] tracking-wider uppercase font-semibold text-[#8E877E]">
                    Needs Attention
                  </h3>
                </div>

                <div className="space-y-8">
                  {contacts.filter(c => c.state === "waiting_on_me").map(contact => (
                    <div key={contact.id} className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <div className="flex items-baseline space-x-2">
                          <h4 className="font-display font-medium text-[1.15rem] text-[#1C1B19]">{contact.name}</h4>
                          <span className="text-[0.8rem] text-[#8E877E]">{contact.company}</span>
                        </div>
                        <span className="text-[0.75rem] text-[#8C6239] font-medium bg-[#F3F1EB] px-2 py-0.5 rounded">
                          {contact.temperature}
                        </span>
                      </div>

                      <p className="text-[0.92rem] text-[#5C5852] leading-relaxed font-light">
                        {contact.summary}
                      </p>

                      <div className="flex items-center space-x-4 pt-1 text-[0.82rem]">
                        <span className="text-[#8E877E]">Suggested action:</span>
                        <button
                          onClick={() => handleTriggerComposer(contact)}
                          className="text-[#8C6239] hover:text-[#1C1B19] font-medium underline underline-offset-2 transition-all"
                        >
                          Draft Follow-Up
                        </button>
                        <span className="text-[#E2DDD3]">•</span>
                        <button 
                          onClick={() => {
                            setActiveTab("people");
                            setSearchQuery(contact.name);
                          }}
                          className="text-[#8E877E] hover:text-[#1C1B19]"
                        >
                          View History
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Your Next Step Column (2/5) - Highlights action borderless */}
              <div className="md:col-span-2 space-y-6">
                <div className="border-b border-[#E2DDD3]/40 pb-2">
                  <h3 className="text-[0.78rem] tracking-wider uppercase font-semibold text-[#8E877E]">
                    Your Next Step
                  </h3>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <span className="text-[0.7rem] uppercase tracking-wider font-semibold text-[#8C6239] block">Immediate priority</span>
                    <h4 className="font-display font-medium text-[1.3rem] text-[#1C1B19] leading-snug">
                      Send pricing proposal to Rahul Sharma.
                    </h4>
                  </div>

                  <p className="text-[0.88rem] text-[#5C5852] leading-relaxed font-light">
                    Rahul requested this during your Zoom call 5 days ago. You promised to send the pricing deck by Friday.
                  </p>

                  <button
                    onClick={() => handleTriggerComposer(contacts[0])}
                    className="w-full bg-[#1C1B19] hover:bg-[#2D2B28] text-[#FAF9F6] text-[0.85rem] font-semibold py-2 rounded-md transition-colors flex items-center justify-center space-x-2"
                  >
                    <Mail className="w-4.5 h-4.5" />
                    <span>Draft Email</span>
                  </button>
                </div>
              </div>

            </div>

            {/* Sync & Activity Logs (Passive layout at bottom) */}
            <section className="pt-10 border-t border-[#E2DDD3]/40 space-y-4 text-[0.85rem] text-[#5C5852]">
              <div className="flex items-center justify-between text-[#8E877E] font-medium text-[0.78rem] uppercase tracking-wider">
                <span>Sync Status</span>
                <span>Google & Zoom Synced</span>
              </div>
              <div className="space-y-2">
                {logs.slice(0, 3).map((log) => (
                  <p key={log.id} className="flex justify-between items-baseline font-light">
                    <span>✓ Processed {log.type} transcript with {log.source}</span>
                    <span className="text-[#8E877E] text-[0.8rem]">{log.timestamp}</span>
                  </p>
                ))}
              </div>
            </section>

          </div>
        )}

        {/* =====================================================================
            PEOPLE VIEW (STORY-DRIVEN RELATIONSHIPS LIST)
            ===================================================================== */}
        {activeTab === "people" && (
          <div className="space-y-10 animate-in fade-in duration-200">
            <div className="space-y-1">
              <h2 className="font-display text-[1.8rem] font-semibold tracking-tight">People</h2>
              <p className="text-[#5C5852] text-[0.9rem] font-light">Explore relationship history, objectives, and concerns.</p>
            </div>

            {/* Minimal Search Bar */}
            <div className="flex items-center border-b border-[#E2DDD3] py-2 max-w-lg">
              <Search className="w-4.5 h-4.5 text-[#8E877E] mr-3" />
              <input
                type="text"
                placeholder="Search names, drivers ('latency'), objections ('SOC2')..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none text-[#1C1B19] placeholder-[#8E877E] focus:outline-none text-[0.95rem] font-light"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-[#8E877E]">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Dossier listing (no boxes, clean story format) */}
            <div className="space-y-12">
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
                  <div key={contact.id} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
                    {/* Header info */}
                    <div className="md:col-span-2 space-y-1">
                      <h3 className="font-display font-medium text-[1.25rem] text-[#1C1B19]">{contact.name}</h3>
                      <p className="text-[#5C5852] text-[0.88rem]">{contact.company} • {contact.temperature}</p>
                      
                      <button
                        onClick={() => handleTriggerComposer(contact)}
                        className="text-[0.82rem] font-semibold text-[#8C6239] hover:underline pt-2 block"
                      >
                        Draft Follow-Up
                      </button>
                    </div>

                    {/* Bio context */}
                    <div className="md:col-span-3 space-y-3">
                      <p className="text-[0.92rem] text-[#1C1B19] font-normal leading-relaxed">
                        {contact.summary}
                      </p>
                      <p className="text-[0.88rem] text-[#5C5852] leading-relaxed font-light">
                        <span className="font-medium text-[#1C1B19]">Thesis: </span>
                        {contact.thesis}
                      </p>

                      <div className="flex flex-wrap gap-2 pt-1 text-[0.78rem]">
                        {contact.drivers.map((d, i) => (
                          <span key={i} className="text-[#8E877E] bg-[#F3F1EB] px-2 py-0.5 rounded">
                            {d}
                          </span>
                        ))}
                        {contact.objections.map((o, i) => (
                          <span key={i} className="text-[#A73F2D] bg-[#F3F1EB] px-2 py-0.5 rounded">
                            Concern: {o}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* =====================================================================
            INBOX VIEW (PENDING ACTION LIST)
            ===================================================================== */}
        {activeTab === "inbox" && (
          <div className="space-y-10 animate-in fade-in duration-200">
            <div className="space-y-1">
              <h2 className="font-display text-[1.8rem] font-semibold tracking-tight">Inbox</h2>
              <p className="text-[#5C5852] text-[0.9rem] font-light">Awaiting follow-up drafts and tasks to close loops.</p>
            </div>

            <div className="space-y-8 max-w-2xl">
              {commitments.filter(c => c.status === "open").length === 0 ? (
                <p className="text-[#8E877E] text-[0.9rem] font-light py-8">Your inbox is empty. All commitments are resolved.</p>
              ) : (
                contacts.map((contact) => {
                  const contactComms = commitments.filter(c => c.status === "open");
                  if (contactComms.length === 0) return null;

                  return (
                    <div key={contact.id} className="flex justify-between items-start border-b border-[#E2DDD3]/40 pb-6 last:border-0">
                      <div className="space-y-1.5">
                        <span className="font-medium text-[1.05rem]">{contact.name}</span>
                        <span className="text-[0.8rem] text-[#8E877E] ml-2">{contact.company}</span>
                        <div className="space-y-1">
                          {contactComms.map((com) => (
                            <p key={com.id} className="text-[0.9rem] text-[#5C5852] font-light">
                              • {com.description} {com.dueDate && `(Due ${com.dueDate})`}
                            </p>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => handleTriggerComposer(contact)}
                        className="text-[0.82rem] font-semibold text-[#8C6239] hover:underline"
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

      </main>

      {/* =========================================================================
          BOTTOM-RIGHT SLIDE-UP EMAIL COMPOSER (REFINED INTERACTION)
          ========================================================================= */}
      {activeDraft && (
        <div className="fixed bottom-0 right-8 z-50 w-full max-w-md bg-[#FAF9F6] border border-[#C8BFB0] rounded-t-xl shadow-lg overflow-hidden animate-in slide-in-from-bottom duration-250">
          {/* Header */}
          <div className="bg-[#EBE8DF] border-b border-[#C8BFB0] px-4 py-3 flex items-center justify-between">
            <span className="font-display font-medium text-[0.9rem]">Email Draft</span>
            <button
              onClick={() => setActiveDraft(null)}
              className="text-[#8E877E] hover:text-[#1C1B19]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <div className="p-5 space-y-4">
            <div className="flex items-center text-[0.85rem] pb-2 border-b border-[#E2DDD3]/50">
              <span className="text-[#8E877E] w-12">To:</span>
              <span className="font-medium text-[#1C1B19]">{activeDraft.contact.email}</span>
            </div>
            
            <div className="flex items-center text-[0.85rem] pb-2 border-b border-[#E2DDD3]/50">
              <span className="text-[#8E877E] w-12">Subject:</span>
              <input
                type="text"
                value={activeDraft.subject}
                onChange={(e) => setActiveDraft({ ...activeDraft, subject: e.target.value })}
                className="font-medium text-[#1C1B19] w-full bg-transparent"
              />
            </div>

            <textarea
              rows={8}
              value={activeDraft.body}
              onChange={(e) => setActiveDraft({ ...activeDraft, body: e.target.value })}
              className="w-full bg-[#F3F1EB]/30 border border-[#E2DDD3] rounded-lg p-3 text-[0.9rem] text-[#1C1B19] leading-relaxed resize-none"
            />

            {/* Helper box (Refined copywriting: Before you send) */}
            <div className="bg-[#F3F1EB] rounded-lg p-3 text-[0.8rem] space-y-1">
              <span className="font-semibold text-[#8C6239] block uppercase tracking-wider text-[0.7rem]">Before You Send</span>
              <p className="text-[#5C5852] font-light">
                {activeDraft.contact.thesis}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => {
                  // Simulate CASUAL rewrite
                  setActiveDraft({
                    ...activeDraft,
                    body: `Hi ${activeDraft.contact.name.split(" ")[0]},\n\nCassual follow up on our previous conversation. Let me know when you're free for a quick catch up.\n\nBest,\nDaksh`
                  });
                }}
                className="text-[0.82rem] text-[#8C6239] hover:underline"
              >
                Make Casual
              </button>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setActiveDraft(null)}
                  className="text-[0.85rem] text-[#8E877E] hover:text-[#1C1B19]"
                >
                  Discard
                </button>
                <button
                  onClick={handleSendDraft}
                  className="bg-[#1C1B19] hover:bg-[#2D2B28] text-[#FAF9F6] text-[0.85rem] font-semibold px-4.5 py-1.8 rounded shadow-sm"
                >
                  Send via Gmail
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          QUICK CAPTURE SLIDE-OVER DRAWER (REFINED)
          ========================================================================= */}
      {isQuickCaptureOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            onClick={() => setIsQuickCaptureOpen(false)}
            className="absolute inset-0 bg-[#1C1B19]/10 backdrop-blur-xs"
          />

          <div className="relative w-full max-w-md h-full bg-[#FAF9F6] border-l border-[#C8BFB0] shadow-xl flex flex-col animate-in slide-in-from-right duration-250">
            <div className="px-6 py-5 border-b border-[#E2DDD3]/50 flex items-center justify-between bg-[#EBE8DF]/30">
              <h3 className="font-display font-semibold text-[1.1rem]">Add Conversation</h3>
              <button onClick={() => setIsQuickCaptureOpen(false)}>
                <X className="w-5 h-5 text-[#8E877E]" />
              </button>
            </div>

            <form onSubmit={handleQuickCaptureSubmit} className="flex-grow flex flex-col p-6 space-y-4">
              <p className="text-[0.85rem] text-[#5C5852] font-light leading-relaxed">
                Paste meeting transcripts, email logs, or manual coffee notes. The assistant will parse context and extract milestones.
              </p>

              <textarea
                value={quickCaptureText}
                onChange={(e) => setQuickCaptureText(e.target.value)}
                placeholder="Met Tom Henderson for coffee at Blue Bottle. He mentioned he recently moved from NY to SF and is focusing on developer tooling..."
                rows={12}
                required
                disabled={isProcessingCapture}
                className="w-full bg-[#F3F1EB]/50 border border-[#E2DDD3] rounded-lg p-4 text-[0.9rem] leading-relaxed resize-none flex-grow"
              />

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-[#E2DDD3]/40">
                <button
                  type="button"
                  onClick={() => setIsQuickCaptureOpen(false)}
                  disabled={isProcessingCapture}
                  className="text-[0.85rem] text-[#8E877E]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingCapture || !quickCaptureText.trim()}
                  className="bg-[#1C1B19] hover:bg-[#2D2B28] disabled:bg-[#8E877E] text-[#FAF9F6] text-[0.85rem] font-semibold px-4.5 py-1.8 rounded"
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
