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
import { createHash, randomBytes } from "node:crypto";
import { initDb, query, getArchiveDuration, setArchiveDuration } from "./db.js";
import { ensureDepartments, ensureSampleApplicants, ensureTestAccounts, seedIfEmpty } from "./seed.js";
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

function getPasswordStrengthScore(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

function isWeakPassword(password: string) {
  return getPasswordStrengthScore(password) <= 1;
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
  // Auto-close vacancies if closing date has passed
  const closingDate = new Date(row.closing_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of day for comparison
  const effectiveStatus = closingDate < today && row.status === "Open" ? "Closed" : row.status;

  return {
    id: row.id,
    positionTitle: row.position_title,
    departmentId: row.department_id,
    plantillaNo: row.plantilla_no ?? "",
    monthlyRate: row.monthly_rate ?? "",
    salaryGrade: row.salary_grade,
    description: row.description ?? row.qualifications ?? "",
    eligibility: row.eligibility ?? "",
    trainings: row.trainings ?? "",
    competencies: row.competencies ?? "",
    educationalBackground: row.educational_background ?? "",
    workExperience: row.work_experience ?? "",
    qualifications: row.qualifications ?? row.description ?? "",
    postingDate: row.posting_date,
    closingDate: row.closing_date,
    status: effectiveStatus,
    positionLevel: row.position_level ?? "first_level"
  };
}

function mapApplicant(row: any) {
  return {
    id: row.id,
    fullName: row.full_name,
    contactNumber: row.contact_number,
    telephoneNumber: row.telephone_number ?? "",
    email: row.email,
    address: row.address,
    permanentAddress: row.permanent_address ?? "",
    dateOfBirth: row.date_of_birth ?? "",
    placeOfBirth: row.place_of_birth ?? "",
    sex: row.sex ?? "",
    civilStatus: row.civil_status ?? "",
    citizenship: row.citizenship ?? "",
    height: row.height ?? "",
    weight: row.weight ?? "",
    bloodType: row.blood_type ?? "",
    gsisIdNo: row.gsis_id_no ?? "",
    philsysNo: row.philsys_no ?? "",
    pagibigIdNo: row.pagibig_id_no ?? "",
    philhealthNo: row.philhealth_no ?? "",
    citizenshipDetails: row.citizenship_details ?? "",
    sssNo: row.sss_no ?? "",
    tinNo: row.tin_no ?? "",
    agencyEmployeeNo: row.agency_employee_no ?? "",
    spouseName: row.spouse_name ?? "",
    spouseSurname: row.spouse_surname ?? "",
    spouseFirstName: row.spouse_first_name ?? "",
    spouseMiddleName: row.spouse_middle_name ?? "",
    spouseNameExtension: row.spouse_name_extension ?? "",
    spouseOccupation: row.spouse_occupation ?? "",
    spouseEmployerBusinessName: row.spouse_employer_business_name ?? "",
    spouseBusinessAddress: row.spouse_business_address ?? "",
    spouseTelephoneNo: row.spouse_telephone_no ?? "",
    childrenInfo: row.children_info ?? "",
    fatherName: row.father_name ?? "",
    fatherSurname: row.father_surname ?? "",
    fatherFirstName: row.father_first_name ?? "",
    fatherMiddleName: row.father_middle_name ?? "",
    fatherNameExtension: row.father_name_extension ?? "",
    motherName: row.mother_name ?? "",
    motherSurname: row.mother_surname ?? "",
    motherFirstName: row.mother_first_name ?? "",
    motherMiddleName: row.mother_middle_name ?? "",
    civilServiceEligibility: row.civil_service_eligibility ?? "",
    voluntaryWork: row.voluntary_work ?? "",
    trainings: row.trainings ?? "",
    otherInfo: row.other_info ?? "",
    referencesInfo: row.references_info ?? "",
    educationalBackground: row.educational_background ?? "",
    workExperience: row.work_experience ?? "",
    applicationId: row.application_id ?? undefined
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

type EmailTemplateKey = RejectionSubtype | "qualification_notice" | "hired";

type EmailTemplateRecord = {
  template_key: EmailTemplateKey;
  template_name: string;
  template_group: "rejection" | "qualification";
  subject: string;
  body: string;
  updated_at: string;
};

const DEFAULT_EMAIL_TEMPLATES: EmailTemplateRecord[] = [];

function renderTemplateText(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? "");
}

function formatTemplateDate(value: Date = new Date()) {
  return value.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTextBlockHtml(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      if (/^_+$/.test(line)) {
        return `<div style="border-top: 1px solid #eab308; margin: 14px 0;"></div>`;
      }

      return `<p style="margin: 0 0 10px; line-height: 1.7; color: #1f2937;">${escapeHtml(line)}</p>`;
    })
    .join("");
}

function buildWmsuEmailShell(options: {
  title: string;
  subtitle: string;
  badgeText: string;
  summaryRows: Array<{ label: string; value: string }>;
  contentHtml: string;
  footerNote: string;
}) {
  const summaryHtml = options.summaryRows
    .map(
      (row) => `
        <tr>
          <td style="padding: 7px 0; color: #6b7280; font-size: 13px; width: 140px; vertical-align: top; border-bottom: 1px solid #f3f4f6;">${escapeHtml(row.label)}</td>
          <td style="padding: 7px 0; color: #111827; font-size: 13px; font-weight: 600; vertical-align: top; border-bottom: 1px solid #f3f4f6;">${escapeHtml(row.value)}</td>
        </tr>
      `
    )
    .join("");

  const _frontendBase = (process.env.FRONTEND_URL ?? "").replace(/\/$/, "");
  const logoUrl = _frontendBase ? `${_frontendBase}/wmsu-seal.png` : undefined;
  const logoLocalPath = path.resolve(__dirname, "../../frontend/public/wmsu-seal.png");
  const useInlineLogo = fs.existsSync(logoLocalPath);

  return `
    <!doctype html>
    <html>
      <head>
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
      </head>
      <body style="margin:0;padding:0;background:#ffffff;color:#111827;font-family: Arial, Helvetica, sans-serif;">
        <div style="max-width:680px;margin:0 auto;padding:20px;">
          <div style="border:0 solid transparent;background:#ffffff;">
            <div style="padding-bottom:12px;border-bottom:1px solid #f3f4f6;">
              <table role="presentation" style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="width:64px;vertical-align:middle;padding-right:8px;">
                    ${useInlineLogo ? `<img src="cid:wmsu_seal" alt="WMSU" width="56" height="56" style="display:block;border:0;border-radius:6px;"/>` : (logoUrl ? `<img src="${logoUrl}" alt="WMSU" width="56" height="56" style="display:block;border:0;border-radius:6px;"/>` : "")}
                  </td>
                  <td style="vertical-align:middle;">
                    <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#7f1d1d;font-weight:700;">Western Mindanao State University</p>
                    <p style="margin:6px 0 0;font-size:16px;font-weight:700;color:#111827;">Human Resource Management Office</p>
                  </td>
                </tr>
              </table>
            </div>

            <div style="padding:16px 0 0;">
              <h1 style="margin:0 0 8px;font-size:22px;color:#111827;">${escapeHtml(options.title)}</h1>
              <p style="margin:0 0 14px;color:#4b5563;font-size:14px;">${escapeHtml(options.subtitle)}</p>

              <table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:14px;">
                ${summaryHtml}
              </table>

              <div style="padding:12px;border:1px solid #eef2f7;border-radius:8px;background:#ffffff;">
                ${options.contentHtml}
              </div>

              <div style="margin-top:16px;padding-top:12px;border-top:1px solid #f3f4f6;color:#6b7280;font-size:12px;">
                <p style="margin:0 0 6px;font-weight:700;color:#7f1d1d;">WMSU HRMO</p>
                <p style="margin:0;">${escapeHtml(options.footerNote)}</p>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getFrontendBaseUrl(req?: Request) {
  return process.env.FRONTEND_URL ?? req?.get("origin") ?? "http://localhost:8080";
}

function buildPasswordResetUrl(token: string, req?: Request) {
  const baseUrl = getFrontendBaseUrl(req).replace(/\/$/, "");
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
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

  // Use hired template if status is Hired
  if (payload.status === "Hired") {
    const template = await fetchEmailTemplateByKey("hired") ?? DEFAULT_EMAIL_TEMPLATES.find((entry) => entry.template_key === "hired") ?? null;
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

  const bodyHtml = renderTextBlockHtml(body);
  const remarksHtml = payload.remarks
    ? `<div style="margin-top: 18px; padding: 14px 16px; background: #fff; border: 1px solid #f3d7ab; border-radius: 14px;"><p style="margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #7f1d1d;">Additional Remarks</p><p style="margin: 0; color: #374151; line-height: 1.6;">${escapeHtml(payload.remarks)}</p></div>`
    : "";

  const html = buildWmsuEmailShell({
    title: `Application Status Update: ${payload.status}`,
    subtitle: `${greeting}, ${payload.applicantName}. This is an official update from the WMSU Human Resource Management Office regarding your application for ${payload.jobTitle}.`,
    badgeText: payload.status,
    summaryRows: [
      { label: "Applicant", value: payload.applicantName },
      { label: "Position", value: payload.jobTitle },
      { label: "Status", value: payload.status },
      { label: "Date", value: formattedDate },
    ],
    contentHtml: `
      <div style="font-size: 15px; line-height: 1.75; color: #1f2937;">${bodyHtml}</div>
      ${remarksHtml}
    `,
    footerNote: "This is an auto-generated email from the WMSU HRMO. Please do not reply to this message."
  });

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

  const logoLocalPath = path.resolve(__dirname, "../../frontend/public/wmsu-seal.png");
  const attachments: Array<any> = [];
  if (fs.existsSync(logoLocalPath)) {
    attachments.push({ filename: "wmsu-seal.png", path: logoLocalPath, cid: "wmsu_seal" });
  }

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: payload.applicantEmail,
    subject,
    html,
    attachments: attachments.length ? attachments : undefined
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

async function sendPasswordResetEmail(payload: {
  email: string;
  name: string;
  resetUrl: string;
}) {
  const subject = "Reset your WMSU HRMO password";
  const html = buildWmsuEmailShell({
    title: "Password Reset Request",
    subtitle: `Good day, ${payload.name}. We received a request to reset the password for your WMSU HRMO account.`,
    badgeText: "Security Notice",
    summaryRows: [
      { label: "Recipient", value: payload.name },
      { label: "Email", value: payload.email },
    ],
    contentHtml: `
      <p style="margin: 0 0 14px; line-height: 1.75; color: #374151;">Click the button below to continue resetting your password.</p>
      <div style="text-align: center; margin: 18px 0 20px;">
        <a href="${escapeHtml(payload.resetUrl)}" style="display: inline-block; background: linear-gradient(135deg, #7f1d1d, #b91c1c); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 22px; border-radius: 999px; box-shadow: 0 10px 24px rgba(127, 29, 29, 0.22);">Reset Password</a>
      </div>
      <p style="margin: 0; line-height: 1.7; color: #6b7280; font-size: 13px;">If the button does not work, copy and paste this link into your browser:</p>
      <p style="margin: 8px 0 0; word-break: break-all; line-height: 1.6; color: #1d4ed8; font-size: 13px;">${escapeHtml(payload.resetUrl)}</p>
      <div style="margin-top: 18px; padding: 14px 16px; background: #fff; border: 1px solid #f3d7ab; border-radius: 14px;">
        <p style="margin: 0; color: #374151; line-height: 1.6;">If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
    footerNote: "This password reset link was generated by the WMSU HRMO system. If you did not request it, no action is needed."
  });

  if (!EMAIL_ENABLED) {
    console.log(`[Email disabled] Password reset for: ${payload.email} | ${payload.resetUrl}`);
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

  const logoLocalPath2 = path.resolve(__dirname, "../../frontend/public/wmsu-seal.png");
  const attachments2: Array<any> = [];
  if (fs.existsSync(logoLocalPath2)) {
    attachments2.push({ filename: "wmsu-seal.png", path: logoLocalPath2, cid: "wmsu_seal" });
  }

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: payload.email,
    subject,
    html,
    attachments: attachments2.length ? attachments2 : undefined
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
  telephoneNumber: string;
  email: string;
  address: string;
  permanentAddress: string;
  dateOfBirth: string;
  placeOfBirth: string;
  sex: string;
  civilStatus: string;
  citizenship: string;
  height: string;
  weight: string;
  bloodType: string;
  gsisIdNo: string;
  philsysNo: string;
  pagibigIdNo: string;
  philhealthNo: string;
  citizenshipDetails: string;
  sssNo: string;
  tinNo: string;
  agencyEmployeeNo: string;
  spouseName: string;
  spouseSurname: string;
  spouseFirstName: string;
  spouseMiddleName: string;
  spouseNameExtension: string;
  spouseOccupation: string;
  spouseEmployerBusinessName: string;
  spouseBusinessAddress: string;
  spouseTelephoneNo: string;
  childrenInfo: string;
  fatherName: string;
  fatherSurname: string;
  fatherFirstName: string;
  fatherMiddleName: string;
  fatherNameExtension: string;
  motherName: string;
  motherSurname: string;
  motherFirstName: string;
  motherMiddleName: string;
  civilServiceEligibility: string;
  voluntaryWork: string;
  trainings: string;
  otherInfo: string;
  referencesInfo: string;
  educationalBackground: string;
  workExperience: string;
  rawTextLength: number;
};

function cleanupExtractedText(value: string) {
  return value
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/(?<!\n)(Name Details|Surname|First Name|Middle Name|Name Extension|Date of Birth|Place of Birth|Sex|Civil Status|Citizenship|Residential Address|Permanent Address|Contact Number|Phone|Mobile|Email|Address|Location|Educational Background|Education|Work Experience|Experience)\b/gi, "\n$1")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitExtractedLines(text: string) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSingleLineValue(value: string) {
  return value.replace(/\s+/g, " ").replace(/^[:\-\s]+|[:\-\s]+$/g, "").trim();
}

function isLikelyPdsHeading(value: string) {
  return /personal data sheet|personal information|family background|educational background|civil service eligibility|work experience|voluntary work|learning and development|other information|references|surname|first name|middle name|name extension|residential address|permanent address|date of birth|place of birth|sex|civil status|citizenship|height|weight|blood type/i.test(value);
}

function extractValueNearLabel(lines: string[], labels: string[], stopLabels: string[] = [], maxLookahead = 3) {
  const labelPattern = labels.map((label) => escapeRegex(label)).join("|");
  const stopPattern = stopLabels.length ? stopLabels.map((label) => escapeRegex(label)).join("|") : "";
  const labelRegex = new RegExp(`(?:${labelPattern})`, "i");
  const stopRegex = stopPattern ? new RegExp(`(?:${stopPattern})`, "i") : null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!labelRegex.test(line)) continue;

    const inlineValue = normalizeSingleLineValue(
      line.replace(new RegExp(`^.*?(?:${labelPattern})\\s*[:=\\-]?\\s*`, "i"), "")
    );
    if (inlineValue && !labelRegex.test(inlineValue) && !stopRegex?.test(inlineValue) && !isLikelyPdsHeading(inlineValue)) {
      return inlineValue;
    }

    const collected: string[] = [];
    for (let offset = 1; offset <= maxLookahead; offset += 1) {
      const nextLine = lines[index + offset];
      if (!nextLine) break;
      if (labelRegex.test(nextLine) || stopRegex?.test(nextLine) || isLikelyPdsHeading(nextLine)) {
        break;
      }
      collected.push(nextLine);
      if (collected.join(" ").length >= 3) {
        break;
      }
    }

    if (collected.length > 0) {
      const candidate = normalizeSingleLineValue(collected.join(" "));
      if (candidate && !labelRegex.test(candidate) && !stopRegex?.test(candidate) && !isLikelyPdsHeading(candidate)) {
        return candidate;
      }
    }
  }

  return "";
}

