import React, { useState } from 'react';
import { 
  Sparkles, 
  User, 
  Briefcase, 
  AlertTriangle, 
  CheckCircle, 
  Eye, 
  Trash2, 
  Clock, 
  Calendar, 
  TrendingUp, 
  MessageSquare, 
  Layers, 
  CheckSquare, 
  ChevronDown,
  ChevronUp,
  Database
} from 'lucide-react';

// ==========================================
// DEMO DATA (5 Scenarios + Loading + Empty)
// ==========================================

interface ContactMemory {
  id: string;
  name: string;
  company: string;
  relationship_state: 'mutual_exploration' | 'waiting_on_me' | 'waiting_on_them' | 'on_hold';
  priority_score: number;
  priority_reasons: string[];
  who_are_they: string;
  why_talking: string;
  key_drivers: string[];
  objections: string[];
  thesis: string;
  current_status: string;
  recommended_next_action: string;
}

interface Milestone {
  id: string;
  summary: string;
  milestone_type: string;
  importance_score: number;
  evidence_quote: string;
  date: string;
}

interface Commitment {
  id: string;
  description: string;
  owner: 'founder' | 'contact' | 'shared';
  due_date: string | null;
  confidence: number;
  evidence_quote: string;
  status: 'open' | 'completed' | 'dismissed';
}

interface Interaction {
  id: string;
  interaction_type: 'meeting' | 'email' | 'slack' | 'note';
  date: string;
  content: string;
}

const DEMO_CONTACTS: Record<string, ContactMemory> = {
  sarah_jenkins: {
    id: 'sarah_jenkins',
    name: 'Sarah Jenkins',
    company: 'NextGen AI',
    relationship_state: 'waiting_on_me',
    priority_score: 85,
    priority_reasons: [
      "+50: Overdue promise to contact (confidence >= 70%)",
      "+20: Attention state is 'Waiting on Me'",
      "Applied Relationship Tier A multiplier (x1.5)"
    ],
    who_are_they: 'Founder and CEO of NextGen AI. Serial entrepreneur with previous exit in NLP space.',
    why_talking: 'Evaluating pre-Seed / Seed round leading options.',
    key_drivers: ['fast scaling', 'technical advisory', 'product-led growth model'],
    objections: ['customer acquisition cost (CAC) overhead', 'market defensibility'],
    thesis: 'Sarah is an exceptionally execution-focused founder in the NLP space. NextGen AI is solving agent orchestration complexity. High conviction on team, but CAC metrics must be proven.',
    current_status: 'Sarah reviewed the pitch deck and liked the architecture. We are waiting to send the detailed financial model and CAC projections.',
    recommended_next_action: 'Email the CAC and financial model projection spreadsheet today (Friday commitment).'
  },
  amit_patel: {
    id: 'amit_patel',
    name: 'Amit Patel',
    company: 'CloudShield',
    relationship_state: 'mutual_exploration',
    priority_score: 45,
    priority_reasons: [
      "+30: Promise due to contact within 48 hours",
      "Applied Relationship Tier B multiplier (x1.0)"
    ],
    who_are_they: 'CTO and co-founder of CloudShield. Ex-AWS Principal Engineer.',
    why_talking: 'Evaluating DB proxy integration for enterprise latency reduction.',
    key_drivers: ['database security', 'latency minimization', 'SOC2 readiness'],
    objections: ['potential network proxy latency overhead (>2ms)'],
    thesis: 'Amit is a highly technical buyer who values concrete benchmarks. Latency breakdown docs resolved the core speed objection. Focus is now on deep-dive configuration and security audit.',
    current_status: 'Latency concerns are resolved (<2ms verified). Deep-dive technical call scheduled.',
    recommended_next_action: 'Send technical deep-dive invite with architect Divya (Tuesday target).'
  },
  marcus_aurelius: {
    id: 'marcus_aurelius',
    name: 'Marcus Aurelius',
    company: 'Rome Ventures',
    relationship_state: 'waiting_on_them',
    priority_score: 30,
    priority_reasons: [
      "+15: Active relationship with no touch for 16 days",
      "Applied Relationship Tier B multiplier (x1.0)"
    ],
    who_are_they: 'Managing Partner at Rome Ventures. Focuses on developer tools and Series A growth rounds.',
    why_talking: 'Early relationship warming for prospective Series A round.',
    key_drivers: ['clear go-to-market speed', 'developer community adoption', 'strong defensibility'],
    objections: ['gtm execution speed'],
    thesis: 'Marcus has high capital density but is conservative on execution pace. Needs to see structural proof of developer velocity and marketing scalability.',
    current_status: 'Marcus has doubts on GTM speed. Founder promised to share the Q3 Head of Sales job description.',
    recommended_next_action: 'Share finalized Head of Sales JD once drafted.'
  },
  elena_rostova: {
    id: 'elena_rostova',
    name: 'Elena Rostova',
    company: 'SecureAuth',
    relationship_state: 'waiting_on_me',
    priority_score: 95,
    priority_reasons: [
      "+50: Overdue promise to contact (confidence >= 70%)",
      "+20: Attention state is 'Waiting on Me'",
      "Applied Relationship Tier A multiplier (x1.5)"
    ],
    who_are_they: 'Director of Security and Integration at SecureAuth.',
    why_talking: 'Integrating enterprise sign-on integrations into identity ecosystem.',
    key_drivers: ['SOC2 compliance', 'AES-256 rest encryption'],
    objections: ['SAML metadata raw token storage'],
    thesis: 'Elena represents a major pipeline deal but requires stringent compliance reviews. Rest encryption details must match their SOC2 framework.',
    current_status: 'Elena requested security policy validation. Security team needs to send the SOC2 Type II report.',
    recommended_next_action: 'Ping Security team to immediately dispatch the SOC2 report to Elena.'
  },
  tom_henderson: {
    id: 'tom_henderson',
    name: 'Tom Henderson',
    company: 'Cascade Ventures',
    relationship_state: 'mutual_exploration',
    priority_score: 15,
    priority_reasons: [
      "Applied Relationship Tier C multiplier (x0.4)"
    ],
    who_are_they: 'Investment Associate at Cascade Ventures. Recently relocated from NY to SF.',
    why_talking: 'General relationship building for developer tooling and database infrastructure.',
    key_drivers: ['developer tools', 'database infrastructure'],
    objections: [],
    thesis: 'Tom is building his network in SF. Good relationship to maintain but low immediate leverage.',
    current_status: 'Met for coffee at Blue Bottle. Friendly catch-up, no immediate deals.',
    recommended_next_action: 'Follow up casually in 2 months.'
  }
};

