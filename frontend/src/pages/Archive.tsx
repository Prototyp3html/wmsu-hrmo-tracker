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
import { fetchApplicants, fetchApplications, fetchEmailTemplates, fetchJobs, updateEmailTemplate, fetchArchivedVacancies, restoreArchivedVacancy, getArchiveDurationSetting, updateArchiveDurationSetting, createEmailTemplate, deleteEmailTemplate } from "@/lib/api";
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

// Available placeholders users can insert
const AVAILABLE_PLACEHOLDERS = [
  { label: "Applicant Name", value: "{{applicantName}}" },
  { label: "Job Title", value: "{{jobTitle}}" },
  { label: "Date", value: "{{date}}" },
  { label: "Exam Date", value: "{{examDate}}" },
  { label: "Exam Venue", value: "{{examVenue}}" },
  { label: "Interview Date", value: "{{interviewDate}}" },
  { label: "Interview Venue", value: "{{interviewVenue}}" },
  { label: "Final Eval Date", value: "{{finalEvalDate}}" },
  { label: "Final Eval Venue", value: "{{finalEvalVenue}}" },
] as const;

const REQUIRED_PLACEHOLDERS = ["{{applicantName}}", "{{jobTitle}}", "{{date}}"] as const;

function getPlaceholderRanges(text: string) {
  return REQUIRED_PLACEHOLDERS.flatMap((placeholder) => {
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
}

interface TemplateEditorProps {
  form: TemplateFormState;
  setForm: (f: TemplateFormState) => void;
  isNew?: boolean;
  bodyRef: React.RefObject<HTMLTextAreaElement>;
}

function TemplateEditor({ form, setForm, isNew, bodyRef }: TemplateEditorProps) {
  const { toast } = useToast();

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
            onValueChange={(val) =>
              setForm({ ...form, linkedStatus: val, templateGroup: groupFromStatus(val) })
            }
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
        </div>
      )}

      <div className="space-y-2">
        <Label>Template Name <span className="text-destructive">*</span></Label>
        <Input
          value={form.templateName}
          onChange={(e) => setForm({ ...form, templateName: e.target.value })}
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
          <p className="text-xs font-medium text-muted-foreground">Required placeholders:</p>
          <div className="flex flex-wrap gap-1.5">
            {REQUIRED_PLACEHOLDERS.map((p) => {
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
    linkedStatus: ""
  });

  // Add template dialog
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [addForm, setAddForm] = useState<TemplateFormState>({
    templateName: "",
    templateGroup: "qualification",
    subject: "",
    body: "",
    linkedStatus: ""
  });

  // Delete template confirmation
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ templateKey: string; templateName: string } | null>(null);

  const [showDurationEditor, setShowDurationEditor] = useState(false);
  const [newDuration, setNewDuration] = useState(30);

  const { data: applicants = [], isLoading: loadingApplicants } = useQuery({ queryKey: ["applicants"], queryFn: fetchApplicants });
  const { data: applications = [], isLoading: loadingApplications } = useQuery({ queryKey: ["applications"], queryFn: fetchApplications });
  const { data: jobs = [], isLoading: loadingJobs } = useQuery({ queryKey: ["jobs"], queryFn: fetchJobs });
  const { data: emailTemplates = [], isLoading: loadingTemplates } = useQuery({ queryKey: ["email-templates"], queryFn: fetchEmailTemplates });
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
      setAddForm({ templateName: "", templateGroup: "qualification", subject: "", body: "", linkedStatus: "" });
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
    rejection: emailTemplates.filter((t) => t.templateGroup === "rejection"),
    qualification: emailTemplates.filter((t) => t.templateGroup === "qualification")
  }), [emailTemplates]);

  const bodyPreview = (body: string) => body.replace(/\s+/g, " ").trim().slice(0, 200);

  const openTemplateEditor = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setEditForm({
      templateName: template.templateName,
      templateGroup: template.templateGroup,
      subject: template.subject,
      body: template.body,
      linkedStatus: template.linkedStatus ?? (template.templateGroup === "rejection" ? "Rejected" : "Approved")
    });
  };

  const validateForm = (form: TemplateFormState, isNew: boolean) => {
    if (!form.templateName.trim()) return "Template name is required.";
    if (!form.subject.trim()) return "Subject is required.";
    if (!form.body.trim()) return "Body is required.";
    if (isNew && !form.linkedStatus) return "Please select a linked application status.";
    const missing = REQUIRED_PLACEHOLDERS.filter((p) => !form.body.includes(p));
    if (missing.length > 0) return `Missing required placeholders: ${missing.join(", ")}`;
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
          <TemplateEditor form={editForm} setForm={setEditForm} bodyRef={editBodyRef} />
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
        if (!open) setAddForm({ templateName: "", templateGroup: "qualification", subject: "", body: "", linkedStatus: "" });
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Email Template</DialogTitle>
          </DialogHeader>
          <TemplateEditor form={addForm} setForm={setAddForm} isNew bodyRef={bodyRef} />
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