function extractChoiceNearLabel(lines: string[], labels: string[], choices: string[], stopLabels: string[] = []) {
  const labelPattern = labels.map((label) => escapeRegex(label)).join("|");
  const stopPattern = stopLabels.length ? stopLabels.map((label) => escapeRegex(label)).join("|") : "";
  const labelRegex = new RegExp(`(?:${labelPattern})`, "i");
  const stopRegex = stopPattern ? new RegExp(`(?:${stopPattern})`, "i") : null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!labelRegex.test(line)) continue;

    const candidates = [
      normalizeSingleLineValue(line),
      normalizeSingleLineValue(lines[index + 1] ?? ""),
      normalizeSingleLineValue(lines[index + 2] ?? "")
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (stopRegex?.test(candidate)) continue;
      for (const choice of choices) {
        if (new RegExp(`\\b${escapeRegex(choice)}\\b`, "i").test(candidate)) {
          return choice;
        }
      }
    }
  }

  return "";
}

function normalizeDateCandidate(value: string) {
  const cleaned = value.replace(/[^\d/\-]/g, " ").replace(/\s+/g, " ").trim();
  const match = cleaned.match(/(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{1,4})/);
  if (!match) return "";

  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = Number(match[3]);

  const pad = (n: number) => String(n).padStart(2, "0");

  if (match[1].length === 4) {
    return `${match[1]}-${pad(second)}-${pad(third)}`;
  }

  if (match[3].length === 4) {
    if (first > 12 && second <= 12) {
      return `${match[3]}-${pad(second)}-${pad(first)}`;
    }

    if (second > 12 && first <= 12) {
      return `${match[3]}-${pad(first)}-${pad(second)}`;
    }

    return `${match[3]}-${pad(first)}-${pad(second)}`;
  }

  if (match[1].length === 2 && match[3].length === 2) {
    return `${match[3].length === 2 ? `20${match[3]}` : match[3]}-${pad(first)}-${pad(second)}`;
  }

  return "";
}

