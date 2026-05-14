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
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createEvaluation, fetchApplicants, fetchApplications, fetchEvaluations, fetchJobs, updateEvaluation, deleteEvaluation } from "@/lib/api";
import { Award, Trophy, Pencil, Trash2, Info, Ellipsis, X, Plus } from "lucide-react";
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

// ─── Sub-components (defined outside Evaluations so React never remounts them) ─

interface EvalFormProps {
  panelists: FormPanelist[];
  setPanelists: (p: FormPanelist[]) => void;
  criteria?: typeof FIRST_LEVEL_CRITERIA | typeof SECOND_LEVEL_CRITERIA;
  level: "first_level" | "second_level";
}

function EvalForm({ panelists, setPanelists, criteria, level }: EvalFormProps) {
  const activeCriteria = criteria ?? (level === "first_level" ? FIRST_LEVEL_CRITERIA : SECOND_LEVEL_CRITERIA);

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
      <div className={`border rounded p-3 flex gap-2 ${isFirst ? "bg-blue-50 border-blue-200" : "bg-green-50 border-green-200"}`}>
        <Info className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isFirst ? "text-blue-600" : "text-green-600"}`} />
        <p className={`text-sm ${isFirst ? "text-blue-800" : "text-green-800"}`}>
          {isFirst ? "First" : "Second"} Level Administrative Position Assessment
        </p>
      </div>

      {/* Panelists Section */}
      <div className="space-y-3 border rounded p-4 bg-muted/30">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Panel of Evaluators</Label>
          <Button type="button" variant="outline" size="sm" onClick={handleAddPanelist}>
            <Plus className="w-4 h-4 mr-2" />
            Add Panelist
          </Button>
        </div>

        {panelists.map((panelist, pIdx) => (
          <div key={panelist.id} className="space-y-2 p-3 bg-background border rounded">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-2">
                <Label className="text-sm">Panelist {pIdx + 1} Name</Label>
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
            <div className="grid grid-cols-2 gap-3 mt-3 p-2 bg-muted/50 rounded">
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
                      const updated = panelists.map((p, i) =>
                        i === pIdx
                          ? { ...p, scores: { ...p.scores, [key]: e.target.value ? Number(e.target.value) : undefined } }
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

      {/* Averages Display */}
      {panelists.length > 0 && (
        <div className="space-y-2 p-3 bg-green-50 border border-green-200 rounded">
          <Label className="text-sm font-semibold text-green-900">Calculated Averages</Label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(calculateAverages(panelists, activeCriteria)).map(([key, avg]) => {
              const criterionKey = key.replace("Avg", "");
              const criterionData = (activeCriteria as any)[criterionKey];
              const criterionName = criterionData?.name || criterionKey;
              return (
                <div key={key} className="text-xs">
                  <span className="font-medium">{criterionName}:</span>
                  <span className="ml-2 text-green-700 font-semibold">{avg.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
          <div className="text-sm font-bold text-green-900 mt-2 pt-2 border-t border-green-200">
            General Average: {calculateTotalScore(panelists, activeCriteria).toFixed(2)}
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
            <DialogHeader><DialogTitle>Add Application for Evaluation</DialogTitle></DialogHeader>
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
              const totalScore = calculateTotalScore(formPanelists, criteria);

              createMutation.mutate({
                applicationId: formApplicationId,
                positionLevel: vacancyLevel,
                panelists: formPanelists.map((p) => ({
                  id: p.id,
                  name: p.name,
                  scores: p.scores
                })),
                ...calculateAverages(formPanelists, criteria),
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
          <DialogHeader><DialogTitle>Edit Evaluation</DialogTitle></DialogHeader>
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
                  ...calculateAverages(editPanelists, criteria),
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
                  <th className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide text-center">Total Score</th>
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
                      {ev.panelists?.length || 0} panelist{ev.panelists?.length !== 1 ? "s" : ""}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-primary text-base">{ev.totalScore.toFixed(1)}</td>
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