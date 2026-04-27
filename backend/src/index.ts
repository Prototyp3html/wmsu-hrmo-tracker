import cors from "cors";
import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import type { QueryResultRow } from "pg";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import nodemailer from "nodemailer";
import { initDb, query } from "./db.js";
import { ensureDepartments, ensureTestAccounts, seedIfEmpty } from "./seed.js";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PORT = Number(process.env.PORT ?? 4000);
const JWT_SECRET: Secret = process.env.JWT_SECRET ?? "dev_secret";
const TOKEN_EXPIRES_IN = (process.env.TOKEN_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"];
const corsOrigins = (process.env.CORS_ORIGIN ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);
const trustProxy = process.env.TRUST_PROXY === "true";
const EMAIL_ENABLED = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

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

const app = express();
app.set("trust proxy", trustProxy);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));

const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const frontendDistDir = path.resolve(__dirname, "../../frontend/dist");
const frontendIndexFile = path.join(frontendDistDir, "index.html");
const frontendBuildExists = fs.existsSync(frontendIndexFile);

const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) =>
    cb(null, uploadDir),
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const parseUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use("/uploads", express.static(uploadDir));

if (frontendBuildExists) {
  app.use(express.static(frontendDistDir));

  app.get(/^\/(?!api|uploads).*/, (_req, res) => {
    res.sendFile(frontendIndexFile);
  });
} else {
  app.get("/", (_req, res) => {
    res.status(503).send("Frontend build not found. Run npm run build:web first.");
  });
}

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

interface AuthedRequest extends Request {
  user?: AuthUser;
  file?: Express.Multer.File;
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

const asyncHandler = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function createToken(user: AuthUser) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
}

async function logAudit(req: Request, action: string, userId?: string, details?: Record<string, unknown>) {
  const ip = req.ip;
  const userAgent = req.headers["user-agent"] ?? null;
  // Fire-and-forget: don't await audit logging to avoid blocking auth requests
  query(
    "INSERT INTO audit_logs (id, user_id, action, ip, user_agent, details, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [
      randomUUID(),
      userId ?? null,
      action,
      ip,
      userAgent,
      details ? JSON.stringify(details) : null,
      new Date().toISOString()
    ]
  ).catch(() => {
    // Silently ignore audit log failures to avoid impacting auth performance
  });
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const token = auth.slice("Bearer ".length);
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;
    const row = await fetchOne<any>("SELECT id, name, email, role, is_active FROM users WHERE id = $1", [payload.id]);
    if (!row || row.is_active === false) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.user = mapUser(row);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

async function fetchOne<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
  const result = await query<T>(sql, params);
  return result.rows[0] ?? null;
}

function mapJob(row: any) {
  return {
    id: row.id,
    positionTitle: row.position_title,
    departmentId: row.department_id,
    salaryGrade: row.salary_grade,
    qualifications: row.qualifications,
    postingDate: row.posting_date,
    closingDate: row.closing_date,
    status: row.status,
    positionLevel: row.position_level ?? "first_level"
  };
}

function mapApplicant(row: any) {
  return {
    id: row.id,
    fullName: row.full_name,
    contactNumber: row.contact_number,
    email: row.email,
    address: row.address,
    educationalBackground: row.educational_background,
    workExperience: row.work_experience
  };
}

function mapApplication(row: any) {
  return {
    id: row.id,
    applicantId: row.applicant_id,
    vacancyId: row.vacancy_id,
    status: row.status,
    dateApplied: row.date_applied,
    remarks: row.remarks ?? undefined,
    documentsComplete: row.documents_complete ?? false,
    examScheduleDate: row.exam_schedule_date ?? undefined,
    examScheduleTime: row.exam_schedule_time ?? undefined,
    examVenue: row.exam_venue ?? undefined,
    interviewScheduleDate: row.interview_schedule_date ?? undefined,
    interviewScheduleTime: row.interview_schedule_time ?? undefined,
    interviewVenue: row.interview_venue ?? undefined,
    finalEvaluationDate: row.final_evaluation_date ?? undefined,
    finalEvaluationTime: row.final_evaluation_time ?? undefined,
    finalEvaluationVenue: row.final_evaluation_venue ?? undefined
  };
}

const statusFlow = [
  "Application Received",
  "Under Initial Screening",
  "For Examination",
  "For Interview",
  "For Final Evaluation",
  "Approved",
  "Hired"
] as const;

function canTransitionStatus(currentStatus: string, nextStatus: string) {
  if (nextStatus === "Rejected") return true;
  if (currentStatus === nextStatus) return true;

  const currentIndex = statusFlow.indexOf(currentStatus as typeof statusFlow[number]);
  const nextIndex = statusFlow.indexOf(nextStatus as typeof statusFlow[number]);

  if (currentIndex === -1 || nextIndex === -1) return false;
  return nextIndex === currentIndex + 1;
}

type RejectionSubtype = "not_qualified" | "non_teaching" | "teaching";

type EmailTemplateKey = RejectionSubtype | "qualification_notice";

type EmailTemplateRecord = {
  template_key: EmailTemplateKey;
  template_name: string;
  template_group: "rejection" | "qualification";
  subject: string;
  body: string;
  updated_at: string;
};

const DEFAULT_EMAIL_TEMPLATES: EmailTemplateRecord[] = [
  {
    template_key: "not_qualified",
    template_name: "Letter for Not Qualified Applicants",
    template_group: "rejection",
    subject: "Application Status Update: Not Qualified",
    body: [
      "Date: {{date}}",
      "",
      "Dear Mr./Ms. {{applicantName}}:",
      "Thank you for your interest in the {{jobTitle}} and for the time and effort you invested in your application.",
      "After careful review and evaluation of all applications, we regret to inform you that you were not selected for the position. While your qualifications and experiences are valued, the selection process was highly competitive, and only applicants who fully met the qualifications and requirements were considered for appointment.",
      "We sincerely thank you for the interest you have shown in our organization and encourage you to continue seeking opportunities with us in the future.",
      "Once again, thank you for considering Western Mindanao State University.",
      "Respectfully,",
      "________________________________",
      "Human Resource Management Officer III"
    ].join("\n"),
    updated_at: ""
  },
  {
    template_key: "non_teaching",
    template_name: "Letter of Regret (For Interviewed Non-Teaching Applicants)",
    template_group: "rejection",
    subject: "Application Status Update: Not Selected",
    body: [
      "Date: {{date}}",
      "",
      "___________________________________",
      "___________________________________",
      "___________________________________",
      "",
      "Dear {{applicantName}},",
      "",
      "This refers to your application for the position of {{jobTitle}} at Western Mindanao State University.",
      "We appreciate the interest you have shown and the time you have spent on the interview with us. However, please be informed that a candidate for the said position has already been selected.",
      "We genuinely appreciate and thank you for your interest in joining the WMSU Community.",
      "",
      "Very truly yours,",
      "",
      "______________________________________________",
      "Human Resource Management Officer III"
    ].join("\n"),
    updated_at: ""
  },
  {
    template_key: "teaching",
    template_name: "Letter of Regret (For Interviewed Teaching Applicants)",
    template_group: "rejection",
    subject: "Application Status Update: Not Selected",
    body: [
      "Date: {{date}}",
      "",
      "___________________________________",
      "___________________________________",
      "___________________________________",
      "",
      "Dear {{applicantName}},",
      "",
      "This refers to your application for the position of {{jobTitle}} at Western Mindanao State University.",
      "We appreciate the interest you have shown and the time you have spent on the Teaching Demonstration and/or Interview with us. However, please be informed that a candidate for the said position has already been selected.",
      "We genuinely appreciate and thank you for your interest in joining the WMSU Community.",
      "",
      "Very truly yours,",
      "",
      "______________________________________________",
      "Human Resource Management Officer III"
    ].join("\n"),
    updated_at: ""
  },
  {
    template_key: "qualification_notice",
    template_name: "Qualification Notice",
    template_group: "qualification",
    subject: "Application Status Update: Qualified",
    body: [
      "Date: {{date}}",
      "",
      "Dear {{applicantName}},",
      "",
      "This refers to your application for the position of {{jobTitle}} at Western Mindanao State University.",
      "We are pleased to inform you that your application has met the required qualifications and is now moving to the next stage of the hiring process.",
      "Please await further instructions from the WMSU HR Office regarding the next step in your application.",
      "",
      "Very truly yours,",
      "",
      "WMSU HR Office"
    ].join("\n"),
    updated_at: ""
  }
];