function extractLabeledValue(text: string, labels: string[], stopLabels: string[] = []) {
  const labelPart = labels.map((label) => escapeRegex(label)).join("|");
  const stopPart = stopLabels.length ? stopLabels.map((label) => escapeRegex(label)).join("|") : "";

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
  const excluded = /resume|curriculum vitae|profile|contact|email|phone|address|education|experience|objective|summary|personal data sheet|personal information|family background|educational background|civil service eligibility|work experience|voluntary work|learning and development|other information|references|surname|first name|middle name|name extension|residential address|permanent address|date of birth|place of birth|sex|civil status|citizenship|height|weight|blood type|elementary|secondary|college|vocational|graduate studies|school/i;
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

function titleCaseName(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .trim();
}

function extractNameFromPds(text: string) {
  const lines = splitExtractedLines(text);
  const surname = extractValueNearLabel(lines, ["surname", "last name"], ["first name", "middle name", "name extension", "date of birth", "sex", "civil status", "citizenship", "height", "weight", "blood type"]);
  const firstName = extractValueNearLabel(lines, ["first name", "given name"], ["surname", "middle name", "name extension", "date of birth", "sex", "civil status", "citizenship", "height", "weight", "blood type"]);
  const middleName = extractValueNearLabel(lines, ["middle name"], ["surname", "first name", "name extension", "date of birth", "sex", "civil status", "citizenship", "height", "weight", "blood type"]);
  const extensionName = extractValueNearLabel(lines, ["name extension"], ["surname", "first name", "middle name", "date of birth", "sex", "civil status", "citizenship", "height", "weight", "blood type"]);

  const orderedParts = [firstName, middleName, surname, extensionName]
    .map(normalizeSingleLineValue)
    .filter((part) => Boolean(part) && !isLikelyPdsHeading(part));

  if (orderedParts.length > 0) {
    return titleCaseName(orderedParts.join(" "));
  }

  const fallback = pickNameCandidate(lines);
  return fallback ? titleCaseName(fallback) : "";
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

// ==================== ENHANCED PHILIPPINE PDS EXTRACTION ====================

function extractTelephoneNumber(text: string): string {
  const match = text.match(/(?:Telephone|Tel|Phone|Contact)\s*(?:Number|No\.?)?\s*[:=]?\s*([+\d\s\-()\.]{6,30})/i);
  return match ? match[1].replace(/\D+/g, "").slice(0, 20) : "";
}

function extractDateOfBirth(text: string): string {
  const lines = splitExtractedLines(text);
  const labeled = extractValueNearLabel(lines, ["date of birth", "dob", "born"], ["place of birth", "sex", "civil status", "citizenship", "height", "weight", "blood type"]);
  const normalizedLabeled = normalizeDateCandidate(labeled);
  if (normalizedLabeled) return normalizedLabeled;

  const patterns = [
    /Date\s+of\s+Birth\s*[:=]?\s*([0-9]{1,2}[-\/]?[0-9]{1,2}[-\/]?[0-9]{2,4})/i,
    /DOB\s*[:=]?\s*([0-9]{1,2}[-\/]?[0-9]{1,2}[-\/]?[0-9]{2,4})/i,
    /Born\s*[:=]?\s*([0-9]{1,2}[-\/]?[0-9]{1,2}[-\/]?[0-9]{2,4})/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return normalizeDateCandidate(match[1]);
  }
  return "";
}

function extractPlaceOfBirth(text: string): string {
  const match = text.match(/Place\s+of\s+Birth\s*[:=]?\s*([^\n]{3,100})/i);
  return match ? match[1].trim().slice(0, 100) : "";
}

function extractPermanentAddress(text: string): string {
  const lines = splitExtractedLines(text);
  const labeled = extractValueNearLabel(lines, ["permanent address"], ["current address", "residential address", "telephone", "email", "contact", "date of birth", "civil status", "citizenship", "sex", "height", "weight"]);
  if (labeled) return labeled.slice(0, 200);

  const match = text.match(/Permanent\s+Address\s*[:=]?\s*([^\n]{5,200})/i);
  return match ? normalizeSingleLineValue(match[1]).slice(0, 200) : extractLabeledValue(text, ["permanent address"], ["current address", "temporary"]).slice(0, 200);
}

function extractCurrentAddress(text: string): string {
  const lines = splitExtractedLines(text);
  const labeled = extractValueNearLabel(lines, ["current address", "residential address", "address"], ["permanent address", "telephone", "email", "contact", "date of birth", "civil status", "citizenship", "sex", "height", "weight"]);
  if (labeled) return labeled.slice(0, 200);

  const match = text.match(/(?:Current|Residential)\s+Address\s*[:=]?\s*([^\n]{5,200})/i);
  return match ? normalizeSingleLineValue(match[1]).slice(0, 200) : extractLabeledValue(text, ["address", "residential"], ["permanent", "contact"]).slice(0, 200);
}

function extractSex(text: string): string {
  const lines = splitExtractedLines(text);
  return extractChoiceNearLabel(lines, ["sex", "gender"], ["Male", "Female"], ["civil status", "citizenship", "height", "weight", "blood type"])
    || (/\b(?:female|girl|woman)\b/i.test(text) ? "Female" : /\b(?:male|boy|man)\b/i.test(text) ? "Male" : "");
}

function extractCivilStatus(text: string): string {
  const lines = splitExtractedLines(text);
  const statuses = ["Single", "Married", "Widowed", "Separated", "Divorced"];
  return extractChoiceNearLabel(lines, ["civil status"], statuses, ["citizenship", "height", "weight", "blood type"]) ||
    statuses.find((s) => new RegExp(`\\b${s}\\b`, "i").test(text)) || "";
}

function extractCitizenship(text: string): string {
  const lines = splitExtractedLines(text);
  const choices = ["Filipino", "Dual Citizenship", "Natural Born Filipino", "Naturalized Filipino"];
  const labeled = extractChoiceNearLabel(lines, ["citizenship"], choices, ["height", "weight", "blood type", "residential address", "permanent address"]);
  if (labeled) return labeled;

  if (/\b(?:dual citizenship)\b/i.test(text)) return "Dual Citizenship";
  if (/\b(?:natural born|naturalized|foreign|alien|foreigner)\b/i.test(text)) {
    return /\bnatural\s+born\b/i.test(text) ? "Natural Born Filipino" : "Naturalized Filipino";
  }
  if (/\bFilipino\b/i.test(text)) return "Natural Born Filipino";
  return "";
}

function extractCitizenshipDetails(text: string): string {
  const lines = splitExtractedLines(text);
  const labeled = extractValueNearLabel(lines, ["citizenship details", "dual citizenship"], ["height", "weight", "blood type", "residential address", "permanent address"]);
  if (labeled) {
    return normalizeSingleLineValue(labeled).slice(0, 200);
  }

  const match = text.match(/Dual\s+Citizenship\s*[:=]?\s*(?:By\s+(Birth|Naturalization))?\s*(.{0,100})/i);
  if (match) return `By ${match[1] || ""}${match[2] ? ": " + match[2] : ""}`.trim();
  return "";
}

function extractMeasurement(text: string, keywords: string[]): string {
  for (const keyword of keywords) {
    const pattern = new RegExp(`${keyword}\\s*[:=]?\\s*([0-9]{1,3}(?:\\.[0-9]{1,2})?\\s*(?:cm|ft|lbs|kg)?)`, "i");
    const match = text.match(pattern);
    if (match) return match[1].slice(0, 20);
  }
  return "";
}

function extractBloodType(text: string): string {
  const match = text.match(/Blood\s+Type\s*[:=]?\s*([OAB]{1,2}(?:[+-])?)/i);
  return match ? match[1] : "";
}

// Philippine ID Numbers
function extractGSIS(text: string): string {
  const match = text.match(/GSIS\s*(?:No\.?|ID\s*No\.?|Number)?\s*[:=]?\s*([0-9\s-]{6,20})/i);
  return match ? match[1].replace(/\s+/g, "").slice(0, 20) : "";
}

function extractSSS(text: string): string {
  const match = text.match(/SSS\s*(?:No\.?|ID\s*No\.?|Number)?\s*[:=]?\s*([0-9\s-]{6,20})/i);
  return match ? match[1].replace(/\s+/g, "").slice(0, 20) : "";
}

function extractTIN(text: string): string {
  const match = text.match(/TIN\s*(?:No\.?|ID\s*No\.?|Number)?\s*[:=]?\s*([0-9\s-]{6,20})/i);
  return match ? match[1].replace(/\s+/g, "").slice(0, 20) : "";
}

function extractPagibig(text: string): string {
  const match = text.match(/Pag[_-]?Ibig\s*(?:No\.?|ID\s*No\.?|Number)?\s*[:=]?\s*([0-9\s-]{6,20})/i);
  return match ? match[1].replace(/\s+/g, "").slice(0, 20) : "";
}

function extractPhilHealth(text: string): string {
  const match = text.match(/Phil[_-]?Health\s*(?:No\.?|ID\s*No\.?|Number)?\s*[:=]?\s*([0-9\s-]{6,20})/i);
  return match ? match[1].replace(/\s+/g, "").slice(0, 20) : "";
}

function extractPhilSys(text: string): string {
  const match = text.match(/Phil[_-]?Sys\s*(?:No\.?|ID\s*No\.?|Number)?\s*[:=]?\s*([0-9\s-]{6,20})/i);
  return match ? match[1].replace(/\s+/g, "").slice(0, 20) : "";
}

function extractAgencyNumber(text: string): string {
  const match = text.match(/Agency\s+(?:Employee\s+)?No\.?\s*[:=]?\s*([0-9\s-]{4,20})/i);
  return match ? match[1].replace(/\s+/g, "").slice(0, 20) : "";
}

// Family Information
function extractSpouseName(text: string): string {
  const section = extractLabeledValue(text, ["spouse", "husband", "wife"], []).slice(0, 200);
  const match = section.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
  return match ? match[1] : "";
}

function extractSpouseSurname(text: string): string {
  const spouseName = extractSpouseName(text);
  const parts = spouseName.split(/\s+/);
  return parts[0] || "";
}

function extractSpouseFirstName(text: string): string {
  const spouseName = extractSpouseName(text);
  const parts = spouseName.split(/\s+/);
  return parts[1] || "";
}

function extractSpouseMiddleName(text: string): string {
  const spouseName = extractSpouseName(text);
  const parts = spouseName.split(/\s+/);
  return parts[2] || "";
}

function extractSpouseOccupation(text: string): string {
  const match = text.match(/Spouse\s+(?:Occupation|Job)\s*[:=]?\s*([^\n]{2,100})/i);
  return match ? match[1].trim().slice(0, 100) : "";
}

function extractSpouseEmployer(text: string): string {
  const match = text.match(/Spouse\s+(?:Employer|Company|Business\s+Name)\s*[:=]?\s*([^\n]{2,100})/i);
  return match ? match[1].trim().slice(0, 100) : "";
}

function extractSpouseAddress(text: string): string {
  const match = text.match(/Spouse\s+(?:Business\s+)?Address\s*[:=]?\s*([^\n]{2,200})/i);
  return match ? match[1].trim().slice(0, 200) : "";
}

function extractSpouseTelephone(text: string): string {
  const match = text.match(/Spouse\s+(?:Telephone|Phone|Contact)\s*[:=]?\s*([+\d\s\-()\.]{6,30})/i);
  return match ? match[1].replace(/\D+/g, "").slice(0, 20) : "";
}

function extractChildrenInfo(text: string): string {
  const section = pickSection(text, ["children", "child", "dependents"]);
  return section.slice(0, 500);
}

function extractFatherName(text: string): string {
  const section = extractLabeledValue(text, ["father", "paternal"], []).slice(0, 200);
  const match = section.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
  return match ? match[1] : "";
}

function extractFatherSurname(text: string): string {
  const fatherName = extractFatherName(text);
  const parts = fatherName.split(/\s+/);
  return parts[0] || "";
}

function extractFatherFirstName(text: string): string {
  const fatherName = extractFatherName(text);
  const parts = fatherName.split(/\s+/);
  return parts[1] || "";
}

function extractFatherMiddleName(text: string): string {
  const fatherName = extractFatherName(text);
  const parts = fatherName.split(/\s+/);
  return parts[2] || "";
}

function extractMotherName(text: string): string {
  const section = extractLabeledValue(text, ["mother", "maternal"], []).slice(0, 200);
  const match = section.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
  return match ? match[1] : "";
}

function extractMotherSurname(text: string): string {
  const motherName = extractMotherName(text);
  const parts = motherName.split(/\s+/);
  return parts[0] || "";
}

function extractMotherFirstName(text: string): string {
  const motherName = extractMotherName(text);
  const parts = motherName.split(/\s+/);
  return parts[1] || "";
}

function extractMotherMiddleName(text: string): string {
  const motherName = extractMotherName(text);
  const parts = motherName.split(/\s+/);
  return parts[2] || "";
}

// Helper: Normalize dates to YYYY-MM-DD
function normalizeDate(dateStr: string): string {
  const cleaned = dateStr.replace(/[^\d/-]/g, "");
  const parts = cleaned.split(/[-/]/);
  
  if (parts.length === 3) {
    let [first, second, third] = parts.map(p => p.trim());
    
    // Detect format and normalize
    if (parseInt(third) > 31) {
      // Format: YYYY-MM-DD or YYYY-DD-MM
      return `${third}-${first.padStart(2, "0")}-${second.padStart(2, "0")}`;
    } else if (parseInt(first) > 31) {
      // Format: YYYY-MM-DD
      return `${first}-${second.padStart(2, "0")}-${third.padStart(2, "0")}`;
    } else {
      // Format: DD-MM-YYYY or MM-DD-YYYY - assume DD-MM-YYYY
      return `${third}-${second.padStart(2, "0")}-${first.padStart(2, "0")}`;
    }
  }
  return dateStr;
}

function parseApplicantDraftFromText(rawText: string): ParsedApplicantDraft {
  const text = cleanupExtractedText(rawText);
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);

  // Extract basic contact info
  const labeledEmail = extractLabeledValue(text, ["email", "e-mail"], ["phone", "mobile", "contact", "address"]);
  const emailMatch = normalizeEmailCandidate(labeledEmail) || extractEmailFromText(text);
  const contactNumber = extractPhoneNumber(text);
  const addressMatch = extractCurrentAddress(text) || extractLabeledValue(text, ["address", "location"], ["education", "experience"]);

  return {
    fullName: extractNameFromPds(text).slice(0, 120),
    contactNumber: contactNumber.slice(0, 20),
    telephoneNumber: extractTelephoneNumber(text).slice(0, 20),
    email: emailMatch.slice(0, 120),
    address: (addressMatch || pickAddressCandidate(lines)).slice(0, 200),
    permanentAddress: extractPermanentAddress(text).slice(0, 200),
    
    // Personal Info
    dateOfBirth: extractDateOfBirth(text).slice(0, 10),
    placeOfBirth: extractPlaceOfBirth(text).slice(0, 100),
    sex: extractSex(text),
    civilStatus: extractCivilStatus(text),
    citizenship: extractCitizenship(text),
    height: extractMeasurement(text, ["height"]).slice(0, 20),
    weight: extractMeasurement(text, ["weight"]).slice(0, 20),
    bloodType: extractBloodType(text).slice(0, 5),
    
    // Government IDs
    gsisIdNo: extractGSIS(text).slice(0, 20),
    philsysNo: extractPhilSys(text).slice(0, 20),
    pagibigIdNo: extractPagibig(text).slice(0, 20),
    philhealthNo: extractPhilHealth(text).slice(0, 20),
    citizenshipDetails: extractCitizenshipDetails(text).slice(0, 200),
    sssNo: extractSSS(text).slice(0, 20),
    tinNo: extractTIN(text).slice(0, 20),
    agencyEmployeeNo: extractAgencyNumber(text).slice(0, 20),
    
    // Spouse Info
    spouseName: extractSpouseName(text).slice(0, 120),
    spouseSurname: extractSpouseSurname(text).slice(0, 60),
    spouseFirstName: extractSpouseFirstName(text).slice(0, 60),
    spouseMiddleName: extractSpouseMiddleName(text).slice(0, 60),
    spouseNameExtension: "",
    spouseOccupation: extractSpouseOccupation(text).slice(0, 100),
    spouseEmployerBusinessName: extractSpouseEmployer(text).slice(0, 100),
    spouseBusinessAddress: extractSpouseAddress(text).slice(0, 200),
    spouseTelephoneNo: extractSpouseTelephone(text).slice(0, 20),
    
    // Children
    childrenInfo: extractChildrenInfo(text).slice(0, 500),
    
    // Father Info
    fatherName: extractFatherName(text).slice(0, 120),
    fatherSurname: extractFatherSurname(text).slice(0, 60),
    fatherFirstName: extractFatherFirstName(text).slice(0, 60),
    fatherMiddleName: extractFatherMiddleName(text).slice(0, 60),
    fatherNameExtension: "",
    
    // Mother Info
    motherName: extractMotherName(text).slice(0, 120),
    motherSurname: extractMotherSurname(text).slice(0, 60),
    motherFirstName: extractMotherFirstName(text).slice(0, 60),
    motherMiddleName: extractMotherMiddleName(text).slice(0, 60),
    
    // Professional Background
    educationalBackground: pickSection(text, ["education", "educational background", "academic background"]).slice(0, 500),
    workExperience: pickSection(text, ["work experience", "employment history", "experience"]).slice(0, 500),
    civilServiceEligibility: pickSection(text, ["civil service eligibility", "civil service exam"]).slice(0, 200),
    voluntaryWork: pickSection(text, ["voluntary work", "volunteer"]).slice(0, 300),
    trainings: pickSection(text, ["trainings", "training", "seminars", "courses"]).slice(0, 300),
    otherInfo: pickSection(text, ["other information", "additional info", "remarks"]).slice(0, 300),
    referencesInfo: pickSection(text, ["references", "references"]).slice(0, 300),
    
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

app.post("/api/auth/forgot-password", authLimiter, asyncHandler(async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email?.trim()) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await fetchOne<{ id: string; name: string; email: string; is_active: boolean }>(
    "SELECT id, name, email, is_active FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
    [normalizedEmail]
  );

  if (!user || user.is_active === false) {
    logAudit(req, "password_reset_requested", undefined, { email: normalizedEmail, found: false });
    res.json({ message: "If an account exists for that email, a reset link has been sent." });
    return;
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashPasswordResetToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS).toISOString();

  await query("DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL", [user.id]);
  await query(
    "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)",
    [randomUUID(), user.id, tokenHash, expiresAt, now.toISOString()]
  );

  const resetUrl = buildPasswordResetUrl(token, req);
  const emailResult = await sendPasswordResetEmail({
    email: user.email,
    name: user.name,
    resetUrl
  });

  logAudit(req, emailResult.sent ? "password_reset_email_sent" : "password_reset_email_disabled", user.id, {
    email: user.email,
    providerResponse: emailResult.providerResponse
  });

  res.json({ message: "If an account exists for that email, a reset link has been sent." });
}));

app.post("/api/auth/reset-password", authLimiter, asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };
  if (!token?.trim() || !newPassword || isWeakPassword(newPassword)) {
    res.status(400).json({ error: "Token and a strong new password are required (minimum 8 characters with mixed character types)." });
    return;
  }

  const tokenHash = hashPasswordResetToken(token.trim());
  const now = new Date().toISOString();
  const result = await query<{
    user_id: string;
  }>(
    `
      WITH valid_token AS (
        UPDATE password_reset_tokens
        SET used_at = $3
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > $3
        RETURNING user_id
      )
      UPDATE users
      SET password_hash = $2
      WHERE id = (SELECT user_id FROM valid_token)
      RETURNING id AS user_id
    `,
    [tokenHash, bcrypt.hashSync(newPassword, 10), now]
  );

  if (result.rowCount === 0) {
    res.status(400).json({ error: "The reset link is invalid or has expired." });
    return;
  }

  logAudit(req, "password_reset_completed", undefined, { userId: result.rows[0].user_id });
  res.json({ message: "Password reset successful." });
}));