const DEMO_MILESTONES: Record<string, Milestone[]> = {
  sarah_jenkins: [
    {
      id: 'm1',
      summary: 'Sarah confirmed receipt of the Seed pitch deck and liked the architecture layout.',
      milestone_type: 'deck_received',
      importance_score: 70,
      evidence_quote: 'Yes, I received the pitch deck. I went through it, and the architecture diagram was very clean.',
      date: '2026-06-29'
    }
  ],
  amit_patel: [
    {
      id: 'm2',
      summary: 'Latency objections resolved, benchmarks verified acceptable under 2ms.',
      milestone_type: 'technical_validation',
      importance_score: 85,
      evidence_quote: 'The latency overhead seems acceptable (under 2ms). Let\'s do a technical deep dive.',
      date: '2026-06-28'
    }
  ],
  marcus_aurelius: [],
  elena_rostova: [
    {
      id: 'm3',
      summary: 'Completed high-fidelity product demonstration and architecture walkthrough.',
      milestone_type: 'demo_completed',
      importance_score: 75,
      evidence_quote: 'The demo was great. I\'m impressed by the speed.',
      date: '2026-06-27'
    }
  ],
  tom_henderson: []
};

const DEMO_COMMITMENTS: Record<string, Commitment[]> = {
  sarah_jenkins: [
    {
      id: 'c1',
      description: 'Send detailed financial model and CAC projections by Friday',
      owner: 'founder',
      due_date: '2026-07-03',
      confidence: 95,
      evidence_quote: "I'll send you our detailed financial model and CAC projections by Friday.",
      status: 'open'
    },
    {
      id: 'c2',
      description: 'Review the financial model upon receipt',
      owner: 'contact',
      due_date: null,
      confidence: 90,
      evidence_quote: 'I will review the financial model as soon as I get it.',
      status: 'open'
    },
    {
      id: 'c3',
      description: 'Send Seed pitch deck',
      owner: 'founder',
      due_date: null,
      confidence: 99,
      evidence_quote: 'Did you get the pitch deck I emailed yesterday?',
      status: 'completed'
    }
  ],
  amit_patel: [
    {
      id: 'c4',
      description: 'Invite lead architect Divya to technical deep dive',
      owner: 'contact',
      due_date: null,
      confidence: 90,
      evidence_quote: "I'll ask my lead architect, Divya, to join us.",
      status: 'open'
    },
    {
      id: 'c5',
      description: 'Set up Zoom invite for technical deep dive next Tuesday',
      owner: 'contact',
      due_date: '2026-07-07',
      confidence: 95,
      evidence_quote: 'I will set up a Zoom invite for next Tuesday.',
      status: 'open'
    },
    {
      id: 'c6',
      description: 'Send technical architecture document for proxy latency overhead',
      owner: 'founder',
      due_date: null,
      confidence: 99,
      evidence_quote: 'Thanks for sending the document.',
      status: 'completed'
    }
  ],
  marcus_aurelius: [
    {
      id: 'c7',
      description: 'Share Head of Sales job description once ready',
      owner: 'founder',
      due_date: null,
      confidence: 90,
      evidence_quote: "I'll share the job description with you once it's ready.",
      status: 'open'
    },
    {
      id: 'c8',
      description: 'Share Head of Sales JD with prospective candidates',
      owner: 'contact',
      due_date: null,
      confidence: 85,
      evidence_quote: 'send it over and I can share it with a few candidates.',
      status: 'open'
    }
  ],
  elena_rostova: [
    {
      id: 'c9',
      description: 'Have security team email SOC2 Type II report',
      owner: 'founder',
      due_date: '2026-07-02',
      confidence: 95,
      evidence_quote: "I'll have our security team email you our SOC2 Type II report.",
      status: 'open'
    },
    {
      id: 'c10',
      description: 'Introduce founder to VP of Infrastructure, Kevin',
      owner: 'contact',
      due_date: null,
      confidence: 90,
      evidence_quote: 'I will introduce you to our VP of Infrastructure, Kevin, to discuss setup.',
      status: 'open'
    }
  ],
  tom_henderson: []
};