function renderTemplateText(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? "");
}

function formatTemplateDate(value: Date = new Date()) {
  return value.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

async function ensureEmailTemplates() {
  for (const template of DEFAULT_EMAIL_TEMPLATES) {
    const existing = await query<{ template_key: string }>("SELECT template_key FROM email_templates WHERE template_key = $1", [template.template_key]);
    if (existing.rowCount === 0) {
      await query(
        "INSERT INTO email_templates (template_key, template_name, template_group, subject, body, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [template.template_key, template.template_name, template.template_group, template.subject, template.body, new Date().toISOString()]
      );
    }
  }
}

async function fetchEmailTemplates() {
  const result = await query<EmailTemplateRecord>("SELECT * FROM email_templates ORDER BY template_group, template_name");
  return result.rows;
}

async function fetchEmailTemplateByKey(templateKey: EmailTemplateKey) {
  return fetchOne<EmailTemplateRecord>("SELECT * FROM email_templates WHERE template_key = $1", [templateKey]);
}

function getStatusEmailDescription(status: string, workflow: {
  examScheduleDate?: string;
  examScheduleTime?: string;
  examVenue?: string;
  interviewScheduleDate?: string;
  interviewScheduleTime?: string;
  interviewVenue?: string;
  finalEvaluationDate?: string;
  finalEvaluationTime?: string;
  finalEvaluationVenue?: string;
}, jobTitle?: string, rejectionSubtype?: RejectionSubtype) {
  const toReadableDate = (value?: string) => {
    if (!value) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  const toReadableTime = (value?: string) => {
    if (!value) return value;
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return value;
    const rawHour = Number(match[1]);
    const minute = match[2];
    if (Number.isNaN(rawHour) || rawHour < 0 || rawHour > 23) return value;
    const period = rawHour >= 12 ? "PM" : "AM";
    const hour12 = rawHour % 12 === 0 ? 12 : rawHour % 12;
    return `${hour12}:${minute} ${period}`;
  };

  const examDate = toReadableDate(workflow.examScheduleDate);
  const examTime = toReadableTime(workflow.examScheduleTime);
  const interviewDate = toReadableDate(workflow.interviewScheduleDate);
  const interviewTime = toReadableTime(workflow.interviewScheduleTime);
  const finalEvalDate = toReadableDate(workflow.finalEvaluationDate);
  const finalEvalTime = toReadableTime(workflow.finalEvaluationTime);

  switch (status) {
    case "Application Received":
      return "Your application has been received and recorded in our system.";
    case "Under Initial Screening":
      return "Your application is now under initial screening. Document verification is in progress.";
    case "For Examination":
      return examDate && examTime && workflow.examVenue
        ? `You are scheduled for examination for the position of ${jobTitle ?? "the applied position"} on ${examDate} at ${examTime} at ${workflow.examVenue}.`
        : "You are now endorsed for examination. Schedule details will follow.";
    case "For Interview":
      return interviewDate && interviewTime && workflow.interviewVenue
        ? `You are scheduled for interview for the position of ${jobTitle ?? "the applied position"} on ${interviewDate} at ${interviewTime} at ${workflow.interviewVenue}.`
        : "You are now endorsed for interview. Schedule details will follow.";
    case "For Final Evaluation":
      return finalEvalDate && finalEvalTime && workflow.finalEvaluationVenue
        ? `Your profile for the position of ${jobTitle ?? "the applied position"} is set for final evaluation on ${finalEvalDate} at ${finalEvalTime} at ${workflow.finalEvaluationVenue}.`
        : "Your profile is now for final evaluation by the panel.";
    case "Approved":
      return "Congratulations! Your application has been approved.";
    case "Hired":
      return "Congratulations! You have been marked as hired.";
    case "Rejected":
      return "Thank you for your interest. Your application has not been selected at this stage.";
    default:
      return "Your application status has been updated.";
  }
}

async function sendApplicationStatusEmail(payload: {
  applicantEmail: string;
  applicantName: string;
  jobTitle: string;
  status: string;
  remarks?: string;
  rejectionSubtype?: RejectionSubtype;
  rejectionTemplateText?: string;
  qualificationTemplateText?: string;
  workflow: {
    examScheduleDate?: string;
    examScheduleTime?: string;
    examVenue?: string;
    interviewScheduleDate?: string;
    interviewScheduleTime?: string;
    interviewVenue?: string;
    finalEvaluationDate?: string;
    finalEvaluationTime?: string;
    finalEvaluationVenue?: string;
  };
}) {
  let subject = `Application Status Update: ${payload.status}`;
  let body = getStatusEmailDescription(payload.status, payload.workflow, payload.jobTitle, payload.rejectionSubtype);
  const sentAt = new Date();
  const hour = sentAt.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const formattedDate = formatTemplateDate(sentAt);

  // Use rejection template if status is Rejected
  if (payload.status === "Rejected" && payload.rejectionSubtype) {
    const template = await fetchEmailTemplateByKey(payload.rejectionSubtype) ?? DEFAULT_EMAIL_TEMPLATES.find((entry) => entry.template_key === payload.rejectionSubtype) ?? null;
    if (template) {
      subject = template.subject;
      body = renderTemplateText(template.body, {
        applicantName: payload.applicantName,
        jobTitle: payload.jobTitle,
        date: formattedDate,
        today: formattedDate
      });
    }
  }

  if (payload.status === "Approved") {
    const template = await fetchEmailTemplateByKey("qualification_notice") ?? DEFAULT_EMAIL_TEMPLATES.find((entry) => entry.template_key === "qualification_notice") ?? null;
    if (template) {
      subject = template.subject;
      body = renderTemplateText(template.body, {
        applicantName: payload.applicantName,
        jobTitle: payload.jobTitle,
        date: formattedDate,
        today: formattedDate
      });
    }
  }

  if (payload.status === "Rejected" && payload.rejectionTemplateText?.trim()) {
    body = renderTemplateText(payload.rejectionTemplateText.trim(), {
      applicantName: payload.applicantName,
      jobTitle: payload.jobTitle,
      date: formattedDate,
      today: formattedDate
    });
  }

  if (payload.status === "Approved" && payload.qualificationTemplateText?.trim()) {
    body = renderTemplateText(payload.qualificationTemplateText.trim(), {
      applicantName: payload.applicantName,
      jobTitle: payload.jobTitle,
      date: formattedDate,
      today: formattedDate
    });
  }

  body = body
    .replace(/Date:\s*\n(?:_+\s*\n?){1,3}/i, `Date: ${formattedDate}\n`)
    .replace(/Date:\s*_+/i, `Date: ${formattedDate}`);

  const html = `
    <p>${greeting}, ${payload.applicantName}.</p>
    <p><strong>Date:</strong> ${formattedDate}</p>
    <p>${body.split('\n').join('</p><p>')}</p>
    ${payload.remarks ? `<p><strong>Additional Remarks:</strong> ${payload.remarks}</p>` : ""}
    <p>From WMSU HR Office</p>
    <p><em>This is an auto-generated email. Please do not reply.</em></p>
  `;

  if (!EMAIL_ENABLED) {
    console.log(`[Email disabled] To: ${payload.applicantEmail} | Status: ${payload.status} | ${body}`);
    return {
      sent: false,
      status: "disabled" as const,
      providerResponse: "SMTP is not configured.",
      accepted: [] as string[],
      rejected: [] as string[],
      subject,
      html
    };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: payload.applicantEmail,
    subject,
    html
  });

  return {
    sent: true,
    status: "accepted" as const,
    providerResponse: info.response ?? "Accepted by SMTP transport",
    messageId: info.messageId,
    accepted: Array.isArray(info.accepted) ? info.accepted : [],
    rejected: Array.isArray(info.rejected) ? info.rejected : [],
    subject,
    html
  };
}

function createEmailBodyPreview(html: string) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function mapHistory(row: any) {
  return {
    id: row.id,
    applicationId: row.application_id,
    status: row.status,
    remarks: row.remarks ?? "",
    updatedBy: row.updated_by,
    updatedAt: row.updated_at
  };
}

type ParsedApplicantDraft = {
  fullName: string;
  contactNumber: string;
  email: string;
  address: string;
  educationalBackground: string;
  workExperience: string;
  rawTextLength: number;
};

function cleanupExtractedText(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/(?<!\n)(Name Details|Contact Number|Phone|Mobile|Email|Address|Location|Educational Background|Education|Work Experience|Experience)\b/gi, "\n$1")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractLabeledValue(text: string, labels: string[], stopLabels: string[] = []) {
  const labelPart = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const stopPart = stopLabels.length
    ? stopLabels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
    : "";

  const regex = stopPart
    ? new RegExp(`(?:${labelPart})\\s*[:\\-]?\\s*(.+?)(?=\\b(?:${stopPart})\\b|$)`, "is")
    : new RegExp(`(?:${labelPart})\\s*[:\\-]?\\s*(.+)`, "i");

  return (text.match(regex)?.[1] ?? "").trim();
}

function normalizeEmailCandidate(value: string) {
  const cleaned = value.replace(/[\s;|]+/g, " ").trim();
  const trimmedByKeywords = cleaned.split(/\b(phone|mobile|contact|address|location)\b/i)[0]?.trim() ?? "";
  const strictMatch = trimmedByKeywords.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,10}/i);
  return strictMatch?.[0] ?? "";
}

