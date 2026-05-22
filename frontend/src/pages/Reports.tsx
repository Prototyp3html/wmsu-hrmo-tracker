import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { fetchApplicants, fetchApplications, fetchDepartments, fetchJobs } from "@/lib/api";
import { allStatuses, getStatusColor } from "@/lib/status";
import { Download, Eye, Printer, Search, SlidersHorizontal, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type SortOption =
  | "date-desc"
  | "date-asc"
  | "applicant-asc"
  | "applicant-desc"
  | "position-asc"
  | "position-desc"
  | "department-asc"
  | "department-desc"
  | "status-asc"
  | "status-desc";

type DatePreset = "all" | "7d" | "30d" | "90d" | "custom";
type CategoryFilter = "all" | "first_level" | "second_level";
type PrintScope = "all" | "vacancy" | "selected";

type ApplicationRow = {
  id: string;
  applicantId: string;
  applicantName: string;
  applicantEmail: string;
  vacancyId: string;
  vacancyTitle: string;
  departmentId: string;
  departmentName: string;
  status: string;
  dateApplied: string;
  dateAppliedValue: number | null;
  remarks: string;
  categoryValue: Exclude<CategoryFilter, "all">;
  categoryLabel: string;
};

const categoryLabelMap: Record<Exclude<CategoryFilter, "all">, string> = {
  first_level: "First Level",
  second_level: "Second Level"
};

const sortLabelMap: Record<SortOption, string> = {
  "date-desc": "Newest first",
  "date-asc": "Oldest first",
  "applicant-asc": "Applicant A-Z",
  "applicant-desc": "Applicant Z-A",
  "position-asc": "Position A-Z",
  "position-desc": "Position Z-A",
  "department-asc": "Department A-Z",
  "department-desc": "Department Z-A",
  "status-asc": "Status A-Z",
  "status-desc": "Status Z-A"
};

const datePresetLabelMap: Record<DatePreset, string> = {
  all: "All dates",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  custom: "Custom range"
};

function toSafeDateValue(value: string): number | null {
  const parsed = new Date(value);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
}

function formatDisplayDate(value: string): string {
  const time = toSafeDateValue(value);
  if (time === null) {
    return value || "—";
  }
  return new Date(time).toLocaleDateString();
}

function escapeCsv(value: string): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function Reports() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [vacancyFilter, setVacancyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("date-desc");
  const [printScope, setPrintScope] = useState<PrintScope>("all");
  const [printVacancyId, setPrintVacancyId] = useState("all");
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<string[]>([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

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
  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: fetchDepartments
  });

  const applicantById = useMemo(() => new Map(applicants.map((applicant) => [applicant.id, applicant])), [applicants]);
  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const departmentById = useMemo(() => new Map(departments.map((department) => [department.id, department])), [departments]);

  const applicationRows = useMemo<ApplicationRow[]>(() => {
    return applications.map((application) => {
      const applicant = applicantById.get(application.applicantId);
      const job = jobById.get(application.vacancyId);
      const department = job ? departmentById.get(job.departmentId) : undefined;
      const categoryValue = job?.positionLevel === "second_level" ? "second_level" : "first_level";

      return {
        id: application.id,
        applicantId: application.applicantId,
        applicantName: applicant?.fullName ?? "Unknown applicant",
        applicantEmail: applicant?.email ?? "—",
        vacancyId: application.vacancyId,
        vacancyTitle: job?.positionTitle ?? "Unknown position",
        departmentId: job?.departmentId ?? "",
        departmentName: department?.name ?? "Unknown department",
        status: application.status,
        dateApplied: application.dateApplied,
        dateAppliedValue: toSafeDateValue(application.dateApplied),
        remarks: application.remarks ?? "—",
        categoryValue,
        categoryLabel: categoryLabelMap[categoryValue]
      };
    });
  }, [applications, applicantById, jobById, departmentById]);

  const vacancyOptions = useMemo(() => {
    return jobs.slice().sort((a, b) => a.positionTitle.localeCompare(b.positionTitle));
  }, [jobs]);

  const departmentOptions = useMemo(() => {
    return departments.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [departments]);

  const filteredApplications = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const now = Date.now();
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toDate = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;

    const filtered = applicationRows.filter((row) => {
      const matchesVacancy = vacancyFilter === "all" || row.vacancyId === vacancyFilter;
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesDepartment = departmentFilter === "all" || row.departmentId === departmentFilter;
      const matchesCategory = categoryFilter === "all" || row.categoryValue === categoryFilter;

      let matchesDate = true;
      if (datePreset !== "all") {
        if (row.dateAppliedValue === null) {
          matchesDate = false;
        } else if (datePreset === "7d") {
          matchesDate = row.dateAppliedValue >= now - 7 * 24 * 60 * 60 * 1000;
        } else if (datePreset === "30d") {
          matchesDate = row.dateAppliedValue >= now - 30 * 24 * 60 * 60 * 1000;
        } else if (datePreset === "90d") {
          matchesDate = row.dateAppliedValue >= now - 90 * 24 * 60 * 60 * 1000;
        } else if (datePreset === "custom") {
          if (fromDate !== null) {
            matchesDate = row.dateAppliedValue >= fromDate;
          }
          if (matchesDate && toDate !== null) {
            matchesDate = row.dateAppliedValue <= toDate;
          }
        }
      }

      const searchableText = [
        row.applicantName,
        row.applicantEmail,
        row.vacancyTitle,
        row.departmentName,
        row.status,
        row.categoryLabel,
        row.remarks,
        row.dateApplied
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = normalizedSearch === "" || searchableText.includes(normalizedSearch);

      return matchesVacancy && matchesStatus && matchesDepartment && matchesCategory && matchesDate && matchesSearch;
    });

    return filtered.slice().sort((left, right) => {
      const leftDate = left.dateAppliedValue ?? 0;
      const rightDate = right.dateAppliedValue ?? 0;
      const leftApplicant = left.applicantName.toLowerCase();
      const rightApplicant = right.applicantName.toLowerCase();
      const leftPosition = left.vacancyTitle.toLowerCase();
      const rightPosition = right.vacancyTitle.toLowerCase();
      const leftDepartment = left.departmentName.toLowerCase();
      const rightDepartment = right.departmentName.toLowerCase();
      const leftStatus = left.status.toLowerCase();
      const rightStatus = right.status.toLowerCase();

      switch (sortBy) {
        case "date-asc":
          return leftDate - rightDate;
        case "date-desc":
          return rightDate - leftDate;
        case "applicant-asc":
          return leftApplicant.localeCompare(rightApplicant);
        case "applicant-desc":
          return rightApplicant.localeCompare(leftApplicant);
        case "position-asc":
          return leftPosition.localeCompare(rightPosition);
        case "position-desc":
          return rightPosition.localeCompare(leftPosition);
        case "department-asc":
          return leftDepartment.localeCompare(rightDepartment);
        case "department-desc":
          return rightDepartment.localeCompare(leftDepartment);
        case "status-asc":
          return leftStatus.localeCompare(rightStatus);
        case "status-desc":
          return rightStatus.localeCompare(leftStatus);
        default:
          return rightDate - leftDate;
      }
    });
  }, [applicationRows, categoryFilter, dateFrom, datePreset, dateTo, departmentFilter, searchTerm, sortBy, statusFilter, vacancyFilter]);

  const selectedApplicationIdSet = useMemo(() => new Set(selectedApplicationIds), [selectedApplicationIds]);

  const allVisibleSelected = filteredApplications.length > 0 && filteredApplications.every((row) => selectedApplicationIdSet.has(row.id));
  const someVisibleSelected = filteredApplications.some((row) => selectedApplicationIdSet.has(row.id));

  const selectedApplications = useMemo(() => {
    return applicationRows.filter((row) => selectedApplicationIdSet.has(row.id));
  }, [applicationRows, selectedApplicationIdSet]);

  const printRows = useMemo(() => {
    if (printScope === "selected") {
      return selectedApplications;
    }

    if (printScope === "vacancy") {
      const baseRows = filteredApplications;
      return printVacancyId === "all"
        ? baseRows
        : baseRows.filter((row) => row.vacancyId === printVacancyId);
    }

    return filteredApplications;
  }, [filteredApplications, printScope, printVacancyId, selectedApplications]);

  const printScopeLabel = useMemo(() => {
    if (printScope === "selected") return "Selected applications only";
    if (printScope === "vacancy") {
      return printVacancyId === "all"
        ? "All applications"
        : `Applications for ${vacancyOptions.find((job) => job.id === printVacancyId)?.positionTitle ?? "selected vacancy"}`;
    }
    return "All application records";
  }, [printScope, printVacancyId, vacancyOptions]);

  const selectedApplication = useMemo(() => {
    if (!selectedApplicationId) {
      return null;
    }
    return filteredApplications.find((row) => row.id === selectedApplicationId) ?? applicationRows.find((row) => row.id === selectedApplicationId) ?? null;
  }, [applicationRows, filteredApplications, selectedApplicationId]);

  const summaryStats = useMemo(() => {
    const uniquePositions = new Set(filteredApplications.map((row) => row.vacancyId)).size;
    const uniqueDepartments = new Set(filteredApplications.map((row) => row.departmentId).filter(Boolean)).size;
    const hiredCount = filteredApplications.filter((row) => row.status === "Hired").length;
    const rejectedCount = filteredApplications.filter((row) => row.status === "Rejected").length;
    return {
      matched: filteredApplications.length,
      total: applicationRows.length,
      uniquePositions,
      uniqueDepartments,
      hiredCount,
      rejectedCount
    };
  }, [applicationRows.length, filteredApplications]);

  const statusBreakdown = useMemo(() => {
    const total = filteredApplications.length || 1;
    return allStatuses.map((status) => {
      const count = filteredApplications.filter((row) => row.status === status).length;
      return {
        status,
        count,
        percentage: Math.round((count / total) * 100)
      };
    });
  }, [filteredApplications]);

  const buildExportRows = () => {
    return filteredApplications.map((row) => [
      row.applicantName,
      row.applicantEmail,
      row.vacancyTitle,
      row.departmentName,
      row.categoryLabel,
      row.status,
      formatDisplayDate(row.dateApplied),
      row.remarks
    ]);
  };

  const handleSelectVisibleApplications = (checked: boolean) => {
    setSelectedApplicationIds((current) => {
      if (!checked) {
        return current.filter((id) => !filteredApplications.some((row) => row.id === id));
      }
      const visibleIds = filteredApplications.map((row) => row.id);
      return Array.from(new Set([...current, ...visibleIds]));
    });
  };

  const handleToggleApplicationSelection = (applicationId: string, checked: boolean) => {
    setSelectedApplicationIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, applicationId]));
      }
      return current.filter((id) => id !== applicationId);
    });
  };

  const handlePrint = () => {
    if (printScope === "selected" && selectedApplications.length === 0) {
      toast({ title: "Nothing to print", description: "Select at least one application first.", variant: "destructive" });
      return;
    }

    if (printScope === "vacancy" && printVacancyId === "all") {
      toast({ title: "Choose a vacancy", description: "Select a specific vacancy before printing vacancy-only records.", variant: "destructive" });
      return;
    }

    const rows = printRows;
    const scopeTitle = printScope === "selected"
      ? "Selected Applications"
      : printScope === "vacancy"
        ? `Applications for ${vacancyOptions.find((job) => job.id === printVacancyId)?.positionTitle ?? "Selected Vacancy"}`
        : "All Application Records";

    const summaryLines = [
      `Search: ${searchTerm || "All"}`,
      `Status: ${statusFilter === "all" ? "All" : statusFilter}`,
      `Department: ${departmentFilter === "all" ? "All" : departmentOptions.find((department) => department.id === departmentFilter)?.name ?? departmentFilter}`,
      `Category: ${categoryFilter === "all" ? "All" : categoryLabelMap[categoryFilter]}`,
      `Date Applied: ${datePresetLabelMap[datePreset]}`,
      `Sort: ${sortLabelMap[sortBy]}`,
      `Print Scope: ${printScopeLabel}`
    ];

    // Condensed filter line: include only active/non-default filters
    const activeFilters: string[] = [];
    if (vacancyFilter !== "all") {
      activeFilters.push(vacancyOptions.find((j) => j.id === vacancyFilter)?.positionTitle ?? vacancyFilter);
    }
    if (statusFilter !== "all") {
      activeFilters.push(statusFilter);
    }
    if (departmentFilter !== "all") {
      activeFilters.push(departmentOptions.find((d) => d.id === departmentFilter)?.name ?? departmentFilter);
    }
    if (categoryFilter !== "all") {
      activeFilters.push(categoryLabelMap[categoryFilter]);
    }
    if (datePreset !== "all") {
      activeFilters.push(datePresetLabelMap[datePreset]);
    }
    if (searchTerm.trim()) {
      activeFilters.unshift(`Search: ${searchTerm.trim()}`);
    }

    const condensedFilters = activeFilters.length > 0 ? activeFilters.join(" | ") : "All application records";

    // Use the browser's default rendering by opening a new window and
    // copying stylesheet links and style tags from the current document head.
    // This keeps the app's regular styles so printed output matches the app view.
    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      toast({ title: "Print failed", description: "Unable to open the print window.", variant: "destructive" });
      return;
    }

    const rowsHtml = rows.length > 0
      ? rows.map((row) => `
          <tr>
            <td>${row.applicantName}</td>
            <td>${row.applicantEmail}</td>
            <td>${row.vacancyTitle}</td>
            <td>${row.departmentName}</td>
            <td>${row.categoryLabel}</td>
            <td class="status-td">${row.status}</td>
            <td>${formatDisplayDate(row.dateApplied)}</td>
            <td>${row.remarks}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="8" class="empty">No applications found.</td></tr>`;

    // Collect stylesheet and style tags from the current document head
    const headHtml = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((n) => n.outerHTML)
      .join("");

    const htmlContent = `<!doctype html>
      <html>
        <head>
          <title>${scopeTitle}</title>
          ${headHtml}
          <style>
            /* Ensure printed table fits and uses readable defaults */
            @page { size: auto; margin: 12mm; }
            body { background: #fff; color: #111; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; }
            thead th { font-weight: 600; }
            .status-td { white-space: nowrap; }
            .meta { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
            .meta .item { border: none; padding: 4px 6px; }
          </style>
        </head>
        <body>
          <div style="max-width:1100px;margin:0 auto;">
            <header style="text-align:center;margin-bottom:8px;">
              <h1 style="margin:0;font-size:18px;">WMSU HRMO Tracker</h1>
              <div style="font-size:13px;color:#444;margin-top:4px;">${condensedFilters}</div>
            </header>
            <div class="meta" style="align-items:center;">
              <div class="item"><strong>Total Records:</strong> ${rows.length}</div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Email</th>
                  <th>Position</th>
                  <th>Department</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Date Applied</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </body>
      </html>`;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    const triggerPrint = () => {
      try {
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 250);
      } catch (err) {
        // If printing fails, still close window after a delay
        setTimeout(() => printWindow.close(), 1000);
      }
    };

    if (printWindow.document.readyState === "complete") {
      triggerPrint();
    } else {
      printWindow.addEventListener("load", triggerPrint, { once: true });
    }
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
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

      const drawTitleBlock = () => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(18);
        pdf.text("WMSU HRMO Tracker - Applications Report", pageWidth / 2, cursorY + 10, { align: "center" });
        cursorY += 18;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9.5);
        pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, cursorY + 10, { align: "center" });
        cursorY += 14;
        const filterSummary = [
          `Search: ${searchTerm || "All"}`,
          `Position: ${vacancyFilter === "all" ? "All" : vacancyOptions.find((job) => job.id === vacancyFilter)?.positionTitle ?? vacancyFilter}`,
          `Status: ${statusFilter === "all" ? "All" : statusFilter}`,
          `Department: ${departmentFilter === "all" ? "All" : departmentOptions.find((department) => department.id === departmentFilter)?.name ?? departmentFilter}`,
          `Category: ${categoryFilter === "all" ? "All" : categoryLabelMap[categoryFilter]}`,
          `Date: ${datePresetLabelMap[datePreset]}`,
          `Sort: ${sortLabelMap[sortBy]}`
        ].join(" | ");
        pdf.setFontSize(8.5);
        pdf.text(filterSummary, pageWidth / 2, cursorY + 10, { align: "center", maxWidth: contentWidth });
        cursorY += 20;
        pdf.setDrawColor(140);
        pdf.line(margin, cursorY, pageWidth - margin, cursorY);
        cursorY += 12;
      };

      const drawTable = (headers: string[], rows: string[][], columnWidths: number[]) => {
        const normalizedWidths = (() => {
          const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0) || 1;
          const scaled = columnWidths.map((width) => (width / totalWidth) * contentWidth);
          const rounded = scaled.map((width) => Math.floor(width));
          rounded[rounded.length - 1] = contentWidth - rounded.slice(0, -1).reduce((sum, width) => sum + width, 0);
          return rounded;
        })();
        const rowPadding = 5;
        const lineHeight = 10;

        const drawRow = (values: string[], isHeader = false) => {
          const cellLines = values.map((value, index) => pdf.splitTextToSize(value, normalizedWidths[index] - rowPadding * 2) as string[]);
          const rowHeight = Math.max(...cellLines.map((lines) => lines.length), 1) * lineHeight + 8;
          ensureSpace(rowHeight + 2);

          let startX = margin;
          values.forEach((_, index) => {
            const width = normalizedWidths[index];
            if (isHeader) {
              pdf.setFillColor(192, 23, 47);
              pdf.rect(startX, cursorY, width, rowHeight, "F");
            }
            pdf.setDrawColor(120);
            pdf.rect(startX, cursorY, width, rowHeight);
            pdf.setFont("helvetica", isHeader ? "bold" : "normal");
            pdf.setTextColor(isHeader ? 255 : 40);
            pdf.setFontSize(isHeader ? 8 : 8.5);
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

      drawTitleBlock();
      drawTable(
        ["Applicant", "Email", "Position", "Department", "Category", "Status", "Date Applied", "Remarks"],
        buildExportRows(),
        [110, 140, 110, 110, 85, 70, 80, 135]
      );

      pdf.save("wmsu-hr-applications-report.pdf");
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
      const rows = buildExportRows();
      const timestamp = new Date().toLocaleString();
      let csvContent = `WMSU HRMO Tracker Applications Report\nGenerated: ${timestamp}\n\n`;
      csvContent += "Applicant,Email,Position,Department,Category,Status,Date Applied,Remarks\n";
      rows.forEach((row) => {
        csvContent += `${row.map(escapeCsv).join(",")}\n`;
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "wmsu-hr-applications-report.csv");
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

  const resetFilters = () => {
    setSearchTerm("");
    setVacancyFilter("all");
    setStatusFilter("all");
    setDepartmentFilter("all");
    setCategoryFilter("all");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
    setSortBy("date-desc");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 no-print sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search, filter, sort, and export application records.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={isExporting}>
            <Download className="w-4 h-4 mr-1" /> {isExporting ? "Exporting..." : "PDF"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={isExporting}>
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      <Card className="no-print">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
              Application Filters
            </div>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="w-4 h-4 mr-1" /> Clear filters
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative xl:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search applicant, position, department, status, or remarks"
                className="pl-9"
              />
            </div>

            <Select value={vacancyFilter} onValueChange={setVacancyFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Vacancy / Position" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All positions</SelectItem>
                {vacancyOptions.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.positionTitle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Applicant status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {allStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departmentOptions.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={(value) => setCategoryFilter(value as CategoryFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Applicant type / category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="first_level">First Level</SelectItem>
                <SelectItem value="second_level">Second Level</SelectItem>
              </SelectContent>
            </Select>

            <Select value={datePreset} onValueChange={(value) => setDatePreset(value as DatePreset)}>
              <SelectTrigger>
                <SelectValue placeholder="Date applied" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(datePresetLabelMap).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
              <SelectTrigger>
                <SelectValue placeholder="Sort results" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(sortLabelMap).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {datePreset === "custom" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">From</p>
                <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">To</p>
                <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="no-print">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Printer className="w-4 h-4 text-muted-foreground" />
              Selective Printing
            </div>
            <div className="text-xs text-muted-foreground">
              Selected: {selectedApplicationIds.length} | Visible selected: {filteredApplications.filter((row) => selectedApplicationIdSet.has(row.id)).length}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
            <Select value={printScope} onValueChange={(value) => setPrintScope(value as PrintScope)}>
              <SelectTrigger>
                <SelectValue placeholder="Print scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All application records</SelectItem>
                <SelectItem value="vacancy">Applications by specific vacancy</SelectItem>
                <SelectItem value="selected">Selected applications only</SelectItem>
              </SelectContent>
            </Select>

            <Select value={printVacancyId} onValueChange={setPrintVacancyId} disabled={printScope !== "vacancy"}>
              <SelectTrigger>
                <SelectValue placeholder="Choose vacancy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vacancies</SelectItem>
                {vacancyOptions.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.positionTitle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={() => setSelectedApplicationIds([])}>
              Clear selected rows
            </Button>

            <Button onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-1" /> Print records
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 no-print">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-2 sm:p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Filtered Applications</p>
            <p className="mt-1 text-lg font-bold leading-none">{summaryStats.matched}</p>
            <p className="mt-1 text-xs text-muted-foreground">of {summaryStats.total} total</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-2 sm:p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Unique Positions</p>
            <p className="mt-1 text-lg font-bold leading-none">{summaryStats.uniquePositions}</p>
            <p className="mt-1 text-xs text-muted-foreground">matching current filters</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-2 sm:p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Hired / Rejected</p>
            <div className="mt-2 flex items-center justify-start gap-4">
              <div>
                <p className="text-lg font-bold leading-none text-success">{summaryStats.hiredCount}</p>
                <p className="text-xs text-muted-foreground">Hired</p>
              </div>
              <div>
                <p className="text-lg font-bold leading-none text-destructive">{summaryStats.rejectedCount}</p>
                <p className="text-xs text-muted-foreground">Rejected</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div>
              <h3 className="font-semibold text-foreground">Applications View</h3>
              <p className="text-sm text-muted-foreground">
                Showing {filteredApplications.length} result{filteredApplications.length === 1 ? "" : "s"} sorted by {sortLabelMap[sortBy].toLowerCase()}.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border border-border/50 shadow-sm rounded-lg">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="border-b border-border/70 bg-primary text-primary-foreground">
                  <th className="h-12 px-4 py-3 text-center text-[11px] font-semibold text-primary-foreground uppercase tracking-wide w-14">
                    <Checkbox
                      checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                      onCheckedChange={(checked) => handleSelectVisibleApplications(checked === true)}
                      aria-label="Select all visible applications"
                    />
                  </th>
                  <th className="h-12 px-4 py-3 text-left text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Applicant</th>
                  <th className="h-12 px-4 py-3 text-left text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Position</th>
                  <th className="h-12 px-4 py-3 text-left text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Department</th>
                  <th className="h-12 px-4 py-3 text-left text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Category</th>
                  <th className="h-12 px-4 py-3 text-center text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Status</th>
                  <th className="h-12 px-4 py-3 text-center text-[11px] font-semibold text-primary-foreground uppercase tracking-wide whitespace-nowrap">Date Applied</th>
                  <th className="h-12 px-4 py-3 text-left text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Remarks</th>
                  <th className="h-12 px-4 py-3 text-center text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">View</th>
                </tr>
              </thead>
              <tbody>
                {filteredApplications.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`border-b border-border/20 h-14 transition-colors ${
                      index % 2 === 0 ? "bg-background hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/20"
                    }`}
                  >
                    <td className="px-4 py-3 text-center align-middle">
                      <Checkbox
                        checked={selectedApplicationIdSet.has(row.id)}
                        onCheckedChange={(checked) => handleToggleApplicationSelection(row.id, checked === true)}
                        aria-label={`Select application for ${row.applicantName}`}
                      />
                    </td>
                    <td className="px-4 py-3 pr-3 font-medium">
                      <div className="space-y-1">
                        <p>{row.applicantName}</p>
                        <p className="text-xs text-muted-foreground">{row.applicantEmail}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.vacancyTitle}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.departmentName}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{row.categoryLabel}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`status-badge ${getStatusColor(row.status)}`}>{row.status}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground whitespace-nowrap">{formatDisplayDate(row.dateApplied)}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[280px] truncate">{row.remarks}</td>
                    <td className="px-4 py-3 text-center">
                      <Button variant="outline" size="sm" onClick={() => setSelectedApplicationId(row.id)}>
                        <Eye className="w-4 h-4 mr-1" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
                {filteredApplications.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No applications found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedApplication)} onOpenChange={(open) => !open && setSelectedApplicationId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Application Details</DialogTitle>
            <DialogDescription>Full view of the selected application record.</DialogDescription>
          </DialogHeader>

          {selectedApplication && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Applicant</p>
                    <p className="font-semibold">{selectedApplication.applicantName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p>{selectedApplication.applicantEmail}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Date Applied</p>
                    <p>{formatDisplayDate(selectedApplication.dateApplied)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Position</p>
                    <p className="font-semibold">{selectedApplication.vacancyTitle}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Department</p>
                    <p>{selectedApplication.departmentName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Category</p>
                    <p>{selectedApplication.categoryLabel}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="sm:col-span-2">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <span className={`status-badge ${getStatusColor(selectedApplication.status)}`}>{selectedApplication.status}</span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Remarks</p>
                    <p className="whitespace-pre-wrap">{selectedApplication.remarks}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
