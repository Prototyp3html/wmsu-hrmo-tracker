import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { fetchApplicants, fetchApplications, fetchJobs, fetchEvaluations } from "@/lib/api";
import { getStatusColor, allStatuses } from "@/lib/status";
import { FileText, Printer, Download, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ReportType = "per-position" | "status" | "hired" | "rejected" | "summary";

export default function Reports() {
  const { toast } = useToast();
  const [reportType, setReportType] = useState<ReportType>("per-position");
  const [isExporting, setIsExporting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [hiredPositionFilter, setHiredPositionFilter] = useState("all");
  const [hiredSalaryGradeFilter, setHiredSalaryGradeFilter] = useState("all");
  const [hiredPositionLevelFilter, setHiredPositionLevelFilter] = useState("all");
  
  const { data: applications = [] } = useQuery({
    queryKey: ["applications"],
    queryFn: fetchApplications
  });
  const { data: applicants = [] } = useQuery({
    queryKey: ["applicants"],
    queryFn: fetchApplicants
  });
  const { data: jobs = [] } = useQuery({
    queryKey: ["jobs"],
    queryFn: fetchJobs
  });
  const { data: evaluations = [] } = useQuery({
    queryKey: ["evaluations"],
    queryFn: fetchEvaluations
  });

  const getApplicantName = (id: string) =>
    applicants.find((a) => a.id === id)?.fullName ?? "Unknown";

  const getVacancyTitle = (id: string) =>
    jobs.find((v) => v.id === id)?.positionTitle ?? "Unknown";

  const getVacancySalaryGrade = (id: string) =>
    jobs.find((v) => v.id === id)?.salaryGrade ?? null;

  const getVacancyPositionLevel = (id: string) => {
    const level = jobs.find((v) => v.id === id)?.positionLevel;
    if (level === "first_level") return "First Level";
    if (level === "second_level") return "Second Level";
    return "Unknown";
  };

  const hired = applications.filter((a) => a.status === "Hired");
  const rejected = applications.filter((a) => a.status === "Rejected");

  const hiredPositionOptions = useMemo(() => {
    return Array.from(new Set(hired.map((app) => getVacancyTitle(app.vacancyId)).filter((title) => title !== "Unknown"))).sort((a, b) => a.localeCompare(b));
  }, [hired, jobs]);

  const hiredSalaryGradeOptions = useMemo(() => {
    return Array.from(new Set(
      hired
        .map((app) => getVacancySalaryGrade(app.vacancyId))
        .filter((grade): grade is number => grade !== null)
    ))
      .sort((a, b) => a - b)
      .map((grade) => String(grade));
  }, [hired, jobs]);

  const hiredPositionLevelOptions = useMemo(() => {
    return Array.from(new Set(
      hired.map((app) => getVacancyPositionLevel(app.vacancyId)).filter((level) => level !== "Unknown")
    ));
  }, [hired, jobs]);

  const hiredFiltered = useMemo(() => {
    return hired.filter((app) => {
      const position = getVacancyTitle(app.vacancyId);
      const salaryGrade = getVacancySalaryGrade(app.vacancyId);
      const positionLevel = getVacancyPositionLevel(app.vacancyId);

      const matchPosition = hiredPositionFilter === "all" || position === hiredPositionFilter;
      const matchSalaryGrade = hiredSalaryGradeFilter === "all" || String(salaryGrade ?? "") === hiredSalaryGradeFilter;
      const matchPositionLevel = hiredPositionLevelFilter === "all" || positionLevel === hiredPositionLevelFilter;

      return matchPosition && matchSalaryGrade && matchPositionLevel;
    });
  }, [hired, hiredPositionFilter, hiredSalaryGradeFilter, hiredPositionLevelFilter, jobs]);

  const positionGroups = jobs.map((v) => ({
    vacancy: v,
    apps: applications.filter((a) => a.vacancyId === v.id),
  }));

  // Status distribution statistics
  const statusStats = useMemo(() => {
    const total = applications.length || 1;
    return allStatuses.map((status) => {
      const count = applications.filter((a) => a.status === status).length;
      const percentage = Math.round((count / total) * 100);
      return { status, count, percentage };
    });
  }, [applications]);

  // Position-level statistics
  const positionLevelStats = useMemo(() => {
    const firstLevel = applications.filter((app) => {
      const job = jobs.find((j) => j.id === app.vacancyId);
      return (job as any)?.positionLevel === "first_level";
    });
    const secondLevel = applications.filter((app) => {
      const job = jobs.find((j) => j.id === app.vacancyId);
      return (job as any)?.positionLevel === "second_level";
    });
    const total = applications.length || 1;
    
    return [
      {
        level: "First Level",
        count: firstLevel.length,
        percentage: Math.round((firstLevel.length / total) * 100),
        hired: firstLevel.filter((a) => a.status === "Hired").length,
        rejected: firstLevel.filter((a) => a.status === "Rejected").length
      },
      {
        level: "Second Level",
        count: secondLevel.length,
        percentage: Math.round((secondLevel.length / total) * 100),
        hired: secondLevel.filter((a) => a.status === "Hired").length,
        rejected: secondLevel.filter((a) => a.status === "Rejected").length
      }
    ];
  }, [applications, jobs]);

  const monthlySummary = useMemo(() => {
    const summaryMap = new Map<string, { month: string; applications: number; hired: number; rejected: number }>();
    applications.forEach((app) => {
      const date = new Date(app.dateApplied);
      if (Number.isNaN(date.getTime())) return;
      const month = date.toLocaleString("en-US", { month: "long", year: "numeric" });
      const entry = summaryMap.get(month) ?? { month, applications: 0, hired: 0, rejected: 0 };
      entry.applications += 1;
      if (app.status === "Hired") entry.hired += 1;
      if (app.status === "Rejected") entry.rejected += 1;
      summaryMap.set(month, entry);
    });
    return Array.from(summaryMap.values());
  }, [applications]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
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

      const drawTitleBlock = (title: string, subtitle?: string) => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(18);
        pdf.text(title, pageWidth / 2, cursorY + 10, { align: "center" });
        cursorY += 18;
        if (subtitle) {
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(9.5);
          pdf.text(subtitle, pageWidth / 2, cursorY + 10, { align: "center" });
          cursorY += 14;
        }
        pdf.setDrawColor(140);
        pdf.setLineWidth(0.8);
        pdf.line(margin, cursorY + 6, pageWidth - margin, cursorY + 6);
        cursorY += 16;
      };

      const drawSectionHeader = (title: string) => {
        ensureSpace(22);
        pdf.setFillColor(237, 237, 237);
        pdf.rect(margin, cursorY, contentWidth, 18, "F");
        pdf.setDrawColor(120);
        pdf.rect(margin, cursorY, contentWidth, 18);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(10);
        pdf.text(title, margin + 6, cursorY + 12);
        cursorY += 22;
      };

      const drawTable = (headers: string[], rows: string[][], columnWidths: number[]) => {
        const normalizedWidths = (() => {
          const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0) || 1;
          const scaled = columnWidths.map((width) => (width / totalWidth) * contentWidth);
          const rounded = scaled.map((width) => Math.floor(width));
          rounded[rounded.length - 1] = contentWidth - rounded.slice(0, -1).reduce((sum, width) => sum + width, 0);
          return rounded;
        })();
        const rowPadding = 6;
        const lineHeight = 11;

        const drawRow = (values: string[], isHeader = false) => {
          const cellLines = values.map((value, index) => pdf.splitTextToSize(value, normalizedWidths[index] - rowPadding * 2) as string[]);
          const rowHeight = Math.max(...cellLines.map((lines) => lines.length), 1) * lineHeight + 8;
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
            const lines = cellLines[index];
            lines.forEach((line, lineIndex) => {
              pdf.text(line, startX + rowPadding, cursorY + 12 + lineIndex * lineHeight);
            });
            startX += width;
          });

          pdf.setTextColor(0);
          cursorY += rowHeight;
        };

        drawRow(headers, true);
        if (rows.length === 0) {
          drawRow(["No records", ...headers.slice(1).map(() => "")]);
          return;
        }
        rows.forEach((row) => drawRow(row));
      };

      const reportTitleMap: Record<ReportType, string> = {
        "per-position": "Applicants Summary per Position",
        hired: "Hired Applicants",
        rejected: "Rejected Applicants",
        status: "Applications by Status",
        summary: "Hiring Summary per Month"
      };

      const generatedAt = new Date().toLocaleString();

      drawTitleBlock(
        "WMSU HRMO Tracker Report",
        reportTitleMap[reportType]
      );

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(`Generated: ${generatedAt}`, pageWidth / 2, cursorY + 4, { align: "center" });
      cursorY += 16;

      if (reportType === "per-position") {
        drawSectionHeader("Applicants Summary per Position");
        drawTable(
          ["Position Title", "Applications", "Hired", "Rejected", "In Review"],
          positionGroups.map(({ vacancy, apps }) => {
            const hiredCount = apps.filter((a) => a.status === "Hired").length;
            const rejectedCount = apps.filter((a) => a.status === "Rejected").length;
            const inReviewCount = apps.filter((a) => a.status !== "Hired" && a.status !== "Rejected").length;
            return [vacancy.positionTitle, String(apps.length), String(hiredCount), String(rejectedCount), String(inReviewCount)];
          }),
          [180, 72, 64, 72, 74]
        );
      } else if (reportType === "hired") {
        drawSectionHeader("Hired Applicants");
        drawTable(
          ["Applicant", "Position", "Salary Grade", "Position Level", "Date Applied"],
          hiredFiltered.map((app) => [
            getApplicantName(app.applicantId),
            getVacancyTitle(app.vacancyId),
            String(getVacancySalaryGrade(app.vacancyId) ?? "N/A"),
            getVacancyPositionLevel(app.vacancyId),
            app.dateApplied
          ]),
          [150, 155, 70, 95, 80]
        );
      } else if (reportType === "rejected") {
        drawSectionHeader("Rejected Applicants");
        drawTable(
          ["Applicant", "Position", "Remarks"],
          rejected.map((app) => [getApplicantName(app.applicantId), getVacancyTitle(app.vacancyId), app.remarks ?? "—"]),
          [145, 145, 260]
        );
      } else if (reportType === "status") {
        drawSectionHeader("Applications by Status");
        drawTable(
          ["Status", "Count", "Percentage"],
          statusStats.map(({ status, count, percentage }) => [status, String(count), `${percentage}%`]),
          [255, 90, 105]
        );
      } else if (reportType === "summary") {
        drawSectionHeader("Hiring Summary per Month");
        drawTable(
          ["Month", "Applications", "Hired", "Rejected"],
          monthlySummary.map((row) => [row.month, String(row.applications), String(row.hired), String(row.rejected)]),
          [220, 90, 90, 90]
        );
      }

      pdf.save(`wmsu-hr-report-${reportType}.pdf`);
      toast({ title: "Success", description: "Report exported as PDF successfully!" });
    } catch (error) {
      toast({
        title: "Export failed",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCsv = () => {
    setIsExporting(true);
    try {
      let csvContent = "";
      const timestamp = new Date().toLocaleString();
      csvContent += `WMSU HRMO Tracker Report - ${reportType}\nGenerated: ${timestamp}\n\n`;

      if (reportType === "per-position") {
        csvContent += "Position Title,Total Applications,Hired,Rejected,In Review\n";
        positionGroups.forEach(({ vacancy, apps }) => {
          const hiredCount = apps.filter((a) => a.status === "Hired").length;
          const rejectedCount = apps.filter((a) => a.status === "Rejected").length;
          const inReviewCount = apps.filter((a) => a.status !== "Hired" && a.status !== "Rejected").length;
          csvContent += `"${vacancy.positionTitle}",${apps.length},${hiredCount},${rejectedCount},${inReviewCount}\n`;
        });
      } else if (reportType === "hired") {
        csvContent += "Applicant Name,Position,Salary Grade,Position Level,Date Applied\n";
        hiredFiltered.forEach((app) => {
          const salaryGrade = getVacancySalaryGrade(app.vacancyId);
          csvContent += `"${getApplicantName(app.applicantId)}","${getVacancyTitle(app.vacancyId)}","${salaryGrade ?? "N/A"}","${getVacancyPositionLevel(app.vacancyId)}","${app.dateApplied}"\n`;
        });
      } else if (reportType === "rejected") {
        csvContent += "Applicant Name,Position,Remarks\n";
        rejected.forEach((app) => {
          const escapedRemarks = (app.remarks ?? "").replace(/"/g, '""');
          csvContent += `"${getApplicantName(app.applicantId)}","${getVacancyTitle(app.vacancyId)}","${escapedRemarks}"\n`;
        });
      } else if (reportType === "status") {
        csvContent += "Status,Count,Percentage\n";
        statusStats.forEach(({ status, count, percentage }) => {
          csvContent += `"${status}",${count},${percentage}%\n`;
        });
      } else if (reportType === "summary") {
        csvContent += "Month,Total Applications,Hired,Rejected\n";
        monthlySummary.forEach((row) => {
          csvContent += `"${row.month}",${row.applications},${row.hired},${row.rejected}\n`;
        });
      }

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `wmsu-hr-report-${reportType}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Success", description: "Report exported as CSV successfully!" });
    } catch (error) {
      toast({
        title: "Export failed",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">Generate and export hiring reports</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
            <Eye className="w-4 h-4 mr-1" /> Preview
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={isExporting}>
            <Download className="w-4 h-4 mr-1" /> {isExporting ? "Exporting..." : "PDF"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={isExporting}>
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      <Tabs value={reportType} onValueChange={(v) => setReportType(v as ReportType)} className="w-full">
        <TabsList className="grid w-full grid-cols-5 no-print">
          <TabsTrigger value="per-position">Per Position</TabsTrigger>
          <TabsTrigger value="hired">Hired</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="status">By Status</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        <div id="report-content">
        <TabsContent value="per-position" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Total Positions</p>
                    <p className="text-2xl font-bold">{jobs.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Total Applications</p>
                    <p className="text-2xl font-bold">{applications.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Avg per Position</p>
                    <p className="text-2xl font-bold">{jobs.length > 0 ? Math.round(applications.length / jobs.length) : 0}</p>
                  </CardContent>
                </Card>
              </div>

              <h3 className="font-semibold text-foreground mb-4">Applicants Summary per Position</h3>
              <div className="overflow-x-auto border border-border/50 shadow-sm rounded-lg">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b border-border/70 bg-primary text-primary-foreground">
                    <th className="h-12 px-4 py-3 text-left text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Position Title</th>
                    <th className="h-12 px-4 py-3 text-center text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Applications</th>
                    <th className="h-12 px-4 py-3 text-center text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Hired</th>
                    <th className="h-12 px-4 py-3 text-center text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Rejected</th>
                    <th className="h-12 px-4 py-3 text-center text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">In Review</th>
                  </tr>
                </thead>
                <tbody>
                  {positionGroups.map(({ vacancy, apps }, idx) => {
                    const hiredCount = apps.filter((a) => a.status === "Hired").length;
                    const rejectedCount = apps.filter((a) => a.status === "Rejected").length;
                    const inReviewCount = apps.filter((a) => 
                      a.status !== "Hired" && a.status !== "Rejected"
                    ).length;
                    
                    return (
                      <tr key={vacancy.id} className={`border-b border-border/20 h-14 transition-colors ${
                        idx % 2 === 0 ? "bg-background hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/20"
                      }`}>
                        <td className="px-4 py-3 pr-3 font-medium">{vacancy.positionTitle}</td>
                        <td className="px-4 py-3 text-center font-semibold">{apps.length}</td>
                        <td className="px-4 py-3 text-center text-success font-medium">{hiredCount}</td>
                        <td className="px-4 py-3 text-center text-destructive font-medium">{rejectedCount}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{inReviewCount}</td>
                      </tr>
                    );
                  })}
                  {positionGroups.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No job vacancies available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hired" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6 no-print">
                <Select value={hiredPositionFilter} onValueChange={setHiredPositionFilter}>
                  <SelectTrigger><SelectValue placeholder="Filter by Position" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Positions</SelectItem>
                    {hiredPositionOptions.map((title) => (
                      <SelectItem key={title} value={title}>{title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={hiredSalaryGradeFilter} onValueChange={setHiredSalaryGradeFilter}>
                  <SelectTrigger><SelectValue placeholder="Filter by Salary Grade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Salary Grades</SelectItem>
                    {hiredSalaryGradeOptions.map((grade) => (
                      <SelectItem key={grade} value={grade}>SG-{grade}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={hiredPositionLevelFilter} onValueChange={setHiredPositionLevelFilter}>
                  <SelectTrigger><SelectValue placeholder="Filter by Position Level" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Position Levels</SelectItem>
                    {hiredPositionLevelOptions.map((level) => (
                      <SelectItem key={level} value={level}>{level}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Filtered Hired</p>
                    <p className="text-2xl font-bold text-success">{hiredFiltered.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Hiring Rate</p>
                    <p className="text-2xl font-bold">{applications.length > 0 ? Math.round((hiredFiltered.length / applications.length) * 100) : 0}%</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Matching Filters</p>
                    <p className="text-2xl font-bold">{hiredFiltered.length}</p>
                  </CardContent>
                </Card>
              </div>
              <h3 className="font-semibold text-foreground mb-4">Hired Applicants</h3>
              <div className="overflow-x-auto border border-border/50 shadow-sm rounded-lg">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-border/70 bg-primary text-primary-foreground">
                    <th className="h-12 px-4 py-3 text-left text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Applicant</th>
                    <th className="h-12 px-4 py-3 text-left text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Position</th>
                    <th className="h-12 px-4 py-3 text-center text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Salary Grade</th>
                    <th className="h-12 px-4 py-3 text-left text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Position Level</th>
                    <th className="h-12 px-4 py-3 text-center text-[11px] font-semibold text-primary-foreground uppercase tracking-wide whitespace-nowrap hidden sm:table-cell">Date Applied</th>
                  </tr>
                </thead>
                <tbody>
                  {hiredFiltered.map((app, idx) => (
                    <tr key={app.id} className={`border-b border-border/20 h-14 transition-colors ${
                      idx % 2 === 0 ? "bg-background hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/20"
                    }`}>
                      <td className="px-4 py-3 pr-3 font-medium whitespace-nowrap">{getApplicantName(app.applicantId)}</td>
                      <td className="px-4 py-3 pr-3 text-muted-foreground">{getVacancyTitle(app.vacancyId)}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground whitespace-nowrap">{getVacancySalaryGrade(app.vacancyId) ?? "N/A"}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{getVacancyPositionLevel(app.vacancyId)}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground whitespace-nowrap hidden sm:table-cell">{app.dateApplied}</td>
                    </tr>
                  ))}
                  {hiredFiltered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No hired applicants found for the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rejected" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Total Rejected</p>
                    <p className="text-2xl font-bold text-destructive">{rejected.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Rejection Rate</p>
                    <p className="text-2xl font-bold">{applications.length > 0 ? Math.round((rejected.length / applications.length) * 100) : 0}%</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">From Applications</p>
                    <p className="text-2xl font-bold">{applications.length}</p>
                  </CardContent>
                </Card>
              </div>
              <h3 className="font-semibold text-foreground mb-4">Rejected Applicants</h3>
              <div className="overflow-x-auto border border-border/50 shadow-sm rounded-lg">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="border-b border-border/70 bg-primary text-primary-foreground">
                    <th className="h-12 px-4 py-3 text-left text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Applicant</th>
                    <th className="h-12 px-4 py-3 text-left text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Position</th>
                    <th className="h-12 px-4 py-3 text-left text-[11px] font-semibold text-primary-foreground uppercase tracking-wide hidden sm:table-cell">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {rejected.map((app, idx) => (
                    <tr key={app.id} className={`border-b border-border/20 h-14 transition-colors ${
                      idx % 2 === 0 ? "bg-background hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/20"
                    }`}>
                      <td className="px-4 py-3 pr-3 font-medium whitespace-nowrap">{getApplicantName(app.applicantId)}</td>
                      <td className="px-4 py-3 pr-3 text-muted-foreground">{getVacancyTitle(app.vacancyId)}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{app.remarks ?? "—"}</td>
                    </tr>
                  ))}
                  {rejected.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No rejected applicants found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                {statusStats.map(({ status, count, percentage }) => (
                  <Card key={status}>
                    <CardContent className="pt-4">
                      <p className="text-xs text-muted-foreground leading-tight mb-2">{status}</p>
                      <p className="text-xl font-bold">{count}</p>
                      <p className="text-sm text-muted-foreground">{percentage}%</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <h3 className="font-semibold text-foreground mb-4">Applications by Status</h3>
              <div className="overflow-x-auto border border-border/50 shadow-sm rounded-lg">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="border-b border-border/70 bg-primary text-primary-foreground">
                    <th className="h-12 px-4 py-3 text-left text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Status</th>
                    <th className="h-12 px-4 py-3 text-center text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Count</th>
                    <th className="h-12 px-4 py-3 text-center text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Percentage</th>
                  </tr>
                </thead>
                <tbody>
                  {statusStats.map(({ status, count, percentage }, idx) => (
                    <tr key={status} className={`border-b border-border/20 h-14 transition-colors ${
                      idx % 2 === 0 ? "bg-background hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/20"
                    }`}>
                      <td className="px-4 py-3 align-middle">
                        <span className={`status-badge ${getStatusColor(status)}`}>{status}</span>
                      </td>
                      <td className="px-4 py-3 text-center font-semibold">{count}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{percentage}%</td>
                    </tr>
                  ))}
                  {statusStats.every(s => s.count === 0) && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No applications found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Total Months</p>
                    <p className="text-2xl font-bold">{monthlySummary.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Avg Applications/Month</p>
                    <p className="text-2xl font-bold">{monthlySummary.length > 0 ? Math.round(applications.length / monthlySummary.length) : 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm text-muted-foreground">Avg Hired/Month</p>
                    <p className="text-2xl font-bold">{monthlySummary.length > 0 ? Math.round(hired.length / monthlySummary.length) : 0}</p>
                  </CardContent>
                </Card>
              </div>
              <h3 className="font-semibold text-foreground mb-4">Hiring Summary per Month</h3>
              <div className="overflow-x-auto border border-border/50 shadow-sm rounded-lg">
              <table className="w-full text-sm min-w-[350px]">
                <thead>
                  <tr className="border-b border-border/70 bg-primary text-primary-foreground">
                    <th className="h-12 px-4 py-3 text-left text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Month</th>
                      <th className="h-12 px-4 py-3 text-center text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Applications</th>
                    <th className="h-12 px-4 py-3 text-center text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Hired</th>
                    <th className="h-12 px-4 py-3 text-center text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Rejected</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySummary.map((row, idx) => (
                    <tr key={row.month} className={`border-b border-border/20 h-14 transition-colors ${
                      idx % 2 === 0 ? "bg-background hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/20"
                    }`}>
                      <td className="px-4 py-3 pr-3 font-medium whitespace-nowrap">{row.month}</td>
                      <td className="px-4 py-3 text-center">{row.applications}</td>
                      <td className="px-4 py-3 text-center text-success font-medium">{row.hired}</td>
                      <td className="px-4 py-3 text-center text-destructive font-medium">{row.rejected}</td>
                    </tr>
                  ))}
                  {monthlySummary.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No applications found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        </div>
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Report Preview</DialogTitle>
            <DialogDescription>Preview of the {reportType} report</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {reportType === "per-position" && (
              <div>
                <h3 className="font-semibold text-foreground mb-4">Applicants Summary per Position</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 text-left text-muted-foreground">Position Title</th>
                      <th className="pb-2 text-center text-muted-foreground">Applications</th>
                      <th className="pb-2 text-center text-muted-foreground">Hired</th>
                      <th className="pb-2 text-center text-muted-foreground">Rejected</th>
                      <th className="pb-2 text-center text-muted-foreground">In Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positionGroups.map(({ vacancy, apps }) => {
                      const hiredCount = apps.filter((a) => a.status === "Hired").length;
                      const rejectedCount = apps.filter((a) => a.status === "Rejected").length;
                      const inReviewCount = apps.filter((a) => 
                        a.status !== "Hired" && a.status !== "Rejected"
                      ).length;
                      
                      return (
                        <tr key={vacancy.id} className="border-b last:border-0">
                          <td className="py-3 pr-3 font-medium">{vacancy.positionTitle}</td>
                          <td className="py-3 text-center font-semibold">{apps.length}</td>
                          <td className="py-3 text-center text-success font-medium">{hiredCount}</td>
                          <td className="py-3 text-center text-destructive font-medium">{rejectedCount}</td>
                          <td className="py-3 text-center text-muted-foreground">{inReviewCount}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === "hired" && (
              <div>
                <h3 className="font-semibold text-foreground mb-4">Hired Applicants</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 text-left text-muted-foreground">Applicant</th>
                      <th className="pb-2 text-left text-muted-foreground">Position</th>
                      <th className="pb-2 text-center text-muted-foreground">Salary Grade</th>
                      <th className="pb-2 text-left text-muted-foreground">Position Level</th>
                      <th className="pb-2 text-center text-muted-foreground whitespace-nowrap">Date Applied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hiredFiltered.map((app) => (
                      <tr key={app.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium whitespace-nowrap">{getApplicantName(app.applicantId)}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{getVacancyTitle(app.vacancyId)}</td>
                        <td className="py-2 text-center text-muted-foreground whitespace-nowrap">{getVacancySalaryGrade(app.vacancyId) ?? "N/A"}</td>
                        <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{getVacancyPositionLevel(app.vacancyId)}</td>
                        <td className="py-2 text-center text-muted-foreground whitespace-nowrap">{app.dateApplied}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === "rejected" && (
              <div>
                <h3 className="font-semibold text-foreground mb-4">Rejected Applicants</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 text-left text-muted-foreground">Applicant</th>
                      <th className="pb-2 text-left text-muted-foreground">Position</th>
                      <th className="pb-2 text-left text-muted-foreground">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rejected.map((app) => (
                      <tr key={app.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium whitespace-nowrap">{getApplicantName(app.applicantId)}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{getVacancyTitle(app.vacancyId)}</td>
                        <td className="py-2 text-muted-foreground">{app.remarks ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === "status" && (
              <div>
                <h3 className="font-semibold text-foreground mb-4">Applications by Status</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 text-left text-muted-foreground">Status</th>
                      <th className="pb-2 text-center text-muted-foreground">Count</th>
                      <th className="pb-2 text-center text-muted-foreground">Percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusStats.map(({ status, count, percentage }) => (
                      <tr key={status} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">
                          <span className={`status-badge ${getStatusColor(status)}`}>{status}</span>
                        </td>
                        <td className="py-2 text-center font-semibold">{count}</td>
                        <td className="py-2 text-center text-muted-foreground">{percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === "summary" && (
              <div>
                <h3 className="font-semibold text-foreground mb-4">Hiring Summary per Month</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-2 text-left text-muted-foreground">Month</th>
                      <th className="pb-2 text-center text-muted-foreground">Applications</th>
                      <th className="pb-2 text-center text-muted-foreground">Hired</th>
                      <th className="pb-2 text-center text-muted-foreground">Rejected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.map((row) => (
                      <tr key={row.month} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium whitespace-nowrap">{row.month}</td>
                        <td className="py-2 text-center">{row.applications}</td>
                        <td className="py-2 text-center text-success font-medium">{row.hired}</td>
                        <td className="py-2 text-center text-destructive font-medium">{row.rejected}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
