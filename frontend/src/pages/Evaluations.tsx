import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createEvaluation, fetchApplicants, fetchApplications, fetchEvaluations, fetchJobs, updateEvaluation, deleteEvaluation } from "@/lib/api";
import { Award, Trophy, Pencil, Trash2, Info, Ellipsis, X, Plus, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Evaluation, Panelist, PanelistScores } from "@/lib/types";

interface FormPanelist {
  id: string;
  name: string;
  scores: PanelistScores;
}

const FIRST_LEVEL_CRITERIA = {
  communicationSkills: { name: "Communication Skills", max: 10 },
  abilityToPresent: { name: "Ability to Present Ideas", max: 5 },
  alertness: { name: "Alertness", max: 5 },
  judgement: { name: "Judgement", max: 5 },
  emotionalStability: { name: "Emotional Stability", max: 5 },
  selfConfidence: { name: "Self-Confidence", max: 5 }
};

const SECOND_LEVEL_CRITERIA = {
  oralCommunication: { name: "Oral Communication", max: 100 },
  analyticalAbility: { name: "Analytical Ability", max: 100 },
  judgement: { name: "Judgement", max: 100 },
  initiative: { name: "Initiative", max: 100 },
  stressTolerance: { name: "Stress Tolerance", max: 100 },
  sensitivity: { name: "Sensitivity", max: 100 },
  serviceOrientation: { name: "Service Orientation", max: 100 }
};

// ─── Helpers (defined once, outside any component) ───────────────────────────

function calculateAverages(
  panelists: FormPanelist[],
  criteria: typeof FIRST_LEVEL_CRITERIA | typeof SECOND_LEVEL_CRITERIA
) {
  const averages: Record<string, number> = {};
  Object.keys(criteria).forEach((criterionKey) => {
    const scores = panelists
      .map((p) => p.scores[criterionKey])
      .filter((s): s is number => s !== undefined);
    if (scores.length > 0) {
      averages[`${criterionKey}Avg`] = scores.reduce((a, b) => a + b, 0) / scores.length;
    }
  });
  return averages;
}

function calculateTotalScore(
  panelists: FormPanelist[],
  criteria: typeof FIRST_LEVEL_CRITERIA | typeof SECOND_LEVEL_CRITERIA
) {
  const averages = calculateAverages(panelists, criteria);
  const avgValues = Object.values(averages);
  if (avgValues.length === 0) return 0;
  return avgValues.reduce((a, b) => a + b, 0) / avgValues.length;
}

function mapAveragesToScorePayload(
  averages: Record<string, number>,
  level: "first_level" | "second_level"
) {
  if (level === "first_level") {
    return {
      communicationSkills: averages.communicationSkillsAvg,
      abilityToPresent: averages.abilityToPresentAvg,
      alertness: averages.alertnessAvg,
      judgement: averages.judgementAvg,
      emotionalStability: averages.emotionalStabilityAvg,
      selfConfidence: averages.selfConfidenceAvg
    };
  }

  return {
    oralCommunication: averages.oralCommunicationAvg,
    analyticalAbility: averages.analyticalAbilityAvg,
    initiative: averages.initiativeAvg,
    stressTolerance: averages.stressToleranceAvg,
    sensitivity: averages.sensitivityAvg,
    serviceOrientation: averages.serviceOrientationAvg,
    judgement: averages.judgementAvg
  };
}

function getAverageScore(totalScore: number, level: "first_level" | "second_level") {
  const criteriaCount = level === "first_level" ? Object.keys(FIRST_LEVEL_CRITERIA).length : Object.keys(SECOND_LEVEL_CRITERIA).length;
  return criteriaCount > 0 ? totalScore / criteriaCount : totalScore;
}

// ─── Sub-components (defined outside Evaluations so React never remounts them) ─

