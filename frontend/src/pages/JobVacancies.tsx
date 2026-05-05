import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createDepartment, createJob, deleteDepartment, fetchDepartments, fetchJobs, fetchPositionTitles, updateJob, deleteJob, deleteJobsByTitle, createPositionTitle, fetchCustomPositionTitles, fetchApplications } from "@/lib/api";
import { getVacancyStatusColor } from "@/lib/status";
import type { JobVacancy } from "@/lib/types";
import { Plus, Search, Pencil, Eye, Trash2, Ellipsis } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const ADD_NEW_POSITION_VALUE = "__add_new_position__";

const DEFAULT_POSITION_TITLES = [
  "Instructor III",
  "Information Technology Officer I Repost",
  "Attorney IV",
  "Information Officer I",
  "Administrative Aide VI (Clerk III)",
  "Project Development Officer I",
  "Internal Auditor I",
  "Administrative Assistant III (Senior Bookkeeper)",
  "Administrative Assistant III",
  "SUC Vice President",
  "Board Secretary V",
  "Chief Administrative Officer",
  "Administrative Aide VI",
  "Administrative Assistant II",
  "Administrative Officer I"
];

const TEST_SALARY_GRADE_BY_TITLE: Record<string, number> = {
  "instructor iii": 14,
  "information technology officer i repost": 19,
  "attorney iv": 23,
  "information officer i": 15,
  "administrative aide vi (clerk iii)": 6,
  "project development officer i": 15,
  "internal auditor i": 19,
  "administrative assistant iii (senior bookkeeper)": 9,
  "administrative assistant iii": 9,
  "suc vice president": 28,
  "board secretary v": 24,
  "chief administrative officer": 24,
  "administrative aide vi": 6,
  "administrative assistant ii": 8,
  "administrative officer i": 10
};