const DEMO_INTERACTIONS: Record<string, Interaction[]> = {
  sarah_jenkins: [
    {
      id: 'i1_1',
      interaction_type: 'meeting',
      date: '2026-06-29T14:00:00Z',
      content: "Founder: Thanks for the time, Sarah. We loved your background. Did you get the pitch deck I emailed yesterday?\nSarah Jenkins: Yes, I received the pitch deck. I went through it, and the architecture diagram was very clean. However, my main concern is customer acquisition cost (CAC). How do you plan to scale it down?\nFounder: We are shifting to a product-led growth model. I'll send you our detailed financial model and CAC projections by Friday.\nSarah Jenkins: Excellent, send that over. Let's schedule a follow-up demo for next week. I will review the financial model as soon as I get it."
    },
    {
      id: 'i1_2',
      interaction_type: 'email',
      date: '2026-06-28T09:15:00Z',
      content: "From: founder@memorycrm.com\nTo: sarah@nextgen.ai\nSubject: NextGen AI & MemoryCRM Intro\n\nHi Sarah, great to connect. Sending over our Seed deck for your review ahead of our call tomorrow."
    }
  ],
  amit_patel: [
    {
      id: 'i2_1',
      interaction_type: 'email',
      date: '2026-06-28T16:30:00Z',
      content: "From: amit@cloudshield.com\nTo: founder@memorycrm.com\nSubject: Re: Latency breakdown doc\n\nThanks for sending the document. The latency overhead seems acceptable (under 2ms). Let's do a technical deep dive. I'll ask my lead architect, Divya, to join us. I will set up a Zoom invite for next Tuesday."
    },
    {
      id: 'i2_2',
      interaction_type: 'meeting',
      date: '2026-06-25T11:00:00Z',
      content: "Introductory call discussing database proxy architecture. Amit raised a strong concern about latency overhead, wanting guarantees that we introduce under 2ms of delay."
    }
  ],
  marcus_aurelius: [
    {
      id: 'i3_1',
      interaction_type: 'slack',
      date: '2026-06-14T10:15:00Z',
      content: "Founder: Hey Marcus, just wanted to check if you had any thoughts on our roadmap?\nMarcus Aurelius: Looks solid, but I have doubts about the GTM speed. Are you hiring a Head of Sales soon?\nFounder: Yes, looking to hire in Q3. I'll share the job description with you once it's ready.\nMarcus Aurelius: Great, send it over and I can share it with a few candidates."
    }
  ],
  elena_rostova: [
    {
      id: 'i4_1',
      interaction_type: 'meeting',
      date: '2026-06-27T10:00:00Z',
      content: "Elena Rostova: The demo was great. I'm impressed by the speed. But do you store raw tokens? We require SAML metadata to be encrypted at rest.\nFounder: We encrypt everything at rest using AES-256. I'll have our security team email you our SOC2 Type II report.\nElena Rostova: Perfect. I will introduce you to our VP of Infrastructure, Kevin, to discuss setup."
    }
  ],
  tom_henderson: [
    {
      id: 'i5_1',
      interaction_type: 'note',
      date: '2026-06-30T10:00:00Z',
      content: "Met Tom Henderson for coffee at Blue Bottle. He mentioned he recently moved from NY to SF and is focusing on developer tooling and database infrastructure investments. No immediate deals on his plate, but wants to stay in touch."
    }
  ]
};

