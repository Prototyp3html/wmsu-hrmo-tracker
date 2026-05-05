import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { fetchApplicants, fetchApplications, fetchEmailTemplates, fetchJobs, updateEmailTemplate, fetchArchivedVacancies, restoreArchivedVacancy, getArchiveDurationSetting, updateArchiveDurationSetting } from "@/lib/api";
import type { EmailTemplate } from "@/lib/types";
import { Search, Pencil } from "lucide-react";
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
    if (key === "Backspace") {
      return caret > range.start && caret <= range.end;
    }
    return caret >= range.start && caret < range.end;
  });
}

export default function Archive() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({
    templateName: "",
    templateGroup: "rejection" as EmailTemplate["templateGroup"],
    subject: "",
    body: ""
  });
  const [showDurationEditor, setShowDurationEditor] = useState(false);
  const [newDuration, setNewDuration] = useState(30);

  const { data: applicants = [], isLoading: loadingApplicants } = useQuery({
    queryKey: ["applicants"],
    queryFn: fetchApplicants
  });

  const { data: applications = [], isLoading: loadingApplications } = useQuery({
    queryKey: ["applications"],
    queryFn: fetchApplications
  });

  const { data: jobs = [], isLoading: loadingJobs } = useQuery({
    queryKey: ["jobs"],
    queryFn: fetchJobs
  });

  const { data: emailTemplates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ["email-templates"],
    queryFn: fetchEmailTemplates
  });

  const { data: archivedVacancies = [], isLoading: loadingArchivedVacancies } = useQuery({
    queryKey: ["archived-vacancies"],
    queryFn: fetchArchivedVacancies
  });

  const { data: archiveDurationData, isLoading: loadingDuration } = useQuery({
    queryKey: ["archive-duration"],
    queryFn: getArchiveDurationSetting
  });

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

  // Sync newDuration with fetched data
  useEffect(() => {
    if (archiveDurationData?.days) {
      setNewDuration(archiveDurationData.days);
    }
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
    rejection: emailTemplates.filter((template) => template.templateGroup === "rejection"),
    qualification: emailTemplates.filter((template) => template.templateGroup === "qualification")
  }), [emailTemplates]);

  const bodyPreview = (body: string) => body.replace(/\s+/g, " ").trim().slice(0, 200);

  const openTemplateEditor = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({
      templateName: template.templateName,
      templateGroup: template.templateGroup,
      subject: template.subject,
      body: template.body
    });
  };

  const missingPlaceholders = REQUIRED_PLACEHOLDERS.filter((placeholder) => !templateForm.body.includes(placeholder));

  const handleTemplateBodyKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Backspace" && event.key !== "Delete") return;

    const target = event.currentTarget;
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;

    if (start !== end) {
      if (selectionIntersectsProtected(templateForm.body, start, end)) {
        event.preventDefault();
        toast({ title: "Protected text", description: "Required placeholders cannot be deleted.", variant: "destructive" });
      }
      return;
    }

    if (caretTouchesProtected(templateForm.body, start, event.key as "Backspace" | "Delete")) {
      event.preventDefault();
      toast({ title: "Protected text", description: "Required placeholders cannot be deleted.", variant: "destructive" });
    }
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
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
              placeholder="Search by applicant, email, position, or status"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

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
                                <Button variant="outline" size="sm" onClick={() => openTemplateEditor(template)}>
                                  <Pencil className="w-4 h-4 mr-2" /> Edit
                                </Button>
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

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

      <Dialog open={Boolean(editingTemplate)} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Email Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input value={templateForm.templateName} onChange={(e) => setTemplateForm((prev) => ({ ...prev, templateName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={templateForm.subject} onChange={(e) => setTemplateForm((prev) => ({ ...prev, subject: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Textarea
                className="min-h-[340px] font-mono text-sm"
                value={templateForm.body}
                onKeyDown={handleTemplateBodyKeyDown}
                onChange={(e) => setTemplateForm((prev) => ({ ...prev, body: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                You can use placeholders like {"{{applicantName}}"}, {"{{jobTitle}}"}, and {"{{date}}"}.
              </p>
              {missingPlaceholders.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  The required placeholders are locked and will be restored automatically.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" type="button" onClick={() => setEditingTemplate(null)}>Cancel</Button>
              <Button
                type="button"
                onClick={() => {
                  if (!editingTemplate) return;
                  if (missingPlaceholders.length > 0) {
                    toast({
                      title: "Required placeholders missing",
                      description: "Please keep {{applicantName}}, {{jobTitle}}, and {{date}} in the template.",
                      variant: "destructive"
                    });
                    return;
                  }
                  saveTemplateMutation.mutate({
                    templateKey: editingTemplate.templateKey,
                    payload: {
                      templateName: templateForm.templateName,
                      templateGroup: templateForm.templateGroup,
                      subject: templateForm.subject,
                      body: templateForm.body
                    }
                  });
                }}
                disabled={saveTemplateMutation.isPending || missingPlaceholders.length > 0}
              >
                Save Template
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="pt-5">
          <div className="mb-4">
            <div className="flex items-center justify-between gap-4 mb-2">
              <h2 className="text-lg font-semibold text-foreground">Archived Vacancies</h2>
              {user?.role === "Admin" && (
                <div className="flex items-center gap-2">
                  {!showDurationEditor ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowDurationEditor(true)}
                    >
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
                            toast({
                              title: "Invalid duration",
                              description: "Duration must be between 1 and 180 days.",
                              variant: "destructive"
                            });
                          }
                        }}
                        disabled={updateDurationMutation.isPending}
                      >
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDurationEditor(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Vacancies that have passed their closing date. They will be permanently deleted after {archiveDurationData?.days || 30} days.</p>
          </div>

          {loadingArchivedVacancies ? (
            <p className="text-sm text-muted-foreground">Loading archived vacancies...</p>
          ) : archivedVacancies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No archived vacancies at this time.</p>
          ) : (
            <div className="space-y-3">
              {archivedVacancies.map((vacancy) => (
                <div
                  key={vacancy.id}
                  className="rounded-lg border border-border/50 bg-background/50 p-4 space-y-3"
                >
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
    </div>
  );
}
