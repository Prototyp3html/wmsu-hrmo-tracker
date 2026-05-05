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
import { Award, Trophy, Pencil, Trash2, Info, Ellipsis } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Evaluation } from "@/lib/types";

export default function Evaluations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [editingEvaluationId, setEditingEvaluationId] = useState<string | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState<"all" | "first_level" | "second_level">("all");
  
  const [formState, setFormState] = useState({
    applicationId: "",
    positionLevel: "first_level" as "first_level" | "second_level",
    communicationSkills: "",
    abilityToPresent: "",
    alertness: "",
    judgement: "",
    emotionalStability: "",
    selfConfidence: "",
    oralCommunication: "",
    analyticalAbility: "",
    initiative: "",
    stressTolerance: "",
    sensitivity: "",
    serviceOrientation: "",
    remarks: ""
  });

  const [editFormState, setEditFormState] = useState(formState);

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
      setFormState({
        applicationId: "",
        positionLevel: "first_level",
        communicationSkills: "",
        abilityToPresent: "",
        alertness: "",
        judgement: "",
        emotionalStability: "",
        selfConfidence: "",
        oralCommunication: "",
        analyticalAbility: "",
        initiative: "",
        stressTolerance: "",
        sensitivity: "",
        serviceOrientation: "",
        remarks: ""
      });
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

  const selectedAppVacantcy = applications.find((a) => a.id === selectedAppId);
  const vacancyLevel = selectedAppVacantcy ? getVacancyLevel(selectedAppVacantcy.vacancyId) : "first_level";

  const handleOpenEdit = (evaluation: Evaluation) => {
    setEditingEvaluationId(evaluation.id);
    setEditFormState({
      applicationId: evaluation.applicationId,
      positionLevel: evaluation.positionLevel,
      communicationSkills: String(evaluation.communicationSkills ?? ""),
      abilityToPresent: String(evaluation.abilityToPresent ?? ""),
      alertness: String(evaluation.alertness ?? ""),
      judgement: String(evaluation.judgement ?? ""),
      emotionalStability: String(evaluation.emotionalStability ?? ""),
      selfConfidence: String(evaluation.selfConfidence ?? ""),
      oralCommunication: String(evaluation.oralCommunication ?? ""),
      analyticalAbility: String(evaluation.analyticalAbility ?? ""),
      initiative: String(evaluation.initiative ?? ""),
      stressTolerance: String(evaluation.stressTolerance ?? ""),
      sensitivity: String(evaluation.sensitivity ?? ""),
      serviceOrientation: String(evaluation.serviceOrientation ?? ""),
      remarks: evaluation.remarks ?? ""
    });
    setShowEdit(true);
  };

  const editingEvaluation = evaluations.find((ev) => ev.id === editingEvaluationId) ?? null;
  const editingApplication = applications.find((app) => app.id === editingEvaluation?.applicationId) ?? null;

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

  const FirstLevelForm = ({ state, setState }: any) => (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded p-3 flex gap-2">
        <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-800">First Level Administrative Position Assessment</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="flex justify-between">
            <span>Communication Skills</span>
            <span className="text-xs text-muted-foreground">/10</span>
          </Label>
          <Input
            type="number"
            min={0}
            max={10}
            placeholder="0-10"
            value={state.communicationSkills}
            onChange={(e) => setState((prev: any) => ({ ...prev, communicationSkills: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label className="flex justify-between">
            <span>Ability to Present Ideas</span>
            <span className="text-xs text-muted-foreground">/5</span>
          </Label>
          <Input
            type="number"
            min={0}
            max={5}
            placeholder="0-5"
            value={state.abilityToPresent}
            onChange={(e) => setState((prev: any) => ({ ...prev, abilityToPresent: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label className="flex justify-between">
            <span>Alertness</span>
            <span className="text-xs text-muted-foreground">/5</span>
          </Label>
          <Input
            type="number"
            min={0}
            max={5}
            placeholder="0-5"
            value={state.alertness}
            onChange={(e) => setState((prev: any) => ({ ...prev, alertness: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label className="flex justify-between">
            <span>Judgement</span>
            <span className="text-xs text-muted-foreground">/5</span>
          </Label>
          <Input
            type="number"
            min={0}
            max={5}
            placeholder="0-5"
            value={state.judgement}
            onChange={(e) => setState((prev: any) => ({ ...prev, judgement: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label className="flex justify-between">
            <span>Emotional Stability</span>
            <span className="text-xs text-muted-foreground">/5</span>
          </Label>
          <Input
            type="number"
            min={0}
            max={5}
            placeholder="0-5"
            value={state.emotionalStability}
            onChange={(e) => setState((prev: any) => ({ ...prev, emotionalStability: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label className="flex justify-between">
            <span>Self-Confidence</span>
            <span className="text-xs text-muted-foreground">/5</span>
          </Label>
          <Input
            type="number"
            min={0}
            max={5}
            placeholder="0-5"
            value={state.selfConfidence}
            onChange={(e) => setState((prev: any) => ({ ...prev, selfConfidence: e.target.value }))}
          />
        </div>
      </div>
    </div>
  );

  const SecondLevelForm = ({ state, setState }: any) => (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded p-3 flex gap-2">
        <Info className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-green-800">Second Level Administrative Position Assessment</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="flex justify-between">
            <span>Oral Communication</span>
            <span className="text-xs text-muted-foreground">/15%</span>
          </Label>
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="0-100"
            value={state.oralCommunication}
            onChange={(e) => setState((prev: any) => ({ ...prev, oralCommunication: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label className="flex justify-between">
            <span>Analytical Ability</span>
            <span className="text-xs text-muted-foreground">/15%</span>
          </Label>
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="0-100"
            value={state.analyticalAbility}
            onChange={(e) => setState((prev: any) => ({ ...prev, analyticalAbility: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label className="flex justify-between">
            <span>Judgement</span>
            <span className="text-xs text-muted-foreground">/15%</span>
          </Label>
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="0-100"
            value={state.judgement}
            onChange={(e) => setState((prev: any) => ({ ...prev, judgement: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label className="flex justify-between">
            <span>Initiative</span>
            <span className="text-xs text-muted-foreground">/15%</span>
          </Label>
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="0-100"
            value={state.initiative}
            onChange={(e) => setState((prev: any) => ({ ...prev, initiative: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label className="flex justify-between">
            <span>Stress Tolerance</span>
            <span className="text-xs text-muted-foreground">/15%</span>
          </Label>
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="0-100"
            value={state.stressTolerance}
            onChange={(e) => setState((prev: any) => ({ ...prev, stressTolerance: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label className="flex justify-between">
            <span>Sensitivity</span>
            <span className="text-xs text-muted-foreground">/15%</span>
          </Label>
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="0-100"
            value={state.sensitivity}
            onChange={(e) => setState((prev: any) => ({ ...prev, sensitivity: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label className="flex justify-between">
            <span>Service Orientation</span>
            <span className="text-xs text-muted-foreground">/15%</span>
          </Label>
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="0-100"
            value={state.serviceOrientation}
            onChange={(e) => setState((prev: any) => ({ ...prev, serviceOrientation: e.target.value }))}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Evaluations</h1>
          <p className="text-sm text-muted-foreground mt-1">Score and rank applicants using WMSU assessment forms</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button><Award className="w-4 h-4 mr-2" /> Add Evaluation</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add Evaluation</DialogTitle></DialogHeader>
            <form className="space-y-4" onSubmit={(e) => {
              e.preventDefault();
              if (!formState.applicationId) return;
              createMutation.mutate({
                applicationId: formState.applicationId,
                positionLevel: vacancyLevel,
                communicationSkills: formState.communicationSkills ? Number(formState.communicationSkills) : undefined,
                abilityToPresent: formState.abilityToPresent ? Number(formState.abilityToPresent) : undefined,
                alertness: formState.alertness ? Number(formState.alertness) : undefined,
                judgement: formState.judgement ? Number(formState.judgement) : undefined,
                emotionalStability: formState.emotionalStability ? Number(formState.emotionalStability) : undefined,
                selfConfidence: formState.selfConfidence ? Number(formState.selfConfidence) : undefined,
                oralCommunication: formState.oralCommunication ? Number(formState.oralCommunication) : undefined,
                analyticalAbility: formState.analyticalAbility ? Number(formState.analyticalAbility) : undefined,
                initiative: formState.initiative ? Number(formState.initiative) : undefined,
                stressTolerance: formState.stressTolerance ? Number(formState.stressTolerance) : undefined,
                sensitivity: formState.sensitivity ? Number(formState.sensitivity) : undefined,
                serviceOrientation: formState.serviceOrientation ? Number(formState.serviceOrientation) : undefined,
                remarks: formState.remarks
              });
            }}>
              <div className="space-y-2">
                <Label>Application</Label>
                <Select value={formState.applicationId} onValueChange={(value) => {
                  setSelectedAppId(value);
                  setFormState((prev) => ({ ...prev, applicationId: value }));
                }}>
                  <SelectTrigger><SelectValue placeholder="Select application" /></SelectTrigger>
                  <SelectContent>
                    {applications.filter(app => !evaluations.some(e => e.applicationId === app.id)).map((app) => (
                      <SelectItem key={app.id} value={app.id}>
                        {getApplicantName(app.applicantId)} — {getVacancyTitle(app.vacancyId)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formState.applicationId && vacancyLevel === "first_level" && (
                <FirstLevelForm state={formState} setState={setFormState} />
              )}

              {formState.applicationId && vacancyLevel === "second_level" && (
                <SecondLevelForm state={formState} setState={setFormState} />
              )}
              <div className="space-y-2">
                <Label>Remarks</Label>
                <Textarea
                  placeholder="Assessment remarks..."
                  value={formState.remarks}
                  onChange={(e) => setFormState((prev) => ({ ...prev, remarks: e.target.value }))}
                />
              </div>
              <Button className="w-full" type="submit" disabled={createMutation.isPending}>Save Assessment</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog
        open={showEdit}
        onOpenChange={(open) => {
          setShowEdit(open);
          if (!open) {
            setEditingEvaluationId(null);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
              updateMutation.mutate({
                id: editingEvaluationId,
                payload: {
                  positionLevel: editFormState.positionLevel,
                  communicationSkills: editFormState.communicationSkills ? Number(editFormState.communicationSkills) : undefined,
                  abilityToPresent: editFormState.abilityToPresent ? Number(editFormState.abilityToPresent) : undefined,
                  alertness: editFormState.alertness ? Number(editFormState.alertness) : undefined,
                  judgement: editFormState.judgement ? Number(editFormState.judgement) : undefined,
                  emotionalStability: editFormState.emotionalStability ? Number(editFormState.emotionalStability) : undefined,
                  selfConfidence: editFormState.selfConfidence ? Number(editFormState.selfConfidence) : undefined,
                  oralCommunication: editFormState.oralCommunication ? Number(editFormState.oralCommunication) : undefined,
                  analyticalAbility: editFormState.analyticalAbility ? Number(editFormState.analyticalAbility) : undefined,
                  initiative: editFormState.initiative ? Number(editFormState.initiative) : undefined,
                  stressTolerance: editFormState.stressTolerance ? Number(editFormState.stressTolerance) : undefined,
                  sensitivity: editFormState.sensitivity ? Number(editFormState.sensitivity) : undefined,
                  serviceOrientation: editFormState.serviceOrientation ? Number(editFormState.serviceOrientation) : undefined,
                  remarks: editFormState.remarks
                }
              });
            }}
          >
            {editingEvaluation?.positionLevel === "first_level" && (
              <FirstLevelForm state={editFormState} setState={setEditFormState} />
            )}

            {editingEvaluation?.positionLevel === "second_level" && (
              <SecondLevelForm state={editFormState} setState={setEditFormState} />
            )}
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Textarea
                placeholder="Assessment remarks..."
                value={editFormState.remarks}
                onChange={(e) => setEditFormState((prev) => ({ ...prev, remarks: e.target.value }))}
              />
            </div>
            <Button className="w-full" type="submit" disabled={updateMutation.isPending}>Update Assessment</Button>
          </form>
        </DialogContent>
      </Dialog>

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
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => {
              if (deleteTarget) {
                deleteMutation.mutate(deleteTarget);
                setShowDeleteConfirm(false);
              }
            }}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Filter by Position</Label>
              <Select value={positionFilter} onValueChange={setPositionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Positions" />
                </SelectTrigger>
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
                <SelectTrigger>
                  <SelectValue placeholder="All Levels" />
                </SelectTrigger>
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
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
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
