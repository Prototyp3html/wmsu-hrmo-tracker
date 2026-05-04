import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { fetchApplicants, fetchApplications, fetchEvaluations, fetchJobs, fetchReportsSummary } from "@/lib/api";
import { allStatuses, getStatusColor } from "@/lib/status";
import { Award, Briefcase, ChevronRight, FilterX, SlidersHorizontal, TrendingUp, UserCheck, Users, Clock } from "lucide-react";
import {
  Area,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PIE_COLORS = ["hsl(217, 91%, 60%)", "hsl(38, 92%, 50%)", "hsl(142, 71%, 45%)"];

/* ── Tooltip ── */
function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const applications = payload.find((p) => p.name === "Applications")?.value ?? 0;
  const hired = payload.find((p) => p.name === "Hired")?.value ?? 0;
  return (
    <div className="rounded-xl border border-border bg-card shadow-lg px-4 py-3 text-xs space-y-1.5 min-w-[140px]">
      <p className="font-semibold text-foreground text-[13px]">{label}</p>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">Applications</span>
        <span className="font-semibold text-foreground tabular-nums">{applications}</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-muted-foreground">Hired</span>
        <span className="font-semibold text-success tabular-nums">{hired}</span>
      </div>
    </div>
  );
}

/* ── Pipeline stage bar ── */
function PipelineBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium truncate max-w-[160px]">{label}</span>
        <span className="tabular-nums font-semibold text-foreground ml-2">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPositionLevel, setFilterPositionLevel] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterJobType, setFilterJobType] = useState("all");
  const [sortBy, setSortBy] = useState("score");

  const { data: applicants = [] } = useQuery({ queryKey: ["applicants"], queryFn: fetchApplicants });
  const { data: jobVacancies = [] } = useQuery({ queryKey: ["jobs"], queryFn: fetchJobs });
  const { data: applications = [] } = useQuery({ queryKey: ["applications"], queryFn: fetchApplications });
  const { data: evaluations = [] } = useQuery({ queryKey: ["evaluations"], queryFn: fetchEvaluations });
  const { data: summary } = useQuery({ queryKey: ["reports-summary"], queryFn: fetchReportsSummary });

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      if (filterStatus !== "all" && app.status !== filterStatus) return false;
      if (filterPositionLevel !== "all") {
        const vacancy = jobVacancies.find((v) => v.id === app.vacancyId);
        if (vacancy && vacancy.positionLevel !== filterPositionLevel) return false;
      }
      if (filterMonth !== "all") {
        const appDate = new Date(app.dateApplied);
        const appMonthYear = `${appDate.getFullYear()}-${String(appDate.getMonth() + 1).padStart(2, "0")}`;
        if (appMonthYear !== filterMonth) return false;
      }
      if (filterJobType !== "all") {
        const vacancy = jobVacancies.find((v) => v.id === app.vacancyId);
        if (vacancy && vacancy.positionTitle !== filterJobType) return false;
      }
      return true;
    });
  }, [applications, jobVacancies, filterStatus, filterPositionLevel, filterMonth, filterJobType]);

  const topRatedApplicants = useMemo(() => {
    const withScores = filteredApplications
      .map((app) => {
        const evaluation = evaluations.find((e) => e.applicationId === app.id);
        const applicant = applicants.find((a) => a.id === app.applicantId);
        const vacancy = jobVacancies.find((v) => v.id === app.vacancyId);
        return {
          applicationId: app.id,
          applicantName: applicant?.fullName ?? "Unknown",
          position: vacancy?.positionTitle ?? "Unknown",
          score: evaluation?.totalScore ?? 0,
          status: app.status,
          hasEvaluation: Boolean(evaluation),
          dateApplied: app.dateApplied,
        };
      })
      .filter((item) => item.hasEvaluation);

    if (sortBy === "score") return withScores.sort((a, b) => b.score - a.score).slice(0, 6);
    return withScores
      .sort((a, b) => new Date(b.dateApplied).getTime() - new Date(a.dateApplied).getTime())
      .slice(0, 6);
  }, [filteredApplications, evaluations, applicants, jobVacancies, sortBy]);

  const screeningStats = useMemo(() => {
    const passingScreening = filteredApplications.filter(
      (a) => a.status !== "Application Received" && a.status !== "Rejected"
    ).length;
    const passRate =
      filteredApplications.length > 0
        ? Math.round((passingScreening / filteredApplications.length) * 100)
        : 0;
    return { passingScreening, passRate };
  }, [filteredApplications]);

  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    applications.forEach((app) => {
      const appDate = new Date(app.dateApplied);
      const monthYear = `${appDate.getFullYear()}-${String(appDate.getMonth() + 1).padStart(2, "0")}`;
      monthsSet.add(monthYear);
    });
    return Array.from(monthsSet).sort().reverse();
  }, [applications]);

  const availableJobTypes = useMemo(() => {
    const s = new Set<string>();
    jobVacancies.forEach((job) => s.add(job.positionTitle));
    return Array.from(s).sort();
  }, [jobVacancies]);

  const monthlyTrendData = useMemo(() => {
    const monthMap = new Map<string, { month: string; applications: number; hired: number }>();
    filteredApplications.forEach((app) => {
      const date = new Date(app.dateApplied);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const month = date.toLocaleString("en-US", { month: "short", year: "numeric" });
      const current = monthMap.get(key) ?? { month, applications: 0, hired: 0 };
      current.applications += 1;
      if (app.status === "Hired") current.hired += 1;
      monthMap.set(key, current);
    });
    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value);
  }, [filteredApplications]);

  const vacancyStatusData = [
    { name: "Open", value: jobVacancies.filter((v) => v.status === "Open").length },
    { name: "Closed", value: jobVacancies.filter((v) => v.status === "Closed").length },
    { name: "Filled", value: jobVacancies.filter((v) => v.status === "Filled").length },
  ];
  const totalVacancies = vacancyStatusData.reduce((sum, item) => sum + item.value, 0);

  /* ── Pipeline breakdown by status ── */
  const pipelineData = useMemo(() => {
    const total = filteredApplications.length;
    return allStatuses.map((status) => ({
      label: status,
      count: filteredApplications.filter((a) => a.status === status).length,
      total,
    }));
  }, [filteredApplications]);

  const activeFilters = useMemo(
    () => [filterStatus, filterPositionLevel, filterMonth, filterJobType].filter((v) => v !== "all").length,
    [filterStatus, filterPositionLevel, filterMonth, filterJobType]
  );

  const resetFilters = () => {
    setFilterStatus("all");
    setFilterPositionLevel("all");
    setFilterMonth("all");
    setFilterJobType("all");
  };

  const statCards = [
    {
      label: "Total Vacancies",
      value: summary?.totalJobs ?? jobVacancies.length,
      icon: Briefcase,
      accent: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950/50",
      border: "border-blue-100 dark:border-blue-900/60",
    },
    {
      label: "Total Applicants",
      value: summary?.totalApplicants ?? applicants.length,
      icon: Users,
      accent: "text-primary",
      bg: "bg-primary/8 dark:bg-primary/15",
      border: "border-primary/15 dark:border-primary/25",
    },
    {
      label: "Passing Screening",
      value: screeningStats.passingScreening,
      icon: TrendingUp,
      accent: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-950/50",
      border: "border-emerald-100 dark:border-emerald-900/60",
    },
    {
      label: "Screening Rate",
      value: `${screeningStats.passRate}%`,
      icon: UserCheck,
      accent: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/50",
      border: "border-amber-100 dark:border-amber-900/60",
    },
  ];

  /* ── Pipeline bar colors by status index ── */
  const pipelineColors = [
    "bg-blue-400",
    "bg-amber-400",
    "bg-purple-400",
    "bg-cyan-400",
    "bg-pink-400",
    "bg-emerald-400",
    "bg-green-500",
    "bg-red-400",
  ];

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 pb-8 space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col gap-1.5 pt-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
          <Clock className="w-3.5 h-3.5" />
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          {greeting}, {user?.name?.split(" ")[0]}.
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Here's what's happening across your hiring pipeline today.
        </p>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
        {statCards.map((card) => (
          <Card
            key={card.label}
            className={`border ${card.border} shadow-none hover:shadow-sm transition-shadow duration-200`}
          >
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">{card.label}</p>
                  <p className="text-2xl sm:text-3xl font-bold text-foreground tabular-nums mt-1 leading-none">
                    {card.value}
                  </p>
                </div>
                <div className={`${card.bg} p-2 rounded-lg shrink-0`}>
                  <card.icon className={`w-4 h-4 ${card.accent}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Filters ── */}
      <Card className="border border-border/60 shadow-none">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-semibold text-foreground">Filters</span>
              {activeFilters > 0 && (
                <span className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilters}
                </span>
              )}
            </div>
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <FilterX className="w-3 h-3" />
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-5 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Month</label>
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {availableMonths.map((m) => {
                    const [yr, mn] = m.split("-");
                    return (
                      <SelectItem key={m} value={m}>
                        {new Date(parseInt(yr), parseInt(mn) - 1).toLocaleString("en-US", {
                          month: "long",
                          year: "numeric",
                        })}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Job Type</label>
              <Select value={filterJobType} onValueChange={setFilterJobType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {availableJobTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {allStatuses.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Level</label>
              <Select value={filterPositionLevel} onValueChange={setFilterPositionLevel}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="first_level">First Level</SelectItem>
                  <SelectItem value="second_level">Second Level</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 sm:col-span-4 xl:col-span-1 flex items-end">
              <div className="w-full rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Showing</span>
                <span className="text-sm font-bold text-foreground tabular-nums">{filteredApplications.length}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* Hiring trend */}
        <Card className="xl:col-span-8 border border-border/60 shadow-none">
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Hiring Trend</p>
                <p className="text-xs text-muted-foreground mt-0.5">Applications vs. hires over time</p>
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded bg-primary inline-block" />
                  Applications
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded bg-emerald-500 inline-block" />
                  Hired
                </span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={monthlyTrendData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="appFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="hireFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142,71%,45%)" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="hsl(142,71%,45%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} strokeOpacity={0.6} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} tickLine={false} axisLine={false} width={24} />
                <Tooltip content={<TrendTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
                <Area type="monotone" dataKey="applications" fill="url(#appFill)" stroke="none" />
                <Area type="monotone" dataKey="hired" fill="url(#hireFill)" stroke="none" />
                <Line type="monotone" dataKey="applications" name="Applications" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="hired" name="Hired" stroke="hsl(142,71%,45%)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Vacancy donut */}
        <Card className="xl:col-span-4 border border-border/60 shadow-none">
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-foreground mb-1">Job Vacancies</p>
            <p className="text-xs text-muted-foreground mb-4">By current status</p>
            <div className="relative">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={vacancyStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={56}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                  >
                    {vacancyStatusData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total</p>
                <p className="text-3xl font-bold text-foreground tabular-nums leading-none mt-0.5">{totalVacancies}</p>
              </div>
            </div>
            {/* Legend */}
            <div className="space-y-2 mt-3">
              {vacancyStatusData.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: PIE_COLORS[idx] }} />
                    {item.name}
                  </span>
                  <span className="font-semibold text-foreground tabular-nums">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Pipeline + Applicant table row ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* Pipeline breakdown */}
        <Card className="xl:col-span-4 border border-border/60 shadow-none">
          <CardContent className="p-5">
            <p className="text-sm font-semibold text-foreground mb-1">Application Pipeline</p>
            <p className="text-xs text-muted-foreground mb-4">Breakdown by stage</p>
            <div className="space-y-3">
              {pipelineData.map((stage, idx) => (
                <PipelineBar
                  key={stage.label}
                  label={stage.label}
                  count={stage.count}
                  total={stage.total}
                  color={pipelineColors[idx] ?? "bg-gray-400"}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent applications table */}
        <Card className="xl:col-span-8 border border-border/60 shadow-none">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Recent Applications</p>
                <p className="text-xs text-muted-foreground mt-0.5">Latest 8 entries</p>
              </div>
            </div>
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <div className="overflow-auto max-h-[340px]">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/60">
                      <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Applicant</th>
                      <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Position</th>
                      <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Date</th>
                      <th className="py-2.5 px-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {filteredApplications.slice(0, 8).map((app) => {
                      const applicant = applicants.find((a) => a.id === app.applicantId);
                      const vacancy = jobVacancies.find((v) => v.id === app.vacancyId);
                      return (
                        <tr key={app.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-3 font-medium text-foreground whitespace-nowrap">{applicant?.fullName}</td>
                          <td className="py-3 px-3 text-muted-foreground max-w-[160px] truncate">{vacancy?.positionTitle}</td>
                          <td className="py-3 px-3 text-muted-foreground hidden sm:table-cell whitespace-nowrap text-xs">{app.dateApplied}</td>
                          <td className="py-3 px-3">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${getStatusColor(app.status)}`}>
                              {app.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Top Rated Applicants ── */}
      <Card className="border border-border/60 shadow-none">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              <p className="text-sm font-semibold text-foreground">Top Rated Applicants</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Sort by</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="score">Highest Score</SelectItem>
                  <SelectItem value="date">Latest</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {topRatedApplicants.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {topRatedApplicants.map((app, idx) => (
                <div
                  key={app.applicationId}
                  className="flex items-center gap-3 rounded-xl border border-border/60 p-3.5 hover:bg-muted/30 transition-colors"
                >
                  {/* Rank badge */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    idx === 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                    idx === 1 ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" :
                    idx === 2 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{app.applicantName}</p>
                    <p className="text-xs text-muted-foreground truncate">{app.position}</p>
                    <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${getStatusColor(app.status)}`}>
                      {app.status}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{app.score}</p>
                    <p className="text-[10px] text-muted-foreground">score</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Award className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No evaluated applicants yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Evaluations will appear here once submitted</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}