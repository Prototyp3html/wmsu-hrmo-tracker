# Development Guide

Development workflow, coding standards, and best practices.

## Table of Contents
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Backend Development](#backend-development)
- [Frontend Development](#frontend-development)
- [Testing](#testing)
- [Git Workflow](#git-workflow)

## Development Workflow

### Start Development Server

```bash
npm run dev
```

This starts:
- Backend: http://localhost:4000 (auto-restart on changes)
- Frontend: http://localhost:5173 (hot reload on changes)

### File Structure Best Practices

**Backend** (`backend/src/`):
- `index.ts` - API routes and server initialization
- `db.ts` - Database initialization and queries
- `seed.ts` - Database seeding utilities

**Frontend** (`frontend/src/`):
- `pages/` - Full page components (one per page)
- `components/` - Reusable components
- `lib/api.ts` - API client functions
- `lib/types.ts` - TypeScript type definitions
- `hooks/` - Custom React hooks
- `contexts/` - React context providers

## Coding Standards

### TypeScript

- Use strict typing - avoid `any`
- Define interfaces for API responses
- Use discriminated unions for state management
- Document complex types with comments

```typescript
// ✅ Good
interface User {
  id: string;
  name: string;
  role: "admin" | "staff";
}

// ❌ Avoid
const user: any = getUser();
```

### React Components

- Use functional components with hooks
- Keep components focused and single-responsibility
- Use descriptive prop names
- Document props with TypeScript interfaces

```typescript
// ✅ Good
interface ButtonProps {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}

export function MyButton({ onClick, label, disabled }: ButtonProps) {
  return <button onClick={onClick} disabled={disabled}>{label}</button>;
}

// ❌ Avoid
export function Button(props: any) {
  return <button {...props} />;
}
```

### Naming Conventions

- **Variables/Functions**: `camelCase`
- **Classes/Interfaces**: `PascalCase`
- **Constants**: `UPPER_SNAKE_CASE` (if truly constant)
- **React Components**: `PascalCase`
- **Files**: Lowercase with hyphens for utilities, PascalCase for components

```
backend/src/index.ts           ✅
frontend/src/components/UserCard.tsx  ✅
frontend/src/lib/api.ts        ✅
frontend/src/utils/formatDate.ts      ✅
```

## Backend Development

### Adding New API Endpoints

```typescript
// In backend/src/index.ts

app.get("/api/example", asyncHandler(async (req, res) => {
  try {
    const result = await query("SELECT * FROM table");
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
}));
```

### Database Queries

```typescript
import { query } from "./db.js";

// Fetch one record
const user = await query<User>(
  "SELECT * FROM users WHERE id = $1",
  [userId]
);

// Fetch multiple records
const users = await query<User>(
  "SELECT * FROM users WHERE role = $1",
  ["admin"]
);

// Insert/Update
await query(
  "INSERT INTO users (id, name, email) VALUES ($1, $2, $3)",
  [id, name, email]
);
```

### Error Handling

```typescript
// ✅ Use asyncHandler wrapper
app.get("/api/data", asyncHandler(async (req, res) => {
  // Errors are automatically caught and logged
  throw new Error("Something went wrong");
}));

// ❌ Avoid manual try-catch for every route
app.get("/api/data", (req, res, next) => {
  try {
    // route logic
  } catch (error) {
    next(error);
  }
});
```

## Frontend Development

### Using React Query (TanStack Query)

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";

// ✅ Fetching data
const { data, isLoading, error } = useQuery({
  queryKey: ["users"],
  queryFn: fetchUsers
});

// ✅ Mutations
const mutation = useMutation({
  mutationFn: (newUser) => createUser(newUser),
  onSuccess: () => {
    // Invalidate cache to refetch
    queryClient.invalidateQueries({ queryKey: ["users"] });
  },
  onError: (error) => {
    console.error("Error:", error);
  }
});

mutation.mutate(userData);
```

### Styling with Tailwind

```typescript
// ✅ Use utility classes
<div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
  <h2 className="text-lg font-semibold text-gray-900">Title</h2>
  <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
    Action
  </button>
</div>

// ❌ Avoid inline styles
<div style={{ display: 'flex', justifyContent: 'space-between' }}>...</div>
```

### Using shadcn/ui Components

```typescript
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function MyDialog() {
  const [open, setOpen] = useState(false);
  
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Action</DialogTitle>
        </DialogHeader>
        <Button onClick={() => setOpen(false)}>Confirm</Button>
      </DialogContent>
    </Dialog>
  );
}
```

## Testing

### Running Tests

```bash
npm run test              # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
```

### Writing Tests

```typescript
// ✅ Test file naming: Component.test.tsx
import { render, screen } from "@testing-library/react";
import { Button } from "./Button";

describe("Button", () => {
  it("renders with text", () => {
    render(<Button label="Click me" />);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });
});
```

## Git Workflow

### Branch Naming

```
feature/feature-name        # New feature
bugfix/bug-description      # Bug fix
hotfix/critical-issue       # Critical production fix
docs/documentation-update   # Documentation
```

### Commit Messages

```
✅ Good:
- "feat: add archive duration settings"
- "fix: correct admin role check in settings API"
- "docs: update setup guide"

❌ Avoid:
- "update"
- "fix bug"
- "changes"
```

### Before Pushing

```bash
npm run lint               # Check code style
npm run build              # Verify compilation
npm run test               # Run tests
git push                   # Push only if all pass
```

## Common Development Tasks

### Add New Page

1. Create component in `frontend/src/pages/`
2. Add route in `frontend/src/App.tsx`
3. Add navigation link in `frontend/src/components/layout/Sidebar.tsx`

### Add New API Endpoint

1. Create handler in `backend/src/index.ts`
2. Add API function in `frontend/src/lib/api.ts`
3. Use in component with React Query
4. Add to [API.md](./API.md) documentation

### Modify Database Schema

1. Edit table creation SQL in `backend/src/db.ts`
2. Add migration if data needs transformation
3. Update TypeScript types in `frontend/src/lib/types.ts`
4. Update [DATABASE.md](./DATABASE.md)

### Update UI Component

1. Edit component in `frontend/src/components/`
2. Run `npm run dev` to see hot reload
3. Test all states (loading, error, success)
4. Test on mobile (DevTools: Ctrl+Shift+M)

---

**Next:** Read [API.md](./API.md) for available endpoints.
