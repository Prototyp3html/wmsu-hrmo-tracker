import { useMemo, useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { fetchApplicants, fetchApplications, fetchEmailTemplates, fetchJobs, updateEmailTemplate, fetchArchivedVacancies, restoreArchivedVacancy, getArchiveDurationSetting, updateArchiveDurationSetting, createEmailTemplate, deleteEmailTemplate, fetchLetterCodes, fetchLetterContent } from "@/lib/api";
import type { EmailTemplate } from "@/lib/types";
import { Search, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type ArchiveRow = {
  id: string;
  applicantName: string;
  applicantEmail: string;
  positionTitle: string;
  status: string;
  dateApplied: string;
  remarks: string;
};

// All application statuses that can have templates
const APPLICATION_STATUSES = [
  "Application Received",
  "Under Initial Screening",
  "For Examination",
  "For Interview",
  "For Final Evaluation",
  "Approved",
  "Hired",
  "Rejected"
] as const;

type RejectionLetterType = "not_qualified" | "non_teaching" | "teaching";

function detectRejectionLetterType(templateName: string): RejectionLetterType | "" {
  const name = templateName.toLowerCase();
  if (!name.trim()) return "";
  if (name.includes("non-teaching")) return "non_teaching";
  if (name.includes("teaching")) return "teaching";
  if (name.includes("not qualified")) return "not_qualified";
  return "";
}

function buildLetterFooter(code: string, effectiveDate: string): string {
  // format effectiveDate as Day-Mon-Year if it's a Date or string
  const fmt = (d: string) => {
    try {
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) {
        const day = parsed.getDate().toString().padStart(2, "0");
        const month = parsed.toLocaleString("en-US", { month: "short" });
        const year = parsed.getFullYear();
        return `${day}-${month}-${year}`;
      }
    } catch (e) {}
    return d;
  };
  return `${code}\nEffective date: ${fmt(effectiveDate)}`;
}

function removeKnownLetterFooter(text: string, knownFooters: string[]) {
  let normalized = text;
  knownFooters.forEach((footer) => {
    if (normalized.endsWith(`\n\n${footer}`)) {
      normalized = normalized.slice(0, -(`\n\n${footer}`).length);
    } else if (normalized.endsWith(footer)) {
      normalized = normalized.slice(0, -footer.length);
    }
  });
  return normalized.trimEnd();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deriveLetterDisplayTitle(filename: string, code: string, fallbackLabel?: string) {
  const raw = String(filename || "").replace(/\.docx?$/i, "").trim();
  const codePattern = escapeRegExp(code);
  const hasWrappedTitle = /\bWMSU[-\s]*HRMO[-\s]*LET[-\s]*[A-Z0-9.]+\s*\(/i.test(raw) || new RegExp(`^\\s*${codePattern}\\s*\\(`, "i").test(raw);
  let title = raw
    .replace(/^\s*WMSU[-\s]*HRMO[-\s]*LET[-\s]*[A-Z0-9.]+\s*/i, "")
    .replace(new RegExp(`^\\s*${codePattern}\\s*[-_:()\\[\\]]*\\s*`, "i"), "")
    .replace(/^[-_:()\[\]\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  // If the DOCX title was wrapped like "(Title)" and the opening parenthesis was stripped,
  // remove the leftover closing parenthesis so 002.02 and 003.02 don't end with ")".
  if (hasWrappedTitle && title.endsWith(")") && !title.includes("(")) {
    title = title.slice(0, -1).trimEnd();
  }

  if (!title && fallbackLabel) title = fallbackLabel;
  if (!title) title = code;
  return title;
}

function applyLetterFooter(body: string, code: string | "", effectiveDate: string | "", knownFooters: string[]) {
  let withoutFooter = removeKnownLetterFooter(body, knownFooters);
  if (!code) return withoutFooter;
  // ensure we don't duplicate existing code lines inside the body
  // remove any existing occurrences of the code string or "Effective date:" lines
  const codeEsc = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  withoutFooter = withoutFooter.replace(new RegExp(`(${codeEsc})(\s|\n|\r)*`, "g"), "");
  withoutFooter = withoutFooter.replace(/Effective date:\s*[^\n\r]*/gi, "");

  const today = new Date();
  const todayStr = `${today.getDate().toString().padStart(2, "0")}-${today.toLocaleString("en-US", { month: "short" })}-${today.getFullYear()}`;
  // Always use current date for Effective date in appended footer
  const eff = todayStr;
  const footer = buildLetterFooter(code, eff);
  if (!withoutFooter.trim()) return footer;
  return `${withoutFooter}\n\n${footer}`;
}

// Available placeholders users can insert
const AVAILABLE_PLACEHOLDERS = [
  { label: "Applicant Name", value: "{{applicantName}}" },
  { label: "Job Title", value: "{{jobTitle}}" },
  { label: "Department", value: "{{department}}" },
  { label: "Date", value: "{{date}}" },
  { label: "Exam Date", value: "{{examDate}}" },
  { label: "Exam Venue", value: "{{examVenue}}" },
  { label: "Interview Date", value: "{{interviewDate}}" },
  { label: "Interview Venue", value: "{{interviewVenue}}" },
  { label: "Final Eval Date", value: "{{finalEvalDate}}" },
  { label: "Final Eval Venue", value: "{{finalEvalVenue}}" },
] as const;

// Placeholders are optional, but once inserted they should not be deleted accidentally.
let PROTECTED_PLACEHOLDERS = AVAILABLE_PLACEHOLDERS.map((placeholder) => placeholder.value);

const DEFAULT_TEMPLATE_KEYS = new Set([
  "not_qualified",
  "non_teaching",
  "teaching",
  "qualification_notice",
  "hired"
]);

function isDefaultTemplate(template: EmailTemplate) {
  return DEFAULT_TEMPLATE_KEYS.has(template.templateKey);
}

function getPlaceholderRanges(text: string) {
  return PROTECTED_PLACEHOLDERS.flatMap((placeholder) => {
    const ranges: Array<{ start: number; end: number }> = [];
    let index = text.indexOf(placeholder);
    while (index !== -1) {
      ranges.push({ start: index, end: index + placeholder.length });
      index = text.indexOf(placeholder, index + placeholder.length);
    }
    return ranges;
  });
}

function selectionIntersectsProtected(text: string, start: number, end: number) {
  return getPlaceholderRanges(text).some((range) => start < range.end && end > range.start);
}

function caretTouchesProtected(text: string, caret: number, key: "Backspace" | "Delete") {
  return getPlaceholderRanges(text).some((range) => {
    if (key === "Backspace") return caret > range.start && caret <= range.end;
    return caret >= range.start && caret < range.end;
  });
}

// Determine template group from status
function groupFromStatus(status: string): EmailTemplate["templateGroup"] {
  return status === "Rejected" ? "rejection" : "qualification";
}

// ─── Placeholder Chip Bar ─────────────────────────────────────────────────────
function PlaceholderChips({ onInsert }: { onInsert: (placeholder: string) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Click to insert placeholder:</p>
      <div className="flex flex-wrap gap-2">
        {AVAILABLE_PLACEHOLDERS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onInsert(p.value)}
            className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-mono text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
          >
            {p.value}
            <span className="ml-1.5 text-[10px] text-muted-foreground font-sans not-italic opacity-70 group-hover:text-primary-foreground">
              {p.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Template Form (shared by Add and Edit) ───────────────────────────────────
interface TemplateFormState {
  templateName: string;
  templateGroup: EmailTemplate["templateGroup"];
  subject: string;
  body: string;
  linkedStatus: string;
  rejectionLetterType: string; // stores selected letter code (e.g. WMSU-HRMO-LET-004A.00)
}

interface TemplateEditorProps {
  form: TemplateFormState;
  setForm: (f: TemplateFormState) => void;
  isNew?: boolean;
  bodyRef: React.RefObject<HTMLTextAreaElement>;
  rejectionMeta?: Record<RejectionLetterType, { label: string; code: string; effectiveDate: string }>;
  knownFooters?: string[];
  letterCodes?: Array<{ code: string; filename: string; effectiveDate?: string }>;
}

function TemplateEditor({ form, setForm, isNew, bodyRef, rejectionMeta, knownFooters, letterCodes }: TemplateEditorProps) {
  const { toast } = useToast();
  const detectCodeFromName = (name: string) => {
    const lower = name.toLowerCase();
    if (!letterCodes || letterCodes.length === 0) return "";
    // try filename keywords
    for (const c of letterCodes) {
      const fname = (c.filename || "").toLowerCase();
      if (lower.includes("non-teach") || lower.includes("non teaching") || lower.includes("non-teaching")) {
        if (fname.includes("non-teach") || fname.includes("non teaching") || fname.includes("non-teaching") || /004a?/i.test(c.code)) return c.code;
      }
      if (lower.includes("teaching") || lower.includes("teach")) {
        if (fname.includes("teaching") || fname.includes("teach") || /004\./i.test(c.code) || /007/.test(c.code)) return c.code;
      }
      if (lower.includes("not qual") || lower.includes("not qualified")) {
        if (fname.includes("not qual") || fname.includes("not qualified") || /003/.test(c.code)) return c.code;
      }
    }
    // fallback by code patterns
    for (const c of letterCodes) {
      if (/003/.test(c.code) && lower.includes("not")) return c.code;
    }
    return "";
  };

  const updateForRejectionType = (nextCode: string) => {
    const shouldApply = isNew && form.linkedStatus === "Rejected";
    const meta = nextCode ? letterCodes?.find((l) => l.code === nextCode) : undefined;
    const fallbackLabel = meta?.code ? Object.values(rejectionMeta || {}).find((entry) => entry.code === meta.code)?.label : undefined;
    const displayTitle = deriveLetterDisplayTitle(meta?.filename ?? nextCode, nextCode, fallbackLabel);

    // Apply the name/subject immediately so the form doesn't appear blank while the DOCX loads.
    if (shouldApply) {
      setForm({
        ...form,
        templateName: displayTitle,
        subject: displayTitle,
        rejectionLetterType: nextCode,
        body: form.body
      });
    }

    // fetch the full text for the letter and insert it as the body
        (async () => {
      try {
        const content = nextCode ? await fetchLetterContent(nextCode) : null;
        let text = content?.text ?? meta?.code ?? "";

        // Trim leading address/preamble so the inserted body starts at the greeting (Dear...)
        const trimToGreeting = (src: string) => {
          if (!src) return src;
          const L = src.split(/\r?\n/);
          // find first line that starts with 'Dear' (case-insensitive)
          let greet = -1;
          for (let i = 0; i < L.length; i++) {
            if (/^\s*dear\b/i.test(L[i])) { greet = i; break; }
          }
          if (greet >= 0) {
            return L.slice(greet).join('\n');
          }
          // otherwise remove leading Date: or empty/name/job/department lines until we hit an empty line or text that looks like a paragraph
          let start = 0;
          while (start < L.length) {
            const line = (L[start] || '').trim();
            if (!line) { start++; continue; }
            if (/^date\s*:/i.test(line)) { start++; continue; }
            // a single-line name or job or department likely part of address - skip first up to 4 consecutive short lines
            if (start < 6 && /^\w[\w\s.,'-]{0,60}$/.test(line) && line.length < 60) { start++; continue; }
            break;
          }
          return L.slice(start).join('\n');
        };

        text = trimToGreeting(text);
        // Replace bracketed placeholder texts (from DOCX) with system placeholders
        const bracketMappings: Array<{ pattern: RegExp; replace: string }> = [
          { pattern: /\[\s*Name of Position applied for\s*\]/ig, replace: "{{jobTitle}}" },
          { pattern: /\[\s*Position applied for\s*\]/ig, replace: "{{jobTitle}}" },
          { pattern: /\[\s*Name of Position\s*\]/ig, replace: "{{jobTitle}}" }
        ];
        for (const m of bracketMappings) {
          text = text.replace(m.pattern, m.replace);
        }

        // Replace runs of underscores with placeholders based on nearby labels
        function fillUnderscoresWithPlaceholders(src: string) {
          if (!src) return src;
          const lines = src.split(/\r?\n/);
          const placeholderFallback = ["{{applicantName}}", "{{jobTitle}}", "{{department}}", "{{date}}", "{{today}}", "{{signature}}"];
          let fallbackIndex = 0;

          const labelToPlaceholder = (label: string) => {
            const l = label.toLowerCase();
            // greetings and title cues -> applicant name
            if (l.includes("dear") || l.includes("mr") || l.includes("mrs") || l.includes("ms") || l.includes("sir") || l.includes("maam") || l.includes("madam")) return "{{applicantName}}";
            if (l.includes("applicant") || l.includes("name") || l.includes("recipient")) return "{{applicantName}}";
            if (l.includes("position") || l.includes("vacancy") || l.includes("post") || l.includes("job")) return "{{jobTitle}}";
            if (l.includes("department")) return "{{department}}";
            if (l.includes("date") || l.includes("effective")) return "{{date}}";
            if (l.includes("signature") || l.includes("signed") || l.includes("oath")) return "{{signature}}";
            return "";
          };

          // track which label line indices we've consumed to avoid mapping multiple underscore lines to the same label
          const consumedLabelLines = new Set<number>();

          // Detect consecutive underscore-only lines at the top (address block). If there are multiple, skip replacing them.
          const topUnderscoreIndices = new Set<number>();
          for (let t = 0; t < Math.min(8, lines.length); t++) {
            const l = (lines[t] || "").trim();
            if (/^_+$/.test(l)) topUnderscoreIndices.add(t);
            else break;
          }

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!(/_{3,}/.test(line))) continue;

            // if this line is one of the top address underscores, skip replacement
            if (topUnderscoreIndices.has(i)) continue;

            // if the same line mentions 'referred' we should not replace the underline (manual input)
            if (/\breferred\b/i.test(line)) continue;

            // look for a label on the same line before underscores
            const before = line.split(/_{3,}/)[0] || "";
            let placeholder = "";
            let consumedLabelIndex: number | null = null;

            if (before.trim()) {
              placeholder = labelToPlaceholder(before);
              // no index for same-line label
            }

            // if not found, look at previous non-empty lines for a label (prefer the nearest)
            if (!placeholder) {
              for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
                let prev = lines[j].trim();
                if (!prev) continue;
                // skip lines that look like already-inserted placeholders (avoid chaining)
                if (/\{\{.*\}\}/.test(prev)) continue;
                const p = labelToPlaceholder(prev);
                if (p) {
                  // only use this prev label if we haven't already consumed it for an earlier underscore
                  if (!consumedLabelLines.has(j)) {
                    placeholder = p;
                    consumedLabelIndex = j;
                    break;
                  }
                }
              }
            }

            // if still not found, use fallback sequence
            if (!placeholder) {
              placeholder = placeholderFallback[fallbackIndex] || "{{value}}";
              fallbackIndex = Math.min(fallbackIndex + 1, placeholderFallback.length - 1);
            }
            // If the selected placeholder is a date but the same-line before text looks like a greeting/title,
            // prefer applicantName (avoid mapping 'Dear ___' to a date)
            if (placeholder === "{{date}}") {
              const beforeLow = before.toLowerCase();
              if (beforeLow.includes("dear") || /\b(mr|ms|mrs|sir|madam|miss)\b/.test(beforeLow)) {
                placeholder = "{{applicantName}}";
              }
              // also if the nearest consumed label line (if any) looks like a greeting, switch
              if (!placeholder && consumedLabelIndex !== null) {
                const consumedText = (lines[consumedLabelIndex] || "").toLowerCase();
                if (consumedText.includes("dear") || /\b(mr|ms|mrs|sir|madam|miss)\b/.test(consumedText)) {
                  placeholder = "{{applicantName}}";
                }
              }
            }

            // Do not replace underscore runs that are intended for manual input after signature or specific phrases.
            // If a prior non-empty line (up to 3 lines above) contains signature closers or 'referred to' phrasing, skip replacement.
            const priorLinesCheck = (n: number) => {
              for (let k = 1; k <= n; k++) {
                const idx = i - k;
                if (idx < 0) break;
                const txt = (lines[idx] || "").toLowerCase();
                if (!txt.trim()) continue;
                if (/(very truly yours|yours truly|sincerely|faithfully|respectfully|very truly yours,)/.test(txt)) return true;
                if (txt.includes("referred to") || txt.includes("referred")) return true;
              }
              return false;
            };

            // if prior lines indicate signature or referred phrase, skip replacing underscores so user can input manually
            if (priorLinesCheck(3)) {
              continue; // leave the underscore run as-is
            }

            // mark consumed label index
            if (consumedLabelIndex !== null) consumedLabelLines.add(consumedLabelIndex);

            // replace the underscore run(s) on this line with the placeholder
            lines[i] = line.replace(/_{3,}/g, placeholder);
          }

          return lines.join("\n");
        }

        text = fillUnderscoresWithPlaceholders(text);

        // If applicantName placeholder appears directly after a signature closer, replace it with an underline
        const signaturePlaceholderRegex = /(very truly yours|yours truly|respectfully|sincerely|faithfully)[\.,]?\s*\n\s*\{\{applicantName\}\}/i;
        if (signaturePlaceholderRegex.test(text)) {
          text = text.replace(signaturePlaceholderRegex, (m, p1) => `${p1}\n\n______________________________`);
        }
        const eff = content?.effectiveDate ?? meta?.effectiveDate ?? new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
        const newBody = shouldApply
          ? applyLetterFooter(text, content?.code ?? meta?.code ?? "", eff, knownFooters ?? [])
          : form.body;

        setForm({
          ...form,
          templateName: shouldApply ? displayTitle : form.templateName,
          subject: shouldApply ? displayTitle : form.subject,
          rejectionLetterType: nextCode,
          body: newBody
        });
      } catch (e) {
        // fallback: set code-only footer
        setForm({
          ...form,
          templateName: shouldApply ? displayTitle : form.templateName,
          subject: shouldApply ? displayTitle : form.subject,
          rejectionLetterType: nextCode,
          body: shouldApply ? applyLetterFooter(form.body, meta?.code ?? "", meta?.effectiveDate ?? "", knownFooters ?? []) : form.body
        });
      }
    })();
  };

  const insertPlaceholder = (placeholder: string) => {
    const ta = bodyRef.current;
    if (!ta) {
      setForm({ ...form, body: form.body + placeholder });
      return;
    }
    const start = ta.selectionStart ?? form.body.length;
    const end = ta.selectionEnd ?? form.body.length;
    const newBody = form.body.slice(0, start) + placeholder + form.body.slice(end);
    setForm({ ...form, body: newBody });
    // Restore cursor after insertion
    requestAnimationFrame(() => {
      ta.selectionStart = start + placeholder.length;
      ta.selectionEnd = start + placeholder.length;
      ta.focus();
    });
  };

  const handleBodyKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Backspace" && event.key !== "Delete") return;
    const target = event.currentTarget;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    if (start !== end) {
      if (selectionIntersectsProtected(form.body, start, end)) {
        event.preventDefault();
        toast({ title: "Protected text", description: "Required placeholders cannot be deleted.", variant: "destructive" });
      }
      return;
    }
    if (caretTouchesProtected(form.body, start, event.key as "Backspace" | "Delete")) {
      event.preventDefault();
      toast({ title: "Protected text", description: "Required placeholders cannot be deleted.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {isNew && (
        <div className="space-y-2">
          <Label>Linked to Status <span className="text-destructive">*</span></Label>
          <Select
            value={form.linkedStatus}
            onValueChange={(val) => {
              const detectedCode = val === "Rejected" ? (typeof (detectCodeFromName) === "function" ? detectCodeFromName(form.templateName) : "") : "";
              const meta = detectedCode ? (letterCodes || []).find((l) => l.code === detectedCode) : undefined;
              setForm({
                ...form,
                linkedStatus: val,
                templateGroup: groupFromStatus(val),
                rejectionLetterType: detectedCode,
                body: val === "Rejected"
                  ? applyLetterFooter(form.body, meta?.code ?? "", meta?.effectiveDate ?? "", knownFooters ?? [])
                  : removeKnownLetterFooter(form.body, knownFooters ?? [])
              });
            }}
          >
                  <SelectTrigger>
              <SelectValue placeholder="Pick an application status" />
            </SelectTrigger>
            <SelectContent>
              {APPLICATION_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            This template will be used when an applicant's status changes to the selected stage.
          </p>

          {form.linkedStatus === "Rejected" && (
            <div className="space-y-2 pt-2">
              <Label>Rejection Letter Type <span className="text-destructive">*</span></Label>
              <Label>Rejection Letter Type <span className="text-destructive">*</span></Label>
              <Select value={form.rejectionLetterType} onValueChange={(value) => updateForRejectionType(value as string)}>
                <SelectTrigger>
                  <SelectValue placeholder="Auto-detect from template name or pick one" />
                </SelectTrigger>
                <SelectContent>
                  {(letterCodes && letterCodes.length > 0)
                    ? letterCodes.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.filename}
                        </SelectItem>
                      ))
                    : (Object.entries(rejectionMeta) as Array<[RejectionLetterType, { label: string; code: string; effectiveDate: string }]>).map(([type, meta]) => (
                        <SelectItem key={type} value={meta.code || type}>
                          {meta.label}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The letter code and effective date footer is automatically appended at the bottom.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label>Template Name <span className="text-destructive">*</span></Label>
        <Input
          value={form.templateName}
            onChange={(e) => {
              const nextName = e.target.value;
              if (isNew && form.linkedStatus === "Rejected") {
                const detectedCode = typeof (detectCodeFromName) === "function" ? detectCodeFromName(nextName) : "";
                const chosen = detectedCode || form.rejectionLetterType;
                const meta = chosen ? (letterCodes || []).find((l) => l.code === chosen) : undefined;
                setForm({
                  ...form,
                  templateName: nextName,
                  rejectionLetterType: detectedCode || form.rejectionLetterType,
                  body: applyLetterFooter(form.body, meta?.code ?? "", meta?.effectiveDate ?? "", knownFooters ?? [])
                });
                return;
              }
              setForm({ ...form, templateName: nextName });
            }}
          placeholder="e.g. Interview Invitation"
        />
      </div>

      <div className="space-y-2">
        <Label>Subject <span className="text-destructive">*</span></Label>
        <Input
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          placeholder="e.g. Invitation for Interview – {{jobTitle}}"
        />
      </div>

      <div className="space-y-2">
        <Label>Body <span className="text-destructive">*</span></Label>
        <PlaceholderChips onInsert={insertPlaceholder} />
        <Textarea
          ref={bodyRef}
          className="min-h-[280px] font-mono text-sm"
          value={form.body}
          onKeyDown={handleBodyKeyDown}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder={`Dear {{applicantName}},\n\nWe are pleased to invite you for an interview for the {{jobTitle}} position.\n\nDate: {{date}}\n\nBest regards,\nHR Department`}
        />
        <div className="rounded-lg bg-muted/40 border border-border/50 px-3 py-2 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Protected placeholders:</p>
          <div className="flex flex-wrap gap-1.5">
            {PROTECTED_PLACEHOLDERS.map((p) => {
              const missing = !form.body.includes(p);
              return (
                <span
                  key={p}
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono border ${
                    missing
                      ? "bg-destructive/10 border-destructive/40 text-destructive"
                      : "bg-green-50 border-green-300 text-green-700"
                  }`}
                >
                  {missing ? "✗" : "✓"} {p}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Archive() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const editBodyRef = useRef<HTMLTextAreaElement>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Edit template dialog
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [editForm, setEditForm] = useState<TemplateFormState>({
    templateName: "",
    templateGroup: "rejection",
    subject: "",
    body: "",
    linkedStatus: "",
    rejectionLetterType: ""
  });

  // Add template dialog
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [addForm, setAddForm] = useState<TemplateFormState>({
    templateName: "",
    templateGroup: "qualification",
    subject: "",
    body: "",
    linkedStatus: "",
    rejectionLetterType: ""
  });

  // Delete template confirmation
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ templateKey: string; templateName: string } | null>(null);

  const [showDurationEditor, setShowDurationEditor] = useState(false);
  const [newDuration, setNewDuration] = useState(30);

  const { data: applicants = [], isLoading: loadingApplicants } = useQuery({ queryKey: ["applicants"], queryFn: fetchApplicants });
  const { data: applications = [], isLoading: loadingApplications } = useQuery({ queryKey: ["applications"], queryFn: fetchApplications });
  const { data: jobs = [], isLoading: loadingJobs } = useQuery({ queryKey: ["jobs"], queryFn: fetchJobs });
  const { data: emailTemplates = [], isLoading: loadingTemplates } = useQuery({ queryKey: ["email-templates"], queryFn: fetchEmailTemplates });
  const { data: letterCodes = [], isLoading: loadingLetterCodes } = useQuery({ queryKey: ["letter-codes"], queryFn: fetchLetterCodes });
  const { data: archivedVacancies = [], isLoading: loadingArchivedVacancies } = useQuery({ queryKey: ["archived-vacancies"], queryFn: fetchArchivedVacancies });
  const { data: archiveDurationData } = useQuery({ queryKey: ["archive-duration"], queryFn: getArchiveDurationSetting });

  const restoreMutation = useMutation({
    mutationFn: (vacancyId: string) => restoreArchivedVacancy(vacancyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["archived-vacancies"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "Vacancy restored", description: "The vacancy has been restored to active listings." });
    },
    onError: (error) => {
      toast({ title: "Restore failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const updateDurationMutation = useMutation({
    mutationFn: (days: number) => updateArchiveDurationSetting(days),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["archive-duration"] });
      queryClient.invalidateQueries({ queryKey: ["archived-vacancies"] });
      setShowDurationEditor(false);
      toast({ title: "Duration updated", description: `Archive retention period set to ${data.days} days.` });
    },
    onError: (error) => {
      toast({ title: "Update failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  useEffect(() => {
    if (archiveDurationData?.days) setNewDuration(archiveDurationData.days);
  }, [archiveDurationData]);

  const saveTemplateMutation = useMutation({
    mutationFn: ({ templateKey, payload }: { templateKey: EmailTemplate["templateKey"]; payload: Omit<EmailTemplate, "templateKey" | "updatedAt"> }) =>
      updateEmailTemplate(templateKey, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setEditingTemplate(null);
      toast({ title: "Template saved", description: "Email template updated successfully." });
    },
    onError: (error) => {
      toast({ title: "Save failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const createTemplateMutation = useMutation({
    mutationFn: (payload: Omit<EmailTemplate, "templateKey" | "updatedAt"> & { linkedStatus: string }) =>
      createEmailTemplate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setShowAddTemplate(false);
      setAddForm({ templateName: "", templateGroup: "qualification", subject: "", body: "", linkedStatus: "", rejectionLetterType: "" });
      toast({ title: "Template created", description: "New email template was added." });
    },
    onError: (error) => {
      toast({ title: "Create failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (templateKey: EmailTemplate["templateKey"]) => deleteEmailTemplate(templateKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setDeleteConfirmation(null);
      toast({ title: "Template deleted", description: "Email template has been deleted successfully." });
    },
    onError: (error) => {
      toast({ title: "Delete failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const rows = useMemo<ArchiveRow[]>(() => {
    if (applications.length === 0) {
      return applicants.map((applicant) => ({
        id: `no-app-${applicant.id}`,
        applicantName: applicant.fullName,
        applicantEmail: applicant.email,
        positionTitle: "No application",
        status: "No Application",
        dateApplied: "-",
        remarks: "-"
      }));
    }
    const mapped = applications.map((application) => {
      const applicant = applicants.find((a) => a.id === application.applicantId);
      const job = jobs.find((j) => j.id === application.vacancyId);
      return {
        id: application.id,
        applicantName: applicant?.fullName ?? "Unknown applicant",
        applicantEmail: applicant?.email ?? "-",
        positionTitle: job?.positionTitle ?? "Unknown position",
        status: application.status,
        dateApplied: application.dateApplied,
        remarks: application.remarks ?? "-"
      };
    });
    return mapped.sort((a, b) => b.dateApplied.localeCompare(a.dateApplied));
  }, [applications, applicants, jobs]);

  const statusOptions = useMemo(() => {
    const unique = Array.from(new Set(rows.map((row) => row.status)));
    return unique.sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch =
        needle.length === 0 ||
        row.applicantName.toLowerCase().includes(needle) ||
        row.applicantEmail.toLowerCase().includes(needle) ||
        row.positionTitle.toLowerCase().includes(needle) ||
        row.status.toLowerCase().includes(needle);
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, statusFilter]);

  const templatesByGroup = useMemo(() => ({
    rejection: emailTemplates.filter((t) => t.templateGroup === "rejection").filter((template) => {
      if (!isDefaultTemplate(template)) return true;
      return !emailTemplates.some((entry) => !isDefaultTemplate(entry) && entry.linkedStatus === template.linkedStatus);
    }),
    qualification: emailTemplates.filter((t) => t.templateGroup === "qualification").filter((template) => {
      if (!isDefaultTemplate(template)) return true;
      return !emailTemplates.some((entry) => !isDefaultTemplate(entry) && entry.linkedStatus === template.linkedStatus);
    })
  }), [emailTemplates]);

  // Build rejection mapping from scanned letter files (fallback to today's date when missing)
  const rejectionMeta = useMemo(() => {
    const today = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
    const base: Record<RejectionLetterType, { label: string; code: string; effectiveDate: string }> = {
      not_qualified: { label: "Letter for Not Qualified Applicants", code: "", effectiveDate: today },
      non_teaching: { label: "Letter of Regret (For Interviewed Non-Teaching Applicants)", code: "", effectiveDate: today },
      teaching: { label: "Letter of Regret (For Interviewed Teaching Applicants)", code: "", effectiveDate: today }
    };

    (letterCodes || []).forEach((c) => {
      const fname = String(c.filename).toLowerCase();
      if (fname.includes("non-teach") || fname.includes("non teaching") || fname.includes("non-teaching")) {
        base.non_teaching.code = c.code;
        base.non_teaching.effectiveDate = c.effectiveDate ?? base.non_teaching.effectiveDate;
      } else if (fname.includes("teach") || fname.includes("teaching")) {
        base.teaching.code = c.code;
        base.teaching.effectiveDate = c.effectiveDate ?? base.teaching.effectiveDate;
      } else if (fname.includes("not qual") || fname.includes("not qualified")) {
        base.not_qualified.code = c.code;
        base.not_qualified.effectiveDate = c.effectiveDate ?? base.not_qualified.effectiveDate;
      } else {
        // fallback by code patterns
        if (c.code.includes("003")) {
          base.not_qualified.code = c.code;
          base.not_qualified.effectiveDate = c.effectiveDate ?? base.not_qualified.effectiveDate;
        }
        if (/004a?/i.test(c.code)) {
          base.non_teaching.code = c.code;
          base.non_teaching.effectiveDate = c.effectiveDate ?? base.non_teaching.effectiveDate;
        }
        if (/007/.test(c.code)) {
          // 007 usually published instructor regret - map to teaching
          base.teaching.code = c.code;
          base.teaching.effectiveDate = c.effectiveDate ?? base.teaching.effectiveDate;
        }
      }
    });

    return base;
  }, [letterCodes]);

  const knownFooters = useMemo(() => {
    return (Object.values(rejectionMeta) || []).filter((m) => m.code).map((m) => `${m.code}\nEffective date: ${m.effectiveDate}`);
  }, [rejectionMeta]);

  const bodyPreview = (body: string) => body.replace(/\s+/g, " ").trim().slice(0, 200);

  const openTemplateEditor = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setEditForm({
      templateName: template.templateName,
      templateGroup: template.templateGroup,
      subject: template.subject,
      body: template.body,
      linkedStatus: template.linkedStatus ?? (template.templateGroup === "rejection" ? "Rejected" : "Approved"),
      rejectionLetterType: ""
    });
  };

  const validateForm = (form: TemplateFormState, isNew: boolean) => {
    if (!form.templateName.trim()) return "Template name is required.";
    if (!form.subject.trim()) return "Subject is required.";
    if (!form.body.trim()) return "Body is required.";
    if (isNew && !form.linkedStatus) return "Please select a linked application status.";
    if (isNew && form.linkedStatus === "Rejected" && !form.rejectionLetterType) {
      return "Please select the rejection letter type so the correct footer can be applied.";
    }
    return null;
  };

  const isLoading = loadingApplicants || loadingApplications || loadingJobs;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display text-foreground">Archive</h1>
        <p className="text-sm text-muted-foreground mt-1">Applicant logs and application history</p>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              placeholder="Search by applicant, email, position, or status"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="Filter by status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Email Templates Section */}
      <Card className="overflow-hidden">
        <Accordion type="single" collapsible>
          <AccordionItem value="email-templates" className="border-0">
            <AccordionTrigger className="px-5 py-4 hover:no-underline">
              <div className="text-left">
                <h2 className="text-lg font-semibold text-foreground">Email Templates</h2>
                <p className="text-sm text-muted-foreground mt-1">Click to view or edit rejection and qualification templates.</p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-5 pb-5 pt-0">
              {loadingTemplates ? (
                <p className="text-sm text-muted-foreground">Loading templates...</p>
              ) : (
                <div className="space-y-6">
                  {user?.role === "admin" && (
                    <div className="flex justify-end">
                      <Button onClick={() => setShowAddTemplate(true)}>
                        <Plus className="w-4 h-4 mr-2" /> Add New Template
                      </Button>
                    </div>
                  )}

                  {(["rejection", "qualification"] as const).map((group) => (
                    <div key={group} className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold text-foreground capitalize">{group} Templates</h3>
                        <span className="text-xs text-muted-foreground">{templatesByGroup[group].length} template(s)</span>
                      </div>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {templatesByGroup[group].map((template) => (
                          <div key={template.templateKey} className="rounded-xl border border-border/60 bg-background p-4 shadow-sm space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold text-foreground truncate">{template.templateName}</p>
                                <p className="text-xs text-muted-foreground">Key: {template.templateKey}</p>
                              </div>
                              {user?.role === "admin" && (
                                <div className="flex gap-2">
                                  <Button variant="outline" size="sm" onClick={() => openTemplateEditor(template)}>
                                    <Pencil className="w-4 h-4 mr-2" /> Edit
                                  </Button>
                                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteConfirmation({ templateKey: template.templateKey, templateName: template.templateName })}>
                                    <Trash2 className="w-4 h-4 mr-2" /> Delete
                                  </Button>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span className="rounded-full bg-muted px-2.5 py-1">Subject: {template.subject}</span>
                              <span className="rounded-full bg-muted px-2.5 py-1">Updated: {new Date(template.updatedAt).toLocaleDateString()}</span>
                            </div>
                            <div className="rounded-lg bg-muted/30 border border-border/50 p-3 text-sm whitespace-pre-wrap leading-6 max-h-36 overflow-auto">
                              {bodyPreview(template.body)}
                            </div>
                          </div>
                        ))}
                        {templatesByGroup[group].length === 0 && (
                          <p className="text-sm text-muted-foreground col-span-2">No {group} templates yet.</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

      {/* Archive Table */}
      <Card>
        <CardContent className="pt-5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading archive...</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No archive records found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-primary text-primary-foreground text-left">
                    <th className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Applicant</th>
                    <th className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Email</th>
                    <th className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Position</th>
                    <th className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Status</th>
                    <th className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Date Applied</th>
                    <th className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={`border-b border-border/20 transition-colors ${
                        idx % 2 === 0 ? "bg-background hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/20"
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-foreground">{row.applicantName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.applicantEmail}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.positionTitle}</td>
                      <td className="px-4 py-3">
                        <span className="status-badge bg-muted text-muted-foreground">{row.status}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {row.dateApplied === "-" ? "-" : new Date(row.dateApplied).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.remarks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Archived Vacancies */}
      <Card>
        <CardContent className="pt-5">
          <div className="mb-4">
            <div className="flex items-center justify-between gap-4 mb-2">
              <h2 className="text-lg font-semibold text-foreground">Archived Vacancies</h2>
              {user?.role === "admin" && (
                <div className="flex items-center gap-2">
                  {!showDurationEditor ? (
                    <Button variant="outline" size="sm" onClick={() => setShowDurationEditor(true)}>
                      Set Retention Period
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="1"
                        max="180"
                        value={newDuration}
                        onChange={(e) => setNewDuration(parseInt(e.target.value) || 30)}
                        className="w-20"
                        placeholder="Days"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (newDuration >= 1 && newDuration <= 180) {
                            updateDurationMutation.mutate(newDuration);
                          } else {
                            toast({ title: "Invalid duration", description: "Duration must be between 1 and 180 days.", variant: "destructive" });
                          }
                        }}
                        disabled={updateDurationMutation.isPending}
                      >
                        Save
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowDurationEditor(false)}>Cancel</Button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Vacancies that have passed their closing date. They will be permanently deleted after {archiveDurationData?.days || 30} days.
            </p>
          </div>

          {loadingArchivedVacancies ? (
            <p className="text-sm text-muted-foreground">Loading archived vacancies...</p>
          ) : archivedVacancies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No archived vacancies at this time.</p>
          ) : (
            <div className="space-y-3">
              {archivedVacancies.map((vacancy) => (
                <div key={vacancy.id} className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{vacancy.positionTitle}</h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>SG-{vacancy.salaryGrade}</span>
                        <span>•</span>
                        <span>Closed: {new Date(vacancy.closingDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => restoreMutation.mutate(vacancy.id)}
                      disabled={restoreMutation.isPending}
                    >
                      Restore
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <div className="rounded bg-muted/50 p-2">
                      <p className="text-muted-foreground">Archived</p>
                      <p className="font-medium text-foreground">{new Date(vacancy.archivedAt).toLocaleDateString()}</p>
                    </div>
                    <div className="rounded bg-muted/50 p-2">
                      <p className="text-muted-foreground">Days Until Delete</p>
                      <p className={`font-medium ${vacancy.daysUntilDeletion <= 7 ? "text-destructive" : "text-foreground"}`}>
                        {vacancy.daysUntilDeletion} days
                      </p>
                    </div>
                    <div className="rounded bg-muted/50 p-2">
                      <p className="text-muted-foreground">Posted</p>
                      <p className="font-medium text-foreground">{new Date(vacancy.postingDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Template Dialog */}
      <Dialog open={Boolean(editingTemplate)} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Email Template</DialogTitle>
          </DialogHeader>
          <TemplateEditor form={editForm} setForm={setEditForm} bodyRef={editBodyRef} rejectionMeta={rejectionMeta} knownFooters={knownFooters} letterCodes={letterCodes} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => setEditingTemplate(null)}>Cancel</Button>
            <Button
              type="button"
              disabled={saveTemplateMutation.isPending}
              onClick={() => {
                if (!editingTemplate) return;
                const error = validateForm(editForm, false);
                if (error) {
                  toast({ title: "Validation error", description: error, variant: "destructive" });
                  return;
                }
                saveTemplateMutation.mutate({
                  templateKey: editingTemplate.templateKey,
                  payload: {
                    templateName: editForm.templateName,
                    templateGroup: editForm.templateGroup,
                    linkedStatus: editForm.linkedStatus,
                    subject: editForm.subject,
                    body: editForm.body
                  }
                });
              }}
            >
              Save Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Template Dialog */}
      <Dialog open={showAddTemplate} onOpenChange={(open) => {
        setShowAddTemplate(open);
        if (!open) setAddForm({ templateName: "", templateGroup: "qualification", subject: "", body: "", linkedStatus: "", rejectionLetterType: "" });
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Email Template</DialogTitle>
          </DialogHeader>
          <TemplateEditor form={addForm} setForm={setAddForm} isNew bodyRef={bodyRef} rejectionMeta={rejectionMeta} knownFooters={knownFooters} letterCodes={letterCodes} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" type="button" onClick={() => setShowAddTemplate(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={createTemplateMutation.isPending}
              onClick={() => {
                const error = validateForm(addForm, true);
                if (error) {
                  toast({ title: "Validation error", description: error, variant: "destructive" });
                  return;
                }
                createTemplateMutation.mutate({
                  templateName: addForm.templateName,
                  templateGroup: addForm.templateGroup,
                  subject: addForm.subject,
                  body: addForm.body,
                  linkedStatus: addForm.linkedStatus
                });
              }}
            >
              Create Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Template Confirmation Dialog */}
      <Dialog open={!!deleteConfirmation} onOpenChange={(open) => {
        if (!open) setDeleteConfirmation(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete the template <span className="font-semibold text-foreground">"{deleteConfirmation?.templateName}"</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmation(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={deleteTemplateMutation.isPending}
                onClick={() => {
                  if (deleteConfirmation?.templateKey) {
                    deleteTemplateMutation.mutate(deleteConfirmation.templateKey);
                  }
                }}
              >
                {deleteTemplateMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}