function pickNameCandidate(lines: string[]) {
  const excluded = /resume|curriculum vitae|profile|contact|email|phone|address|education|experience|objective|summary/i;
  return (
    lines.find((line) => {
      const clean = line.trim();
      if (!clean || clean.length < 5 || clean.length > 60) return false;
      if (excluded.test(clean)) return false;
      if (/\d/.test(clean)) return false;
      const words = clean.split(/\s+/).filter(Boolean);
      if (words.length < 2 || words.length > 5) return false;
      return words.every((word) => /^[A-Za-z.'-]+$/.test(word));
    }) ?? ""
  );
}

function pickSection(text: string, headings: string[]) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const headingRegex = new RegExp(`^(${headings.join("|")})\\b`, "i");
  const nextHeadingRegex = /^(objective|summary|education|educational background|experience|work experience|employment history|skills|certifications|references|projects|training|seminars?)\b/i;
  const startIndex = lines.findIndex((line) => headingRegex.test(line));
  if (startIndex === -1) return "";

  const collected: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (nextHeadingRegex.test(line)) {
      break;
    }
    collected.push(line);
    if (collected.length >= 6) {
      break;
    }
  }

  return collected.join("; ").slice(0, 500);
}

function pickAddressCandidate(lines: string[]) {
  const ignored = /education|experience|skill|reference|email|phone|mobile|contact|objective|summary/i;
  const addressHints = /barangay|brgy|city|municipality|province|region|street|st\.?|avenue|ave\.?|road|rd\.?|purok|sitio/i;

  return (
    lines.find((line) => {
      const clean = line.trim();
      if (!clean || clean.length < 6 || clean.length > 180) return false;
      if (ignored.test(clean)) return false;
      if (/@/.test(clean)) return false;
      return addressHints.test(clean);
    }) ?? ""
  );
}

function extractEmailFromText(text: string) {
  const directMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,10}/i)?.[0];
  if (directMatch) return directMatch;

  const compact = text.replace(/\s+/g, "");
  const compactMatch = compact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,10}/i)?.[0];
  if (compactMatch) return compactMatch;

  return "";
}

function extractPhoneNumber(text: string): string {
  // First try labeled phone/contact fields (no stop labels - capture full line)
  const labeledPhone = extractLabeledValue(
    text,
    ["phone", "mobile", "contact number", "contact", "telephone", "tel"],
    []
  );
  if (labeledPhone && /\d{7,}/.test(labeledPhone)) {
    const match = labeledPhone.match(/[\d+\s\-()]+/)?.[0];
    if (match) {
      const cleaned = match.replace(/\D+/g, "").slice(0, 20);
      if (/\d{7,}/.test(cleaned)) {
        return cleaned;
      }
    }
  }

  // Try Philippine format with more flexibility
  // Matches: 09xx xxx xxxx, 09xx-xxx-xxxx, +63 9xx xxx xxxx, etc.
  const philMatch = text.match(/(?:\+63|0)[\s-]?9[\d\s-]{8,12}/);
  if (philMatch) {
    const cleaned = philMatch[0].replace(/\D+/g, "").slice(0, 20);
    if (/\d{10,}/.test(cleaned)) {
      return cleaned;
    }
  }

  // Try general pattern: any number with 7+ digits after phone/contact labels
  const phoneMatch = text.match(/(?:phone|mobile|contact|tel)[:\s]+([+\d\s\-()\.]+)/i);
  if (phoneMatch) {
    const cleaned = phoneMatch[1].replace(/\D+/g, "").slice(0, 20);
    if (/\d{7,}/.test(cleaned)) {
      return cleaned;
    }
  }

  // Try direct patterns for common formats
  // Format: xxx-xxx-xxxx or xxx xxx xxxx (7+ digits with separators)
  const directMatch = text.match(/\b(?:\+\d{1,3})?[\s.-]?\(?(\d{2,4})[\s.-]?(\d{2,4})[\s.-]?(\d{4,})\)?/);
  if (directMatch) {
    const cleaned = directMatch[0].replace(/\D+/g, "").slice(0, 20);
    if (/\d{7,}/.test(cleaned)) {
      return cleaned;
    }
  }

  return "";
}