app.post("/api/auth/change-password", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };

  if (!currentPassword || !newPassword || isWeakPassword(newPassword)) {
    res.status(400).json({ error: "currentPassword and a strong new password are required (minimum 8 characters with mixed character types)." });
    return;
  }

  const user = await fetchOne<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE id = $1 LIMIT 1",
    [req.user?.id]
  );

  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    res.status(400).json({ error: "Current password is incorrect." });
    return;
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  await query("UPDATE users SET password_hash = $2 WHERE id = $1", [user.id, passwordHash]);

  logAudit(req, "password_changed", req.user?.id, {
    targetUserId: req.user?.id,
    selfService: true
  });

  res.json({ message: "Password updated successfully." });
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

  if (isWeakPassword(password)) {
    res.status(400).json({ error: "Password is too weak. Use at least 8 characters with mixed character types." });
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

  if (password && isWeakPassword(password)) {
    res.status(400).json({ error: "Password is too weak. Use at least 8 characters with mixed character types." });
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
  if (!newPassword || isWeakPassword(newPassword)) {
    res.status(400).json({ error: "newPassword must be strong (minimum 8 characters with mixed character types)." });
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

app.post("/api/departments", requireAuth, requireAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  const name = String(req.body.name ?? "").trim();
  if (!name) {
    res.status(400).json({ error: "Department name is required" });
    return;
  }

  const existing = await query<{ id: string; name: string }>(
    "SELECT id, name FROM departments WHERE LOWER(name) = LOWER($1) LIMIT 1",
    [name]
  );
  if ((existing.rowCount ?? 0) > 0) {
    res.status(200).json(existing.rows[0]);
    return;
  }

  const id = randomUUID();
  await query("INSERT INTO departments (id, name) VALUES ($1, $2)", [id, name]);
  res.status(201).json({ id, name });
}));

app.delete("/api/departments/:id", requireAuth, requireAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  const departmentId = String(req.params.id ?? "").trim();
  if (!departmentId) {
    res.status(400).json({ error: "Department id is required" });
    return;
  }

  const usage = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM applications app
       INNER JOIN job_vacancies job ON job.id = app.vacancy_id
      WHERE job.department_id = $1`,
    [departmentId]
  );
  const count = Number(usage.rows[0]?.count ?? "0");
  if (count > 0) {
    res.status(409).json({ error: "Department is in use" });
    return;
  }

  const deletedVacancies = await query("DELETE FROM job_vacancies WHERE department_id = $1", [departmentId]);

  const result = await query("DELETE FROM departments WHERE id = $1", [departmentId]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Department not found" });
    return;
  }

  res.json({ deleted: deletedVacancies.rowCount ?? 0 });
}));

app.get("/api/position-titles", asyncHandler(async (_req, res) => {
  const customRows = await query<{ id: string; title: string }>("SELECT id, title FROM position_titles ORDER BY title");
  const customTitles = customRows.rows.map((r) => r.title?.trim()).filter((t): t is string => Boolean(t));

  const merged = Array.from(new Set([...customTitles]))
    .sort((a, b) => a.localeCompare(b));
  res.json(merged);
}));

app.get("/api/position-titles/custom", requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const rows = await query<{ id: string; title: string }>("SELECT id, title FROM position_titles ORDER BY title");
  res.json(rows.rows.map((r) => ({ id: r.id, title: r.title })));
}));

app.post("/api/position-titles", requireAuth, requireAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  const title = String(req.body.title ?? "").trim();
  if (!title) {
    res.status(400).json({ error: "Title is required" });
    return;
  }

  const id = randomUUID();
  try {
    await query("INSERT INTO position_titles (id, title) VALUES ($1, $2)", [id, title]);
    res.status(201).json({ id, title });
  } catch (err) {
    // Unique constraint
    const existing = await query<{ id: string; title: string }>("SELECT id, title FROM position_titles WHERE LOWER(title)=LOWER($1)", [title]);
    if (existing && (existing.rowCount ?? 0) > 0) {
      res.status(200).json(existing.rows[0]);
      return;
    }
    throw err;
  }
}));

app.delete("/api/position-titles/:id", requireAuth, requireAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  const result = await query("DELETE FROM position_titles WHERE id = $1", [req.params.id]);
  if (result.rowCount === 0) {
    res.status(404).json({ error: "Position title not found" });
    return;
  }
  res.status(204).send();
}));

app.delete("/api/jobs/by-title/:title", requireAuth, requireAdmin, asyncHandler(async (req: AuthedRequest, res) => {
  const title = String(req.params.title ?? "").trim();
  if (!title) {
    res.status(400).json({ error: "Title is required" });
    return;
  }

  const locked = await query(
    `SELECT 1
       FROM applications app
       INNER JOIN job_vacancies job ON job.id = app.vacancy_id
      WHERE LOWER(job.position_title) = LOWER($1)
      LIMIT 1`,
    [title]
  );
  if ((locked.rowCount ?? 0) > 0) {
    res.status(409).json({ error: "Title is in use" });
    return;
  }

  await query("DELETE FROM position_titles WHERE LOWER(title) = LOWER($1)", [title]);
  const result = await query("DELETE FROM job_vacancies WHERE LOWER(position_title) = LOWER($1)", [title]);
  res.json({ deleted: result.rowCount ?? 0 });
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
  const {
    positionTitle,
    departmentId,
    plantillaNo,
    monthlyRate,
    salaryGrade,
    description,
    eligibility,
    trainings,
    competencies,
    educationalBackground,
    workExperience,
    qualifications,
    postingDate,
    closingDate,
    status,
    positionLevel
  } = req.body as any;
  if (!positionTitle || !departmentId || !salaryGrade || !postingDate || !closingDate || !status) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const normalizedDescription = String(description ?? qualifications ?? "");

  const job = {
    id: randomUUID(),
    positionTitle,
    departmentId,
    plantillaNo: String(plantillaNo ?? ""),
    monthlyRate: String(monthlyRate ?? ""),
    salaryGrade,
    description: normalizedDescription,
    eligibility: String(eligibility ?? ""),
    trainings: String(trainings ?? ""),
    competencies: String(competencies ?? ""),
    educationalBackground: String(educationalBackground ?? ""),
    workExperience: String(workExperience ?? ""),
    qualifications: normalizedDescription,
    postingDate,
    closingDate,
    status,
    positionLevel: positionLevel ?? "first_level"
  };

  await query(
    "INSERT INTO job_vacancies (id, position_title, department_id, plantilla_no, monthly_rate, salary_grade, description, eligibility, trainings, competencies, educational_background, work_experience, qualifications, posting_date, closing_date, status, position_level) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)",
    [
      job.id,
      job.positionTitle,
      job.departmentId,
      job.plantillaNo,
      job.monthlyRate,
      job.salaryGrade,
      job.description,
      job.eligibility,
      job.trainings,
      job.competencies,
      job.educationalBackground,
      job.workExperience,
      job.qualifications,
      job.postingDate,
      job.closingDate,
      job.status,
      job.positionLevel
    ]
  );

  res.status(201).json(job);
}));

app.put("/api/jobs/:id", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const {
    positionTitle,
    departmentId,
    plantillaNo,
    monthlyRate,
    salaryGrade,
    description,
    eligibility,
    trainings,
    competencies,
    educationalBackground,
    workExperience,
    qualifications,
    postingDate,
    closingDate,
    status,
    positionLevel
  } = req.body as any;
  const normalizedDescription = String(description ?? qualifications ?? "");
  const result = await query(
    "UPDATE job_vacancies SET position_title=$2, department_id=$3, plantilla_no=$4, monthly_rate=$5, salary_grade=$6, description=$7, eligibility=$8, trainings=$9, competencies=$10, educational_background=$11, work_experience=$12, qualifications=$13, posting_date=$14, closing_date=$15, status=$16, position_level=$17 WHERE id=$1 RETURNING *",
    [
      req.params.id,
      positionTitle,
      departmentId,
      String(plantillaNo ?? ""),
      String(monthlyRate ?? ""),
      salaryGrade,
      normalizedDescription,
      String(eligibility ?? ""),
      String(trainings ?? ""),
      String(competencies ?? ""),
      String(educationalBackground ?? ""),
      String(workExperience ?? ""),
      normalizedDescription,
      postingDate,
      closingDate,
      status,
      positionLevel ?? "first_level"
    ]
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
  const body = req.body as any;
  const fullName = String(body.fullName ?? "").trim();
  const contactNumber = String(body.contactNumber ?? "").trim();
  const email = String(body.email ?? "").trim();
  const address = String(body.address ?? "").trim();
  if (!fullName || !contactNumber || !email || !address) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  // Provide safe defaults for NOT NULL columns
  const educationalBackground = String(body.educationalBackground ?? "");
  const workExperience = String(body.workExperience ?? "");
  const telephoneNumber = String(body.telephoneNumber ?? "");
  const permanentAddress = String(body.permanentAddress ?? "");
  const dateOfBirth = String(body.dateOfBirth ?? "");
  const placeOfBirth = String(body.placeOfBirth ?? "");
  const sex = String(body.sex ?? "");
  const civilStatus = String(body.civilStatus ?? "");
  const citizenship = String(body.citizenship ?? "");
  const height = String(body.height ?? "");
  const weight = String(body.weight ?? "");
  const bloodType = String(body.bloodType ?? "");
  const gsisIdNo = String(body.gsisIdNo ?? "");
  const philsysNo = String(body.philsysNo ?? "");
  const pagibigIdNo = String(body.pagibigIdNo ?? "");
  const philhealthNo = String(body.philhealthNo ?? "");
  const citizenshipDetails = String(body.citizenshipDetails ?? "");
  const sssNo = String(body.sssNo ?? "");
  const tinNo = String(body.tinNo ?? "");
  const agencyEmployeeNo = String(body.agencyEmployeeNo ?? "");
  const spouseName = String(body.spouseName ?? "");
  const spouseSurname = String(body.spouseSurname ?? "");
  const spouseFirstName = String(body.spouseFirstName ?? "");
  const spouseMiddleName = String(body.spouseMiddleName ?? "");
  const spouseNameExtension = String(body.spouseNameExtension ?? "");
  const spouseOccupation = String(body.spouseOccupation ?? "");
  const spouseEmployerBusinessName = String(body.spouseEmployerBusinessName ?? "");
  const spouseBusinessAddress = String(body.spouseBusinessAddress ?? "");
  const spouseTelephoneNo = String(body.spouseTelephoneNo ?? "");
  const childrenInfo = String(body.childrenInfo ?? "");
  const fatherName = String(body.fatherName ?? "");
  const fatherSurname = String(body.fatherSurname ?? "");
  const fatherFirstName = String(body.fatherFirstName ?? "");
  const fatherMiddleName = String(body.fatherMiddleName ?? "");
  const fatherNameExtension = String(body.fatherNameExtension ?? "");
  const motherName = String(body.motherName ?? "");
  const motherSurname = String(body.motherSurname ?? "");
  const motherFirstName = String(body.motherFirstName ?? "");
  const motherMiddleName = String(body.motherMiddleName ?? "");
  const civilServiceEligibility = String(body.civilServiceEligibility ?? "");
  const voluntaryWork = String(body.voluntaryWork ?? "");
  const trainings = String(body.trainings ?? "");
  const otherInfo = String(body.otherInfo ?? "");
  const referencesInfo = String(body.referencesInfo ?? "");

  const applicantId = randomUUID();

  await query(
    `INSERT INTO applicants (
      id, full_name, contact_number, telephone_number, email, address, permanent_address,
      date_of_birth, place_of_birth, sex, civil_status, citizenship, height, weight, blood_type,
      gsis_id_no, philsys_no, pagibig_id_no, philhealth_no, citizenship_details, sss_no, tin_no, agency_employee_no,
      spouse_name, spouse_surname, spouse_first_name, spouse_middle_name, spouse_name_extension, spouse_occupation,
      spouse_employer_business_name, spouse_business_address, spouse_telephone_no, children_info,
      father_name, father_surname, father_first_name, father_middle_name, father_name_extension,
      mother_name, mother_surname, mother_first_name, mother_middle_name,
      civil_service_eligibility, voluntary_work, trainings, other_info, references_info,
      educational_background, work_experience
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49) 
    `,
    [
      applicantId,
      fullName,
      contactNumber,
      telephoneNumber,
      email,
      address,
      permanentAddress,
      dateOfBirth,
      placeOfBirth,
      sex,
      civilStatus,
      citizenship,
      height,
      weight,
      bloodType,
      gsisIdNo,
      philsysNo,
      pagibigIdNo,
      philhealthNo,
      citizenshipDetails,
      sssNo,
      tinNo,
      agencyEmployeeNo,
      spouseName,
      spouseSurname,
      spouseFirstName,
      spouseMiddleName,
      spouseNameExtension,
      spouseOccupation,
      spouseEmployerBusinessName,
      spouseBusinessAddress,
      spouseTelephoneNo,
      childrenInfo,
      fatherName,
      fatherSurname,
      fatherFirstName,
      fatherMiddleName,
      fatherNameExtension,
      motherName,
      motherSurname,
      motherFirstName,
      motherMiddleName,
      civilServiceEligibility,
      voluntaryWork,
      trainings,
      otherInfo,
      referencesInfo,
      educationalBackground,
      workExperience
    ]
  );

  res.status(201).json({ id: applicantId, fullName, contactNumber, email, address, educationalBackground, workExperience });
}));

app.put("/api/applicants/:id", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const b = req.body as any;
  const result = await query(
    `UPDATE applicants SET
      full_name=$2, contact_number=$3, telephone_number=$4, email=$5, address=$6, permanent_address=$7,
      date_of_birth=$8, place_of_birth=$9, sex=$10, civil_status=$11, citizenship=$12, height=$13, weight=$14, blood_type=$15,
      gsis_id_no=$16, philsys_no=$17, pagibig_id_no=$18, philhealth_no=$19, citizenship_details=$20, sss_no=$21, tin_no=$22, agency_employee_no=$23,
      spouse_name=$24, spouse_surname=$25, spouse_first_name=$26, spouse_middle_name=$27, spouse_name_extension=$28, spouse_occupation=$29,
      spouse_employer_business_name=$30, spouse_business_address=$31, spouse_telephone_no=$32, children_info=$33,
      father_name=$34, father_surname=$35, father_first_name=$36, father_middle_name=$37, father_name_extension=$38,
      mother_name=$39, mother_surname=$40, mother_first_name=$41, mother_middle_name=$42,
      civil_service_eligibility=$43, voluntary_work=$44, trainings=$45, other_info=$46, references_info=$47,
      educational_background=$48, work_experience=$49
    WHERE id=$1 RETURNING *`,
    [
      req.params.id,
      String(b.fullName ?? ""),
      String(b.contactNumber ?? ""),
      String(b.telephoneNumber ?? ""),
      String(b.email ?? ""),
      String(b.address ?? ""),
      String(b.permanentAddress ?? ""),
      String(b.dateOfBirth ?? ""),
      String(b.placeOfBirth ?? ""),
      String(b.sex ?? ""),
      String(b.civilStatus ?? ""),
      String(b.citizenship ?? ""),
      String(b.height ?? ""),
      String(b.weight ?? ""),
      String(b.bloodType ?? ""),
      String(b.gsisIdNo ?? ""),
      String(b.philsysNo ?? ""),
      String(b.pagibigIdNo ?? ""),
      String(b.philhealthNo ?? ""),
      String(b.citizenshipDetails ?? ""),
      String(b.sssNo ?? ""),
      String(b.tinNo ?? ""),
      String(b.agencyEmployeeNo ?? ""),
      String(b.spouseName ?? ""),
      String(b.spouseSurname ?? ""),
      String(b.spouseFirstName ?? ""),
      String(b.spouseMiddleName ?? ""),
      String(b.spouseNameExtension ?? ""),
      String(b.spouseOccupation ?? ""),
      String(b.spouseEmployerBusinessName ?? ""),
      String(b.spouseBusinessAddress ?? ""),
      String(b.spouseTelephoneNo ?? ""),
      String(b.childrenInfo ?? ""),
      String(b.fatherName ?? ""),
      String(b.fatherSurname ?? ""),
      String(b.fatherFirstName ?? ""),
      String(b.fatherMiddleName ?? ""),
      String(b.fatherNameExtension ?? ""),
      String(b.motherName ?? ""),
      String(b.motherSurname ?? ""),
      String(b.motherFirstName ?? ""),
      String(b.motherMiddleName ?? ""),
      String(b.civilServiceEligibility ?? ""),
      String(b.voluntaryWork ?? ""),
      String(b.trainings ?? ""),
      String(b.otherInfo ?? ""),
      String(b.referencesInfo ?? ""),
      String(b.educationalBackground ?? ""),
      String(b.workExperience ?? "")
    ]
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

  // Validate that the vacancy exists and is still open
  const vacancyResult = await query("SELECT * FROM job_vacancies WHERE id = $1", [vacancyId]);
  if (vacancyResult.rowCount === 0) {
    res.status(404).json({ error: "Job vacancy not found" });
    return;
  }

  const vacancy = vacancyResult.rows[0];
  const closingDate = new Date(vacancy.closing_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (closingDate < today || vacancy.status === "Closed") {
    res.status(400).json({ error: "This job vacancy is no longer accepting applications (closing date has passed)" });
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
    linkedStatus: row.template_key.split(":")[0],
    subject: row.subject,
    body: row.body,
    updatedAt: row.updated_at
  })));
}));

app.post("/api/email-templates", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { templateName, templateGroup, subject, body, linkedStatus } = req.body as {
    templateName?: string;
    templateGroup?: "rejection" | "qualification";
    subject?: string;
    body?: string;
    linkedStatus?: string;
  };

  if (!templateName || !templateGroup || !subject || !body || !linkedStatus) {
    res.status(400).json({ error: "templateName, templateGroup, subject, body, and linkedStatus are required" });
    return;
  }

  // Generate templateKey from linkedStatus and current count
  const existingKeys = await query("SELECT template_key FROM email_templates WHERE template_key LIKE $1", [`${linkedStatus}:%`]);
  const count = existingKeys.rows.length;
  const templateKey: EmailTemplateKey = `${linkedStatus}:${count + 1}`;

  const updatedAt = new Date().toISOString();
  await query(
    `INSERT INTO email_templates (template_key, template_name, template_group, subject, body, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [templateKey, templateName, templateGroup, subject, body, updatedAt]
  );

  const saved = await fetchEmailTemplateByKey(templateKey);
  if (!saved) {
    res.status(500).json({ error: "Failed to create email template" });
    return;
  }

  res.json({
    templateKey: saved.template_key,
    templateName: saved.template_name,
    templateGroup: saved.template_group,
    linkedStatus: linkedStatus,
    subject: saved.subject,
    body: saved.body,
    updatedAt: saved.updated_at
  });
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
    linkedStatus: saved.template_key.split(":")[0],
    subject: saved.subject,
    body: saved.body,
    updatedAt: saved.updated_at
  });
}));

