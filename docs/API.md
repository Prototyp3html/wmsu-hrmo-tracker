# API Documentation

Complete reference for all available API endpoints.

## Base URL

```
http://localhost:4000/api
```

## Authentication

Most endpoints require JWT authentication in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

## Auth Endpoints

### POST /auth/login

Login with email and password.

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@wmsu.edu",
    "password": "password123"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": "user-id",
    "name": "Admin User",
    "email": "admin@wmsu.edu",
    "role": "admin",
    "isActive": true
  }
}
```

### GET /auth/me

Get current authenticated user.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "user": {
    "id": "user-id",
    "name": "Admin User",
    "email": "admin@wmsu.edu",
    "role": "admin",
    "isActive": true
  }
}
```

### POST /auth/logout

Logout current user (invalidates token on client side).

```bash
curl -X POST http://localhost:4000/api/auth/logout \
  -H "Authorization: Bearer <token>"
```

## Job Vacancies

### GET /jobs

List all active job vacancies.

```bash
curl http://localhost:4000/api/jobs \
  -H "Authorization: Bearer <token>"
```

### POST /jobs

Create a new job vacancy (admin only).

```bash
curl -X POST http://localhost:4000/api/jobs \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "positionTitle": "Software Engineer",
    "departmentId": "dept-id",
    "salaryGrade": 5,
    "qualifications": "BS Computer Science",
    "postingDate": "2026-05-06",
    "closingDate": "2026-06-06"
  }'
```

### GET /jobs/:id

Get a specific job vacancy.

```bash
curl http://localhost:4000/api/jobs/job-id \
  -H "Authorization: Bearer <token>"
```

### PUT /jobs/:id

Update a job vacancy (admin only).

```bash
curl -X PUT http://localhost:4000/api/jobs/job-id \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"positionTitle": "New Title"}'
```

### DELETE /jobs/:id

Delete a job vacancy (admin only).

```bash
curl -X DELETE http://localhost:4000/api/jobs/job-id \
  -H "Authorization: Bearer <token>"
```

## Archived Vacancies

### GET /archived-vacancies

List all archived vacancies.

```bash
curl http://localhost:4000/api/archived-vacancies \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
[
  {
    "id": "archived-id",
    "originalJobId": "job-id",
    "positionTitle": "Software Engineer",
    "salaryGrade": 5,
    "archiveDurationDays": 30,
    "archivedAt": "2026-05-01T10:00:00Z",
    "createdAt": "2026-05-01T10:00:00Z",
    "daysUntilDeletion": 28
  }
]
```

### POST /archived-vacancies/:id/restore

Restore an archived vacancy back to active listings.

```bash
curl -X POST http://localhost:4000/api/archived-vacancies/archived-id/restore \
  -H "Authorization: Bearer <token>"
```

## Settings

### GET /settings/archive-duration

Get current archive retention duration in days.

```bash
curl http://localhost:4000/api/settings/archive-duration \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "days": 30
}
```

### POST /settings/archive-duration

Update archive retention duration (admin only).

```bash
curl -X POST http://localhost:4000/api/settings/archive-duration \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"days": 45}'
```

**Validation:**
- Must be integer between 1 and 180
- Requires admin role

**Response:**
```json
{
  "success": true,
  "message": "Archive duration updated",
  "days": 45
}
```

## Applications

### GET /applications

List all applications.

```bash
curl http://localhost:4000/api/applications \
  -H "Authorization: Bearer <token>"
```

### POST /applications

Create a new application.

```bash
curl -X POST http://localhost:4000/api/applications \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "applicantId": "applicant-id",
    "vacancyId": "job-id",
    "status": "Submitted"
  }'
```

### PUT /applications/:id

Update application status and remarks.

```bash
curl -X PUT http://localhost:4000/api/applications/app-id \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "Interviewed",
    "remarks": "Good candidate"
  }'
```

## Users

### GET /users

List all users (admin only).

```bash
curl http://localhost:4000/api/users \
  -H "Authorization: Bearer <token>"
```

### POST /users

Create a new user (admin only).

```bash
curl -X POST http://localhost:4000/api/users \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New User",
    "email": "user@wmsu.edu",
    "role": "staff"
  }'
```

### PUT /users/:id

Update user (admin only).

```bash
curl -X PUT http://localhost:4000/api/users/user-id \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "role": "admin"
  }'
```

### DELETE /users/:id

Delete user (admin only).

```bash
curl -X DELETE http://localhost:4000/api/users/user-id \
  -H "Authorization: Bearer <token>"
```

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message describing what went wrong"
}
```

### Common Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (invalid input) |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 500 | Server Error |

## Rate Limiting

- Login endpoint: 5 attempts per 15 minutes per IP
- Other endpoints: No rate limit (can be added in production)

## Pagination

Currently not implemented. All endpoints return full results. For large datasets, implement:

```typescript
GET /api/jobs?page=1&limit=10
```

---

**Last Updated:** May 6, 2026