// ==========================================
// SQL QUERY DICTIONARY FOR EXPLAINABILITY
// ==========================================

const LEMMA_QUERIES = {
  fetch_contact: (id: string) => `SELECT * FROM contacts WHERE id = '${id}';`,
  fetch_milestones: (id: string) => `SELECT * FROM relationship_milestones \nWHERE contact_id = '${id}' \nORDER BY importance_score DESC;`,
  fetch_commitments: (id: string) => `SELECT * FROM commitments \nWHERE contact_id = '${id}' \nORDER BY created_at DESC;`,
  fetch_interactions: (id: string) => `SELECT * FROM interactions \nWHERE contact_id = '${id}' \nORDER BY date DESC;`
};

export default function App() {
  const [selectedContactId, setSelectedContactId] = useState<string>('sarah_jenkins');
  const [activeTab, setActiveTab] = useState<'ui' | 'queries'>('ui');
  const [expandedMoment, setExpandedMoment] = useState<string | null>(null);
  const [expandedTimeline, setExpandedTimeline] = useState<string | null>(null);
  
  // Custom states for commitments to show interactive transitions
  const [commitmentsState, setCommitmentsState] = useState<Record<string, Commitment[]>>(DEMO_COMMITMENTS);

  const contact = DEMO_CONTACTS[selectedContactId];
  const milestones = DEMO_MILESTONES[selectedContactId] || [];
  const commitments = commitmentsState[selectedContactId] || [];
  const interactions = DEMO_INTERACTIONS[selectedContactId] || [];

  const handleUpdateCommitmentStatus = (id: string, nextStatus: 'completed' | 'dismissed') => {
    setCommitmentsState(prev => {
      const contactComms = prev[selectedContactId] || [];
      const updated = contactComms.map(c => c.id === id ? { ...c, status: nextStatus } : c);
      return { ...prev, [selectedContactId]: updated };
    });
  };



  const getPriorityRingColor = (score: number) => {
    if (score >= 70) return '#EF4444';
    if (score >= 40) return '#F59E0B';
    return '#10B981';
  };

  // Switch handlers
  const handleContactChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedContactId(e.target.value);
    setExpandedMoment(null);
    setExpandedTimeline(null);
  };

  return (
    <div className="min-h-screen text-slate-100 flex flex-col">
      {/* Top Banner / Switcher */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 py-4 px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-sky-400 to-indigo-500 p-2.5 rounded-xl shadow-lg shadow-indigo-500/10">
            <Sparkles className="h-6 w-6 text-slate-900" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
              Lemma CRM
            </h1>
            <p className="text-xs text-slate-400 font-medium">Relationship Operating System</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 w-full md:w-64">
            <User className="h-4 w-4 text-slate-400" />
            <select 
              value={selectedContactId}
              onChange={handleContactChange}
              className="bg-transparent text-sm w-full outline-none border-none text-slate-200 cursor-pointer font-medium"
            >
              <option value="sarah_jenkins">Sarah Jenkins (NextGen AI)</option>
              <option value="amit_patel">Amit Patel (CloudShield)</option>
              <option value="marcus_aurelius">Marcus Aurelius (Rome)</option>
              <option value="elena_rostova">Elena Rostova (SecureAuth)</option>
              <option value="tom_henderson">Tom Henderson (Cascade)</option>
              <option value="loading">⚙️ [Simulated] Loading State</option>
              <option value="empty">📭 [Simulated] Empty State</option>
            </select>
          </div>

          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button 
              onClick={() => setActiveTab('ui')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${activeTab === 'ui' ? 'bg-slate-800 text-sky-400' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Eye className="h-3.5 w-3.5" />
              UI Screen
            </button>
            <button 
              onClick={() => setActiveTab('queries')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${activeTab === 'queries' ? 'bg-slate-800 text-sky-400' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Database className="h-3.5 w-3.5" />
              Lemma Queries
            </button>
          </div>
        </div>
      </header>

      {/* Loading State Simulator */}
      {selectedContactId === 'loading' && (
        <div className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
          <div className="lg:col-span-1 space-y-6">
            <div className="h-64 bg-slate-900/50 border border-slate-800/50 rounded-2xl"></div>
            <div className="h-48 bg-slate-900/50 border border-slate-800/50 rounded-2xl"></div>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <div className="h-44 bg-slate-900/50 border border-slate-800/50 rounded-2xl"></div>
            <div className="h-56 bg-slate-900/50 border border-slate-800/50 rounded-2xl"></div>
            <div className="h-40 bg-slate-900/50 border border-slate-800/50 rounded-2xl"></div>
          </div>
        </div>
      )}

      {/* Empty State Simulator */}
      {selectedContactId === 'empty' && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-md mx-auto text-center">
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-full mb-4">
            <Sparkles className="h-8 w-8 text-sky-400/50" />
          </div>
          <h2 className="text-xl font-bold mb-2">No relationship data yet</h2>
          <p className="text-slate-400 text-sm mb-6">
            Once you log a call, note, email thread or Slack integration, the Consolidated Extractor will automatically construct contact memories, extract milestones, and create commitments.
          </p>
          <button 
            onClick={() => setSelectedContactId('sarah_jenkins')}
            className="px-4 py-2 bg-gradient-to-r from-sky-400 to-indigo-500 hover:from-sky-500 hover:to-indigo-600 text-slate-900 font-semibold rounded-lg text-sm shadow-lg shadow-sky-500/10 transition-all"
          >
            Load Demo Workspace
          </button>
        </div>
      )}

      {/* Active Workspace tabs */}
      {selectedContactId !== 'loading' && selectedContactId !== 'empty' && (
        <main className="flex-1 max-w-7xl w-full mx-auto p-6">
          {activeTab === 'queries' ? (
            <div className="space-y-6">
              <div className="border border-slate-800/60 rounded-xl overflow-hidden bg-slate-900/40 backdrop-blur-md p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Database className="h-5 w-5 text-sky-400" />
                  <h3 className="font-bold text-slate-200">Datastore Queries (Lemma Pod Context)</h3>
                </div>
                <p className="text-xs text-slate-400 mb-6">
                  Lemma pod workflows interface directly with datastore tables. Below are the precise SQL-style queries generated by the relationship memory screen controller for contact <strong>{contact.name}</strong>.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(LEMMA_QUERIES).map(([key, queryFn]) => (
                    <div key={key} className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs">
                      <div className="text-sky-400/80 mb-2 font-semibold">-- {key.toUpperCase().replace('_', ' ')}</div>
                      <pre className="text-slate-300 overflow-x-auto whitespace-pre-wrap">{queryFn(contact.id)}</pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              
              {/* LEFT COLUMN: Summary & Thesis */}
              <div className="space-y-6 lg:col-span-1">
                
                {/* SECTION 1: Relationship Summary */}
                <div className="glass-panel p-6 space-y-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-100">{contact.name}</h2>
                      <p className="text-sm text-sky-400 flex items-center gap-1.5 mt-1 font-medium">
                        <Briefcase className="h-3.5 w-3.5" />
                        {contact.company}
                      </p>
                    </div>
                    {/* Ring score */}
                    <div className="relative h-14 w-14 flex items-center justify-center">
                      <svg className="absolute transform -rotate-90 w-full h-full">
                        <circle cx="28" cy="28" r="24" stroke="rgba(255,255,255,0.04)" strokeWidth="4" fill="transparent" />
                        <circle 
                          cx="28" 
                          cy="28" 
                          r="24" 
                          stroke={getPriorityRingColor(contact.priority_score)} 
                          strokeWidth="4" 
                          fill="transparent" 
                          strokeDasharray={2 * Math.PI * 24}
                          strokeDashoffset={2 * Math.PI * 24 * (1 - contact.priority_score / 100)} 
                        />
                      </svg>
                      <span className="text-xs font-bold font-mono">{contact.priority_score}</span>
                    </div>
                  </div>

                  {/* Relationship State Badge */}
                  <div className="pt-2">
                    <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 block mb-1">State</span>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border border-sky-500/20 bg-sky-950/20 text-sky-400">
                      <Clock className="h-3 w-3" />
                      {contact.relationship_state.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Why Talking */}
                  <div>
                    <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 block mb-1">Why We Are Talking</span>
                    <p className="text-sm text-slate-300 leading-relaxed font-medium">{contact.why_talking}</p>
                  </div>

                  {/* Key Drivers */}
                  <div>
                    <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 block mb-1.5">What They Care About</span>
                    <div className="flex flex-wrap gap-1.5">
                      {contact.key_drivers.map((driver, idx) => (
                        <span key={idx} className="text-xs px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-300">
                          {driver}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Objections */}
                  {contact.objections.length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 block mb-1.5">Current Objections</span>
                      <div className="space-y-1.5">
                        {contact.objections.map((obj, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg border border-red-500/20 bg-red-950/10 text-red-400">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{obj}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* SECTION 5: AI Memory Card */}
                <div className="glass-panel p-6 space-y-4 border-sky-500/10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                    <Sparkles className="h-16 w-16 text-sky-400" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4.5 w-4.5 text-sky-400" />
                    <h3 className="font-bold text-sky-400 text-sm tracking-wide uppercase">AI Thesis & Next Action</h3>
                  </div>

                  <div className="space-y-3.5">
                    <div>
                      <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 block mb-1">Relationship Thesis</span>
                      <p className="text-xs text-slate-300 leading-relaxed font-medium">{contact.thesis}</p>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400 block mb-1">Current Status</span>
                      <p className="text-xs text-slate-300 leading-relaxed font-medium">{contact.current_status}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-800/60">
                      <span className="text-[10px] font-bold tracking-wider uppercase text-sky-400 block mb-1">Recommended Next Action</span>
                      <p className="text-xs text-sky-300 leading-relaxed font-semibold">{contact.recommended_next_action}</p>
                    </div>
                  </div>
                </div>

              </div>

              {/* RIGHT COLUMN: Open Loops, Moments, Timeline */}
              <div className="space-y-6 lg:col-span-2">
                
                {/* SECTION 3: Open Loops (Commitments) */}
                <div className="glass-panel p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="h-5 w-5 text-indigo-400" />
                      <h3 className="font-bold text-slate-200">Open Loops</h3>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                      {commitments.filter(c => c.status === 'open').length} Unresolved
                    </span>
                  </div>

                  {commitments.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">No commitments detected for this contact.</div>
                  ) : (
                    <div className="space-y-3">
                      {commitments.map((comm) => (
                        <div 
                          key={comm.id} 
                          className={`p-4 rounded-xl border transition-all ${comm.status !== 'open' ? 'opacity-40 bg-slate-950/20 border-slate-900' : 'bg-slate-900/30 border-slate-800/80'}`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <p className={`text-sm font-semibold ${comm.status === 'completed' ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                                {comm.description}
                              </p>
                              
                              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${comm.owner === 'founder' ? 'bg-amber-950/20 border border-amber-500/20 text-amber-400' : 'bg-blue-950/20 border border-blue-500/20 text-blue-400'}`}>
                                  {comm.owner}
                                </span>
                                {comm.due_date && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3.5 w-3.5" />
                                    Due {comm.due_date}
                                  </span>
                                )}
                                <span className="flex items-center gap-1 font-mono">
                                  <TrendingUp className="h-3.5 w-3.5" />
                                  {comm.confidence}% confidence
                                </span>
                              </div>
                            </div>

                            {comm.status === 'open' && (
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => handleUpdateCommitmentStatus(comm.id, 'completed')}
                                  className="p-1.5 rounded-lg border border-emerald-500/30 hover:bg-emerald-950/20 text-emerald-400 transition-all"
                                  title="Mark as Complete"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                </button>
                                <button 
                                  onClick={() => handleUpdateCommitmentStatus(comm.id, 'dismissed')}
                                  className="p-1.5 rounded-lg border border-red-500/30 hover:bg-red-950/20 text-red-400 transition-all"
                                  title="Dismiss Loop"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Evidence Quote */}
                          <div className="mt-3 pl-3 border-l-2 border-indigo-500/30 text-xs italic text-slate-400 leading-relaxed">
                            "{comm.evidence_quote}"
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SECTION 2: Key Moments (Milestones) */}
                <div className="glass-panel p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="h-5 w-5 text-sky-400" />
                    <h3 className="font-bold text-slate-200">Key Moments</h3>
                  </div>

                  {milestones.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">No milestones extracted yet. Log an interaction to generate moments.</div>
                  ) : (
                    <div className="space-y-3">
                      {milestones.map((mile) => (
                        <div key={mile.id} className="p-4 rounded-xl border border-slate-800/80 bg-slate-900/30">
                          <div className="flex items-center justify-between gap-4">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-950/20 border border-sky-500/20 text-sky-400">
                              {mile.milestone_type.replace(/_/g, ' ')}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">{mile.date}</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                                Importance {mile.importance_score}
                              </span>
                            </div>
                          </div>

                          <p className="text-sm font-semibold text-slate-200 mt-2">
                            {mile.summary}
                          </p>

                          {/* Evidence drawer toggle */}
                          <div className="mt-3">
                            <button 
                              onClick={() => setExpandedMoment(expandedMoment === mile.id ? null : mile.id)}
                              className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 transition-all"
                            >
                              {expandedMoment === mile.id ? 'Hide Evidence' : 'Show Evidence Quote'}
                              {expandedMoment === mile.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                            
                            {expandedMoment === mile.id && (
                              <div className="mt-2 p-3 bg-slate-950/60 rounded-lg border border-slate-800/60 text-xs italic text-slate-400 leading-relaxed animate-fadeIn">
                                "{mile.evidence_quote}"
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SECTION 4: Timeline (Interactions) */}
                <div className="glass-panel p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Layers className="h-5 w-5 text-indigo-400" />
                    <h3 className="font-bold text-slate-200">Raw Interaction Logs</h3>
                  </div>

                  <div className="relative pl-6 space-y-6">
                    <div className="timeline-line"></div>
                    
                    {interactions.map((int) => (
                      <div key={int.id} className="relative space-y-2">
                        {/* Bullet */}
                        <div className="absolute -left-[30px] top-1.5 h-4 w-4 rounded-full bg-slate-950 border-2 border-indigo-400 flex items-center justify-center">
                          <div className="h-1.5 w-1.5 rounded-full bg-sky-400"></div>
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold uppercase text-slate-400 flex items-center gap-1.5">
                            <MessageSquare className="h-3.5 w-3.5 text-indigo-400" />
                            {int.interaction_type}
                          </span>
                          <span className="text-slate-400 font-medium">{new Date(int.date).toLocaleDateString()}</span>
                        </div>

                        <div className="border border-slate-800/60 bg-slate-900/20 rounded-xl p-4">
                          <button 
                            onClick={() => setExpandedTimeline(expandedTimeline === int.id ? null : int.id)}
                            className="w-full text-left flex justify-between items-center text-sm font-semibold text-slate-200"
                          >
                            <span className="truncate pr-4">
                              {int.content.split('\n')[0]}
                            </span>
                            <span className="text-xs text-sky-400 hover:text-sky-300 font-medium">
                              {expandedTimeline === int.id ? 'Collapse' : 'Expand'}
                            </span>
                          </button>

                          {expandedTimeline === int.id && (
                            <div className="mt-3 pt-3 border-t border-slate-800/60 text-xs text-slate-400 font-mono whitespace-pre-wrap leading-relaxed animate-fadeIn">
                              {int.content}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}
        </main>
      )}
      
      {/* Footer */}
      <footer className="mt-auto py-6 text-center border-t border-slate-900 text-xs text-slate-500 font-medium">
        MemoryCRM Pod Console © 2026. Built with Lemma Platform.
      </footer>
    </div>
  );
}
