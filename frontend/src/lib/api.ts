import type {
  Applicant,
  ApplicantDocument,
  Application,
  ApplicationStatus,
  Department,
  Evaluation,
  AuditLog,
  EmailTemplate,
  JobVacancy,
  StatusHistory,
  User,
  ParsedApplicantDraft
} from "./types";

const API_BASE = (() => {
  const configuredApi = import.meta.env.VITE_API_URL;
  if (configuredApi) {
    return configuredApi;
  }

  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    return "http://127.0.0.1:4000/api";
  }

  return "/api";
})();
const TOKEN_KEY = "wmsu_hr_token";

export function getFileUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (API_BASE.startsWith("http://") || API_BASE.startsWith("https://")) {
    const baseUrl = API_BASE.replace("/api", "");
    return `${baseUrl}${path}`;
  }
  return path;
}

export async function createEmailTemplate(
  payload: Omit<EmailTemplate, "templateKey" | "updatedAt"> & { linkedStatus: string }
): Promise<EmailTemplate> {
  return apiFetch<EmailTemplate>("/email-templates", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });
  } catch {
    throw new Error("Cannot connect to API server. Make sure backend is running on port 4000.");
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: formData
    });
  } catch {
    throw new Error("Cannot connect to API server. Make sure backend is running on port 4000.");
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error ?? "Request failed");
  }

  return response.json() as Promise<T>;
}

export async function login(email: string, password: string) {
  return apiFetch<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export async function logout() {
  return apiFetch<void>("/auth/logout", { method: "POST" });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ message: string }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword })
  });
}

export async function requestPasswordReset(email: string) {
  return apiFetch<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export async function resetPassword(token: string, newPassword: string) {
  return apiFetch<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, newPassword })
  });
}

export async function fetchMe() {
  return apiFetch<{ user: User }>("/me");
}

export async function fetchAuditLogs(limit = 200) {
  return apiFetch<AuditLog[]>(`/audit-logs?limit=${limit}`);
}

export async function fetchUsers() {
  return apiFetch<User[]>("/users");
}

export async function createUser(payload: { name: string; email: string; password: string; role: string; isActive?: boolean }) {
  return apiFetch<User>("/users", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateUser(id: string, payload: { name: string; email: string; role: string; password?: string }) {
  return apiFetch<User>(`/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteUser(id: string) {
  return apiFetch<void>(`/users/${id}`, { method: "DELETE" });
}

export async function setUserStatus(id: string, isActive: boolean) {
  return apiFetch<User>(`/users/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ isActive })
  });
}

