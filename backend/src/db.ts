import { Pool, QueryResultRow } from "pg";

let pool: Pool | null = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return getPool().query<T>(text, params);
}

export async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS job_vacancies (
      id TEXT PRIMARY KEY,
      position_title TEXT NOT NULL,
      department_id TEXT NOT NULL REFERENCES departments(id),
      plantilla_no TEXT NOT NULL DEFAULT '',
      monthly_rate TEXT NOT NULL DEFAULT '',
      salary_grade INTEGER NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      eligibility TEXT NOT NULL DEFAULT '',
      trainings TEXT NOT NULL DEFAULT '',
      competencies TEXT NOT NULL DEFAULT '',
      educational_background TEXT NOT NULL DEFAULT '',
      work_experience TEXT NOT NULL DEFAULT '',
      qualifications TEXT NOT NULL,
      posting_date TEXT NOT NULL,
      closing_date TEXT NOT NULL,
      status TEXT NOT NULL,
      position_level TEXT DEFAULT 'first_level'
    );

    CREATE TABLE IF NOT EXISTS position_titles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS applicants (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      contact_number TEXT NOT NULL,
      telephone_number TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      address TEXT NOT NULL,
      permanent_address TEXT NOT NULL DEFAULT '',
      date_of_birth TEXT NOT NULL DEFAULT '',
      place_of_birth TEXT NOT NULL DEFAULT '',
      sex TEXT NOT NULL DEFAULT '',
      civil_status TEXT NOT NULL DEFAULT '',
      citizenship TEXT NOT NULL DEFAULT '',
      height TEXT NOT NULL DEFAULT '',
      weight TEXT NOT NULL DEFAULT '',
      blood_type TEXT NOT NULL DEFAULT '',
      gsis_id_no TEXT NOT NULL DEFAULT '',
      umid_id_no TEXT NOT NULL DEFAULT '',
      philsys_no TEXT NOT NULL DEFAULT '',
      pagibig_id_no TEXT NOT NULL DEFAULT '',
      philhealth_no TEXT NOT NULL DEFAULT '',
      citizenship_details TEXT NOT NULL DEFAULT '',
      sss_no TEXT NOT NULL DEFAULT '',
      tin_no TEXT NOT NULL DEFAULT '',
      agency_employee_no TEXT NOT NULL DEFAULT '',
      spouse_name TEXT NOT NULL DEFAULT '',
      spouse_surname TEXT NOT NULL DEFAULT '',
      spouse_first_name TEXT NOT NULL DEFAULT '',
      spouse_middle_name TEXT NOT NULL DEFAULT '',
      spouse_name_extension TEXT NOT NULL DEFAULT '',
      spouse_occupation TEXT NOT NULL DEFAULT '',
      spouse_employer_business_name TEXT NOT NULL DEFAULT '',
      spouse_business_address TEXT NOT NULL DEFAULT '',
      spouse_telephone_no TEXT NOT NULL DEFAULT '',
      children_info TEXT NOT NULL DEFAULT '',
      father_name TEXT NOT NULL DEFAULT '',
      father_surname TEXT NOT NULL DEFAULT '',
      father_first_name TEXT NOT NULL DEFAULT '',
      father_middle_name TEXT NOT NULL DEFAULT '',
      father_name_extension TEXT NOT NULL DEFAULT '',
      mother_name TEXT NOT NULL DEFAULT '',
      mother_surname TEXT NOT NULL DEFAULT '',
      mother_first_name TEXT NOT NULL DEFAULT '',
      mother_middle_name TEXT NOT NULL DEFAULT '',
      civil_service_eligibility TEXT NOT NULL DEFAULT '',
      voluntary_work TEXT NOT NULL DEFAULT '',
      trainings TEXT NOT NULL DEFAULT '',
      other_info TEXT NOT NULL DEFAULT '',
      references_info TEXT NOT NULL DEFAULT '',
      educational_background TEXT NOT NULL,
      work_experience TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      applicant_id TEXT NOT NULL REFERENCES applicants(id),
      vacancy_id TEXT NOT NULL REFERENCES job_vacancies(id),
      status TEXT NOT NULL,
      date_applied TEXT NOT NULL,
      remarks TEXT,
      documents_complete BOOLEAN NOT NULL DEFAULT FALSE,
      exam_schedule_date TEXT,
      exam_schedule_time TEXT,
      exam_venue TEXT,
      interview_schedule_date TEXT,
      interview_schedule_time TEXT,
      interview_venue TEXT,
      final_evaluation_date TEXT,
      final_evaluation_time TEXT,
      final_evaluation_venue TEXT
    );

    CREATE TABLE IF NOT EXISTS status_history (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id),
      status TEXT NOT NULL,
      remarks TEXT,
      updated_by TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL REFERENCES applications(id),
      position_level TEXT NOT NULL DEFAULT 'first_level',
      panelists TEXT NOT NULL DEFAULT '[]',
      panelists_count INTEGER NOT NULL DEFAULT 0,
      communication_skills REAL,
      ability_to_present REAL,
      alertness REAL,
      judgement REAL,
      emotional_stability REAL,
      self_confidence REAL,
      first_level_total REAL,
      oral_communication REAL,
      analytical_ability REAL,
      initiative REAL,
      stress_tolerance REAL,
      sensitivity REAL,
      service_orientation REAL,
      second_level_total REAL,
      total_score REAL NOT NULL,
      remarks TEXT,
      evaluated_by TEXT NOT NULL,
      evaluated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS applicant_documents (
      id TEXT PRIMARY KEY,
      applicant_id TEXT NOT NULL REFERENCES applicants(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      uploaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS email_templates (
      template_key TEXT PRIMARY KEY,
      template_name TEXT NOT NULL,
      template_group TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_position_titles_title ON position_titles(title);
  `);

  await query(`
    ALTER TABLE evaluations
    ADD COLUMN IF NOT EXISTS panelists TEXT NOT NULL DEFAULT '[]';
  `).catch(() => {
    // Ignore errors if column already exists.
  });

  await query(`
    ALTER TABLE evaluations
    ADD COLUMN IF NOT EXISTS panelists_count INTEGER NOT NULL DEFAULT 0;
  `).catch(() => {
    // Ignore errors if column already exists.
  });

  // Add position_level column if it doesn't exist (for existing databases)
  await query(`
    ALTER TABLE job_vacancies 
    ADD COLUMN IF NOT EXISTS position_level TEXT DEFAULT 'first_level';
  `).catch(() => {
    // Ignore errors if column already exists
  });

  // Add extended vacancy fields for legacy databases
  await query(`
    ALTER TABLE job_vacancies
    ADD COLUMN IF NOT EXISTS plantilla_no TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS monthly_rate TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS eligibility TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS trainings TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS competencies TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS educational_background TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS work_experience TEXT NOT NULL DEFAULT '';
  `).catch(() => {});

  // Add user activation flag for existing databases
  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
  `).catch(() => {});

  // Add password reset token table support for existing databases.
  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
  `).catch(() => {});

  // Add position_level column to evaluations if it doesn't exist
  await query(`
    ALTER TABLE evaluations 
    ADD COLUMN IF NOT EXISTS position_level TEXT DEFAULT 'first_level';
  `).catch(() => {});

  // Add all missing assessment score columns to evaluations
  await query(`
    ALTER TABLE evaluations 
    ADD COLUMN IF NOT EXISTS communication_skills REAL,
    ADD COLUMN IF NOT EXISTS ability_to_present REAL,
    ADD COLUMN IF NOT EXISTS alertness REAL,
    ADD COLUMN IF NOT EXISTS judgement REAL,
    ADD COLUMN IF NOT EXISTS emotional_stability REAL,
    ADD COLUMN IF NOT EXISTS self_confidence REAL,
    ADD COLUMN IF NOT EXISTS first_level_total REAL,
    ADD COLUMN IF NOT EXISTS oral_communication REAL,
    ADD COLUMN IF NOT EXISTS analytical_ability REAL,
    ADD COLUMN IF NOT EXISTS initiative REAL,
    ADD COLUMN IF NOT EXISTS stress_tolerance REAL,
    ADD COLUMN IF NOT EXISTS sensitivity REAL,
    ADD COLUMN IF NOT EXISTS service_orientation REAL,
    ADD COLUMN IF NOT EXISTS second_level_total REAL;
  `).catch(() => {});

  // Make exam_score nullable if it exists (for backward compatibility)
  await query(`
    ALTER TABLE evaluations 
    ALTER COLUMN exam_score DROP NOT NULL;
  `).catch(() => {});

  // Make interview_score and other old columns nullable
  await query(`
    ALTER TABLE evaluations 
    ALTER COLUMN interview_score DROP NOT NULL;
  `).catch(() => {});

  // Make written_exam_score nullable
  await query(`
    ALTER TABLE evaluations 
    ALTER COLUMN written_exam_score DROP NOT NULL;
  `).catch(() => {});

  // Drop old columns if they exist (we're replacing them with new assessment columns)
  await query(`
    ALTER TABLE evaluations 
    DROP COLUMN IF EXISTS exam_score,
    DROP COLUMN IF EXISTS interview_score,
    DROP COLUMN IF EXISTS written_exam_score;
  `).catch(() => {});

  // Add workflow columns to applications for status progression requirements
  await query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS documents_complete BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS exam_schedule_date TEXT,
    ADD COLUMN IF NOT EXISTS exam_schedule_time TEXT,
    ADD COLUMN IF NOT EXISTS exam_venue TEXT,
    ADD COLUMN IF NOT EXISTS interview_schedule_date TEXT,
    ADD COLUMN IF NOT EXISTS interview_schedule_time TEXT,
    ADD COLUMN IF NOT EXISTS interview_venue TEXT,
    ADD COLUMN IF NOT EXISTS final_evaluation_date TEXT,
    ADD COLUMN IF NOT EXISTS final_evaluation_time TEXT,
    ADD COLUMN IF NOT EXISTS final_evaluation_venue TEXT;
  `).catch(() => {});

  // Add email templates table columns for existing databases.
  await query(`
    ALTER TABLE email_templates
    ADD COLUMN IF NOT EXISTS template_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS template_group TEXT NOT NULL DEFAULT 'rejection',
    ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS updated_at TEXT NOT NULL DEFAULT '';
  `).catch(() => {});

  // Add key PDS identity fields for applicants.
  await query(`
    ALTER TABLE applicants
    ADD COLUMN IF NOT EXISTS date_of_birth TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS place_of_birth TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sex TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS civil_status TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS citizenship TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS height TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS weight TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS blood_type TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS telephone_number TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS permanent_address TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS gsis_id_no TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS umid_id_no TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS philsys_no TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS pagibig_id_no TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS philhealth_no TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS citizenship_details TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS sss_no TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS tin_no TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS agency_employee_no TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS spouse_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS spouse_surname TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS spouse_first_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS spouse_middle_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS spouse_name_extension TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS spouse_occupation TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS spouse_employer_business_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS spouse_business_address TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS spouse_telephone_no TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS children_info TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS father_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS father_surname TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS father_first_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS father_middle_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS father_name_extension TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS mother_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS mother_surname TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS mother_first_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS mother_middle_name TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS civil_service_eligibility TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS voluntary_work TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS trainings TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS other_info TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS references_info TEXT NOT NULL DEFAULT '';
  `).catch(() => {});

  // Add archived_vacancies table for vacancy lifecycle management
  await query(`
    CREATE TABLE IF NOT EXISTS archived_vacancies (
      id TEXT PRIMARY KEY,
      original_job_id TEXT NOT NULL,
      position_title TEXT NOT NULL,
      department_id TEXT NOT NULL REFERENCES departments(id),
      salary_grade INTEGER NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      qualifications TEXT NOT NULL,
      posting_date TEXT NOT NULL,
      closing_date TEXT NOT NULL,
      archived_at TEXT NOT NULL,
      archive_duration_days INTEGER NOT NULL DEFAULT 30,
      deleted_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_archived_vacancies_created_at ON archived_vacancies(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_archived_vacancies_deleted_at ON archived_vacancies(deleted_at);
  `).catch(() => {});

  // Add archived_at and archive_duration_days columns to job_vacancies if they don't exist
  await query(`
    ALTER TABLE job_vacancies
    ADD COLUMN IF NOT EXISTS archived_at TEXT,
    ADD COLUMN IF NOT EXISTS archive_duration_days INTEGER NOT NULL DEFAULT 30;
  `).catch(() => {});

  // Add application settings table for system configuration
  await query(`
    CREATE TABLE IF NOT EXISTS application_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      setting_type TEXT NOT NULL,
      description TEXT,
      updated_at TEXT NOT NULL,
      updated_by TEXT
    );
  `).catch(() => {});

  // Initialize default archive duration setting if it doesn't exist
  await query(`
    INSERT INTO application_settings (setting_key, setting_value, setting_type, description, updated_at)
    SELECT 'archive_duration_days', '30', 'integer', 'Number of days before archived vacancies are permanently deleted', NOW()::TEXT
    WHERE NOT EXISTS (SELECT 1 FROM application_settings WHERE setting_key = 'archive_duration_days');
  `).catch(() => {});
}

export async function getArchiveDuration(): Promise<number> {
  try {
    const result = await query<{ setting_value: string }>(
      "SELECT setting_value FROM application_settings WHERE setting_key = $1",
      ["archive_duration_days"]
    );
    if (result.rowCount && result.rowCount > 0) {
      return parseInt(result.rows[0].setting_value, 10) || 30;
    }
  } catch (error) {
    console.error("Error fetching archive duration:", error);
  }
  return 30; // Default fallback
}

export async function setArchiveDuration(days: number, updatedBy?: string): Promise<void> {
  try {
    await query(
      `UPDATE application_settings 
       SET setting_value = $1, updated_at = $2, updated_by = $3
       WHERE setting_key = 'archive_duration_days'`,
      [String(days), new Date().toISOString(), updatedBy || null]
    );
  } catch (error) {
    console.error("Error updating archive duration:", error);
    throw error;
  }
}