interface EvalFormProps {
  panelists: FormPanelist[];
  setPanelists: (p: FormPanelist[]) => void;
  criteria?: typeof FIRST_LEVEL_CRITERIA | typeof SECOND_LEVEL_CRITERIA;
  level: "first_level" | "second_level";
}

function EvalForm({ panelists, setPanelists, criteria, level }: EvalFormProps) {
  const activeCriteria = criteria ?? (level === "first_level" ? FIRST_LEVEL_CRITERIA : SECOND_LEVEL_CRITERIA);
  const [showCountSelector, setShowCountSelector] = useState(panelists.length === 1 && !panelists[0].name);

  const handleSetPanelistCount = (count: number) => {
    const newPanelists = Array.from({ length: count }, () => ({
      id: Math.random().toString(36),
      name: "",
      scores: {}
    }));
    setPanelists(newPanelists);
    setShowCountSelector(false);
  };

  const handleAddPanelist = () => {
    setPanelists([...panelists, { id: Math.random().toString(36), name: "", scores: {} }]);
  };

  const handleRemovePanelist = (id: string) => {
    if (panelists.length > 1) {
      setPanelists(panelists.filter((p) => p.id !== id));
    }
  };

  const isFirst = level === "first_level";

  return (
    <div className="space-y-4">
      <div className="border rounded-lg px-4 py-3 flex gap-2.5 items-center bg-muted/40 border-border/60">
        <Info className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          {isFirst ? "First" : "Second"} Level Administrative Position Assessment
        </p>
      </div>

      {/* Panelists Count Selector */}
      {showCountSelector && (
        <div className="space-y-3 border rounded-lg p-4 bg-muted/30 border-border/60">
          <div>
            <Label className="text-sm font-semibold text-foreground block mb-3">How many panelists will evaluate this applicant?</Label>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((count) => (
                <Button
                  key={count}
                  type="button"
                  variant={panelists.length === count ? "default" : "outline"}
                  size="sm"
                  className={`w-8 h-8 text-sm font-semibold p-0 ${panelists.length === count ? "bg-primary text-white" : "border-border/60"}`}
                  onClick={() => handleSetPanelistCount(count)}
                >
                  {count}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Select a number, and the form will be populated with that many panelist slots.</p>
          </div>
        </div>
      )}

      {/* Panelists Section */}
      {!showCountSelector && (
        <div className="space-y-3 border rounded-lg p-4 bg-muted/20 border-border/50">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-bold text-foreground">Panel of Evaluators ({panelists.length})</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground text-xs"
                onClick={() => setShowCountSelector(true)}
              >
                Change Count
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleAddPanelist}>
                <Plus className="w-4 h-4 mr-2" />
                Add More
              </Button>
            </div>
          </div>

          {panelists.map((panelist, pIdx) => (
          <div key={panelist.id} className="space-y-2 p-3 bg-background border border-border/60 rounded-lg shadow-sm">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Panelist {pIdx + 1} Name</Label>
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck="false"
                  placeholder="Enter panelist name"
                  value={panelist.name}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  onChange={(e) => {
                    const updated = panelists.map((p, i) =>
                      i === pIdx ? { ...p, name: e.target.value } : p
                    );
                    setPanelists(updated);
                  }}
                />
              </div>
              {panelists.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => handleRemovePanelist(panelist.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>

            {/* Criteria for this panelist */}
            <div className="grid grid-cols-2 gap-3 mt-3 p-3 bg-muted/40 rounded-lg border border-border/30">
              {Object.entries(activeCriteria).map(([key, data]) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs flex justify-between">
                    <span>{data.name}</span>
                    <span className="text-muted-foreground">/{data.max}</span>
                  </Label>
                  <input
                    type="number"
                    autoComplete="off"
                    spellCheck="false"
                    min={0}
                    max={data.max}
                    placeholder={`0-${data.max}`}
                    value={panelist.scores[key] ?? ""}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    onChange={(e) => {
                      let val = e.target.value ? Number(e.target.value) : undefined;
                      if (val !== undefined) {
                        if (val < 0) val = 0;
                        if (val > data.max) val = data.max;
                      }
                      const updated = panelists.map((p, i) =>
                        i === pIdx
                          ? { ...p, scores: { ...p.scores, [key]: val } }
                          : p
                      );
                      setPanelists(updated);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        </div>
      )}

      {/* Averages Display */}
      {panelists.length > 0 && (
        <div className="space-y-2 p-3 bg-muted/30 border border-border/60 rounded-lg">
          <Label className="text-sm font-semibold text-foreground">Calculated Averages</Label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(calculateAverages(panelists, activeCriteria)).map(([key, avg]) => {
              const criterionKey = key.replace("Avg", "");
              const criterionData = (activeCriteria as any)[criterionKey];
              const criterionName = criterionData?.name || criterionKey;
              return (
                <div key={key} className="text-xs flex justify-between items-center py-0.5">
                  <span className="text-muted-foreground">{criterionName}:</span>
                  <span className="font-semibold text-foreground">{avg.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
          <div className="text-sm font-bold text-foreground mt-2 pt-2 border-t border-border/40 flex justify-between items-center">
            <span>General Average</span>
            <span>{calculateTotalScore(panelists, activeCriteria).toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Evaluations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingEvaluationId, setEditingEvaluationId] = useState<string | null>(null);
  const [positionFilter, setPositionFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState<"all" | "first_level" | "second_level">("all");
  const [isExportingReport, setIsExportingReport] = useState(false);

  // Form state for panelists
  const [formPanelists, setFormPanelists] = useState<FormPanelist[]>([
    { id: Math.random().toString(36), name: "", scores: {} }
  ]);
  const [formRemarks, setFormRemarks] = useState("");
  const [formApplicationId, setFormApplicationId] = useState("");

  // Edit form state for panelists
  const [editPanelists, setEditPanelists] = useState<FormPanelist[]>([]);
  const [editRemarks, setEditRemarks] = useState("");

  const { data: evaluations = [] } = useQuery({
    queryKey: ["evaluations"],
    queryFn: fetchEvaluations
  });

  const { data: applications = [] } = useQuery({
    queryKey: ["applications"],
    queryFn: fetchApplications
  });

  const { data: applicants = [] } = useQuery({
    queryKey: ["applicants"],
    queryFn: fetchApplicants
  });

  const { data: jobVacancies = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: fetchJobs
  });

  const createMutation = useMutation({
    mutationFn: createEvaluation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evaluations"] });
      setFormPanelists([{ id: Math.random().toString(36), name: "", scores: {} }]);
      setFormRemarks("");
      setFormApplicationId("");
      toast({ title: "Evaluation saved", description: "Assessment form was recorded." });
    },
    onError: (error) => {
      toast({ title: "Save failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Evaluation> }) =>
      updateEvaluation(id, payload as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evaluations"] });
      setShowEdit(false);
      setEditingEvaluationId(null);
      toast({ title: "Evaluation updated", description: "Assessment form was updated." });
    },
    onError: (error) => {
      toast({ title: "Update failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEvaluation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evaluations"] });
      toast({ title: "Evaluation removed", description: "Assessment form was deleted." });
    },
    onError: (error) => {
      toast({ title: "Delete failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const getApplicantName = (id: string) =>
    applicants.find((a) => a.id === id)?.fullName ?? "Unknown";

  const getVacancyTitle = (id: string) =>
    jobVacancies.find((v) => v.id === id)?.positionTitle ?? "Unknown";

  const getVacancyLevel = (vacancyId: string) => {
    const vacancy = jobVacancies.find((v) => v.id === vacancyId);
    return (vacancy as any)?.positionLevel ?? "first_level";
  };

  const selectedAppVacancy = applications.find((a) => a.id === formApplicationId);
  const vacancyLevel = selectedAppVacancy ? getVacancyLevel(selectedAppVacancy.vacancyId) : "first_level";

  const editingEvaluation = evaluations.find((ev) => ev.id === editingEvaluationId) ?? null;
  const editingApplication = applications.find((app) => app.id === editingEvaluation?.applicationId) ?? null;

  const handleOpenEdit = (evaluation: Evaluation) => {
    setEditingEvaluationId(evaluation.id);
    const panelists = evaluation.panelists || [];
    setEditPanelists(panelists.map((p) => ({
      id: p.id,
      name: p.name,
      scores: { ...p.scores }
    })));
    setEditRemarks(evaluation.remarks ?? "");
    setShowEdit(true);
  };

  useEffect(() => {
    if (!showEdit || !editingEvaluation) return;

    const panelists = editingEvaluation.panelists ?? [];
    if (panelists.length > 0) {
      setEditPanelists(panelists.map((p) => ({
        id: p.id,
        name: p.name,
        scores: { ...p.scores }
      })));
      return;
    }

    const fallbackCount = editingEvaluation.panelists?.length ?? 0;
    if (fallbackCount > 0 && editPanelists.length === 0) {
      setEditPanelists(
        Array.from({ length: fallbackCount }, () => ({
          id: Math.random().toString(36),
          name: "",
          scores: {}
        }))
      );
    }
  }, [showEdit, editingEvaluation, editPanelists.length]);

  const evaluationRows = useMemo(() => {
    return evaluations
      .map((evaluation) => {
        const application = applications.find((app) => app.id === evaluation.applicationId);
        const vacancy = application ? jobVacancies.find((job) => job.id === application.vacancyId) : null;
        return {
          ...evaluation,
          applicantName: application ? getApplicantName(application.applicantId) : "Unknown",
          positionTitle: vacancy?.positionTitle ?? "Unknown position",
          vacancyId: vacancy?.id ?? "",
          displayLevel: (vacancy as any)?.positionLevel ?? evaluation.positionLevel
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore);
  }, [evaluations, applications, jobVacancies]);

  const filteredEvaluationRows = useMemo(() => {
    return evaluationRows.filter((row) => {
      const matchesPosition = positionFilter === "all" || row.vacancyId === positionFilter;
      const matchesLevel = levelFilter === "all" || row.displayLevel === levelFilter;
      return matchesPosition && matchesLevel;
    });
  }, [evaluationRows, positionFilter, levelFilter]);

  const handleExportSingleEvaluationPdf = async (evaluation: typeof evaluationRows[0]) => {
    setIsExportingReport(true);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 36;
      const contentWidth = pageWidth - margin * 2;
      let cursorY = margin;

      const ensureSpace = (requiredHeight: number) => {
        if (cursorY + requiredHeight <= pageHeight - margin) return;
        pdf.addPage();
        cursorY = margin;
      };

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text("Evaluation Report", pageWidth / 2, cursorY + 12, { align: "center" });
      cursorY += 28;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(100);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, cursorY + 6, { align: "center" });
      cursorY += 18;

      pdf.setTextColor(40);
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.text("Applicant Information", margin, cursorY + 8);
      cursorY += 16;

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text(`Applicant: ${evaluation.applicantName}`, margin + 10, cursorY + 6);
      cursorY += 14;
      pdf.text(`Position: ${evaluation.positionTitle}`, margin + 10, cursorY + 6);
      cursorY += 14;
      pdf.text(`Level: ${evaluation.displayLevel === "second_level" ? "Second Level" : "First Level"}`, margin + 10, cursorY + 6);
      cursorY += 14;
      pdf.text(`Average Score: ${getAverageScore(evaluation.totalScore, evaluation.displayLevel).toFixed(2)}`, margin + 10, cursorY + 6);
      cursorY += 14;
      if (evaluation.remarks) {
        pdf.text(`Remarks: ${evaluation.remarks}`, margin + 10, cursorY + 6);
        cursorY += 14;
      }
      cursorY += 16;

      pdf.setDrawColor(180);
      pdf.setLineWidth(0.5);
      pdf.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 20;

      const criteria = evaluation.displayLevel === "first_level" ? FIRST_LEVEL_CRITERIA : SECOND_LEVEL_CRITERIA;
      
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(40);
      pdf.text("Panelist Scores by Criterion", margin, cursorY + 8);
      cursorY += 16;

      const headers = ["Panelist", ...Object.entries(criteria).map(([, data]) => data.name)];
      const rows = (evaluation.panelists ?? []).map((panelist) => [
        panelist.name,
        ...Object.keys(criteria).map((key) => {
          const score = panelist.scores[key];
          return score !== undefined ? String(score) : "—";
        })
      ]);

      const baseWidth = 90;
      const criteriaCount = Object.keys(criteria).length;
      const criteriaWidth = (contentWidth - baseWidth) / criteriaCount;
      const widths = [baseWidth, ...Array(criteriaCount).fill(criteriaWidth)];
      const normalizedWidths = widths.map((w) => w);

      const drawRow = (values: string[], isHeader = false) => {
        const cellLines = values.map((value, index) => pdf.splitTextToSize(value, normalizedWidths[index] - 8) as string[]);
        const rowHeight = Math.max(...cellLines.map((lines) => lines.length), 1) * 10 + 6;
        ensureSpace(rowHeight + 2);

        let startX = margin;
        values.forEach((value, index) => {
          const width = normalizedWidths[index];
          if (isHeader) {
            pdf.setFillColor(192, 23, 47);
            pdf.rect(startX, cursorY, width, rowHeight, "F");
          }
          pdf.setDrawColor(120);
          pdf.rect(startX, cursorY, width, rowHeight);
          pdf.setFont("helvetica", isHeader ? "bold" : "normal");
          pdf.setTextColor(isHeader ? 255 : 40);
          pdf.setFontSize(isHeader ? 8.5 : 9);
          cellLines[index].forEach((line, lineIndex) => {
            pdf.text(line, startX + 4, cursorY + 11 + lineIndex * 10);
          });
          startX += width;
        });

        pdf.setTextColor(0);
        cursorY += rowHeight;
      };

      drawRow(headers, true);
      if (rows.length === 0) {
        drawRow(Array(headers.length).fill(""));
      } else {
        rows.forEach((row) => drawRow(row));
      }

      cursorY += 18;
      pdf.setDrawColor(180);
      pdf.setLineWidth(0.5);
      pdf.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 22;

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(40);
      pdf.text("Score Averages by Criterion", margin, cursorY + 8);
      cursorY += 16;

      const averages = calculateAverages(evaluation.panelists ?? [], criteria);
      const averageRows = Object.entries(criteria).map(([key, data]) => {
        const avg = averages[`${key}Avg`];
        return [data.name, avg !== undefined ? avg.toFixed(2) : "—"];
      });

      const avgWidths = [contentWidth * 0.7, contentWidth * 0.3];
      
      const drawAverageHeaderRow = () => {
        const headers = ["Criterion", "Average Score"];
        const rowHeight = 12;
        ensureSpace(rowHeight + 2);

        let startX = margin;
        headers.forEach((header, index) => {
          const width = avgWidths[index];
          pdf.setFillColor(192, 23, 47);
          pdf.rect(startX, cursorY, width, rowHeight, "F");
          pdf.setDrawColor(120);
          pdf.rect(startX, cursorY, width, rowHeight);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(255);
          pdf.setFontSize(9);
          pdf.text(header, startX + 4, cursorY + 9);
          startX += width;
        });
        pdf.setTextColor(40);
        cursorY += rowHeight;
      };

      drawAverageHeaderRow();

      const drawAverageRow = (label: string, value: string, rowIndex: number) => {
        const cellLines = [
          pdf.splitTextToSize(label, avgWidths[0] - 8) as string[],
          pdf.splitTextToSize(value, avgWidths[1] - 8) as string[]
        ];
        const rowHeight = Math.max(...cellLines.map((lines) => lines.length), 1) * 10 + 6;
        ensureSpace(rowHeight + 2);

        let startX = margin;
        [label, value].forEach((val, index) => {
          const width = avgWidths[index];
          if (rowIndex % 2 === 0) {
            pdf.setFillColor(245, 245, 245);
            pdf.rect(startX, cursorY, width, rowHeight, "F");
          }
          pdf.setDrawColor(200);
          pdf.rect(startX, cursorY, width, rowHeight);
          pdf.setFont("helvetica", index === 1 ? "bold" : "normal");
          pdf.setTextColor(40);
          pdf.setFontSize(9);
          cellLines[index].forEach((line, lineIndex) => {
            pdf.text(line, startX + 4, cursorY + 11 + lineIndex * 10);
          });
          startX += width;
        });
        cursorY += rowHeight;
      };

      averageRows.forEach(([label, value], index) => drawAverageRow(label, value, index));

      pdf.save(`evaluation-${evaluation.applicantName.replace(/\s+/g, "-")}.pdf`);
      toast({ title: "Success", description: "Evaluation exported as PDF successfully!" });
    } catch (error) {
      toast({ title: "Export failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsExportingReport(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Evaluations</h1>
          <p className="text-sm text-muted-foreground mt-1">Score and rank applicants using WMSU assessment forms with multiple panelists</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button><Award className="w-4 h-4 mr-2" /> Add Application</Button>
          </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Application for Evaluation</DialogTitle>
              </DialogHeader>
              <form className="space-y-4" onSubmit={(e) => {
                e.preventDefault();

                if (!formApplicationId) {
                  toast({ title: "Error", description: "Please select an application", variant: "destructive" });
                  return;
                }

                if (formPanelists.some((p) => !p.name.trim())) {
                  toast({ title: "Error", description: "All panelists must have names", variant: "destructive" });
                  return;
                }

                const criteria = vacancyLevel === "first_level" ? FIRST_LEVEL_CRITERIA : SECOND_LEVEL_CRITERIA;
                const averages = calculateAverages(formPanelists, criteria);
                const totalScore = calculateTotalScore(formPanelists, criteria);

                createMutation.mutate({
                  applicationId: formApplicationId,
                  positionLevel: vacancyLevel,
                  panelists: formPanelists.map((p) => ({
                    id: p.id,
                    name: p.name,
                    scores: p.scores
                  })),
                  ...mapAveragesToScorePayload(averages, vacancyLevel),
                  totalScore,
                  remarks: formRemarks
                } as any);
              }}>
                <div className="space-y-2">
                  <Label>Application</Label>
                  <Select value={formApplicationId} onValueChange={setFormApplicationId}>
                    <SelectTrigger><SelectValue placeholder="Select application" /></SelectTrigger>
                    <SelectContent>
                      {applications
                        .filter((app) => !evaluations.some((e) => e.applicationId === app.id))
                        .map((app) => (
                          <SelectItem key={app.id} value={app.id}>
                            {getApplicantName(app.applicantId)} — {getVacancyTitle(app.vacancyId)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {formApplicationId && (
                  <EvalForm
                    panelists={formPanelists}
                    setPanelists={setFormPanelists}
                    level={vacancyLevel as "first_level" | "second_level"}
                  />
                )}

                <div className="space-y-2">
                  <Label>Remarks</Label>
                  <Textarea
                    placeholder="Assessment remarks..."
                    value={formRemarks}
                    onChange={(e) => setFormRemarks(e.target.value)}
                  />
                </div>
                <Button className="w-full" type="submit" disabled={createMutation.isPending}>
                  Save Assessment
                </Button>
              </form>
            </DialogContent>
          </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog
        open={showEdit}
        onOpenChange={(open) => {
          setShowEdit(open);
          if (!open) setEditingEvaluationId(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Evaluation</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>Applicant: {editingApplication ? getApplicantName(editingApplication.applicantId) : "Unknown"}</p>
            <p>Vacancy: {editingApplication ? getVacancyTitle(editingApplication.vacancyId) : "Unknown"}</p>
          </div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingEvaluationId) return;

              if (editPanelists.some((p) => !p.name.trim())) {
                toast({ title: "Error", description: "All panelists must have names", variant: "destructive" });
                return;
              }

              const criteria = editingEvaluation?.positionLevel === "first_level" ? FIRST_LEVEL_CRITERIA : SECOND_LEVEL_CRITERIA;
              const averages = calculateAverages(editPanelists, criteria);
              const totalScore = calculateTotalScore(editPanelists, criteria);

              updateMutation.mutate({
                id: editingEvaluationId,
                payload: {
                  positionLevel: editingEvaluation?.positionLevel,
                  panelists: editPanelists.map((p) => ({
                    id: p.id,
                    name: p.name,
                    scores: p.scores
                  })),
                  ...mapAveragesToScorePayload(averages, editingEvaluation?.positionLevel ?? "first_level"),
                  totalScore,
                  remarks: editRemarks
                } as any
              });
            }}
          >
            {editingEvaluation && (
              <EvalForm
                panelists={editPanelists}
                setPanelists={setEditPanelists}
                level={editingEvaluation.positionLevel as "first_level" | "second_level"}
              />
            )}

            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                placeholder="Assessment remarks..."
                value={editRemarks}
                onChange={(e) => setEditRemarks(e.target.value)}
              />
            </div>
            <Button className="w-full" type="submit" disabled={updateMutation.isPending}>
              Update Assessment
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Evaluation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this evaluation? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget);
                  setShowDeleteConfirm(false);
                }
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Filter by Position</Label>
              <Select value={positionFilter} onValueChange={setPositionFilter}>
                <SelectTrigger><SelectValue placeholder="All Positions" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Positions</SelectItem>
                  {jobVacancies.map((vacancy) => (
                    <SelectItem key={vacancy.id} value={vacancy.id}>{vacancy.positionTitle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Filter by Position Level</Label>
              <Select value={levelFilter} onValueChange={(value) => setLevelFilter(value as "all" | "first_level" | "second_level")}>
                <SelectTrigger><SelectValue placeholder="All Levels" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="first_level">First Level</SelectItem>
                  <SelectItem value="second_level">Second Level</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 bg-primary text-primary-foreground text-left">
                  <th className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide w-12">Rank</th>
                  <th className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Applicant</th>
                  <th className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Position</th>
                  <th className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Level</th>
                  <th className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Panelists</th>
                  <th className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide text-center">Avg Score</th>
                  <th className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Remarks</th>
                  <th className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvaluationRows.map((ev, idx) => (
                  <tr
                    key={ev.id}
                    className={`h-14 border-b border-border/20 transition-colors ${
                      idx % 2 === 0 ? "bg-background hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/20"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {idx === 0 && <Trophy className="w-4 h-4 text-warning" />}
                        <span className="font-medium">{idx + 1}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{ev.applicantName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{ev.positionTitle}</td>
                    <td className="px-4 py-3 text-muted-foreground">{ev.displayLevel === "second_level" ? "Second Level" : "First Level"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {ev.panelists?.length ?? 0} panelist{(ev.panelists?.length ?? 0) !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-primary text-base">
                      {getAverageScore(ev.totalScore, ev.displayLevel).toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{ev.remarks}</td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Open actions menu">
                            <Ellipsis className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onClick={() => handleOpenEdit(ev)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleExportSingleEvaluationPdf(ev)}
                            disabled={isExportingReport}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Export
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setDeleteTarget(ev.id);
                              setShowDeleteConfirm(true);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {filteredEvaluationRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No evaluations found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}