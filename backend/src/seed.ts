import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { query } from "./db.js";

type SeedDepartment = {
  id: string;
  name: string;
};

type SeedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type SeedJobVacancy = {
  id: string;
  positionTitle: string;
  departmentId: string;
  salaryGrade: number;
  qualifications: string;
  postingDate: string;
  closingDate: string;
  status: string;
};

type SeedPositionTitle = {
  id: string;
  title: string;
};

type SeedApplicant = {
  id: string;
  fullName: string;
  contactNumber: string;
  email: string;
  address: string;
  educationalBackground: string;
  workExperience: string;
};

type SeedApplication = {
  id: string;
  applicantId: string;
  vacancyId: string;
  status: string;
  dateApplied: string;
  remarks?: string | null;
};

type SeedStatusHistory = {
  id: string;
  applicationId: string;
  status: string;
  remarks: string;
  updatedBy: string;
  updatedAt: string;
};

type SeedEvaluation = {
  id: string;
  applicationId: string;
  totalScore: number;
  remarks: string;
  evaluatedBy: string;
  evaluatedAt: string;
};

const departments: SeedDepartment[] = [];

const users: SeedUser[] = [];

const TEST_ACCOUNT_PASSWORD = "password123";

const jobVacancies: SeedJobVacancy[] = [];

const positionTitles: SeedPositionTitle[] = [
  { id: randomUUID(), title: "Attorney IV" },
  { id: randomUUID(), title: "Internal Auditor I" },
  { id: randomUUID(), title: "Instructor III" },
  { id: randomUUID(), title: "Information Technology Officer I Repost" },
  { id: randomUUID(), title: "Information Officer I" },
  { id: randomUUID(), title: "Administrative Aide VI (Clerk III)" },
  { id: randomUUID(), title: "Project Development Officer I" },
  { id: randomUUID(), title: "Administrative Assistant III (Senior Bookkeeper)" },
  { id: randomUUID(), title: "Administrative Assistant III" },
  { id: randomUUID(), title: "SUC Vice President" },
  { id: randomUUID(), title: "Board Secretary V" },
  { id: randomUUID(), title: "Chief Administrative Officer" },
  { id: randomUUID(), title: "Administrative Aide VI" },
  { id: randomUUID(), title: "Administrative Assistant II" },
  { id: randomUUID(), title: "Administrative Officer I" }
];

const applicants: SeedApplicant[] = [
  {
    id: randomUUID(),
    fullName: "Juan Dela Cruz",
    contactNumber: "09171234567",
    email: "juan.delacruz@example.com",
    address: "Barangay Baliwasan, Zamboanga City, Zamboanga del Sur",
    educationalBackground: "Bachelor of Science in Information Technology - Western Mindanao State University",
    workExperience: "Administrative Assistant, 2022-Present"
  },
  {
    id: randomUUID(),
    fullName: "Maria Santos",
    contactNumber: "09181234567",
    email: "maria.santos@example.com",
    address: "Barangay Tumaga, Zamboanga City, Zamboanga del Sur",
    educationalBackground: "Bachelor of Science in Business Administration - Ateneo de Zamboanga University",
    workExperience: "Clerk, 2021-2024"
  },
  {
    id: randomUUID(),
    fullName: "Jose Reyes",
    contactNumber: "09191234567",
    email: "jose.reyes@example.com",
    address: "Barangay Divisoria, Zamboanga City, Zamboanga del Sur",
    educationalBackground: "Bachelor of Secondary Education - Universidad de Zamboanga",
    workExperience: "Teacher Aide, 2020-2023"
  },
  {
    id: randomUUID(),
    fullName: "Ana Lopez",
    contactNumber: "09201234567",
    email: "ana.lopez@example.com",
    address: "Barangay Tetuan, Zamboanga City, Zamboanga del Sur",
    educationalBackground: "Bachelor of Science in Psychology - Universidad de Zamboanga",
    workExperience: "HR Assistant, 2023-Present"
  },
  {
    id: randomUUID(),
    fullName: "Mark Villanueva",
    contactNumber: "09211234567",
    email: "mark.villanueva@example.com",
    address: "Barangay Putik, Zamboanga City, Zamboanga del Sur",
    educationalBackground: "Bachelor of Science in Computer Science - Western Mindanao State University",
    workExperience: "IT Support Specialist, 2022-Present"
  }
];