export async function resetUserPassword(id: string, newPassword: string) {
  return apiFetch<void>(`/users/${id}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ newPassword })
  });
}

export async function fetchDepartments() {
  return apiFetch<Department[]>("/departments");
}

export async function createDepartment(name: string) {
  return apiFetch<Department>("/departments", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export async function deleteDepartment(id: string) {
  return apiFetch<{ deleted: number }>(`/departments/${id}`, { method: "DELETE" });
}

export async function fetchPositionTitles() {
  return apiFetch<string[]>("/position-titles");
}

export async function fetchCustomPositionTitles() {
  return apiFetch<{ id: string; title: string }[]>("/position-titles/custom");
}

export async function createPositionTitle(title: string) {
  return apiFetch<{ id: string; title: string }>("/position-titles", {
    method: "POST",
    body: JSON.stringify({ title })
  });
}

export async function deletePositionTitle(id: string) {
  return apiFetch<void>(`/position-titles/${id}`, { method: "DELETE" });
}

export async function deleteJobsByTitle(title: string) {
  return apiFetch<{ deleted: number }>(`/jobs/by-title/${encodeURIComponent(title)}`, { method: "DELETE" });
}

export async function fetchJobs() {
  return apiFetch<JobVacancy[]>("/jobs");
}

export async function createJob(payload: Omit<JobVacancy, "id">) {
  return apiFetch<JobVacancy>("/jobs", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateJob(id: string, payload: Omit<JobVacancy, "id">) {
  return apiFetch<JobVacancy>(`/jobs/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteJob(id: string) {
  return apiFetch<void>(`/jobs/${id}`, { method: "DELETE" });
}

export async function fetchArchivedVacancies() {
  return apiFetch<Array<{
    id: string;
    originalJobId: string;
    positionTitle: string;
    departmentId: string;
    salaryGrade: number;
    description: string;
    qualifications: string;
    postingDate: string;
    closingDate: string;
    archivedAt: string;
    archiveDurationDays: number;
    createdAt: string;
    daysUntilDeletion: number;
  }>>("/archived-vacancies");
}

export async function getArchivedVacancy(id: string) {
  return apiFetch<{
    id: string;
    originalJobId: string;
    positionTitle: string;
    departmentId: string;
    salaryGrade: number;
    description: string;
    qualifications: string;
    postingDate: string;
    closingDate: string;
    archivedAt: string;
    archiveDurationDays: number;
    createdAt: string;
  }>(`/archived-vacancies/${id}`);
}

export async function restoreArchivedVacancy(id: string) {
  return apiFetch<{ success: boolean; message: string }>(`/archived-vacancies/${id}/restore`, {
    method: "POST"
  });
}

// Settings API functions
export async function getArchiveDurationSetting() {
  return apiFetch<{ days: number }>("/settings/archive-duration");
}

export async function updateArchiveDurationSetting(days: number) {
  return apiFetch<{ success: boolean; message: string; days: number }>(
    "/settings/archive-duration",
    {
      method: "POST",
      body: JSON.stringify({ days })
    }
  );
}

export async function fetchApplicants() {
  return apiFetch<Applicant[]>("/applicants");
}

export async function createApplicant(payload: Omit<Applicant, "id" | "applicationId">) {
  return apiFetch<Applicant>("/applicants", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateApplicant(id: string, payload: Omit<Applicant, "id" | "applicationId">) {
  return apiFetch<Applicant>(`/applicants/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteApplicant(id: string) {
  return apiFetch<void>(`/applicants/${id}`, { method: "DELETE" });
}

export async function fetchApplicantDocuments(applicantId: string) {
  return apiFetch<ApplicantDocument[]>(`/applicants/${applicantId}/documents`);
}

export async function uploadApplicantDocument(applicantId: string, type: string, file: File) {
  const formData = new FormData();
  formData.append("type", type);
  formData.append("file", file);
  return apiUpload<ApplicantDocument>(`/applicants/${applicantId}/documents`, formData);
}

export async function parseApplicantDocument(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload<ParsedApplicantDraft>("/applicants/parse-document", formData);
}

export async function fetchApplications() {
  return apiFetch<Application[]>("/applications");
}

export async function createApplication(payload: { applicantId: string; vacancyId: string; dateApplied: string; remarks?: string }) {
  return apiFetch<Application>("/applications", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      status: "Application Received"
    })
  });
}

export async function updateApplicationStatus(payload: {
  id: string;
  status: ApplicationStatus;
  remarks?: string;
  documentsComplete?: boolean;
  examScheduleDate?: string;
  examScheduleTime?: string;
  examVenue?: string;
  interviewScheduleDate?: string;
  interviewScheduleTime?: string;
  interviewVenue?: string;
  finalEvaluationDate?: string;
  finalEvaluationTime?: string;
  finalEvaluationVenue?: string;
  notifyApplicant?: boolean;
  rejectionSubtype?: "not_qualified" | "non_teaching" | "teaching";
  selectedTemplateKey?: string;
  emailTemplateText?: string;
}) {
  return apiFetch<{ application: Application; history: StatusHistory }>(`/applications/${payload.id}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      status: payload.status,
      remarks: payload.remarks,
      documentsComplete: payload.documentsComplete,
      examScheduleDate: payload.examScheduleDate,
      examScheduleTime: payload.examScheduleTime,
      examVenue: payload.examVenue,
      interviewScheduleDate: payload.interviewScheduleDate,
      interviewScheduleTime: payload.interviewScheduleTime,
      interviewVenue: payload.interviewVenue,
      finalEvaluationDate: payload.finalEvaluationDate,
      finalEvaluationTime: payload.finalEvaluationTime,
      finalEvaluationVenue: payload.finalEvaluationVenue,
      notifyApplicant: payload.notifyApplicant,
      rejectionSubtype: payload.rejectionSubtype,
      selectedTemplateKey: payload.selectedTemplateKey,
      emailTemplateText: payload.emailTemplateText
    })
  });
}

export async function fetchStatusHistory(applicationId: string) {
  return apiFetch<StatusHistory[]>(`/status-history?applicationId=${encodeURIComponent(applicationId)}`);
}

export async function fetchEvaluations() {
  return apiFetch<Evaluation[]>("/evaluations");
}

export async function fetchEmailTemplates() {
  return apiFetch<EmailTemplate[]>("/email-templates");
}

export async function updateEmailTemplate(templateKey: EmailTemplate["templateKey"], payload: Omit<EmailTemplate, "templateKey" | "updatedAt">) {
  return apiFetch<EmailTemplate>(`/email-templates/${templateKey}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteEmailTemplate(templateKey: EmailTemplate["templateKey"]) {
  return apiFetch<void>(`/email-templates/${encodeURIComponent(templateKey)}`, {
    method: "DELETE"
  });
}

export async function createEvaluation(payload: {
  applicationId: string;
  positionLevel: "first_level" | "second_level";
  communicationSkills?: number;
  abilityToPresent?: number;
  alertness?: number;
  judgement?: number;
  emotionalStability?: number;
  selfConfidence?: number;
  oralCommunication?: number;
  analyticalAbility?: number;
  initiative?: number;
  stressTolerance?: number;
  sensitivity?: number;
  serviceOrientation?: number;
  remarks?: string;
}) {
  return apiFetch<Evaluation>("/evaluations", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateEvaluation(id: string, payload: {
  positionLevel: "first_level" | "second_level";
  communicationSkills?: number;
  abilityToPresent?: number;
  alertness?: number;
  judgement?: number;
  emotionalStability?: number;
  selfConfidence?: number;
  oralCommunication?: number;
  analyticalAbility?: number;
  initiative?: number;
  stressTolerance?: number;
  sensitivity?: number;
  serviceOrientation?: number;
  remarks?: string;
}) {
  return apiFetch<Evaluation>(`/evaluations/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteEvaluation(id: string) {
  return apiFetch<void>(`/evaluations/${id}`, { method: "DELETE" });
}

export async function fetchReportsSummary() {
  return apiFetch<{
    totalJobs: number;
    totalApplicants: number;
    totalApplications: number;
    applicationsByStatus: Array<{ status: string; count: number }>;
    vacanciesByStatus: Array<{ status: string; count: number }>;
  }>("/reports/summary");
}