function parseApplicantDraftFromText(rawText: string): ParsedApplicantDraft {
  const text = cleanupExtractedText(rawText);
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);

  const labeledEmail = extractLabeledValue(text, ["email", "e-mail"], ["phone", "mobile", "contact", "address", "education", "experience"]);
  const emailMatch = normalizeEmailCandidate(labeledEmail) || extractEmailFromText(text);
  const contactNumber = extractPhoneNumber(text);
  const addressMatch = extractLabeledValue(
    text,
    ["address", "location"],
    ["education", "educational background", "experience", "work experience", "skills", "references"]
  );

  const educationalBackground = pickSection(text, ["education", "educational background", "academic background"]);
  const workExperience = pickSection(text, ["work experience", "experience", "employment history"]);

  return {
    fullName: pickNameCandidate(lines).slice(0, 120),
    contactNumber: contactNumber,
    email: emailMatch.slice(0, 120),
    address: (addressMatch || pickAddressCandidate(lines)).slice(0, 200),
    educationalBackground,
    workExperience,
    rawTextLength: text.length
  };
}

async function extractTextFromUploadedDocument(file: Express.Multer.File) {
  const extension = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  if (extension === ".txt" || mime.includes("text/plain")) {
    return file.buffer.toString("utf8");
  }

  if (extension === ".docx" || mime.includes("officedocument.wordprocessingml.document")) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }

  if (extension === ".pdf" || mime.includes("pdf")) {
    const parser = new PDFParse({ data: file.buffer });
    const parsed = await parser.getText();
    await parser.destroy();
    return parsed.text;
  }

  throw new Error("Unsupported file type. Please upload PDF, DOCX, or TXT.");
}

function mapEvaluation(row: any) {
  return {
    id: row.id,
    applicationId: row.application_id,
    positionLevel: row.position_level ?? "first_level",
    communicationSkills: row.communication_skills,
    abilityToPresent: row.ability_to_present,
    alertness: row.alertness,
    judgement: row.judgement,
    emotionalStability: row.emotional_stability,
    selfConfidence: row.self_confidence,
    firstLevelTotal: row.first_level_total,
    oralCommunication: row.oral_communication,
    analyticalAbility: row.analytical_ability,
    initiative: row.initiative,
    stressTolerance: row.stress_tolerance,
    sensitivity: row.sensitivity,
    serviceOrientation: row.service_orientation,
    secondLevelTotal: row.second_level_total,
    totalScore: row.total_score,
    remarks: row.remarks ?? "",
    evaluatedBy: row.evaluated_by,
    evaluatedAt: row.evaluated_at
  };
}

function mapUser(row: any) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.is_active !== false
  };
}

async function countActiveAdmins(excludeUserId?: string) {
  const params: unknown[] = [];
  let sql = "SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin' AND is_active = TRUE";
  if (excludeUserId) {
    params.push(excludeUserId);
    sql += " AND id <> $1";
  }
  const row = await fetchOne<{ count: number }>(sql, params);
  return row?.count ?? 0;
}

function mapDocument(row: any) {
  return {
    id: row.id,
    applicantId: row.applicant_id,
    docType: row.doc_type,
    fileName: row.file_name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    size: row.size,
    uploadedAt: row.uploaded_at,
    url: `/uploads/${row.file_name}`
  };
}

function removeFileSafe(fileName: string) {
  const filePath = path.join(uploadDir, fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== "POST"
});

app.post("/api/auth/login", authLimiter, asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const row = await fetchOne<any>("SELECT * FROM users WHERE email = $1", [email]);
  if (!row) {
    logAudit(req, "login_failed", undefined, { email });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (row.is_active === false) {
    logAudit(req, "login_failed_inactive", row.id, { email });
    res.status(403).json({ error: "Account is inactive. Contact your administrator." });
    return;
  }

  const isValid = bcrypt.compareSync(password, row.password_hash);
  if (!isValid) {
    logAudit(req, "login_failed", row.id, { email });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const user = mapUser(row);
  const token = createToken(user);
  logAudit(req, "login_success", user.id);
  res.json({ token, user });
}));

app.post("/api/auth/logout", authLimiter, requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  logAudit(req, "logout", req.user?.id);
  res.status(204).send();
}));

app.post("/api/auth/register", asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
  };

  if (!name || !email || !password) {
    res.status(400).json({ error: "Name, email, and password are required" });
    return;
  }

  const existing = await fetchOne("SELECT id FROM users WHERE email = $1", [email]);
  if (existing) {
    res.status(409).json({ error: "Email already exists" });
    return;
  }

  const user = {
    id: randomUUID(),
    name,
    email,
    role: role ?? "staff",
    isActive: true
  };

  const passwordHash = bcrypt.hashSync(password, 10);
  await query(
    "INSERT INTO users (id, name, email, role, password_hash, is_active, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [user.id, user.name, user.email, user.role, passwordHash, user.isActive, new Date().toISOString()]
  );

  const token = createToken(user);
  res.status(201).json({ token, user });
}));

app.get("/api/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

app.get("/api/audit-logs", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const result = await query(
    `
      SELECT
        al.id,
        al.user_id,
        al.action,
        al.ip,
        al.user_agent,
        al.details,
        al.created_at,
        u.name AS user_name,
        u.email AS user_email
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC
      LIMIT $1
    `,
    [limit]
  );

  const logs = result.rows.map((row: any) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name ?? undefined,
    userEmail: row.user_email ?? undefined,
    action: row.action,
    ip: row.ip ?? undefined,
    userAgent: row.user_agent ?? undefined,
    details: row.details ? JSON.parse(row.details) : undefined,
    createdAt: row.created_at
  }));

  res.json(logs);
}));

app.get("/api/users", requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const result = await query("SELECT id, name, email, role, is_active FROM users ORDER BY name");
  res.json(result.rows.map(mapUser));
}));

app.post("/api/users", requireAuth, requireAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  const { name, email, password, role } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
  };

  if (!name || !email || !password) {
    res.status(400).json({ error: "Name, email, and password are required" });
    return;
  }

  const existing = await fetchOne("SELECT id FROM users WHERE email = $1", [email]);
  if (existing) {
    res.status(409).json({ error: "Email already exists" });
    return;
  }

  const user = {
    id: randomUUID(),
    name,
    email,
    role: role ?? "staff",
    isActive: true
  };

  const passwordHash = bcrypt.hashSync(password, 10);
  await query(
    "INSERT INTO users (id, name, email, role, password_hash, is_active, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [user.id, user.name, user.email, user.role, passwordHash, user.isActive, new Date().toISOString()]
  );

  logAudit(req, "user_created", req.user?.id, { targetUserId: user.id, email: user.email, role: user.role });

  res.status(201).json(user);
}));