const applications: SeedApplication[] = [];

const statusHistory: SeedStatusHistory[] = [];

const evaluations: SeedEvaluation[] = [];

export async function seedIfEmpty() {
  const userCount = await query<{ count: string }>("SELECT COUNT(*) as count FROM users");
  if (Number(userCount.rows[0]?.count ?? 0) > 0) {
    return;
  }

  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(TEST_ACCOUNT_PASSWORD, 10);

  for (const user of users) {
    await query(
      "INSERT INTO users (id, name, email, role, password_hash, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [user.id, user.name, user.email, user.role, passwordHash, now]
    );
  }

  for (const dept of departments) {
    await query(
      "INSERT INTO departments (id, name) VALUES ($1, $2)",
      [dept.id, dept.name]
    );
  }

  for (const positionTitle of positionTitles) {
    await query(
      "INSERT INTO position_titles (id, title) VALUES ($1, $2)",
      [positionTitle.id, positionTitle.title]
    );
  }

  for (const vacancy of jobVacancies) {
    await query(
      "INSERT INTO job_vacancies (id, position_title, department_id, salary_grade, qualifications, posting_date, closing_date, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
      [
        vacancy.id,
        vacancy.positionTitle,
        vacancy.departmentId,
        vacancy.salaryGrade,
        vacancy.qualifications,
        vacancy.postingDate,
        vacancy.closingDate,
        vacancy.status
      ]
    );
  }

  for (const applicant of applicants) {
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
  }

  for (const application of applications) {
    await query(
      "INSERT INTO applications (id, applicant_id, vacancy_id, status, date_applied, remarks) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        application.id,
        application.applicantId,
        application.vacancyId,
        application.status,
        application.dateApplied,
        application.remarks ?? null
      ]
    );
  }

  for (const history of statusHistory) {
    await query(
      "INSERT INTO status_history (id, application_id, status, remarks, updated_by, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        history.id,
        history.applicationId,
        history.status,
        history.remarks,
        history.updatedBy,
        history.updatedAt
      ]
    );
  }

  for (const evaluation of evaluations) {
    await query(
      "INSERT INTO evaluations (id, application_id, total_score, remarks, evaluated_by, evaluated_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        evaluation.id,
        evaluation.applicationId,
        evaluation.totalScore,
        evaluation.remarks,
        evaluation.evaluatedBy,
        evaluation.evaluatedAt
      ]
    );
  }
}

export async function ensurePositionTitles() {
  for (const positionTitle of positionTitles) {
    const existing = await query<{ id: string }>(
      "SELECT id FROM position_titles WHERE LOWER(title) = LOWER($1) LIMIT 1",
      [positionTitle.title]
    );

    if (existing.rowCount === 0) {
      await query(
        "INSERT INTO position_titles (id, title) VALUES ($1, $2)",
        [positionTitle.id, positionTitle.title]
      );
    }
  }
}

export async function ensureTestAccounts() {
  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(TEST_ACCOUNT_PASSWORD, 10);

  for (const user of users) {
    const existing = await query<{ id: string }>("SELECT id FROM users WHERE email = $1", [user.email]);

    if (existing.rowCount === 0) {
      await query(
        "INSERT INTO users (id, name, email, role, password_hash, is_active, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [randomUUID(), user.name, user.email, user.role, passwordHash, true, now]
      );
      continue;
    }

    await query(
      "UPDATE users SET name = $2, role = $3, password_hash = $4, is_active = TRUE WHERE email = $1",
      [user.email, user.name, user.role, passwordHash]
    );
  }
}

export async function ensureDepartments() {
  for (const dept of departments) {
    const existing = await query<{ id: string }>(
      "SELECT id FROM departments WHERE LOWER(name) = LOWER($1) LIMIT 1",
      [dept.name]
    );

    if (existing.rowCount === 0) {
      await query("INSERT INTO departments (id, name) VALUES ($1, $2)", [randomUUID(), dept.name]);
    }
  }
}

export async function ensureSampleApplicants() {
  for (const applicant of applicants) {
    const existing = await query<{ id: string }>(
      "SELECT id FROM applicants WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [applicant.email]
    );

    if (existing.rowCount === 0) {
      await query(
        `INSERT INTO applicants (
          id, full_name, contact_number, email, address,
          educational_background, work_experience
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
    }
  }
}
