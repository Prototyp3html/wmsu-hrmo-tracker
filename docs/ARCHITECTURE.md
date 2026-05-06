# System Architecture

Overview of WMSU HR Connect's technical architecture and design.

## Table of Contents
- [High-Level Architecture](#high-level-architecture)
- [Technology Decisions](#technology-decisions)
- [Data Flow](#data-flow)
- [Key Components](#key-components)
- [Security Model](#security-model)
- [Scalability Considerations](#scalability-considerations)

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                  │
│  - SPA (Single Page Application)                             │
│  - Runs in browser                                           │
│  - Communicates via REST API                                │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP/REST
                           │ JSON
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Backend (Node.js + Express)                     │
│  - REST API Server                                           │
│  - Handles business logic                                   │
│  - Manages database operations                              │
│  - Scheduled jobs (vacancy archival)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ SQL
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Database (PostgreSQL)                           │
│  - Persistent data storage                                   │
│  - Users, jobs, applications, audit logs                    │
│  - Settings and email templates                             │
└─────────────────────────────────────────────────────────────┘
```

## Technology Decisions

### Frontend: React + TypeScript + Vite
**Why:**
- **React**: Industry standard, large ecosystem, component reusability
- **TypeScript**: Type safety, better IDE support, catch bugs early
- **Vite**: Fast build tool, excellent DX, quick HMR (Hot Module Reload)
- **TanStack Query**: Excellent server state management, caching

### Backend: Node.js + Express + TypeScript
**Why:**
- **Node.js**: JavaScript full-stack, large ecosystem
- **Express**: Lightweight, flexible routing, mature
- **TypeScript**: Type safety on backend, shared types with frontend
- **PostgreSQL**: Robust, ACID compliance, good for relational data

### UI: shadcn/ui + Tailwind CSS
**Why:**
- **shadcn/ui**: Beautiful, accessible components
- **Tailwind**: Utility-first CSS, consistent styling, small bundle size

## Data Flow

### User Login
```
1. User enters credentials → Frontend
2. Frontend POSTs to /api/auth/login
3. Backend validates credentials, generates JWT token
4. Frontend stores token in localStorage
5. Frontend adds token to Authorization header for subsequent requests
6. Frontend stores user info in AuthContext
```

### Create Job Vacancy
```
1. Admin fills form → Frontend
2. Frontend validates input
3. Frontend POSTs /api/jobs with data
4. Backend creates record in database
5. Backend returns created job with ID
6. Frontend invalidates cache, shows toast
7. List automatically updates via React Query
```

### Archive Expired Vacancy
```
1. Backend job runs daily (setInterval 24 hours)
2. Job queries: SELECT jobs WHERE closing_date < today
3. For each expired job:
   - Insert into archived_vacancies
   - Set archived_at timestamp
   - Update original job with archived_at
4. Cleanup job runs after archive job:
   - Check archived_vacancies where retention expired
   - Mark with deleted_at timestamp
5. Frontend shows archived jobs with "Restore" button
```

### Update Archive Duration
```
1. Admin enters days (1-180) → Archive page
2. Frontend POSTs /api/settings/archive-duration
3. Backend validates:
   - User must be admin
   - Days must be 1-180
4. Backend updates application_settings table
5. New duration applies to future archival jobs
6. Existing archived records keep their duration
```

## Key Components

### Database Schema

**Core Tables:**
- `users` - Admin and staff accounts
- `departments` - HR departments
- `job_vacancies` - Active job postings
- `archived_vacancies` - Expired job postings
- `applications` - Applicant submissions
- `evaluations` - Applicant assessments
- `applicants` - Applicant personal data
- `email_templates` - Email message templates
- `application_settings` - System configuration
- `audit_logs` - Change history

### Frontend Structure

**Pages** (full page components):
- Dashboard - Overview/statistics
- Job Vacancies - CRUD operations
- Applicants - Applicant management
- Application Tracking - Workflow management
- Evaluations - Assessment system
- Archive - Archived records + Settings
- User Management - User CRUD
- Reports - Analytics
- Audit Logs - Change tracking

**Components** (reusable):
- `Button`, `Dialog`, `Table` from shadcn/ui
- Custom components for specific features
- Layout components (Sidebar, AppLayout)

**Hooks**:
- `useAuth()` - Access authentication state
- `useQuery()` - Fetch data with caching
- `useMutation()` - Submit data with loading states
- `useToast()` - Show notifications

### Backend Structure

**Routes** (`/api/...`):
- Auth: login, logout, me
- Jobs: CRUD operations
- Archived Vacancies: list, restore
- Applications: CRUD operations
- Users: CRUD operations (admin)
- Settings: get/update archive duration
- Evaluations: CRUD operations
- And more...

**Middleware**:
- `requireAuth` - Validate JWT token
- `asyncHandler` - Catch async errors
- CORS - Cross-origin requests
- Helmet - Security headers
- Rate limiting - Login protection

**Jobs** (background tasks):
- `archiveExpiredVacancies()` - Daily, moves closed vacancies to archive
- `cleanupOldArchivedVacancies()` - Daily, marks old archived vacancies for deletion

## Security Model

### Authentication
- **Method**: JWT (JSON Web Token)
- **Storage**: localStorage on frontend
- **Expiration**: 7 days (configurable)
- **Secret**: Required in backend `.env`

### Authorization
- **Model**: Role-Based Access Control (RBAC)
- **Roles**: `admin` (full access), `staff` (limited access)
- **Check**: Middleware validates user role for protected endpoints

### Best Practices Implemented
- ✅ Passwords hashed with bcryptjs (10 rounds)
- ✅ SQL injection prevention (parameterized queries)
- ✅ CORS enabled only for known origins
- ✅ Security headers via Helmet
- ✅ Rate limiting on login endpoint
- ✅ JWT validation on every protected request
- ✅ Admin checks on sensitive operations

## Scalability Considerations

### Current Limitations
- **Single server**: Backend runs on one instance
- **File storage**: Uploads stored locally on server
- **Jobs**: Background tasks run on main server
- **In-memory caching**: Lost on server restart

### Future Improvements
1. **Horizontal Scaling**:
   - Load balancer (nginx, HAProxy)
   - Multiple backend instances
   - Shared database across instances

2. **Distributed Background Jobs**:
   - Bull queue (Redis-backed)
   - Separate job worker process
   - Reliable retry mechanism

3. **File Storage**:
   - AWS S3 or similar cloud storage
   - Content Delivery Network (CDN) for static assets
   - Separate file server

4. **Caching**:
   - Redis for session/data caching
   - Reduce database queries
   - Session sharing across instances

5. **Database Optimization**:
   - Add indexes on frequently queried columns
   - Implement pagination for large result sets
   - Archive/purge old audit logs

### Current Performance
- Frontend: ~1.1MB (gzipped) - bundle size
- Cold start: ~2-3 seconds
- Database queries: <100ms typical

## Deployment Architecture

### Development
- Single machine
- Frontend: http://localhost:5173
- Backend: http://localhost:4000
- Database: Local PostgreSQL

### Production (Recommended)
```
Internet
    ↓
CDN (for static assets)
    ↓
Load Balancer
    ↓ (distributes to)
Node.js Server 1
Node.js Server 2
Node.js Server 3
    ↓
PostgreSQL Database (replicated)
    ↓
Redis (caching)
    ↓
S3 (file storage)
```

---

**Next:** See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment steps.