app.put("/api/users/:id", requireAuth, requireAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  const { name, email, role, password } = req.body as {
    name?: string;
    email?: string;
    role?: string;
    password?: string;
  };

  if (!name || !email || !role) {
    res.status(400).json({ error: "Name, email, and role are required" });
    return;
  }

  const duplicate = await fetchOne("SELECT id FROM users WHERE email = $1 AND id <> $2", [email, req.params.id]);
  if (duplicate) {
    res.status(409).json({ error: "Email already exists" });
    return;
  }

  const current = await fetchOne<any>("SELECT id, role, is_active FROM users WHERE id = $1", [req.params.id]);
  if (!current) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (current.role === "admin" && role !== "admin") {
    const remainingActiveAdmins = await countActiveAdmins(req.params.id);
    if (remainingActiveAdmins === 0) {
      res.status(400).json({ error: "Cannot demote the last active admin." });
      return;
    }
  }

  const passwordHash = password ? bcrypt.hashSync(password, 10) : null;
  const result = passwordHash
    ? await query(
        "UPDATE users SET name=$2, email=$3, role=$4, password_hash=$5 WHERE id=$1 RETURNING id, name, email, role, is_active",
        [req.params.id, name, email, role, passwordHash]
      )
    : await query(
        "UPDATE users SET name=$2, email=$3, role=$4 WHERE id=$1 RETURNING id, name, email, role, is_active",
        [req.params.id, name, email, role]
      );

  logAudit(req, "user_updated", req.user?.id, {
    targetUserId: req.params.id,
    roleChanged: current.role !== role,
    previousRole: current.role,
    newRole: role,
    passwordReset: Boolean(password)
  });

  res.json(mapUser(result.rows[0]));
}));

app.patch("/api/users/:id/status", requireAuth, requireAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  const { isActive } = req.body as { isActive?: boolean };
  if (typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive must be boolean" });
    return;
  }

  const target = await fetchOne<any>("SELECT id, role FROM users WHERE id = $1", [req.params.id]);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (req.user?.id === req.params.id && !isActive) {
    res.status(400).json({ error: "You cannot deactivate your own account." });
    return;
  }

  if (target.role === "admin" && !isActive) {
    const remainingActiveAdmins = await countActiveAdmins(req.params.id);
    if (remainingActiveAdmins === 0) {
      res.status(400).json({ error: "Cannot deactivate the last active admin." });
      return;
    }
  }

  const result = await query(
    "UPDATE users SET is_active = $2 WHERE id = $1 RETURNING id, name, email, role, is_active",
    [req.params.id, isActive]
  );

  logAudit(req, "user_status_changed", req.user?.id, {
    targetUserId: req.params.id,
    isActive
  });

  res.json(mapUser(result.rows[0]));
}));

app.post("/api/users/:id/reset-password", requireAuth, requireAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  const { newPassword } = req.body as { newPassword?: string };
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "newPassword is required (minimum 6 characters)." });
    return;
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  const result = await query("UPDATE users SET password_hash = $2 WHERE id = $1 RETURNING id", [req.params.id, passwordHash]);

  if (result.rowCount === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  logAudit(req, "user_password_reset", req.user?.id, { targetUserId: req.params.id });
  res.status(204).send();
}));

app.delete("/api/users/:id", requireAuth, requireAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  if (req.user?.id === req.params.id) {
    res.status(400).json({ error: "You cannot delete your own account." });
    return;
  }

  const target = await fetchOne<any>("SELECT id, role FROM users WHERE id = $1", [req.params.id]);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (target.role === "admin") {
    const remainingActiveAdmins = await countActiveAdmins(req.params.id);
    if (remainingActiveAdmins === 0) {
      res.status(400).json({ error: "Cannot delete the last active admin." });
      return;
    }
  }

  const result = await query("DELETE FROM users WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  logAudit(req, "user_deleted", req.user?.id, { targetUserId: req.params.id });
  res.status(204).send();
}));

app.get("/api/departments", asyncHandler(async (_req, res) => {
  const rows = await query("SELECT * FROM departments ORDER BY name");
  res.json(rows.rows);
}));

app.get("/api/position-titles", asyncHandler(async (_req, res) => {
  const rows = await query<{ position_title: string }>(
    "SELECT DISTINCT position_title FROM job_vacancies WHERE position_title IS NOT NULL ORDER BY position_title"
  );
  const dynamicTitles = rows.rows
    .map((row) => row.position_title?.trim())
    .filter((title): title is string => Boolean(title));
  const merged = Array.from(new Set([...DEFAULT_POSITION_TITLES, ...dynamicTitles]))
    .sort((a, b) => a.localeCompare(b));
  res.json(merged);
}));

app.get("/api/jobs", asyncHandler(async (_req, res) => {
  const rows = await query("SELECT * FROM job_vacancies ORDER BY posting_date DESC");
  res.json(rows.rows.map(mapJob));
}));

app.get("/api/jobs/:id", asyncHandler(async (req, res) => {
  const row = await fetchOne("SELECT * FROM job_vacancies WHERE id = $1", [req.params.id]);
  if (!row) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(mapJob(row));
}));

app.post("/api/jobs", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { positionTitle, departmentId, salaryGrade, qualifications, postingDate, closingDate, status, positionLevel } = req.body as any;
  if (!positionTitle || !departmentId || !salaryGrade || !qualifications || !postingDate || !closingDate || !status) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const job = {
    id: randomUUID(),
    positionTitle,
    departmentId,
    salaryGrade,
    qualifications,
    postingDate,
    closingDate,
    status,
    positionLevel: positionLevel ?? "first_level"
  };

  await query(
    "INSERT INTO job_vacancies (id, position_title, department_id, salary_grade, qualifications, posting_date, closing_date, status, position_level) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [job.id, job.positionTitle, job.departmentId, job.salaryGrade, job.qualifications, job.postingDate, job.closingDate, job.status, job.positionLevel]
  );

  res.status(201).json(job);
}));

app.put("/api/jobs/:id", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { positionTitle, departmentId, salaryGrade, qualifications, postingDate, closingDate, status, positionLevel } = req.body as any;
  const result = await query(
    "UPDATE job_vacancies SET position_title=$2, department_id=$3, salary_grade=$4, qualifications=$5, posting_date=$6, closing_date=$7, status=$8, position_level=$9 WHERE id=$1 RETURNING *",
    [req.params.id, positionTitle, departmentId, salaryGrade, qualifications, postingDate, closingDate, status, positionLevel ?? "first_level"]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(mapJob(result.rows[0]));
}));

app.delete("/api/jobs/:id", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const result = await query("DELETE FROM job_vacancies WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.status(204).send();
}));

app.get("/api/applicants", asyncHandler(async (_req, res) => {
  const rows = await query("SELECT * FROM applicants ORDER BY full_name");
  res.json(rows.rows.map(mapApplicant));
}));

app.get("/api/applicants/:id", asyncHandler(async (req, res) => {
  const row = await fetchOne("SELECT * FROM applicants WHERE id = $1", [req.params.id]);
  if (!row) {
    res.status(404).json({ error: "Applicant not found" });
    return;
  }
  res.json(mapApplicant(row));
}));

app.post("/api/applicants/parse-document", requireAuth, parseUpload.single("file"), asyncHandler(async (req: AuthedRequest, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Document file is required" });
    return;
  }

  try {
    const text = await extractTextFromUploadedDocument(req.file);
    const parsed = parseApplicantDraftFromText(text);
    res.json(parsed);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message || "Unable to parse document" });
  }
}));

app.post("/api/applicants", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { fullName, contactNumber, email, address, educationalBackground, workExperience } = req.body as any;
  if (!fullName || !contactNumber || !email || !address || !educationalBackground || !workExperience) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const applicant = {
    id: randomUUID(),
    fullName,
    contactNumber,
    email,
    address,
    educationalBackground,
    workExperience
  };

  await query(
    "INSERT INTO applicants (id, full_name, contact_number, email, address, educational_background, work_experience) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [
      applicant.id,
      applicant.fullName,
      applicant.contactNumber,
      applicant.email,
      applicant.address,
      applicant.educationalBackground,
      applicant.workExperience
    ]
  );

  res.status(201).json(applicant);
}));

