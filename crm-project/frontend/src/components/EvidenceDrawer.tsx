"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, FileText, Mail, Video, MessageSquare, BookOpen, Calendar, AlertCircle } from "lucide-react";

// ─── Data Model ────────────────────────────────────────────────────────────────

export interface EvidenceReference {
  sourceType: "meeting" | "email" | "slack" | "note" | "calendar" | "unknown";
  sourceTitle: string;      // e.g. "Zoom Call", "Email Thread"
  timestamp: string;        // display-ready relative time
  speaker?: string;         // e.g. "Sarah Jenkins"
  excerpt: string;          // the original quote / supporting text
  confidence?: "High" | "Medium" | "Low";
  contactName?: string;
}

/** Build an EvidenceReference from raw DB fields that may or may not exist */
export function buildEvidence(fields: {
  evidenceQuote?: string | null;
  evidenceSource?: string | null;
  sourceType?: string | null;
  timestamp?: string | null;
  contactName?: string | null;
  confidence?: number | null;
}): EvidenceReference | null {
  const excerpt = fields.evidenceQuote?.trim();
  if (!excerpt) return null;

  const rawType = (fields.sourceType || fields.evidenceSource || "").toLowerCase();
  let sourceType: EvidenceReference["sourceType"] = "unknown";
  let sourceTitle = "Conversation";

  if (rawType.includes("meet") || rawType.includes("zoom") || rawType.includes("call")) {
    sourceType = "meeting"; sourceTitle = "Zoom Call";
  } else if (rawType.includes("email") || rawType.includes("mail")) {
    sourceType = "email"; sourceTitle = "Email Thread";
  } else if (rawType.includes("slack") || rawType.includes("chat") || rawType.includes("message")) {
    sourceType = "slack"; sourceTitle = "Slack Message";
  } else if (rawType.includes("note") || rawType.includes("manual")) {
    sourceType = "note"; sourceTitle = "Manual Note";
  } else if (rawType.includes("calendar") || rawType.includes("event")) {
    sourceType = "calendar"; sourceTitle = "Calendar Event";
  }

  let confidence: EvidenceReference["confidence"] | undefined;
  if (fields.confidence != null) {
    if (fields.confidence >= 85) confidence = "High";
    else if (fields.confidence >= 60) confidence = "Medium";
    else confidence = "Low";
  }

  return {
    sourceType,
    sourceTitle,
    timestamp: fields.timestamp || "Unknown time",
    speaker: fields.contactName || undefined,
    excerpt,
    confidence,
    contactName: fields.contactName || undefined,
  };
}

// ─── Source Icon ───────────────────────────────────────────────────────────────

function SourceIcon({ type, className }: { type: EvidenceReference["sourceType"]; className?: string }) {
  const cls = className ?? "w-4 h-4";
  switch (type) {
    case "meeting":  return <Video className={cls} />;
    case "email":    return <Mail className={cls} />;
    case "slack":    return <MessageSquare className={cls} />;
    case "note":     return <BookOpen className={cls} />;
    case "calendar": return <Calendar className={cls} />;
    default:         return <FileText className={cls} />;
  }
}

// ─── Confidence Pill ───────────────────────────────────────────────────────────

function ConfidencePill({ level }: { level: EvidenceReference["confidence"] }) {
  if (!level) return null;
  const colors = {
    High:   "bg-[#F1ECE1] text-[#A36A2B] border-[#D5CBB5]",
    Medium: "bg-[#FCFAF6] text-[#6B655E] border-[#EBE6D9]",
    Low:    "bg-[#FCFAF6] text-[#9A9287] border-[#EBE6D9]",
  };
  return (
    <span className={`inline-flex items-center text-[0.68rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${colors[level]}`}>
      Confidence: {level}
    </span>
  );
}

// ─── Panel (slide-over) ────────────────────────────────────────────────────────

interface PanelProps {
  evidence: EvidenceReference;
  label: string;
  onClose: () => void;
}

