# Database Schema Reference

Complete database schema for WMSU HRMO Tracker.

## Overview

The application uses PostgreSQL with the following core tables:

| Table | Purpose |
|-------|---------|
| `users` | Admin and staff accounts |
| `departments` | HR departments |
| `job_vacancies` | Active job postings |
| `archived_vacancies` | Expired/archived job postings |
| `applications` | Applicant job applications |
| `applicants` | Applicant personal information |
| `evaluations` | Applicant assessments/scoring |
| `email_templates` | Customizable email templates |
| `application_settings` | System configuration |
| `audit_logs` | Change/activity log |

## Tables

### users

Stores user accounts with roles and permissions.

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,                    -- 'admin' or 'staff'
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TEXT NOT NULL
);
```

**Key Fields:**
- `role`: 'admin' (full access) or 'staff' (limited access)
- `email`: Must be unique
- `password_hash`: Bcrypted password, never plain text

### departments

HR departments for organizing job vacancies.

```sql
CREATE TABLE departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
```

### job_vacancies

Active job openings.

```sql
CREATE TABLE job_vacancies (
  id TEXT PRIMARY KEY,
  position_title TEXT NOT NULL,
  department_id TEXT NOT NULL REFERENCES departments(id),
  salary_grade INTEGER NOT NULL,
  qualifications TEXT NOT NULL,
  description TEXT,
  posting_date TEXT NOT NULL,
  closing_date TEXT NOT NULL,
  status TEXT NOT NULL,                  -- 'Open', 'Closed'
  created_at TEXT NOT NULL,
  archived_at TEXT,                      -- Set when moved to archive
  archive_duration_days INTEGER DEFAULT 30
);
```

**Key Fields:**
- `closing_date`: When vacancy expires
- `archived_at`: Null for active, timestamp when archived
- `status`: 'Open' (accepting) or 'Closed' (not accepting)

### archived_vacancies

Vacancies that have passed their closing date.

```sql
CREATE TABLE archived_vacancies (
  id TEXT PRIMARY KEY,
  original_job_id TEXT NOT NULL,         -- Reference to original job
  position_title TEXT NOT NULL,
  department_id TEXT NOT NULL,
  salary_grade INTEGER NOT NULL,
  qualifications TEXT NOT NULL,
  description TEXT,
  posting_date TEXT NOT NULL,
  closing_date TEXT NOT NULL,
  archived_at TEXT NOT NULL,             -- When archived
  archive_duration_days INTEGER DEFAULT 30,
  deleted_at TEXT,                       -- Set for permanent deletion
  created_at TEXT NOT NULL
);
```

**Lifecycle:**
1. Job vacancy created in `job_vacancies`
2. When `closing_date` passes, moved to `archived_vacancies` with `archived_at`
3. Original job gets `archived_at` timestamp
4. After `archive_duration_days`, `deleted_at` is set
5. Can be restored by clearing `deleted_at` on original job

### applications

Job applications from applicants.

```sql
CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  applicant_id TEXT NOT NULL REFERENCES applicants(id),
  vacancy_id TEXT NOT NULL REFERENCES job_vacancies(id),
  status TEXT NOT NULL,                  -- Status in workflow
  date_applied TEXT NOT NULL,
  remarks TEXT,
  created_at TEXT NOT NULL
);
```

**Status Values:**
- Submitted
- Under Review
- Interviewed
- Shortlisted
- Hired
- Rejected

### applicants

Applicant personal information.

```sql
CREATE TABLE applicants (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  address TEXT,
  educational_background TEXT,
  work_experience TEXT,
  trainings TEXT,
  other_info TEXT,
  created_at TEXT NOT NULL
);
```

### evaluations

Applicant assessment scores.

```sql
CREATE TABLE evaluations (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  total_score DECIMAL(5,2),              -- Score out of 100
  remarks TEXT,
  evaluated_by TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

### email_templates

Customizable email message templates.

```sql
CREATE TABLE email_templates (
  template_key TEXT PRIMARY KEY,
  template_name TEXT NOT NULL,
  template_group TEXT NOT NULL,          -- 'rejection', 'qualification', etc.
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**Template Groups:**
- `rejection` - Rejection emails
- `qualification` - Qualification/interview notification
- Custom groups as needed

**Placeholders in body:**
- `{{applicantName}}`
- `{{jobTitle}}`
- `{{date}}`

### application_settings

System-wide configuration stored in database.

```sql
CREATE TABLE application_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  setting_type TEXT NOT NULL,            -- 'string', 'integer', 'boolean'
  description TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT                        -- User ID who updated it
);
```

**Current Settings:**
- `archive_duration_days` - How many days to keep archived records

### audit_logs

Complete audit trail of all changes.

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,                  -- What was done
  table_name TEXT,                       -- Which table
  record_id TEXT,                        -- Which record
  old_values JSONB,                      -- Previous state
  new_values JSONB,                      -- New state
  ip_address TEXT,
  timestamp TEXT NOT NULL
);
```