app.put("/api/applicants/:id", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { fullName, contactNumber, email, address, educationalBackground, workExperience } = req.body as any;
  const result = await query(
    "UPDATE applicants SET full_name=$2, contact_number=$3, email=$4, address=$5, educational_background=$6, work_experience=$7 WHERE id=$1 RETURNING *",
    [req.params.id, fullName, contactNumber, email, address, educationalBackground, workExperience]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: "Applicant not found" });
    return;
  }

  res.json(mapApplicant(result.rows[0]));
}));

app.delete("/api/applicants/:id", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  // Remove uploaded files linked to the applicant.
  const docs = await query("SELECT file_name FROM applicant_documents WHERE applicant_id = $1", [req.params.id]);
  docs.rows.forEach((doc) => removeFileSafe(doc.file_name));

  // Delete dependent rows in child tables first to avoid FK violations.
  await query(
    "DELETE FROM evaluations WHERE application_id IN (SELECT id FROM applications WHERE applicant_id = $1)",
    [req.params.id]
  );
  await query(
    "DELETE FROM status_history WHERE application_id IN (SELECT id FROM applications WHERE applicant_id = $1)",
    [req.params.id]
  );
  await query("DELETE FROM applications WHERE applicant_id = $1", [req.params.id]);

  const result = await query("DELETE FROM applicants WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Applicant not found" });
    return;
  }
  res.status(204).send();
}));

app.get("/api/applicants/:id/documents", requireAuth, asyncHandler(async (req, res) => {
  const rows = await query("SELECT * FROM applicant_documents WHERE applicant_id = $1 ORDER BY uploaded_at DESC", [req.params.id]);
  res.json(rows.rows.map(mapDocument));
}));

app.post("/api/applicants/:id/documents", requireAuth, upload.single("file"), asyncHandler(async (req: AuthedRequest, res) => {
  const docType = String(req.body.type ?? "");
  if (!req.file || !docType) {
    res.status(400).json({ error: "File and type are required" });
    return;
  }

  const applicantId = req.params.id;

  // For resume and transcript, replace existing ones; for certificates, add new ones
  if (docType === "resume" || docType === "transcript") {
    // Get and delete existing document of same type
    const existing = await query(
      "SELECT file_name FROM applicant_documents WHERE applicant_id = $1 AND doc_type = $2",
      [applicantId, docType]
    );
    
    if (existing.rows.length > 0) {
      const oldFileName = existing.rows[0].file_name;
      const oldFilePath = path.join(uploadDir, oldFileName);
      
      // Delete old file from disk
      try {
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      } catch (err) {
        console.error(`Failed to delete old file ${oldFilePath}:`, err);
      }
      
      // Delete old document record
      await query(
        "DELETE FROM applicant_documents WHERE applicant_id = $1 AND doc_type = $2",
        [applicantId, docType]
      );
    }
  }

  const doc = {
    id: randomUUID(),
    applicantId,
    docType,
    fileName: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedAt: new Date().toISOString()
  };

  await query(
    "INSERT INTO applicant_documents (id, applicant_id, doc_type, file_name, original_name, mime_type, size, uploaded_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [doc.id, doc.applicantId, doc.docType, doc.fileName, doc.originalName, doc.mimeType, doc.size, doc.uploadedAt]
  );

  res.status(201).json({ ...doc, url: `/uploads/${doc.fileName}` });
}));

app.get("/api/applications", asyncHandler(async (_req, res) => {
  const rows = await query("SELECT * FROM applications ORDER BY date_applied DESC");
  res.json(rows.rows.map(mapApplication));
}));

app.get("/api/applications/:id", asyncHandler(async (req, res) => {
  const row = await fetchOne("SELECT * FROM applications WHERE id = $1", [req.params.id]);
  if (!row) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  res.json(mapApplication(row));
}));

app.post("/api/applications", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { applicantId, vacancyId, status, dateApplied, remarks } = req.body as any;
  if (!applicantId || !vacancyId || !status || !dateApplied) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const application = {
    id: randomUUID(),
    applicantId,
    vacancyId,
    status,
    dateApplied,
    remarks: remarks ?? null
  };

  await query(
    "INSERT INTO applications (id, applicant_id, vacancy_id, status, date_applied, remarks) VALUES ($1, $2, $3, $4, $5, $6)",
    [application.id, application.applicantId, application.vacancyId, application.status, application.dateApplied, application.remarks]
  );

  res.status(201).json(application);
}));

app.put("/api/applications/:id", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { applicantId, vacancyId, status, dateApplied, remarks } = req.body as any;
  const result = await query(
    "UPDATE applications SET applicant_id=$2, vacancy_id=$3, status=$4, date_applied=$5, remarks=$6 WHERE id=$1 RETURNING *",
    [req.params.id, applicantId, vacancyId, status, dateApplied, remarks ?? null]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  res.json(mapApplication(result.rows[0]));
}));

app.delete("/api/applications/:id", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const result = await query("DELETE FROM applications WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Application not found" });
    return;
  }
  res.status(204).send();
}));