function EvidencePanel({ evidence, label, onClose }: PanelProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-[#1D1D1B]/10 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed bottom-0 right-0 z-[70] w-full sm:max-w-sm h-auto sm:h-full flex flex-col bg-[#F8F5EF] border-l border-t sm:border-t-0 border-[#D5CBB5] shadow-xl animate-in slide-in-from-right duration-200 sm:slide-in-from-bottom-0">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBE6D9] bg-[#F1ECE1]/50 shrink-0">
          <div className="flex items-center space-x-2 text-[#6B655E]">
            <SourceIcon type={evidence.sourceType} className="w-4 h-4" />
            <span className="text-[0.72rem] uppercase tracking-widest font-semibold">Source Evidence</span>
          </div>
          <button
            onClick={onClose}
            className="text-[#6B655E] hover:text-[#1D1D1B] transition-colors p-1 rounded"
            aria-label="Close evidence drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-grow overflow-y-auto px-5 py-5 space-y-5">

          {/* What we're explaining */}
          <div className="space-y-1">
            <p className="text-[0.68rem] uppercase tracking-widest font-semibold text-[#9A9287]">Insight</p>
            <p className="text-[0.9rem] text-[#1D1D1B] font-medium leading-snug">{label}</p>
          </div>

          {/* Source metadata */}
          <div className="space-y-2.5">
            <p className="text-[0.68rem] uppercase tracking-widest font-semibold text-[#9A9287]">Origin</p>

            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-[#EBE6D9] flex items-center justify-center shrink-0">
                <SourceIcon type={evidence.sourceType} className="w-3.5 h-3.5 text-[#6B655E]" />
              </div>
              <div>
                <p className="text-[0.88rem] font-medium text-[#1D1D1B]">{evidence.sourceTitle}</p>
                <p className="text-[0.78rem] text-[#9A9287]">{evidence.timestamp}</p>
              </div>
            </div>

            {evidence.speaker && (
              <p className="text-[0.82rem] text-[#6B655E]">
                <span className="font-medium text-[#1D1D1B]">{evidence.speaker}</span> said:
              </p>
            )}
          </div>

          {/* The quote — most important element */}
          <div className="space-y-2">
            <p className="text-[0.68rem] uppercase tracking-widest font-semibold text-[#9A9287]">Original Excerpt</p>
            <blockquote className="border-l-2 border-[#A36A2B] pl-4 py-1">
              <p className="text-[0.92rem] text-[#1D1D1B] leading-relaxed font-light italic">
                &ldquo;{evidence.excerpt}&rdquo;
              </p>
            </blockquote>
          </div>

          {/* Confidence */}
          {evidence.confidence && (
            <div className="space-y-2">
              <p className="text-[0.68rem] uppercase tracking-widest font-semibold text-[#9A9287]">Confidence</p>
              <ConfidencePill level={evidence.confidence} />
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#EBE6D9] shrink-0">
          <p className="text-[0.72rem] text-[#9A9287] font-light">
            Source traceability powered by MemoryCRM Intelligence Layer
          </p>
        </div>
      </div>
    </>
  );
}

// ─── Empty-state Panel ─────────────────────────────────────────────────────────

function EmptyPanel({ label, onClose }: { label: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-[#1D1D1B]/10 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed bottom-0 right-0 z-[70] w-full sm:max-w-sm bg-[#F8F5EF] border-l border-t sm:border-t-0 border-[#D5CBB5] shadow-xl animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBE6D9] bg-[#F1ECE1]/50">
          <span className="text-[0.72rem] uppercase tracking-widest font-semibold text-[#6B655E]">Source Evidence</span>
          <button onClick={onClose} className="text-[#6B655E] hover:text-[#1D1D1B] p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-8 flex flex-col items-center text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-[#D5CBB5]" />
          <p className="text-[0.88rem] text-[#6B655E] font-light">No source evidence available for this insight.</p>
          <p className="text-[0.78rem] text-[#9A9287]">{label}</p>
        </div>
      </div>
    </>
  );
}

// ─── Public: EvidenceDrawer ────────────────────────────────────────────────────

interface EvidenceDrawerProps {
  /** The insight text being explained, shown at the top of the drawer */
  label: string;
  /** Pre-built evidence. Pass null to show empty state, undefined to hide trigger. */
  evidence: EvidenceReference | null | undefined;
  /** Visual variant of the trigger button */
  variant?: "link" | "badge";
}

/**
 * Drop-in component. Renders a small trigger link/badge.
 * On click, opens an inline slide-over panel showing source evidence.
 *
 * Usage:
 *   <EvidenceDrawer
 *     label="Send updated financial projections"
 *     evidence={buildEvidence({ evidenceQuote: "...", sourceType: "meeting", timestamp: "Yesterday" })}
 *   />
 */
export function EvidenceDrawer({ label, evidence, variant = "link" }: EvidenceDrawerProps) {
  const [open, setOpen] = useState(false);

  if (evidence === undefined) return null;

  const triggerCls =
    variant === "badge"
      ? "inline-flex items-center space-x-1 text-[0.68rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border border-[#EBE6D9] bg-[#FCFAF6] text-[#6B655E] hover:border-[#D5CBB5] hover:text-[#1D1D1B] transition-all cursor-pointer"
      : "text-[0.75rem] text-[#A36A2B] hover:text-[#1D1D1B] font-medium underline underline-offset-2 transition-colors cursor-pointer";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerCls}
        aria-label={`View source evidence for: ${label}`}
      >
        {variant === "badge" ? (
          <>
            <FileText className="w-2.5 h-2.5" />
            <span>Source</span>
          </>
        ) : (
          "View Source"
        )}
      </button>

      {open && (
        evidence
          ? <EvidencePanel evidence={evidence} label={label} onClose={() => setOpen(false)} />
          : <EmptyPanel label={label} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