app.delete("/api/email-templates/:templateKey", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const templateKey = req.params.templateKey as EmailTemplateKey;

  await query("DELETE FROM email_templates WHERE template_key = $1", [templateKey]);

  res.json({ success: true, message: "Email template deleted successfully" });
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

// ============ VACANCY ARCHIVAL SYSTEM ============

async function archiveExpiredVacancies() {
  try {
    // Get current archive duration setting
    const archiveDurationDays = await getArchiveDuration();

    // Find all open/closed vacancies where closing_date has passed
    const today = new Date().toISOString().split('T')[0];
    const result = await query<{ id: string; position_title: string; department_id: string; salary_grade: number; description: string; qualifications: string; posting_date: string; closing_date: string }>(
      `SELECT id, position_title, department_id, salary_grade, description, qualifications, posting_date, closing_date 
       FROM job_vacancies 
       WHERE archived_at IS NULL AND closing_date < $1 AND status IN ('Open', 'Closed')`,
      [today]
    );

    for (const vacancy of result.rows) {
      const archiveId = randomUUID();
      await query(
        `INSERT INTO archived_vacancies 
         (id, original_job_id, position_title, department_id, salary_grade, description, qualifications, posting_date, closing_date, archived_at, archive_duration_days, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          archiveId,
          vacancy.id,
          vacancy.position_title,
          vacancy.department_id,
          vacancy.salary_grade,
          vacancy.description,
          vacancy.qualifications,
          vacancy.posting_date,
          vacancy.closing_date,
          new Date().toISOString(),
          archiveDurationDays,
          new Date().toISOString()
        ]
      );

      // Mark original vacancy as archived
      await query(
        `UPDATE job_vacancies SET archived_at = $1 WHERE id = $2`,
        [new Date().toISOString(), vacancy.id]
      );
    }

    if (result.rowCount && result.rowCount > 0) {
      console.log(`✓ Archived ${result.rowCount} expired vacancy(ies) with ${archiveDurationDays} day retention`);
    }
  } catch (error) {
    console.error("❌ Error archiving expired vacancies:", error);
  }
}

async function cleanupOldArchivedVacancies() {
  try {
    // Mark archived vacancies as deleted when their retention period expires
    const deleteResult = await query(
      `UPDATE archived_vacancies 
       SET deleted_at = $1 
       WHERE deleted_at IS NULL 
       AND (CURRENT_TIMESTAMP - INTERVAL '1 day' * archive_duration_days) >= created_at::timestamp`,
      [new Date().toISOString()]
    );

    if (deleteResult.rowCount && deleteResult.rowCount > 0) {
      console.log(`✓ Marked ${deleteResult.rowCount} archived vacancy(ies) for permanent deletion`);
    }
  } catch (error) {
    console.error("❌ Error cleaning up archived vacancies:", error);
  }
}

// ============ VACANCY ARCHIVAL API ENDPOINTS ============

app.get("/api/archived-vacancies", asyncHandler(async (_req, res) => {
  const result = await query(
    `SELECT id, original_job_id, position_title, department_id, salary_grade, description, qualifications, 
            posting_date, closing_date, archived_at, archive_duration_days, deleted_at, created_at
     FROM archived_vacancies 
     WHERE deleted_at IS NULL
     ORDER BY archived_at DESC`
  );

  const rows = result.rows as any[];
  res.json(rows.map((row) => ({
    id: row.id,
    originalJobId: row.original_job_id,
    positionTitle: row.position_title,
    departmentId: row.department_id,
    salaryGrade: row.salary_grade,
    description: row.description,
    qualifications: row.qualifications,
    postingDate: row.posting_date,
    closingDate: row.closing_date,
    archivedAt: row.archived_at,
    archiveDurationDays: row.archive_duration_days,
    createdAt: row.created_at,
    daysUntilDeletion: Math.max(0, Math.ceil((new Date(row.created_at).getTime() + row.archive_duration_days * 24 * 60 * 60 * 1000 - new Date().getTime()) / (24 * 60 * 60 * 1000)))
  })));
}));

app.post("/api/archived-vacancies/:id/restore", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  const archived = await fetchOne(
    `SELECT id, original_job_id FROM archived_vacancies WHERE id = $1 AND deleted_at IS NULL`,
    [req.params.id]
  );

  if (!archived) {
    res.status(404).json({ error: "Archived vacancy not found" });
    return;
  }

  // Restore the original job vacancy
  await query(
    `UPDATE job_vacancies SET archived_at = NULL WHERE id = $1`,
    [archived.original_job_id]
  );

  // Mark archived record as restored
  await query(
    `UPDATE archived_vacancies SET deleted_at = $1 WHERE id = $2`,
    [new Date().toISOString(), req.params.id]
  );

  res.json({ success: true, message: "Vacancy restored" });
}));

app.get("/api/archived-vacancies/:id", asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT * FROM archived_vacancies WHERE id = $1 AND deleted_at IS NULL`,
    [req.params.id]
  );

  if (result.rowCount === 0) {
    res.status(404).json({ error: "Archived vacancy not found" });
    return;
  }

  const row = result.rows[0] as any;
  res.json({
    id: row.id,
    originalJobId: row.original_job_id,
    positionTitle: row.position_title,
    departmentId: row.department_id,
    salaryGrade: row.salary_grade,
    description: row.description,
    qualifications: row.qualifications,
    postingDate: row.posting_date,
    closingDate: row.closing_date,
    archivedAt: row.archived_at,
    archiveDurationDays: row.archive_duration_days,
    createdAt: row.created_at
  });
}));

// ============ SETTINGS API ENDPOINTS ============

app.get("/api/settings/archive-duration", asyncHandler(async (_req, res) => {
  const duration = await getArchiveDuration();
  res.json({ days: duration });
}));

app.post("/api/settings/archive-duration", requireAuth, asyncHandler(async (req: AuthedRequest, res) => {
  // Check if user is admin (already authenticated by requireAuth middleware)
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "Only admins can update settings" });
    return;
  }

  const { days } = req.body;
  
  // Validate input
  if (!Number.isInteger(days) || days < 1 || days > 180) {
    res.status(400).json({ error: "Archive duration must be between 1 and 180 days" });
    return;
  }

  try {
    await setArchiveDuration(days, req.user?.id);
    res.json({ success: true, message: "Archive duration updated", days });
  } catch (error) {
    res.status(500).json({ error: "Failed to update archive duration" });
  }
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
  await ensureSampleApplicants();
  await ensureEmailTemplates();
  
  // Run archival jobs
  await archiveExpiredVacancies();
  await cleanupOldArchivedVacancies();
  
  // Schedule archival jobs to run daily at midnight
  setInterval(async () => {
    await archiveExpiredVacancies();
  }, 24 * 60 * 60 * 1000); // Run daily
  
  setInterval(async () => {
    await cleanupOldArchivedVacancies();
  }, 24 * 60 * 60 * 1000); // Run daily
  
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});