app.patch("/api/applications/:id/status", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const {
    status,
    remarks,
    documentsComplete,
    examScheduleDate,
    examScheduleTime,
    examVenue,
    interviewScheduleDate,
    interviewScheduleTime,
    interviewVenue,
    finalEvaluationDate,
    finalEvaluationTime,
    finalEvaluationVenue,
    notifyApplicant,
    rejectionSubtype,
    rejectionTemplateText
    ,qualificationTemplateText
  } = req.body as {
    status?: string;
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
    rejectionSubtype?: RejectionSubtype;
    rejectionTemplateText?: string;
    qualificationTemplateText?: string;
  };

  if (!status) {
    res.status(400).json({ error: "Status is required" });
    return;
  }

  const existing = await fetchOne<any>("SELECT * FROM applications WHERE id = $1", [req.params.id]);
  if (!existing) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  const canBypassWorkflow = req.user?.role === "admin" || req.user?.role === "staff";
  if (!canTransitionStatus(existing.status, status) && !canBypassWorkflow) {
    res.status(400).json({ error: `Invalid status transition from ${existing.status} to ${status}` });
    return;
  }

  if (status === "Under Initial Screening" && documentsComplete !== true) {
    res.status(400).json({ error: "Complete document check is required before initial screening." });
    return;
  }

  if (status === "For Examination" && (!examScheduleDate || !examScheduleTime || !examVenue)) {
    res.status(400).json({ error: "Examination date, time, and venue are required." });
    return;
  }

  if (status === "For Interview" && (!interviewScheduleDate || !interviewScheduleTime || !interviewVenue)) {
    res.status(400).json({ error: "Interview date, time, and venue are required." });
    return;
  }

  if (status === "For Final Evaluation" && (!finalEvaluationDate || !finalEvaluationTime || !finalEvaluationVenue)) {
    res.status(400).json({ error: "Final evaluation date, time, and venue are required." });
    return;
  }

  const updatedDocumentsComplete = documentsComplete ?? existing.documents_complete ?? false;
  const updatedExamDate = examScheduleDate ?? existing.exam_schedule_date ?? null;
  const updatedExamTime = examScheduleTime ?? existing.exam_schedule_time ?? null;
  const updatedExamVenue = examVenue ?? existing.exam_venue ?? null;
  const updatedInterviewDate = interviewScheduleDate ?? existing.interview_schedule_date ?? null;
  const updatedInterviewTime = interviewScheduleTime ?? existing.interview_schedule_time ?? null;
  const updatedInterviewVenue = interviewVenue ?? existing.interview_venue ?? null;
  const updatedFinalEvalDate = finalEvaluationDate ?? existing.final_evaluation_date ?? null;
  const updatedFinalEvalTime = finalEvaluationTime ?? existing.final_evaluation_time ?? null;
  const updatedFinalEvalVenue = finalEvaluationVenue ?? existing.final_evaluation_venue ?? null;

  const result = await query(
    "UPDATE applications SET status=$2, remarks=$3, documents_complete=$4, exam_schedule_date=$5, exam_schedule_time=$6, exam_venue=$7, interview_schedule_date=$8, interview_schedule_time=$9, interview_venue=$10, final_evaluation_date=$11, final_evaluation_time=$12, final_evaluation_venue=$13 WHERE id=$1 RETURNING *",
    [
      req.params.id,
      status,
      remarks ?? null,
      updatedDocumentsComplete,
      updatedExamDate,
      updatedExamTime,
      updatedExamVenue,
      updatedInterviewDate,
      updatedInterviewTime,
      updatedInterviewVenue,
      updatedFinalEvalDate,
      updatedFinalEvalTime,
      updatedFinalEvalVenue
    ]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: "Application not found" });
    return;
  }

  const history = {
    id: randomUUID(),
    applicationId: req.params.id,
    status,
    remarks: remarks ?? "",
    updatedBy: req.user?.name ?? "System",
    updatedAt: new Date().toISOString().slice(0, 10)
  };

  await query(
    "INSERT INTO status_history (id, application_id, status, remarks, updated_by, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [history.id, history.applicationId, history.status, history.remarks, history.updatedBy, history.updatedAt]
  );

  const emailContext = await fetchOne<any>(
    `SELECT a.full_name, a.email, j.position_title
     FROM applications ap
     JOIN applicants a ON a.id = ap.applicant_id
     JOIN job_vacancies j ON j.id = ap.vacancy_id
     WHERE ap.id = $1`,
    [req.params.id]
  );

  const shouldNotifyApplicant = notifyApplicant !== false;

  let notificationSent = false;
  let emailDeliveryStatus: "skipped" | "disabled" | "accepted" | "failed" = "skipped";
  let emailProviderResponse: string | undefined;

  if (!shouldNotifyApplicant) {
    logAudit(req, "status_email_skipped", req.user?.id, {
      applicationId: req.params.id,
      to: emailContext?.email,
      status,
      reason: "Notification disabled by user toggle"
    });
  }

  if (shouldNotifyApplicant && emailContext) {
    try {
      const emailResult = await sendApplicationStatusEmail({
        applicantEmail: emailContext.email,
        applicantName: emailContext.full_name,
        jobTitle: emailContext.position_title,
        status,
        remarks,
        rejectionSubtype,
        rejectionTemplateText,
        qualificationTemplateText,
        workflow: {
          examScheduleDate: updatedExamDate ?? undefined,
          examScheduleTime: updatedExamTime ?? undefined,
          examVenue: updatedExamVenue ?? undefined,
          interviewScheduleDate: updatedInterviewDate ?? undefined,
          interviewScheduleTime: updatedInterviewTime ?? undefined,
          interviewVenue: updatedInterviewVenue ?? undefined,
          finalEvaluationDate: updatedFinalEvalDate ?? undefined,
          finalEvaluationTime: updatedFinalEvalTime ?? undefined,
          finalEvaluationVenue: updatedFinalEvalVenue ?? undefined
        }
      });

      notificationSent = emailResult.sent;
      emailDeliveryStatus = emailResult.status;
      emailProviderResponse = emailResult.providerResponse;

      logAudit(req, emailResult.sent ? "status_email_sent" : "status_email_disabled", req.user?.id, {
        applicationId: req.params.id,
        to: emailContext.email,
        applicantName: emailContext.full_name,
        jobTitle: emailContext.position_title,
        status,
        subject: emailResult.subject,
        bodyPreview: createEmailBodyPreview(emailResult.html),
        messageId: emailResult.messageId,
        accepted: emailResult.accepted,
        rejected: emailResult.rejected,
        providerResponse: emailResult.providerResponse
      });
    } catch (error) {
      console.error("Failed to send status email", error);
      emailDeliveryStatus = "failed";
      emailProviderResponse = error instanceof Error ? error.message : "Unknown send error";
      logAudit(req, "status_email_failed", req.user?.id, {
        applicationId: req.params.id,
        to: emailContext.email,
        status,
        providerResponse: emailProviderResponse
      });
    }
  }

  res.json({
    application: mapApplication(result.rows[0]),
    history,
    notificationSent,
    notificationSkipped: !shouldNotifyApplicant,
    emailDeliveryStatus,
    emailProviderResponse
  });
}));

app.get("/api/status-history", asyncHandler(async (req, res) => {
  const applicationId = req.query.applicationId as string | undefined;
  if (!applicationId) {
    res.status(400).json({ error: "applicationId is required" });
    return;
  }
  const rows = await query("SELECT * FROM status_history WHERE application_id = $1 ORDER BY updated_at", [applicationId]);
  res.json(rows.rows.map(mapHistory));
}));

app.get("/api/email-templates", requireAuth, asyncHandler(async (_req, res) => {
  const rows = await fetchEmailTemplates();
  res.json(rows.map((row) => ({
    templateKey: row.template_key,
    templateName: row.template_name,
    templateGroup: row.template_group,
    subject: row.subject,
    body: row.body,
    updatedAt: row.updated_at
  })));
}));

app.put("/api/email-templates/:templateKey", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const templateKey = req.params.templateKey as EmailTemplateKey;
  const { templateName, templateGroup, subject, body } = req.body as {
    templateName?: string;
    templateGroup?: "rejection" | "qualification";
    subject?: string;
    body?: string;
  };

  if (!templateName || !templateGroup || !subject || !body) {
    res.status(400).json({ error: "templateName, templateGroup, subject, and body are required" });
    return;
  }

  const updatedAt = new Date().toISOString();
  await query(
    `INSERT INTO email_templates (template_key, template_name, template_group, subject, body, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (template_key)
     DO UPDATE SET template_name = EXCLUDED.template_name,
                   template_group = EXCLUDED.template_group,
                   subject = EXCLUDED.subject,
                   body = EXCLUDED.body,
                   updated_at = EXCLUDED.updated_at`,
    [templateKey, templateName, templateGroup, subject, body, updatedAt]
  );

  const saved = await fetchEmailTemplateByKey(templateKey);
  if (!saved) {
    res.status(500).json({ error: "Failed to save email template" });
    return;
  }

  res.json({
    templateKey: saved.template_key,
    templateName: saved.template_name,
    templateGroup: saved.template_group,
    subject: saved.subject,
    body: saved.body,
    updatedAt: saved.updated_at
  });
}));

app.get("/api/evaluations", asyncHandler(async (_req, res) => {
  const rows = await query("SELECT * FROM evaluations");
  res.json(rows.rows.map(mapEvaluation));
}));