**Common Actions:**
- `login_success`, `login_failed` - Authentication
- `create_job`, `update_job`, `delete_job` - Job operations
- `create_user`, `update_user` - User management
- etc.

## Indexes

For performance optimization:

```sql
-- Users
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- Job Vacancies
CREATE INDEX idx_jobs_status ON job_vacancies(status);
CREATE INDEX idx_jobs_department_id ON job_vacancies(department_id);
CREATE INDEX idx_jobs_closing_date ON job_vacancies(closing_date);

-- Archived Vacancies
CREATE INDEX idx_archived_vacancies_created_at ON archived_vacancies(created_at);
CREATE INDEX idx_archived_vacancies_deleted_at ON archived_vacancies(deleted_at);

-- Applications
CREATE INDEX idx_applications_vacancy_id ON applications(vacancy_id);
CREATE INDEX idx_applications_applicant_id ON applications(applicant_id);
CREATE INDEX idx_applications_status ON applications(status);

-- Audit Logs
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
```

## Key Relationships

```
users (many roles/accounts)
  ↓ references
audit_logs (tracks actions)

departments (many positions)
  ↓ references
job_vacancies (active postings)
  ↓
archived_vacancies (when closed)

applicants (job seekers)
  ↓ applies for
applications (job applications)
  ↓ references
job_vacancies (the position)
  ↓ is evaluated
evaluations (scoring)

email_templates (reusable messages)
  ↓ used for
applications (when status changes)
```

## Maintenance Tasks

### Regular Backups

```bash
# Daily backup
pg_dump wmsu_hr_connect > backup-$(date +%Y%m%d).sql

# Compressed backup
pg_dump wmsu_hr_connect | gzip > backup-$(date +%Y%m%d).sql.gz

# Restore from backup
psql wmsu_hr_connect < backup.sql
```

### Cleanup Old Audit Logs

```sql
-- Delete audit logs older than 1 year
DELETE FROM audit_logs 
WHERE timestamp < NOW() - INTERVAL '1 year';
```

### Monitor Table Sizes

```sql
-- Which tables are largest
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Vacuum and Analyze

```sql
-- Optimize table performance
VACUUM ANALYZE;

-- For specific table
VACUUM ANALYZE job_vacancies;
```

## Query Examples

### Get jobs closing soon

```sql
SELECT * FROM job_vacancies
WHERE closing_date <= NOW() + INTERVAL '7 days'
AND archived_at IS NULL
ORDER BY closing_date ASC;
```

### Get application statistics by status

```sql
SELECT 
  applications.status,
  COUNT(*) as count
FROM applications
GROUP BY status
ORDER BY count DESC;
```

### Get user audit history

```sql
SELECT *
FROM audit_logs
WHERE user_id = 'user-id'
ORDER BY timestamp DESC
LIMIT 50;
```

### Find archived vacancies ready for deletion

```sql
SELECT *
FROM archived_vacancies
WHERE deleted_at IS NULL
AND (CURRENT_TIMESTAMP - INTERVAL '1 day' * archive_duration_days) >= created_at;
```

---

**Database Admin Contacts**: See SETUP.md for connection details.
