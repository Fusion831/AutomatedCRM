"use client";

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Inbox,
  Users,
  Mail,
  RefreshCw,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  ArrowRight,
  Send,
  Trash2,
  X,
  FileText,
  User,
  AlertCircle,
  Check,
  Calendar,
  ChevronRight,
  Sliders,
  Maximize2
} from "lucide-react";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Contact {
  id: string;
  name: string;
  company: string;
  email: string;
  temperature: "Active" | "Cooling" | "Cold" | "Reviving";
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
// HIGH-FIDELITY MOCK DATABASES
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
      "+50: Overdue promise to contact (confidence >= 70%)",
      "+20: Attention state is 'Waiting on Me'",
      "Applied Relationship Tier A multiplier (x1.5)"
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
      "+30: Promise due to contact within 48 hours",
      "Applied Relationship Tier A multiplier (x1.5)"
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
    temperature: "Cooling",
    state: "waiting_on_them",
    lastInteraction: "16 days ago",
    priorityScore: 40,
    priorityReasons: [
      "+15: Active relationship with no touch for 14+ days",
      "Applied Relationship Tier B multiplier (x1.0)"
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
      "+20: High momentum relationship reviving",
      "Applied Relationship Tier A multiplier (x1.5)"
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
  // Navigation State
  const [activeTab, setActiveTab] = useState<"today" | "relationships" | "followups" | "updates">("today");

  // Core State
  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);
  const [commitments, setCommitments] = useState<Commitment[]>(INITIAL_COMMITMENTS);
  const [logs, setLogs] = useState<ProcessedLog[]>(INITIAL_LOGS);
  const [lastVisitedAt, setLastVisitedAt] = useState<string>("Yesterday, 4:30 PM");

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

  // Simulated live processing interval
  useEffect(() => {
    const timer = setTimeout(() => {
      // Add a simulated running ingestion log
      setLogs((prev) => [
        {
          id: "l4",
          type: "calendar",
          source: "Calendar Sync Service",
          timestamp: "Just now",
          status: "completed",
        },
        ...prev,
      ]);
    }, 12000);
    return () => clearTimeout(timer);
  }, []);

  // Quick Capture processing handler
  const handleQuickCaptureSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCaptureText.trim()) return;

    setIsProcessingCapture(true);

    // Simulate Consolidated Extractor execution on local stack
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
        priorityReasons: ["+30: New manual note interaction ingested", "Tier C multiplier (x0.8)"],
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
          source: "Quick Capture Note",
          timestamp: "Just now",
          status: "completed"
        },
        ...prev
      ]);

      setIsProcessingCapture(false);
      setQuickCaptureText("");
      setIsQuickCaptureOpen(false);

      // Trigger temporary success notification
      setClosureMessage("Manual note processed. Tom Henderson added to Relationships!");
      setTimeout(() => setClosureMessage(null), 4000);
    }, 2000);
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
      subject: `MemoryCRM Follow-up — ${contact.company}`,
      body: draftBody
    });
  };

  // Submit Draft (Closure mechanism)
  const handleSendDraft = () => {
    if (!activeDraft) return;

    const contactId = activeDraft.contact.id;

    // Trigger visual closure transition
    setContacts((prev) =>
      prev.map((c) => {
        if (c.id === contactId) {
          // Shifting state: waiting_on_me -> waiting_on_them
          return {
            ...c,
            state: "waiting_on_them",
            temperature: "Reviving",
            lastInteraction: "Today (Follow-up Sent)"
          };
        }
        return c;
      })
    );

    // Resolve any open founder commitments for this contact
    setCommitments((prev) =>
      prev.map((com) => {
        if (com.status === "open" && com.owner === "founder") {
          return { ...com, status: "completed" };
        }
        return com;
      })
    );

    // Trigger Closure feedback message
    setClosureMessage(`✓ Follow-up dispatched to ${activeDraft.contact.name}. State shifted to "Waiting on Them".`);
    setActiveDraft(null);

    // Fade out notification
    setTimeout(() => {
      setClosureMessage(null);
    }, 4500);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1C1B19] font-sans antialiased flex flex-col relative pb-16">
      
      {/* =========================================================================
          APPLICATION SHELL / TOP NAVIGATION
          ========================================================================= */}
      <header className="sticky top-0 z-40 bg-[#FAF9F6]/80 backdrop-blur-md border-b border-[#E2DDD3] px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#EBE8DF] border border-[#C8BFB0] flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#8C6239]" />
            </div>
            <div>
              <h1 className="font-display font-semibold text-[1.1rem] tracking-tight">MemoryCRM</h1>
              <p className="text-[0.7rem] text-[#8E877E] tracking-wider uppercase font-semibold">Relationship Memory OS</p>
            </div>
          </div>

          <nav className="flex items-center space-x-1">
            <button
              onClick={() => setActiveTab("today")}
              className={`px-4 py-1.5 rounded-md text-[0.9rem] font-medium transition-all duration-200 ${
                activeTab === "today"
                  ? "bg-[#EBE8DF] text-[#1C1B19] font-semibold"
                  : "text-[#5C5852] hover:text-[#1C1B19] hover:bg-[#F3F1EB]"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setActiveTab("relationships")}
              className={`px-4 py-1.5 rounded-md text-[0.9rem] font-medium transition-all duration-200 ${
                activeTab === "relationships"
                  ? "bg-[#EBE8DF] text-[#1C1B19] font-semibold"
                  : "text-[#5C5852] hover:text-[#1C1B19] hover:bg-[#F3F1EB]"
              }`}
            >
              Relationships
            </button>
            <button
              onClick={() => setActiveTab("followups")}
              className={`px-4 py-1.5 rounded-md text-[0.9rem] font-medium transition-all duration-200 ${
                activeTab === "followups"
                  ? "bg-[#EBE8DF] text-[#1C1B19] font-semibold"
                  : "text-[#5C5852] hover:text-[#1C1B19] hover:bg-[#F3F1EB]"
              }`}
            >
              Follow-Ups
            </button>
            <button
              onClick={() => setActiveTab("updates")}
              className={`px-4 py-1.5 rounded-md text-[0.9rem] font-medium transition-all duration-200 ${
                activeTab === "updates"
                  ? "bg-[#EBE8DF] text-[#1C1B19] font-semibold"
                  : "text-[#5C5852] hover:text-[#1C1B19] hover:bg-[#F3F1EB]"
              }`}
            >
              Updates
            </button>
          </nav>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsQuickCaptureOpen(true)}
              className="bg-[#1C1B19] hover:bg-[#2D2B28] text-[#FAF9F6] text-[0.85rem] font-medium px-3.5 py-1.8 rounded-md transition-all flex items-center space-x-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Quick Capture</span>
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================================
          CLOSURE NOTIFICATION POPUP
          ========================================================================= */}
      {closureMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-[#EBE8DF] border border-[#C8BFB0] text-[#1C1B19] px-4 py-2.5 rounded-lg shadow-lg flex items-center space-x-2 text-[0.9rem] animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle2 className="w-4.5 h-4.5 text-[#8C6239]" />
          <span className="font-medium">{closureMessage}</span>
        </div>
      )}

      {/* =========================================================================
          MAIN VIEWPONT CONTAINER
          ========================================================================= */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        
        {/* =====================================================================
            TODAY VIEW (DEFAULT LANDING SCREEN)
            ===================================================================== */}
        {activeTab === "today" && (
          <div className="space-y-12 animate-in fade-in duration-300">
            
            {/* Morning Brief Section */}
            <section className="space-y-4">
              <h2 className="font-display text-[2.2rem] font-medium tracking-tight text-[#1C1B19] leading-tight">
                Good morning, Daksh.
              </h2>
              <div className="space-y-1.5 text-[1.1rem] text-[#5C5852] font-light max-w-2xl border-l border-[#E2DDD3] pl-4">
                <p>Since your last visit ({lastVisitedAt}):</p>
                <ul className="space-y-1 mt-2 text-[#1C1B19] font-normal">
                  <li className="flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8C6239]"></span>
                    <span>2 relationships entered <span className="font-semibold text-[#8C6239]">cooling</span></span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A73F2D]"></span>
                    <span>1 commitment became <span className="font-semibold text-[#A73F2D]">overdue</span></span>
                  </li>
                  <li className="flex items-center space-x-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C5A059]"></span>
                    <span>3 follow-up recommendations were generated</span>
                  </li>
                </ul>
              </div>
            </section>

            {/* Grid Layout for Critical Attention + Recommended Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              
              {/* Left & Middle Column (2/3): Critical Attention & Feed */}
              <div className="lg:col-span-2 space-y-10">
                
                {/* Critical Attention Screen Section */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between border-b border-[#E2DDD3] pb-2">
                    <h3 className="text-[0.8rem] tracking-wider uppercase font-semibold text-[#8E877E] flex items-center space-x-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Critical Attention</span>
                    </h3>
                  </div>
                  
                  <div className="space-y-3.5">
                    {contacts.filter(c => c.state === "waiting_on_me").map(contact => (
                      <div
                        key={contact.id}
                        className="group bg-[#F3F1EB] hover:bg-[#EBE8DF]/50 border border-[#E2DDD3] rounded-xl p-5 transition-all duration-200 shadow-sm"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center space-x-2">
                              <h4 className="font-display font-medium text-[1.1rem] text-[#1C1B19] group-hover:text-[#8C6239] transition-colors">{contact.name}</h4>
                              <span className="text-[0.85rem] text-[#8E877E]">•</span>
                              <span className="text-[0.9rem] text-[#5C5852] font-medium">{contact.company}</span>
                            </div>
                            <p className="text-[0.9rem] text-[#5C5852] mt-1.5 line-clamp-1">{contact.summary}</p>
                          </div>

                          <div className="flex items-center space-x-2">
                            <span className={`text-[0.75rem] font-semibold px-2 py-0.5 rounded-full border ${
                              contact.temperature === "Active" ? "bg-[#FAF9F6] border-[#C5A059] text-[#8C6239]" :
                              contact.temperature === "Cooling" ? "bg-[#FAF9F6] border-[#E2DDD3] text-[#8E877E]" :
                              "bg-[#FAF9F6] border-[#D4AF37] text-[#D4AF37]"
                            }`}>
                              {contact.temperature}
                            </span>
                          </div>
                        </div>

                        {/* Action section inside Card */}
                        <div className="mt-4 pt-3.5 border-t border-[#E2DDD3]/60 flex items-center justify-between">
                          <span className="text-[0.85rem] text-[#8C6239] font-medium flex items-center space-x-1">
                            <span>Suggest:</span>
                            <span className="text-[#1C1B19] font-normal underline">
                              {contact.id === "rahul-sharma" ? "Send pricing proposal" : "Send projections & model"}
                            </span>
                          </span>
                          
                          <div className="flex items-center space-x-2">
                            <button 
                              onClick={() => {
                                setActiveTab("relationships");
                                setSearchQuery(contact.name);
                              }}
                              className="text-[0.8rem] font-medium text-[#5C5852] hover:text-[#1C1B19] px-2.5 py-1 rounded"
                            >
                              View Relationship
                            </button>
                            <button
                              onClick={() => handleTriggerComposer(contact)}
                              className="text-[0.8rem] font-medium bg-[#1C1B19] hover:bg-[#2D2B28] text-[#FAF9F6] px-3 py-1 rounded transition-colors flex items-center space-x-1"
                            >
                              <Mail className="w-3 h-3" />
                              <span>Draft Follow-Up</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Relationship Feed Section */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between border-b border-[#E2DDD3] pb-2">
                    <h3 className="text-[0.8rem] tracking-wider uppercase font-semibold text-[#8E877E] flex items-center space-x-1.5">
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Relationship Feed</span>
                    </h3>
                  </div>

                  <div className="bg-[#F3F1EB] border border-[#E2DDD3] rounded-xl overflow-hidden shadow-sm">
                    <div className="divide-y divide-[#E2DDD3]">
                      {contacts.map((contact) => (
                        <div
                          key={contact.id}
                          className="p-4 hover:bg-[#EBE8DF]/40 transition-all flex items-center justify-between"
                        >
                          <div className="flex items-center space-x-4">
                            <div className="w-9 h-9 rounded-full bg-[#FAF9F6] border border-[#E2DDD3] flex items-center justify-center font-display font-medium text-[0.95rem] text-[#8C6239]">
                              {contact.name.split(" ").map(n => n[0]).join("")}
                            </div>
                            <div>
                              <h4 className="font-medium text-[0.95rem]">{contact.name}</h4>
                              <p className="text-[0.8rem] text-[#8E877E]">{contact.company} • Last sync: {contact.lastInteraction}</p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-3">
                            <span className="text-[0.8rem] text-[#5C5852] capitalize">
                              {contact.state.replace(/_/g, " ")}
                            </span>
                            <div className="flex items-center space-x-1 bg-[#FAF9F6] border border-[#E2DDD3] px-2 py-0.5 rounded text-[0.8rem] font-semibold">
                              <span>Priority:</span>
                              <span className="text-[#8C6239]">{contact.priorityScore}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>

              {/* Right Column (1/3): Highlighted Action & Processing Center */}
              <div className="space-y-10">
                
                {/* Single Highlighted Recommendation Section */}
                <section className="space-y-4">
                  <h3 className="text-[0.8rem] tracking-wider uppercase font-semibold text-[#8E877E] border-b border-[#E2DDD3] pb-2 flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
                    <span>Focus Objective</span>
                  </h3>
                  
                  <div className="bg-gradient-to-br from-[#F3F1EB] to-[#EBE8DF]/50 border-2 border-[#C5A059]/40 rounded-xl p-5 shadow-sm space-y-4">
                    <div>
                      <span className="text-[0.7rem] uppercase tracking-wider font-semibold text-[#8C6239]">Highest ROI Recommendation</span>
                      <h4 className="font-display font-medium text-[1.2rem] text-[#1C1B19] mt-1.5 leading-snug">
                        Send pricing proposal to Rahul Sharma.
                      </h4>
                    </div>

                    <div className="space-y-2 text-[0.85rem] text-[#5C5852] bg-[#FAF9F6] p-3 rounded-lg border border-[#E2DDD3]/80">
                      <p className="font-semibold text-[#1C1B19]">Reasoning:</p>
                      <ul className="list-disc list-inside space-y-1 font-light">
                        <li>Requested 5 days ago in Zoom Call.</li>
                        <li>Open loop: promise outstanding on founder.</li>
                      </ul>
                    </div>

                    <div className="flex items-center space-x-2 pt-1">
                      <button
                        onClick={() => {
                          setActiveTab("relationships");
                          setSearchQuery("Rahul");
                        }}
                        className="flex-1 text-[0.85rem] font-medium border border-[#C8BFB0] hover:bg-[#EBE8DF]/40 text-[#1C1B19] py-1.5 rounded-md transition-colors"
                      >
                        View Context
                      </button>
                      <button
                        onClick={() => handleTriggerComposer(contacts[0])}
                        className="flex-1 text-[0.85rem] font-medium bg-[#1C1B19] hover:bg-[#2D2B28] text-[#FAF9F6] py-1.5 rounded-md transition-colors flex items-center justify-center space-x-1 shadow-sm"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Draft Email</span>
                      </button>
                    </div>
                  </div>
                </section>

                {/* Processing Center Section */}
                <section className="space-y-4">
                  <h3 className="text-[0.8rem] tracking-wider uppercase font-semibold text-[#8E877E] border-b border-[#E2DDD3] pb-2 flex items-center space-x-1.5">
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Processing Center</span>
                  </h3>
                  
                  <div className="bg-[#F3F1EB] border border-[#E2DDD3] rounded-xl p-4.5 space-y-4 shadow-sm">
                    {/* Active Connections */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-[#FAF9F6] border border-[#E2DDD3] p-2.5 rounded-lg text-center">
                        <span className="block text-[0.7rem] uppercase tracking-wider font-semibold text-[#8E877E]">Gmail</span>
                        <span className="inline-flex items-center mt-1 text-[0.75rem] text-[#8C6239] font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8C6239] mr-1.5"></span>
                          Connected
                        </span>
                      </div>
                      <div className="bg-[#FAF9F6] border border-[#E2DDD3] p-2.5 rounded-lg text-center">
                        <span className="block text-[0.7rem] uppercase tracking-wider font-semibold text-[#8E877E]">Zoom</span>
                        <span className="inline-flex items-center mt-1 text-[0.75rem] text-[#8C6239] font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8C6239] mr-1.5"></span>
                          Connected
                        </span>
                      </div>
                      <div className="bg-[#FAF9F6] border border-[#E2DDD3] p-2.5 rounded-lg text-center">
                        <span className="block text-[0.7rem] uppercase tracking-wider font-semibold text-[#8E877E]">Calendar</span>
                        <span className="inline-flex items-center mt-1 text-[0.75rem] text-[#8C6239] font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#8C6239] mr-1.5"></span>
                          Synced
                        </span>
                      </div>
                    </div>

                    {/* Recently Processed Log */}
                    <div className="space-y-3">
                      <span className="text-[0.75rem] font-semibold text-[#8E877E] uppercase tracking-wider block">Recently Ingested</span>
                      
                      <div className="space-y-2">
                        {logs.slice(0, 4).map((log) => (
                          <div
                            key={log.id}
                            className="bg-[#FAF9F6] border border-[#E2DDD3] rounded-lg p-2.5 flex items-center justify-between text-[0.8rem]"
                          >
                            <div className="flex items-center space-x-2">
                              {log.type === "email" && <Mail className="w-3.5 h-3.5 text-[#8C6239]" />}
                              {log.type === "zoom" && <FileText className="w-3.5 h-3.5 text-[#C5A059]" />}
                              {log.type === "slack" && <Inbox className="w-3.5 h-3.5 text-[#8C6239]" />}
                              {log.type === "calendar" && <Calendar className="w-3.5 h-3.5 text-[#C5A059]" />}
                              
                              <span className="font-medium text-[#1C1B19] truncate max-w-[120px]">
                                {log.source}
                              </span>
                            </div>
                            <span className="text-[0.75rem] text-[#8E877E]">
                              {log.timestamp}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </div>

            </div>
          </div>
        )}

        {/* =====================================================================
            RELATIONSHIPS VIEW (SEARCH-FIRST SCREEN)
            ===================================================================== */}
        {activeTab === "relationships" && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="space-y-2">
              <h2 className="font-display text-[1.8rem] font-semibold tracking-tight">Relationship Memory</h2>
              <p className="text-[#5C5852] text-[0.95rem]">Search facts, drivers, objectives, and objections across all stakeholders.</p>
            </div>

            {/* Elevated Search Bar */}
            <div className="relative max-w-2xl bg-[#F3F1EB] rounded-xl border border-[#E2DDD3] shadow-sm flex items-center px-4 py-3">
              <Search className="w-5 h-5 text-[#8E877E] mr-3" />
              <input
                type="text"
                placeholder="Search name, company, drivers ('SOC2'), objections ('migration')..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent border-none text-[#1C1B19] placeholder-[#8E877E] focus:outline-none text-[0.95rem]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="text-[#8E877E] hover:text-[#1C1B19]">
                  <X className="w-4.5 h-4.5" />
                </button>
              )}
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  <div
                    key={contact.id}
                    className="bg-[#F3F1EB] border border-[#E2DDD3] rounded-xl p-5 hover:border-[#C8BFB0] transition-all flex flex-col justify-between space-y-4 shadow-sm"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-display font-semibold text-[1.2rem] text-[#1C1B19]">{contact.name}</h3>
                          <span className="text-[#5C5852] text-[0.85rem] font-medium">{contact.company}</span>
                        </div>
                        <span className={`text-[0.75rem] font-semibold px-2 py-0.5 rounded-full border ${
                          contact.temperature === "Active" ? "bg-[#FAF9F6] border-[#C5A059] text-[#8C6239]" :
                          contact.temperature === "Cooling" ? "bg-[#FAF9F6] border-[#E2DDD3] text-[#8E877E]" :
                          "bg-[#FAF9F6] border-[#D4AF37] text-[#D4AF37]"
                        }`}>
                          {contact.temperature}
                        </span>
                      </div>

                      <div className="mt-3.5 space-y-2">
                        <p className="text-[0.85rem] text-[#5C5852] font-medium italic">"{contact.summary}"</p>
                        <p className="text-[0.85rem] text-[#5C5852] leading-relaxed line-clamp-2">
                          <span className="font-semibold text-[#1C1B19]">Thesis: </span>
                          {contact.thesis}
                        </p>
                      </div>

                      {/* Drivers / Objections tags */}
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {contact.drivers.map((d, idx) => (
                          <span key={idx} className="bg-[#FAF9F6] border border-[#E2DDD3] text-[#5C5852] text-[0.75rem] px-2 py-0.5 rounded">
                            {d}
                          </span>
                        ))}
                        {contact.objections.map((o, idx) => (
                          <span key={idx} className="bg-[#FAF9F6] border border-[#A73F2D]/20 text-[#A73F2D] text-[0.75rem] px-2 py-0.5 rounded">
                            Concern: {o}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-[#E2DDD3] flex items-center justify-between">
                      <span className="text-[0.8rem] text-[#8E877E]">Last contact: {contact.lastInteraction}</span>
                      <button
                        onClick={() => handleTriggerComposer(contact)}
                        className="text-[0.8rem] font-semibold bg-[#1C1B19] hover:bg-[#2D2B28] text-[#FAF9F6] px-3.5 py-1.5 rounded-md transition-all flex items-center space-x-1.5"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>Draft Follow-Up</span>
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* =====================================================================
            FOLLOW-UPS VIEW (ACTIVE COMMPOSE TEMPLATE SCREEN)
            ===================================================================== */}
        {activeTab === "followups" && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="space-y-2">
              <h2 className="font-display text-[1.8rem] font-semibold tracking-tight">Active Follow-Up Queue</h2>
              <p className="text-[#5C5852] text-[0.95rem]">Outstanding commitments and generated emails needing review.</p>
            </div>

            <div className="bg-[#F3F1EB] border border-[#E2DDD3] rounded-xl p-6 shadow-sm max-w-4xl space-y-6">
              {commitments.filter(c => c.status === "open").length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-[#8C6239] mx-auto" />
                  <h3 className="font-medium text-[#1C1B19]">No pending commitments!</h3>
                  <p className="text-[#8E877E] text-[0.85rem]">All loops are successfully closed.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#E2DDD3] space-y-4">
                  {contacts.map((contact) => {
                    const contactComms = commitments.filter(c => c.status === "open");
                    if (contactComms.length === 0) return null;

                    return (
                      <div key={contact.id} className="pt-4 first:pt-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-[1.05rem]">{contact.name}</span>
                            <span className="text-[0.8rem] text-[#8E877E]">{contact.company}</span>
                          </div>
                          
                          <div className="mt-2 space-y-1.5">
                            {contactComms.map((com) => (
                              <div key={com.id} className="flex items-start space-x-2 text-[0.88rem] text-[#5C5852]">
                                <Clock className="w-4 h-4 text-[#8C6239] mt-0.5 shrink-0" />
                                <span>{com.description} {com.dueDate && `(Due ${com.dueDate})`}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <button
                            onClick={() => handleTriggerComposer(contact)}
                            className="bg-[#1C1B19] hover:bg-[#2D2B28] text-[#FAF9F6] text-[0.85rem] font-medium px-4 py-2 rounded-md transition-all flex items-center space-x-1.5 shadow-sm"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Draft Follow-Up</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            UPDATES VIEW (SYSTEM AUDIT LOG)
            ===================================================================== */}
        {activeTab === "updates" && (
          <div className="space-y-8 animate-in fade-in duration-300 max-w-3xl">
            <div className="space-y-2">
              <h2 className="font-display text-[1.8rem] font-semibold tracking-tight">System Updates</h2>
              <p className="text-[#5C5852] text-[0.95rem]">Audit trail logs of decisions, facts, and milestones processed by MemoryCRM.</p>
            </div>

            <div className="space-y-4">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="bg-[#F3F1EB] border border-[#E2DDD3] rounded-xl p-4.5 flex items-start space-x-3.5 hover:border-[#C8BFB0] transition-all"
                >
                  <div className="w-8 h-8 rounded-full bg-[#FAF9F6] border border-[#E2DDD3] flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4.5 h-4.5 text-[#8C6239]" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-[0.95rem]">
                        {log.type === "email" ? "Email interaction ingested" :
                         log.type === "zoom" ? "Meeting transcript parsed" :
                         log.type === "slack" ? "Slack thread analyzed" : "Calendar synced"}
                      </span>
                      <span className="text-[0.8rem] text-[#8E877E]">• {log.timestamp}</span>
                    </div>
                    <p className="text-[0.88rem] text-[#5C5852] font-light">
                      Successfully reconciled facts and updated relationship state for <span className="font-medium text-[#1C1B19]">{log.source}</span>.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      {/* =========================================================================
          BOTTOM-RIGHT SLIDE-UP EMAIL COMPOSER
          ========================================================================= */}
      {activeDraft && (
        <div className="fixed bottom-0 right-6 z-50 w-full max-w-lg bg-[#FAF9F6] border border-[#C8BFB0] rounded-t-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">
          {/* Header */}
          <div className="bg-[#EBE8DF] border-b border-[#C8BFB0] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Mail className="w-4 h-4 text-[#8C6239]" />
              <span className="font-display font-medium text-[0.92rem]">Drafting Follow-up to {activeDraft.contact.name}</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <button className="text-[#8E877E] hover:text-[#1C1B19] p-0.5 rounded">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setActiveDraft(null)}
                className="text-[#8E877E] hover:text-[#1C1B19] p-0.5 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Form */}
          <div className="p-4 space-y-3.5">
            <div className="flex items-center justify-between text-[0.85rem] pb-2 border-b border-[#E2DDD3]">
              <span className="text-[#8E877E]">To:</span>
              <span className="font-medium text-[#1C1B19]">{activeDraft.contact.email}</span>
            </div>
            <div className="flex items-center justify-between text-[0.85rem] pb-2 border-b border-[#E2DDD3]">
              <span className="text-[#8E877E]">Subject:</span>
              <input
                type="text"
                value={activeDraft.subject}
                onChange={(e) => setActiveDraft({ ...activeDraft, subject: e.target.value })}
                className="font-medium text-[#1C1B19] w-full text-right bg-transparent focus:outline-none"
              />
            </div>

            <textarea
              rows={8}
              value={activeDraft.body}
              onChange={(e) => setActiveDraft({ ...activeDraft, body: e.target.value })}
              className="w-full bg-[#F3F1EB]/50 border border-[#E2DDD3] rounded-lg p-3 text-[0.9rem] text-[#1C1B19] focus:outline-none font-sans leading-relaxed resize-none"
            />

            {/* Context Helper box */}
            <div className="bg-[#F3F1EB] rounded-lg p-3 border border-[#E2DDD3] text-[0.8rem] space-y-1.5">
              <span className="font-semibold text-[#8C6239] uppercase tracking-wider block">Context Panel Reference</span>
              <p className="text-[#5C5852]">
                <span className="font-medium text-[#1C1B19]">Thesis: </span>
                {activeDraft.contact.thesis}
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {activeDraft.contact.drivers.map((d, idx) => (
                  <span key={idx} className="bg-[#FAF9F6] text-[#8E877E] border border-[#E2DDD3] px-1.5 py-0.2 rounded text-[0.75rem]">
                    {d}
                  </span>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setActiveDraft(null)}
                className="text-[0.85rem] font-medium text-[#5C5852] hover:text-[#1C1B19] py-1.5"
              >
                Discard Draft
              </button>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    // Quick regeneration simulation
                    setActiveDraft({
                      ...activeDraft,
                      body: `Hi ${activeDraft.contact.name.split(" ")[0]},\n\nReaching out relative to our conversation yesterday. Just wanted to follow up and see if you had any thoughts. Let's touch base next week.\n\nBest,\nDaksh`
                    });
                  }}
                  className="text-[0.82rem] font-medium text-[#8C6239] hover:underline px-3 py-1.5"
                >
                  Regenerate
                </button>
                <button
                  onClick={handleSendDraft}
                  className="bg-[#1C1B19] hover:bg-[#2D2B28] text-[#FAF9F6] text-[0.85rem] font-semibold px-4.5 py-2 rounded-md shadow-sm flex items-center space-x-1.5 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send via Gmail</span>
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
          {/* Backdrop */}
          <div
            onClick={() => setIsQuickCaptureOpen(false)}
            className="absolute inset-0 bg-[#1C1B19]/20 backdrop-blur-xs transition-opacity"
          />

          {/* Drawer container */}
          <div className="relative w-full max-w-md h-full bg-[#FAF9F6] border-l border-[#C8BFB0] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="px-6 py-5 border-b border-[#E2DDD3] flex items-center justify-between bg-[#EBE8DF]/50">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4.5 h-4.5 text-[#8C6239]" />
                <h3 className="font-display font-semibold text-[1.1rem]">Quick Capture</h3>
              </div>
              <button
                onClick={() => setIsQuickCaptureOpen(false)}
                className="text-[#8E877E] hover:text-[#1C1B19] p-0.5 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleQuickCaptureSubmit} className="flex-grow flex flex-col p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[0.8rem] font-semibold uppercase tracking-wider text-[#8E877E]">
                  Pasted Conversation Context
                </label>
                <p className="text-[0.85rem] text-[#5C5852] font-light leading-relaxed">
                  Paste emails, Slack conversations, or type manual coffee notes. The Lemma Consolidated Extractor parses facts in the background.
                </p>
              </div>

              <textarea
                value={quickCaptureText}
                onChange={(e) => setQuickCaptureText(e.target.value)}
                placeholder="Met Tom Henderson for coffee at Blue Bottle. He mentioned he recently moved from NY to SF and is focusing on developer tooling..."
                rows={12}
                required
                disabled={isProcessingCapture}
                className="w-full bg-[#F3F1EB] border border-[#E2DDD3] rounded-xl p-4 text-[0.9rem] text-[#1C1B19] focus:outline-none font-sans leading-relaxed resize-none flex-grow"
              />

              <div className="flex items-center justify-end space-x-2 pt-4">
                <button
                  type="button"
                  onClick={() => setIsQuickCaptureOpen(false)}
                  disabled={isProcessingCapture}
                  className="text-[0.85rem] font-medium text-[#5C5852] hover:text-[#1C1B19] px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingCapture || !quickCaptureText.trim()}
                  className="bg-[#1C1B19] hover:bg-[#2D2B28] disabled:bg-[#8E877E] text-[#FAF9F6] text-[0.85rem] font-semibold px-4.5 py-2 rounded-md shadow-sm flex items-center space-x-1.5 transition-colors"
                >
                  {isProcessingCapture ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Ingesting Context...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Process Note</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
