# Changelog

All notable changes to WMSU HR Connect are documented in this file.

## [1.0.0] - May 6, 2026 (Production Release)

### 🆕 New Features

#### Archive Duration Configuration System
- Added `application_settings` table for system-wide configuration
- Admins can now adjust vacancy archive retention period (1-180 days) via Archive page UI
- Settings persist in database and apply to future archival operations
- New API endpoints:
  - `GET /api/settings/archive-duration` - Get current retention period
  - `POST /api/settings/archive-duration` - Update retention period (admin only)
- Database functions:
  - `getArchiveDuration()` in `db.ts` - Fetch duration setting
  - `setArchiveDuration(days, updatedBy?)` in `db.ts` - Update duration

#### Improved Delete Confirmations
- Replaced browser `window.confirm()` dialogs with themed shadcn/ui Dialog components
- Affects:
  - User deletion (UserManagement.tsx)
  - Evaluation deletion (Evaluations.tsx)
  - Applicant deletion (ApplicationTracking.tsx)
  - Position title, department, vacancy deletion (JobVacancies.tsx)
- Better UX with consistent styling and messaging

#### Job Vacancy Archival Lifecycle
- Automatic archival: Vacancies with passed closing dates move to `archived_vacancies` table
- Automatic cleanup: Archived vacancies permanently deleted after retention period
- Daily background jobs:
  - `archiveExpiredVacancies()` - Runs daily at startup + 24-hour intervals
  - `cleanupOldArchivedVacancies()` - Runs daily at startup + 24-hour intervals
- Archive restore: Admins can restore archived vacancies back to active listings

#### Archive Page Enhancements
- "Set Retention Period" button visible to admin users
- Inline duration editor with validation (1-180 days)
- Real-time sync of duration with database settings
- Toast notifications for success/error feedback
- Display of days until permanent deletion (red if ≤7 days)
- Restore functionality for archived vacancies

### 🛠️ Technical Changes

#### Backend (Node.js + Express)
- New database table: `application_settings` with fields:
  - `setting_key` (PRIMARY KEY)
  - `setting_value`
  - `setting_type`
  - `description`
  - `updated_at`
  - `updated_by`
- Enhanced `archiveExpiredVacancies()` to use dynamic duration from settings
- Enhanced `cleanupOldArchivedVacancies()` to properly handle PostgreSQL datetime logic
- Fixed: Removed SQLite `datetime()` functions that don't exist in PostgreSQL
- Added admin role check to settings API endpoints using direct `req.user` access

#### Frontend (React + TypeScript)
- New API functions in `lib/api.ts`:
  - `getArchiveDurationSetting()` - GET /api/settings/archive-duration
  - `updateArchiveDurationSetting(days)` - POST /api/settings/archive-duration
- Archive page component updates:
  - Added React hooks: `useEffect` for syncing duration
  - Added state: `showDurationEditor`, `newDuration`
  - Added mutation: `updateDurationMutation`
  - Conditional rendering: "Set Retention Period" button for admins
- Fixed: Role comparison from "Admin" to "admin" (lowercase) to match database

#### Database
- New table: `application_settings`
- Index: Existing indexes still apply
- Automatic initialization of default archive_duration_days = 30

#### Documentation (NEW)
- Created `/docs` folder with comprehensive guides:
  - `SETUP.md` - Environment setup and configuration
  - `DEVELOPMENT.md` - Development workflow and standards
  - `API.md` - Complete API endpoint reference
  - `ARCHITECTURE.md` - System design and data flow
  - `DATABASE.md` - Database schema and queries
  - `DEPLOYMENT.md` - Production deployment guide
  - `TROUBLESHOOTING.md` - Common issues and solutions
  - `PROJECT_STRUCTURE.md` - Detailed file organization
  - `HANDOVER.md` - IT team onboarding guide

### 📝 Documentation Updates
- Completely rewrote `README.md` with comprehensive overview
- Updated `.env.example` with all environment variables and descriptions
- Created detailed project structure documentation
- Added deployment guides for multiple platforms

### 🐛 Bug Fixes
- Fixed role-based access control: Changed "Admin" to "admin" for consistency
- Fixed archival job error: Removed non-existent SQLite functions
- Fixed authorization check: Now uses already-authenticated `req.user` from middleware

### 🔒 Security
- Added validation for archive duration (1-180 days)
- Admin-only access to settings update endpoint
- Audit trail for settings changes via `updated_by` field

### 📊 Performance
- No significant performance impact
- Settings cached in memory after first fetch (no per-request DB query)
- Background jobs run on 24-hour intervals (no impact on normal operations)

### 📚 Migration Guide
For existing installations:

```sql
-- Create settings table
CREATE TABLE IF NOT EXISTS application_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  setting_type TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

-- Initialize default archive duration
INSERT INTO application_settings (setting_key, setting_value, setting_type, description, updated_at)
VALUES ('archive_duration_days', '30', 'integer', 'Number of days before archived vacancies are permanently deleted', NOW()::TEXT)
WHERE NOT EXISTS (SELECT 1 FROM application_settings WHERE setting_key = 'archive_duration_days');
```

Or restart backend - it applies automatically.

### 📦 Deployment
- Backend: No breaking changes, backward compatible
- Frontend: No breaking changes, backward compatible
- Database: Auto-migrates on backend startup
- No downtime required for upgrade

### 🗑️ Deprecated
- Nothing deprecated in this release

### ⚠️ Known Issues
- None identified

---

## [0.1.0] - Project Initialization

Initial project setup with:
- React + TypeScript frontend with Vite
- Node.js + Express backend
- PostgreSQL database
- Monorepo structure
- Core HR management features

---

## Version Format

This project follows [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

---

## Future Roadmap

Planned for future releases:

- [ ] Pagination for large datasets
- [ ] Redis caching layer
- [ ] Distributed job queue (Bull)
- [ ] Cloud file storage (S3)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Advanced reporting features
- [ ] Email notification improvements
- [ ] Mobile app
- [ ] Multi-language support
- [ ] Two-factor authentication

---

**Last Updated**: May 6, 2026  
**Status**: Production Ready ✅