app.post("/api/evaluations", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const {
    applicationId,
    positionLevel,
    communicationSkills,
    abilityToPresent,
    alertness,
    judgement,
    emotionalStability,
    selfConfidence,
    oralCommunication,
    analyticalAbility,
    initiative,
    stressTolerance,
    sensitivity,
    serviceOrientation,
    remarks
  } = req.body as any;

  if (!applicationId || !positionLevel) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  // Validate that at least one score is provided
  const hasFirstLevelScores = communicationSkills !== undefined || abilityToPresent !== undefined || alertness !== undefined || judgement !== undefined || emotionalStability !== undefined || selfConfidence !== undefined;
  const hasSecondLevelScores = oralCommunication !== undefined || analyticalAbility !== undefined || initiative !== undefined || stressTolerance !== undefined || sensitivity !== undefined || serviceOrientation !== undefined;
  
  if (!hasFirstLevelScores && !hasSecondLevelScores) {
    res.status(400).json({ error: "Please enter at least one assessment score" });
    return;
  }

  let firstLevelTotal = null;
  let secondLevelTotal = null;
  let totalScore = 0;

  if (positionLevel === "first_level") {
    firstLevelTotal =
      (communicationSkills || 0) +
      (abilityToPresent || 0) +
      (alertness || 0) +
      (judgement || 0) +
      (emotionalStability || 0) +
      (selfConfidence || 0);
    totalScore = firstLevelTotal;
  } else if (positionLevel === "second_level") {
    secondLevelTotal =
      (oralCommunication || 0) +
      (analyticalAbility || 0) +
      (judgement || 0) +
      (initiative || 0) +
      (stressTolerance || 0) +
      (sensitivity || 0) +
      (serviceOrientation || 0);
    totalScore = secondLevelTotal;
  }

  const evaluation = {
    id: randomUUID(),
    applicationId,
    positionLevel,
    communicationSkills: communicationSkills || null,
    abilityToPresent: abilityToPresent || null,
    alertness: alertness || null,
    judgement: judgement || null,
    emotionalStability: emotionalStability || null,
    selfConfidence: selfConfidence || null,
    firstLevelTotal,
    oralCommunication: oralCommunication || null,
    analyticalAbility: analyticalAbility || null,
    initiative: initiative || null,
    stressTolerance: stressTolerance || null,
    sensitivity: sensitivity || null,
    serviceOrientation: serviceOrientation || null,
    secondLevelTotal,
    totalScore,
    remarks: remarks ?? "",
    evaluatedBy: req.user?.name ?? "System",
    evaluatedAt: new Date().toISOString().slice(0, 10)
  };

  await query(
    `INSERT INTO evaluations (
      id, application_id, position_level,
      communication_skills, ability_to_present, alertness, judgement, emotional_stability, self_confidence, first_level_total,
      oral_communication, analytical_ability, initiative, stress_tolerance, sensitivity, service_orientation, second_level_total,
      total_score, remarks, evaluated_by, evaluated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
    [
      evaluation.id,
      evaluation.applicationId,
      evaluation.positionLevel,
      evaluation.communicationSkills,
      evaluation.abilityToPresent,
      evaluation.alertness,
      evaluation.judgement,
      evaluation.emotionalStability,
      evaluation.selfConfidence,
      evaluation.firstLevelTotal,
      evaluation.oralCommunication,
      evaluation.analyticalAbility,
      evaluation.initiative,
      evaluation.stressTolerance,
      evaluation.sensitivity,
      evaluation.serviceOrientation,
      evaluation.secondLevelTotal,
      evaluation.totalScore,
      evaluation.remarks,
      evaluation.evaluatedBy,
      evaluation.evaluatedAt
    ]
  );

  res.status(201).json(evaluation);
}));

app.put("/api/evaluations/:id", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const {
    positionLevel,
    communicationSkills,
    abilityToPresent,
    alertness,
    judgement,
    emotionalStability,
    selfConfidence,
    oralCommunication,
    analyticalAbility,
    initiative,
    stressTolerance,
    sensitivity,
    serviceOrientation,
    remarks
  } = req.body as any;

  if (!positionLevel) {
    res.status(400).json({ error: "Position level is required" });
    return;
  }

  let firstLevelTotal = null;
  let secondLevelTotal = null;
  let totalScore = 0;

  if (positionLevel === "first_level") {
    firstLevelTotal =
      (communicationSkills || 0) +
      (abilityToPresent || 0) +
      (alertness || 0) +
      (judgement || 0) +
      (emotionalStability || 0) +
      (selfConfidence || 0);
    totalScore = firstLevelTotal;
  } else if (positionLevel === "second_level") {
    secondLevelTotal =
      (oralCommunication || 0) +
      (analyticalAbility || 0) +
      (judgement || 0) +
      (initiative || 0) +
      (stressTolerance || 0) +
      (sensitivity || 0) +
      (serviceOrientation || 0);
    totalScore = secondLevelTotal;
  }

  const result = await query(
    `UPDATE evaluations SET
      position_level=$2,
      communication_skills=$3,
      ability_to_present=$4,
      alertness=$5,
      judgement=$6,
      emotional_stability=$7,
      self_confidence=$8,
      first_level_total=$9,
      oral_communication=$10,
      analytical_ability=$11,
      initiative=$12,
      stress_tolerance=$13,
      sensitivity=$14,
      service_orientation=$15,
      second_level_total=$16,
      total_score=$17,
      remarks=$18
    WHERE id=$1 RETURNING *`,
    [
      req.params.id,
      positionLevel,
      communicationSkills || null,
      abilityToPresent || null,
      alertness || null,
      judgement || null,
      emotionalStability || null,
      selfConfidence || null,
      firstLevelTotal,
      oralCommunication || null,
      analyticalAbility || null,
      initiative || null,
      stressTolerance || null,
      sensitivity || null,
      serviceOrientation || null,
      secondLevelTotal,
      totalScore,
      remarks ?? ""
    ]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: "Evaluation not found" });
    return;
  }

  res.json(mapEvaluation(result.rows[0]));
}));

app.delete("/api/evaluations/:id", requireAuth, asyncHandler(async (req, res) => {
  const result = await query("DELETE FROM evaluations WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Evaluation not found" });
    return;
  }
  res.status(204).send();
}));

app.get("/api/reports/summary", asyncHandler(async (_req, res) => {
  const totalJobs = await query<{ count: string }>("SELECT COUNT(*) as count FROM job_vacancies");
  const totalApplicants = await query<{ count: string }>("SELECT COUNT(*) as count FROM applicants");
  const totalApplications = await query<{ count: string }>("SELECT COUNT(*) as count FROM applications");

  const statusCounts = await query<{ status: string; count: string }>(
    "SELECT status, COUNT(*) as count FROM applications GROUP BY status"
  );
  const vacancyStatusCounts = await query<{ status: string; count: string }>(
    "SELECT status, COUNT(*) as count FROM job_vacancies GROUP BY status"
  );

  res.json({
    totalJobs: Number(totalJobs.rows[0]?.count ?? 0),
    totalApplicants: Number(totalApplicants.rows[0]?.count ?? 0),
    totalApplications: Number(totalApplications.rows[0]?.count ?? 0),
    applicationsByStatus: statusCounts.rows.map((row) => ({
      status: row.status,
      count: Number(row.count)
    })),
    vacanciesByStatus: vacancyStatusCounts.rows.map((row) => ({
      status: row.status,
      count: Number(row.count)
    }))
  });
}));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

async function start() {
  await initDb();
  // await seedIfEmpty(); // All sample data has been removed
  await ensureDepartments();
  await ensureTestAccounts();
  await ensureEmailTemplates();
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
