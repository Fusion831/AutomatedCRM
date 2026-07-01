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
    <div className="app-wrapper">
      {/* Top Banner / Switcher */}
      <header className="app-header">
        <div className="brand-section">
          <div className="logo-icon-container">
            <Sparkles className="logo-icon" />
          </div>
          <div>
            <h1 className="brand-title">Lemma CRM</h1>
            <p className="brand-subtitle">Relationship Operating System</p>
          </div>
        </div>

        <div className="controls-section">
          <div className="selector-container">
            <User className="selector-icon" />
            <select 
              value={selectedContactId}
              onChange={handleContactChange}
              className="contact-select"
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

          <div className="tab-switcher">
            <button 
              onClick={() => setActiveTab('ui')}
              className={`tab-btn ${activeTab === 'ui' ? 'active' : ''}`}
            >
              <Eye style={{ width: '14px', height: '14px' }} />
              UI Screen
            </button>
            <button 
              onClick={() => setActiveTab('queries')}
              className={`tab-btn ${activeTab === 'queries' ? 'active' : ''}`}
            >
              <Database style={{ width: '14px', height: '14px' }} />
              Lemma Queries
            </button>
          </div>
        </div>
      </header>

      {/* Loading State Simulator */}
      {selectedContactId === 'loading' && (
        <main className="dashboard-container">
          <div className="column-left">
            <div className="glass-panel skeleton-card">
              <div className="skeleton-pulse"></div>
            </div>
            <div className="glass-panel skeleton-card">
              <div className="skeleton-pulse"></div>
            </div>
          </div>
          <div className="column-right">
            <div className="glass-panel skeleton-card" style={{ height: '200px' }}>
              <div className="skeleton-pulse"></div>
            </div>
            <div className="glass-panel skeleton-card" style={{ height: '250px' }}>
              <div className="skeleton-pulse"></div>
            </div>
          </div>
        </main>
      )}

      {/* Empty State Simulator */}
      {selectedContactId === 'empty' && (
        <div className="empty-wrapper">
          <div className="empty-icon-circle">
            <Sparkles className="empty-icon" />
          </div>
          <h2 className="empty-headline">No relationship data yet</h2>
          <p className="empty-body">
            Once you log a call, note, email thread or Slack integration, the Consolidated Extractor will automatically construct contact memories, extract milestones, and create commitments.
          </p>
          <button 
            onClick={() => setSelectedContactId('sarah_jenkins')}
            className="cta-btn"
          >
            Load Demo Workspace
          </button>
        </div>
      )}

      {/* Active Workspace tabs */}
      {selectedContactId !== 'loading' && selectedContactId !== 'empty' && (
        <main className="dashboard-container">
          {activeTab === 'queries' ? (
            <div style={{ gridColumn: 'span 2' }}>
              <div className="glass-panel">
                <div className="section-title-container">
                  <Database className="section-icon cyan" />
                  <h3 className="section-title">Datastore Queries (Lemma Pod Context)</h3>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                  Lemma pod workflows interface directly with datastore tables. Below are the precise SQL-style queries generated by the relationship memory screen controller for contact <strong>{contact.name}</strong>.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                  {Object.entries(LEMMA_QUERIES).map(([key, queryFn]) => (
                    <div key={key} style={{ background: '#05070A', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      <div style={{ color: 'var(--accent-cyan)', marginBottom: '0.5rem', fontWeight: 'bold' }}>-- {key.toUpperCase().replace('_', ' ')}</div>
                      <pre style={{ overflowX: 'auto', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{queryFn(contact.id)}</pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* LEFT COLUMN: Summary & Thesis */}
              <div className="column-left">
                
                {/* SECTION 1: Relationship Summary */}
                <div className="glass-panel">
                  <div className="profile-header">
                    <div>
                      <h2 className="profile-title">{contact.name}</h2>
                      <p style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem', fontWeight: 600 }}>
                        <Briefcase style={{ width: '12px', height: '12px' }} />
                        {contact.company}
                      </p>
                    </div>
                    {/* Ring score */}
                    <div className="priority-ring-wrapper">
                      <svg className="priority-ring-svg">
                        <circle cx="30" cy="30" r="26" stroke="rgba(255,255,255,0.03)" strokeWidth="3" fill="transparent" />
                        <circle 
                          cx="30" 
                          cy="30" 
                          r="26" 
                          stroke={getPriorityRingColor(contact.priority_score)} 
                          strokeWidth="3" 
                          fill="transparent" 
                          strokeDasharray={2 * Math.PI * 26}
                          strokeDashoffset={2 * Math.PI * 26 * (1 - contact.priority_score / 100)} 
                        />
                      </svg>
                      <span className="priority-score-text" style={{ color: getPriorityRingColor(contact.priority_score) }}>{contact.priority_score}</span>
                    </div>
                  </div>

                  {/* Relationship State Badge */}
                  <div className="badge-group">
                    <span className="badge-label">Attention State</span>
                    <span className="state-badge">
                      <Clock style={{ width: '11px', height: '11px' }} />
                      {contact.relationship_state.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Why Talking */}
                  <div className="badge-group">
                    <span className="badge-label">Why We Are Talking</span>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.4, fontWeight: 500 }}>{contact.why_talking}</p>
                  </div>

                  {/* Key Drivers */}
                  <div className="badge-group">
                    <span className="badge-label">What They Care About</span>
                    <div className="driver-tags">
                      {contact.key_drivers.map((driver, idx) => (
                        <span key={idx} className="tag-driver">
                          {driver}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Objections */}
                  {contact.objections.length > 0 && (
                    <div className="badge-group">
                      <span className="badge-label">Current Objections</span>
                      <div className="objections-list">
                        {contact.objections.map((obj, idx) => (
                          <div key={idx} className="objection-item">
                            <AlertTriangle className="objection-icon" />
                            <span>{obj}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* SECTION 5: AI Memory Card */}
                <div className="glass-panel" style={{ borderLeft: '3px solid var(--accent-cyan)' }}>
                  <div className="section-title-container" style={{ marginBottom: '1rem' }}>
                    <Sparkles className="section-icon cyan" />
                    <h3 className="section-title" style={{ color: 'var(--accent-cyan)' }}>AI Thesis & Next Action</h3>
                  </div>

                  <div className="memory-detail-item">
                    <span className="badge-label">Relationship Thesis</span>
                    <p className="memory-detail-content">{contact.thesis}</p>
                  </div>

                  <div className="memory-detail-item">
                    <span className="badge-label">Current Status</span>
                    <p className="memory-detail-content">{contact.current_status}</p>
                  </div>

                  <div className="next-action-card">
                    <span className="badge-label" style={{ color: 'var(--accent-cyan)' }}>Recommended Next Action</span>
                    <p className="next-action-text">{contact.recommended_next_action}</p>
                  </div>
                </div>

              </div>

              {/* RIGHT COLUMN: Open Loops, Moments, Timeline */}
              <div className="column-right">
                
                {/* SECTION 3: Open Loops (Commitments) */}
                <div className="glass-panel">
                  <div className="section-title-container" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CheckSquare className="section-icon indigo" />
                      <h3 className="section-title">Open Loops</h3>
                    </div>
                    <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                      {commitments.filter(c => c.status === 'open').length} Unresolved
                    </span>
                  </div>

                  {commitments.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No commitments detected for this contact.</div>
                  ) : (
                    <div className="commitments-list">
                      {commitments.map((comm) => (
                        <div 
                          key={comm.id} 
                          className={`commitment-card ${comm.status !== 'open' ? 'inactive' : ''}`}
                        >
                          <div className="commitment-header">
                            <div style={{ flex: 1 }}>
                              <p className={`commitment-desc ${comm.status === 'completed' ? 'completed' : ''}`}>
                                {comm.description}
                              </p>
                              
                              <div className="commitment-meta">
                                <span className={`owner-pill ${comm.owner}`}>
                                  {comm.owner}
                                </span>
                                {comm.due_date && (
                                  <span className="meta-item">
                                    <Calendar className="meta-icon" />
                                    Due {comm.due_date}
                                  </span>
                                )}
                                <span className="meta-item">
                                  <TrendingUp className="meta-icon" />
                                  {comm.confidence}% confidence
                                </span>
                              </div>
                            </div>

                            {comm.status === 'open' && (
                              <div className="commitment-actions">
                                <button 
                                  onClick={() => handleUpdateCommitmentStatus(comm.id, 'completed')}
                                  className="action-btn complete"
                                  title="Mark as Complete"
                                >
                                  <CheckCircle style={{ width: '13px', height: '13px' }} />
                                </button>
                                <button 
                                  onClick={() => handleUpdateCommitmentStatus(comm.id, 'dismissed')}
                                  className="action-btn dismiss"
                                  title="Dismiss Loop"
                                >
                                  <Trash2 style={{ width: '13px', height: '13px' }} />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Evidence Quote */}
                          <div className="evidence-quote">
                            "{comm.evidence_quote}"
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* SECTION 2: Key Moments (Milestones) */}
                <div className="glass-panel">
                  <div className="section-title-container">
                    <Sparkles className="section-icon blue" />
                    <h3 className="section-title">Key Moments</h3>
                  </div>

                  {milestones.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No milestones extracted yet. Log an interaction to generate moments.</div>
                  ) : (
                    <div>
                      {milestones.map((mile) => (
                        <div key={mile.id} className="moment-card">
                          <div className="moment-header">
                            <span className="moment-type">
                              {mile.milestone_type.replace(/_/g, ' ')}
                            </span>
                            <div className="moment-meta">
                              <span>{mile.date}</span>
                              <span className="moment-importance">
                                Importance {mile.importance_score}
                              </span>
                            </div>
                          </div>

                          <p className="moment-summary">
                            {mile.summary}
                          </p>

                          {/* Evidence drawer toggle */}
                          <div>
                            <button 
                              onClick={() => setExpandedMoment(expandedMoment === mile.id ? null : mile.id)}
                              className="drawer-toggle"
                            >
                              {expandedMoment === mile.id ? 'Hide Evidence' : 'Show Evidence Quote'}
                              {expandedMoment === mile.id ? <ChevronUp style={{ width: '11px', height: '11px' }} /> : <ChevronDown style={{ width: '11px', height: '11px' }} />}
                            </button>
                            
                            {expandedMoment === mile.id && (
                              <div className="drawer-content">
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
                <div className="glass-panel">
                  <div className="section-title-container">
                    <Layers className="section-icon indigo" />
                    <h3 className="section-title">Raw Interaction Logs</h3>
                  </div>

                  <div className="timeline-wrapper">
                    <div className="timeline-line"></div>
                    
                    {interactions.map((int) => (
                      <div key={int.id} className="timeline-node">
                        {/* Bullet */}
                        <div className="timeline-bullet">
                          <div className="timeline-bullet-inner"></div>
                        </div>

                        <div className="timeline-node-header">
                          <span className="timeline-node-type">
                            {int.interaction_type}
                          </span>
                          <span className="timeline-node-date">{new Date(int.date).toLocaleDateString()}</span>
                        </div>

                        <div className="timeline-node-content">
                          <button 
                            onClick={() => setExpandedTimeline(expandedTimeline === int.id ? null : int.id)}
                            className="timeline-node-title"
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%' }}>
                              {int.content.split('\n')[0]}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)', fontWeight: 'bold' }}>
                              {expandedTimeline === int.id ? 'Collapse' : 'Expand'}
                            </span>
                          </button>

                          {expandedTimeline === int.id && (
                            <div className="timeline-body">
                              {int.content}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </>
          )}
        </main>
      )}
      
      {/* Footer */}
      <footer className="footer">
        MemoryCRM Pod Console © 2026. Built with Lemma Platform.
      </footer>
    </div>
  );
}