export default function JobVacancies() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreateCustomTitle, setShowCreateCustomTitle] = useState(false);
  const [showEditCustomTitle, setShowEditCustomTitle] = useState(false);
  const [createCustomTitle, setCreateCustomTitle] = useState("");
  const [editCustomTitle, setEditCustomTitle] = useState("");
  const [showManageTitles, setShowManageTitles] = useState(false);
  const [showCreateCustomDepartment, setShowCreateCustomDepartment] = useState(false);
  const [showEditCustomDepartment, setShowEditCustomDepartment] = useState(false);
  const [createCustomDepartment, setCreateCustomDepartment] = useState("");
  const [editCustomDepartment, setEditCustomDepartment] = useState("");
  const [showManageDepartments, setShowManageDepartments] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "title" | "department" | "vacancy"; id: string; name: string } | null>(null);
  const [customPositionTitles, setCustomPositionTitles] = useState<string[]>([]);
  const [formState, setFormState] = useState({
    positionTitle: "",
    departmentId: "",
    plantillaNo: "",
    monthlyRate: "",
    salaryGrade: "",
    description: "",
    eligibility: "",
    trainings: "",
    competencies: "",
    educationalBackground: "",
    workExperience: "",
    qualifications: "",
    postingDate: "",
    closingDate: "",
    status: "Open",
    positionLevel: "first_level"
  });
  const [editFormState, setEditFormState] = useState({
    positionTitle: "",
    departmentId: "",
    plantillaNo: "",
    monthlyRate: "",
    salaryGrade: "",
    description: "",
    eligibility: "",
    trainings: "",
    competencies: "",
    educationalBackground: "",
    workExperience: "",
    qualifications: "",
    postingDate: "",
    closingDate: "",
    status: "Open",
    positionLevel: "first_level"
  });

  const { data: jobVacancies = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: fetchJobs
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: fetchDepartments
  });

  const { data: positionTitles = [] } = useQuery({
    queryKey: ["position-titles"],
    queryFn: fetchPositionTitles
  });

  const { data: applications = [] } = useQuery({
    queryKey: ["applications"],
    queryFn: fetchApplications
  });

  const positionTitleOptions = useMemo(() => {
    return Array.from(new Set([
      ...positionTitles,
      ...jobVacancies.map((vacancy) => vacancy.positionTitle),
      ...customPositionTitles,
      formState.positionTitle,
      editFormState.positionTitle
    ]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [positionTitles, jobVacancies, customPositionTitles, formState.positionTitle, editFormState.positionTitle]);

  const registerCustomPositionTitle = async (rawTitle: string) => {
    const title = rawTitle.trim();
    if (!title) {
      toast({ title: "Missing title", description: "Please enter a position title first.", variant: "destructive" });
      return null;
    }

    const exists = positionTitleOptions.some((existing) => existing.toLowerCase() === title.toLowerCase());
    if (exists) {
      const existingTitle = positionTitleOptions.find((existing) => existing.toLowerCase() === title.toLowerCase()) ?? title;
      toast({ title: "Already exists", description: `${existingTitle} is already in the dropdown.` });
      return existingTitle;
    }

    // Persist the custom title to the server (requires admin)
    try {
      const created = await createPositionTitle(title);
      setCustomPositionTitles((prev) => Array.from(new Set([...prev, created.title])));
      queryClient.setQueryData<{ id: string; title: string }[]>(["position-titles-custom"], (current) => {
        const next = current ?? [];
        if (next.some((item) => item.id === created.id || item.title.toLowerCase() === created.title.toLowerCase())) {
          return next;
        }
        return [...next, created];
      });
      // refresh cached position titles
      queryClient.invalidateQueries({ queryKey: ["position-titles"] });
      toast({ title: "Position title added", description: `${created.title} is now available in the dropdown.` });
      return created.title;
    } catch (err) {
      toast({ title: "Add failed", description: (err as Error).message, variant: "destructive" });
      return null;
    }
  };

  const salaryGradeByTitle = useMemo(() => {
    const map = new Map<string, number>(Object.entries(TEST_SALARY_GRADE_BY_TITLE));
    for (const vacancy of jobVacancies) {
      const key = vacancy.positionTitle.trim().toLowerCase();
      if (key && Number.isFinite(vacancy.salaryGrade)) {
        map.set(key, vacancy.salaryGrade);
      }
    }
    return map;
  }, [jobVacancies]);

  const applyCreateTitle = (title: string) => {
    if (title === ADD_NEW_POSITION_VALUE) {
      setShowCreateCustomTitle(true);
      return;
    }

    setShowCreateCustomTitle(false);
    setCreateCustomTitle("");

    const suggested = salaryGradeByTitle.get(title.trim().toLowerCase());
    setFormState((prev) => ({
      ...prev,
      positionTitle: title,
      salaryGrade: suggested ? String(suggested) : prev.salaryGrade
    }));
  };

  const handleAddCreateCustomTitle = () => {
    (async () => {
      const title = await registerCustomPositionTitle(createCustomTitle);
      if (!title) return;
      applyCreateTitle(title);
    })();
  };

  const applyEditTitle = (title: string) => {
    if (title === ADD_NEW_POSITION_VALUE) {
      setShowEditCustomTitle(true);
      return;
    }

    setShowEditCustomTitle(false);
    setEditCustomTitle("");

    const suggested = salaryGradeByTitle.get(title.trim().toLowerCase());
    setEditFormState((prev) => ({
      ...prev,
      positionTitle: title,
      salaryGrade: suggested ? String(suggested) : prev.salaryGrade
    }));
  };

  const handleAddEditCustomTitle = () => {
    (async () => {
      const title = await registerCustomPositionTitle(editCustomTitle);
      if (!title) return;
      applyEditTitle(title);
    })();
  };

  const registerCustomDepartment = async (rawName: string) => {
    const name = rawName.trim();
    if (!name) {
      toast({ title: "Missing department", description: "Please enter a department name first.", variant: "destructive" });
      return null;
    }

    const existing = departments.find((d) => d.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      toast({ title: "Already exists", description: `${existing.name} is already in the list.` });
      return existing;
    }

    try {
      const created = await createDepartment(name);
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast({ title: "Department added", description: `${created.name} is now available.` });
      return created;
    } catch (err) {
      toast({ title: "Add failed", description: (err as Error).message, variant: "destructive" });
      return null;
    }
  };

  const handleAddCreateCustomDepartment = () => {
    (async () => {
      const department = await registerCustomDepartment(createCustomDepartment);
      if (!department) return;
      setFormState((prev) => ({ ...prev, departmentId: department.id }));
      setShowCreateCustomDepartment(false);
      setCreateCustomDepartment("");
    })();
  };

  const handleAddEditCustomDepartment = () => {
    (async () => {
      const department = await registerCustomDepartment(editCustomDepartment);
      if (!department) return;
      setEditFormState((prev) => ({ ...prev, departmentId: department.id }));
      setShowEditCustomDepartment(false);
      setEditCustomDepartment("");
    })();
  };

  const createMutation = useMutation({
    mutationFn: createJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setShowCreate(false);
      setFormState({
        positionTitle: "",
        departmentId: "",
        plantillaNo: "",
        monthlyRate: "",
        salaryGrade: "",
        description: "",
        eligibility: "",
        trainings: "",
        competencies: "",
        educationalBackground: "",
        workExperience: "",
        qualifications: "",
        postingDate: "",
        closingDate: "",
        status: "Open",
        positionLevel: "first_level"
      });
      toast({ title: "Vacancy created", description: "The job vacancy was added." });
    },
    onError: (error) => {
      toast({ title: "Create failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const { refetch: refetchCustomTitles } = useQuery({
    queryKey: ["position-titles-custom"],
    queryFn: fetchCustomPositionTitles,
    enabled: false // only fetch on demand when manage dialog opens
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Omit<JobVacancy, "id"> }) => updateJob(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      setShowEdit(false);
      setEditingId(null);
      toast({ title: "Vacancy updated", description: "Changes saved." });
    },
    onError: (error) => {
      toast({ title: "Update failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast({ title: "Vacancy deleted", description: "The vacancy was removed." });
    },
    onError: (error) => {
      toast({ title: "Delete failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === "title") {
        const result = await deleteJobsByTitle(deleteTarget.name);
        setCustomPositionTitles((prev) => prev.filter((item) => item.toLowerCase() !== deleteTarget.name.toLowerCase()));
        queryClient.invalidateQueries({ queryKey: ["position-titles"] });
        queryClient.invalidateQueries({ queryKey: ["position-titles-custom"] });
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
        refetchCustomTitles();
        toast({ title: "Deleted", description: `${deleteTarget.name} removed (${result.deleted} vacancy record(s)).` });
      } else if (deleteTarget.type === "department") {
        const result = await deleteDepartment(deleteTarget.id);
        queryClient.invalidateQueries({ queryKey: ["departments"] });
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
        toast({ title: "Deleted", description: `${deleteTarget.name} removed.` });
        if ((result.deleted ?? 0) > 0) {
          toast({ title: "Vacancies removed", description: `${result.deleted} unused vacancy(ies) removed.` });
        }
      } else if (deleteTarget.type === "vacancy") {
        deleteMutation.mutate(deleteTarget.id);
      }
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    } catch (err) {
      toast({ title: "Delete failed", description: (err as Error).message, variant: "destructive" });
    }
  };

  const getDepartmentName = (id: string) =>
    departments.find((d) => d.id === id)?.name ?? "Unknown";

  const filtered = useMemo(() => {
    return jobVacancies.filter((v) => {
      const matchSearch = v.positionTitle.toLowerCase().includes(search.toLowerCase());
      const matchDept = filterDept === "all" || v.departmentId === filterDept;
      const matchStatus = filterStatus === "all" || v.status === filterStatus;
      return matchSearch && matchDept && matchStatus;
    });
  }, [jobVacancies, search, filterDept, filterStatus]);

  const titleApplicationCount = useMemo(() => {
    const vacancyTitleById = new Map<string, string>();
    for (const vacancy of jobVacancies) {
      vacancyTitleById.set(vacancy.id, vacancy.positionTitle.trim().toLowerCase());
    }

    const map = new Map<string, number>();
    for (const application of applications) {
      const key = vacancyTitleById.get(application.vacancyId);
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }

    return map;
  }, [jobVacancies, applications]);

  const departmentUsageCount = useMemo(() => {
    const vacancyDepartmentById = new Map<string, string>();
    for (const vacancy of jobVacancies) {
      vacancyDepartmentById.set(vacancy.id, vacancy.departmentId);
    }

    const map = new Map<string, number>();
    for (const application of applications) {
      const departmentId = vacancyDepartmentById.get(application.vacancyId);
      if (!departmentId) continue;
      map.set(departmentId, (map.get(departmentId) ?? 0) + 1);
    }

    return map;
  }, [jobVacancies, applications]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Job Vacancies</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} position(s) found</p>
        </div>
        {user?.role === "admin" && (
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> New Vacancy</Button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Job Vacancy</DialogTitle></DialogHeader>
              <form className="space-y-4" onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate({
                  positionTitle: formState.positionTitle,
                  departmentId: formState.departmentId,
                  plantillaNo: formState.plantillaNo,
                  monthlyRate: formState.monthlyRate,
                  salaryGrade: Number(formState.salaryGrade),
                  description: formState.description,
                  eligibility: formState.eligibility,
                  trainings: formState.trainings,
                  competencies: formState.competencies,
                  educationalBackground: formState.educationalBackground,
                  workExperience: formState.workExperience,
                  qualifications: formState.qualifications,
                  postingDate: formState.postingDate,
                  closingDate: formState.closingDate,
                  status: formState.status as JobVacancy["status"],
                  positionLevel: formState.positionLevel
                });
              }}>
                <div className="space-y-2">
                  <Label>Position Title</Label>
                  <Select value={formState.positionTitle} onValueChange={applyCreateTitle}>
                    <SelectTrigger><SelectValue placeholder="Select position title" /></SelectTrigger>
                      <SelectContent>
                        {positionTitleOptions.map((title) => <SelectItem key={title} value={title}>{title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2 mt-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreateCustomTitle((s) => !s)}>+ Add new position title</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowManageTitles(true)}>Manage titles</Button>
                    </div>
                    {showCreateCustomTitle && (
                      <div className="flex items-center gap-2 mt-2">
                        <Input
                          placeholder="Enter new position title"
                          value={createCustomTitle}
                          onChange={(e) => setCreateCustomTitle(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!createCustomTitle.trim()}
                          onClick={handleAddCreateCustomTitle}
                        >
                          Add
                        </Button>
                      </div>
                    )}
                </div>
                <div className="space-y-2">
                  <Label>Office</Label>
                  <Select value={formState.departmentId} onValueChange={(value) => setFormState((prev) => ({ ...prev, departmentId: value }))}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 mt-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreateCustomDepartment((s) => !s)}>+ Add new department</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowManageDepartments(true)}>Manage departments</Button>
                  </div>
                  {showCreateCustomDepartment && (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        placeholder="Enter new department name"
                        value={createCustomDepartment}
                        onChange={(e) => setCreateCustomDepartment(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!createCustomDepartment.trim()}
                        onClick={handleAddCreateCustomDepartment}
                      >
                        Add
                      </Button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Plantilla No.</Label>
                    <Input
                      placeholder="Enter plantilla number"
                      value={formState.plantillaNo}
                      onChange={(e) => setFormState((prev) => ({ ...prev, plantillaNo: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Monthly Rate</Label>
                    <Input
                      placeholder="Enter monthly rate"
                      value={formState.monthlyRate}
                      onChange={(e) => setFormState((prev) => ({ ...prev, monthlyRate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Salary Grade</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 12"
                      value={formState.salaryGrade}
                      onChange={(e) => setFormState((prev) => ({ ...prev, salaryGrade: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formState.status} onValueChange={(value) => setFormState((prev) => ({ ...prev, status: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                      <SelectItem value="Filled">Filled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Position Level</Label>
                  <Select value={formState.positionLevel} onValueChange={(value) => setFormState((prev) => ({ ...prev, positionLevel: value as "first_level" | "second_level" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first_level">First Level Administrative Position</SelectItem>
                      <SelectItem value="second_level">Second Level Administrative Position</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Posting Date</Label>
                    <Input
                      type="date"
                      value={formState.postingDate}
                      onChange={(e) => setFormState((prev) => ({ ...prev, postingDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Closing Date</Label>
                    <Input
                      type="date"
                      value={formState.closingDate}
                      onChange={(e) => setFormState((prev) => ({ ...prev, closingDate: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="N/A"
                    value={formState.description}
                    onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value, qualifications: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Eligibility</Label>
                  <Textarea
                    placeholder="None Required"
                    value={formState.eligibility}
                    onChange={(e) => setFormState((prev) => ({ ...prev, eligibility: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Trainings</Label>
                  <Textarea
                    placeholder="N/A"
                    value={formState.trainings}
                    onChange={(e) => setFormState((prev) => ({ ...prev, trainings: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Competencies</Label>
                  <Textarea
                    placeholder="N/A"
                    value={formState.competencies}
                    onChange={(e) => setFormState((prev) => ({ ...prev, competencies: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Educational Background</Label>
                  <Textarea
                    placeholder="N/A"
                    value={formState.educationalBackground}
                    onChange={(e) => setFormState((prev) => ({ ...prev, educationalBackground: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Work Experience</Label>
                  <Textarea
                    placeholder="N/A"
                    value={formState.workExperience}
                    onChange={(e) => setFormState((prev) => ({ ...prev, workExperience: e.target.value }))}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" type="button" onClick={() => setShowCreate(false)}>Cancel</Button>
                  <Button type="submit" disabled={createMutation.isPending}>Create Vacancy</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
        <Dialog open={showManageTitles} onOpenChange={(open) => {
          setShowManageTitles(open);
          if (open) refetchCustomTitles();
        }}>
          <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Manage Position Titles</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {positionTitleOptions.length === 0 && (
                <div className="text-sm text-muted-foreground">No titles available.</div>
              )}
              {positionTitleOptions.map((title) => {
                const usageCount = titleApplicationCount.get(title.toLowerCase()) ?? 0;
                const canDelete = usageCount === 0;
                return (
                  <div key={title} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{title}</div>
                      <div className="text-xs text-muted-foreground">
                        {usageCount > 0 ? `Used by ${usageCount} application(s)` : "Unused - can be deleted"}
                      </div>
                    </div>
                    {canDelete ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={async () => {
                          setDeleteTarget({ type: "title", id: title, name: title });
                          setShowDeleteConfirm(true);
                        }}
                      >
                        Delete
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Locked</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setShowManageTitles(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={showManageDepartments} onOpenChange={setShowManageDepartments}>
          <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Manage Departments</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {departments.length === 0 && (
                <div className="text-sm text-muted-foreground">No departments available.</div>
              )}
              {departments.map((department) => {
                const usageCount = departmentUsageCount.get(department.id) ?? 0;
                const canDelete = usageCount === 0;
                return (
                  <div key={department.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{department.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {usageCount > 0 ? `Used by ${usageCount} application(s)` : "Unused - can be deleted"}
                      </div>
                    </div>
                    {canDelete ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={async () => {
                          setDeleteTarget({ type: "department", id: department.id, name: department.name });
                          setShowDeleteConfirm(true);
                        }}
                      >
                        Delete
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Locked</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setShowManageDepartments(false)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
        {user?.role === "admin" && (
          <Dialog open={showEdit} onOpenChange={setShowEdit}>
            <DialogContent className="w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Edit Job Vacancy</DialogTitle></DialogHeader>
              <form className="space-y-4" onSubmit={(e) => {
                e.preventDefault();
                if (!editingId) return;
                updateMutation.mutate({
                  id: editingId,
                  payload: {
                    positionTitle: editFormState.positionTitle,
                    departmentId: editFormState.departmentId,
                    plantillaNo: editFormState.plantillaNo,
                    monthlyRate: editFormState.monthlyRate,
                    salaryGrade: Number(editFormState.salaryGrade),
                    description: editFormState.description,
                    eligibility: editFormState.eligibility,
                    trainings: editFormState.trainings,
                    competencies: editFormState.competencies,
                    educationalBackground: editFormState.educationalBackground,
                    workExperience: editFormState.workExperience,
                    qualifications: editFormState.qualifications,
                    postingDate: editFormState.postingDate,
                    closingDate: editFormState.closingDate,
                    status: editFormState.status as JobVacancy["status"],
                    positionLevel: editFormState.positionLevel
                  }
                });
              }}>
                <div className="space-y-2">
                  <Label>Position Title</Label>
                  <Select value={editFormState.positionTitle} onValueChange={applyEditTitle}>
                    <SelectTrigger><SelectValue placeholder="Select position title" /></SelectTrigger>
                      <SelectContent>
                        {positionTitleOptions.map((title) => <SelectItem key={title} value={title}>{title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2 mt-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setShowEditCustomTitle((s) => !s)}>+ Add new position title</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowManageTitles(true)}>Manage titles</Button>
                    </div>
                    {showEditCustomTitle && (
                      <div className="flex items-center gap-2 mt-2">
                        <Input
                          placeholder="Enter new position title"
                          value={editCustomTitle}
                          onChange={(e) => setEditCustomTitle(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!editCustomTitle.trim()}
                          onClick={handleAddEditCustomTitle}
                        >
                          Add
                        </Button>
                      </div>
                    )}
                </div>
                <div className="space-y-2">
                  <Label>Office</Label>
                  <Select value={editFormState.departmentId} onValueChange={(value) => setEditFormState((prev) => ({ ...prev, departmentId: value }))}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 mt-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowEditCustomDepartment((s) => !s)}>+ Add new department</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowManageDepartments(true)}>Manage departments</Button>
                  </div>
                  {showEditCustomDepartment && (
                    <div className="flex items-center gap-2 mt-2">
                      <Input
                        placeholder="Enter new department name"
                        value={editCustomDepartment}
                        onChange={(e) => setEditCustomDepartment(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!editCustomDepartment.trim()}
                        onClick={handleAddEditCustomDepartment}
                      >
                        Add
                      </Button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Plantilla No.</Label>
                    <Input
                      placeholder="Enter plantilla number"
                      value={editFormState.plantillaNo}
                      onChange={(e) => setEditFormState((prev) => ({ ...prev, plantillaNo: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Monthly Rate</Label>
                    <Input
                      placeholder="Enter monthly rate"
                      value={editFormState.monthlyRate}
                      onChange={(e) => setEditFormState((prev) => ({ ...prev, monthlyRate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Salary Grade</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 12"
                      value={editFormState.salaryGrade}
                      onChange={(e) => setEditFormState((prev) => ({ ...prev, salaryGrade: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={editFormState.status} onValueChange={(value) => setEditFormState((prev) => ({ ...prev, status: value }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Open">Open</SelectItem>
                      <SelectItem value="Closed">Closed</SelectItem>
                      <SelectItem value="Filled">Filled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Position Level</Label>
                  <Select value={editFormState.positionLevel} onValueChange={(value) => setEditFormState((prev) => ({ ...prev, positionLevel: value as "first_level" | "second_level" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="first_level">First Level Administrative Position</SelectItem>
                      <SelectItem value="second_level">Second Level Administrative Position</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Posting Date</Label>
                    <Input
                      type="date"
                      value={editFormState.postingDate}
                      onChange={(e) => setEditFormState((prev) => ({ ...prev, postingDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Closing Date</Label>
                    <Input
                      type="date"
                      value={editFormState.closingDate}
                      onChange={(e) => setEditFormState((prev) => ({ ...prev, closingDate: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea
                    placeholder="N/A"
                    value={editFormState.description}
                    onChange={(e) => setEditFormState((prev) => ({ ...prev, description: e.target.value, qualifications: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Eligibility</Label>
                  <Textarea
                    placeholder="None Required"
                    value={editFormState.eligibility}
                    onChange={(e) => setEditFormState((prev) => ({ ...prev, eligibility: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Trainings</Label>
                  <Textarea
                    placeholder="N/A"
                    value={editFormState.trainings}
                    onChange={(e) => setEditFormState((prev) => ({ ...prev, trainings: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Competencies</Label>
                  <Textarea
                    placeholder="N/A"
                    value={editFormState.competencies}
                    onChange={(e) => setEditFormState((prev) => ({ ...prev, competencies: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Educational Background</Label>
                  <Textarea
                    placeholder="N/A"
                    value={editFormState.educationalBackground}
                    onChange={(e) => setEditFormState((prev) => ({ ...prev, educationalBackground: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Work Experience</Label>
                  <Textarea
                    placeholder="N/A"
                    value={editFormState.workExperience}
                    onChange={(e) => setEditFormState((prev) => ({ ...prev, workExperience: e.target.value }))}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" type="button" onClick={() => setShowEdit(false)}>Cancel</Button>
                  <Button type="submit" disabled={updateMutation.isPending}>Save Changes</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search positions..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Open">Open</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
                <SelectItem value="Filled">Filled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Vacancy List */}
      <Card className="border border-border/50 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/70 bg-primary text-primary-foreground hover:bg-primary">
                  <TableHead className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Position</TableHead>
                  <TableHead className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Department</TableHead>
                  <TableHead className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">SG</TableHead>
                  <TableHead className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Posting</TableHead>
                  <TableHead className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Closing</TableHead>
                  <TableHead className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Status</TableHead>
                  <TableHead className="h-12 px-4 text-[11px] font-semibold text-right text-primary-foreground uppercase tracking-wide">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((vacancy, idx) => (
                  <TableRow
                    key={vacancy.id}
                    className={`border-b border-border/20 h-14 transition-colors ${
                      idx % 2 === 0 ? "bg-background hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/20"
                    }`}
                  >
                    <TableCell className="px-4 py-3 text-sm font-medium text-foreground">{vacancy.positionTitle}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">{getDepartmentName(vacancy.departmentId)}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">{vacancy.salaryGrade}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">{vacancy.postingDate}</TableCell>
                    <TableCell className="px-4 py-3 text-sm text-muted-foreground">{vacancy.closingDate}</TableCell>
                    <TableCell className="px-4 py-3">
                      <span className={`status-badge text-xs ${getVacancyStatusColor(vacancy.status)}`}>{vacancy.status}</span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Dialog>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Open actions menu">
                              <Ellipsis className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DialogTrigger asChild>
                              <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                                <Eye className="w-4 h-4 mr-2" />
                                View
                              </DropdownMenuItem>
                            </DialogTrigger>
                            {user?.role === "admin" && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setEditingId(vacancy.id);
                                  setEditFormState({
                                    positionTitle: vacancy.positionTitle,
                                    departmentId: vacancy.departmentId,
                                    plantillaNo: vacancy.plantillaNo ?? "",
                                    monthlyRate: vacancy.monthlyRate ?? "",
                                    salaryGrade: String(vacancy.salaryGrade),
                                    description: vacancy.description ?? vacancy.qualifications ?? "",
                                    eligibility: vacancy.eligibility ?? "",
                                    trainings: vacancy.trainings ?? "",
                                    competencies: vacancy.competencies ?? "",
                                    educationalBackground: vacancy.educationalBackground ?? "",
                                    workExperience: vacancy.workExperience ?? "",
                                    qualifications: vacancy.qualifications ?? vacancy.description ?? "",
                                    postingDate: vacancy.postingDate,
                                    closingDate: vacancy.closingDate,
                                    status: vacancy.status,
                                    positionLevel: vacancy.positionLevel ?? "first_level"
                                  });
                                  setShowEdit(true);
                                }}
                              >
                                <Pencil className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {user?.role === "admin" && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  setDeleteTarget({ type: "vacancy", id: vacancy.id, name: vacancy.positionTitle });
                                  setShowDeleteConfirm(true);
                                }}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <DialogContent>
                          <DialogHeader><DialogTitle>{vacancy.positionTitle}</DialogTitle></DialogHeader>
                          <div className="space-y-3 text-sm">
                            <div><span className="text-muted-foreground">Department:</span> <span className="font-medium">{getDepartmentName(vacancy.departmentId)}</span></div>
                            <div><span className="text-muted-foreground">Plantilla No.:</span> <span>{vacancy.plantillaNo || "-"}</span></div>
                            <div><span className="text-muted-foreground">Monthly Rate:</span> <span>{vacancy.monthlyRate || "-"}</span></div>
                            <div><span className="text-muted-foreground">Salary Grade:</span> <span className="font-medium">SG-{vacancy.salaryGrade}</span></div>
                            <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline">{vacancy.status}</Badge></div>
                            <div><span className="text-muted-foreground">Posting Date:</span> <span>{vacancy.postingDate}</span></div>
                            <div><span className="text-muted-foreground">Closing Date:</span> <span>{vacancy.closingDate}</span></div>
                            <div><span className="text-muted-foreground">Description:</span><p className="mt-1 whitespace-pre-wrap">{vacancy.description || vacancy.qualifications || "-"}</p></div>
                            <div><span className="text-muted-foreground">Eligibility:</span><p className="mt-1 whitespace-pre-wrap">{vacancy.eligibility || "-"}</p></div>
                            <div><span className="text-muted-foreground">Trainings:</span><p className="mt-1 whitespace-pre-wrap">{vacancy.trainings || "-"}</p></div>
                            <div><span className="text-muted-foreground">Competencies:</span><p className="mt-1 whitespace-pre-wrap">{vacancy.competencies || "-"}</p></div>
                            <div><span className="text-muted-foreground">Educational Background:</span><p className="mt-1 whitespace-pre-wrap">{vacancy.educationalBackground || "-"}</p></div>
                            <div><span className="text-muted-foreground">Work Experience:</span><p className="mt-1 whitespace-pre-wrap">{vacancy.workExperience || "-"}</p></div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No job vacancies found for the selected filters.
                    </TableCell>
                  </TableRow>
                )}              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.type === "title" && "Delete Position Title"}
              {deleteTarget?.type === "department" && "Delete Department"}
              {deleteTarget?.type === "vacancy" && "Delete Vacancy"}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.type === "title" && `Are you sure you want to delete "${deleteTarget.name}" and all saved references to it? This action cannot be undone.`}
              {deleteTarget?.type === "department" && `Are you sure you want to delete "${deleteTarget.name}" and all unused vacancies in this department? This action cannot be undone.`}
              {deleteTarget?.type === "vacancy" && `Are you sure you want to delete ${deleteTarget?.name}? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={handleDeleteConfirm}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

