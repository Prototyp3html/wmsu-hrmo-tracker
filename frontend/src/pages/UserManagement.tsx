import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, deleteUser, fetchUsers, resetUserPassword, setUserStatus, updateUser } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, KeyRound, Pencil, Plus, Search, Shield, ShieldCheck, Trash2, UserCheck, UserX, Ellipsis } from "lucide-react";
import { useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

/* ── Password strength helpers ── */
function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { score: 1, label: "Weak", color: "bg-destructive" };
  if (score <= 2) return { score: 2, label: "Fair — add a number or symbol", color: "bg-warning" };
  if (score <= 3) return { score: 3, label: "Good", color: "bg-info" };
  return { score: 4, label: "Strong", color: "bg-success" };
}

function isWeakPassword(password: string) {
  if (!password) return true;
  return getPasswordStrength(password).score <= 1;
}

function PasswordStrengthBar({ password }: { password: string }) {
  const { score, label, color } = getPasswordStrength(password);
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= score ? color : "bg-muted"}`}
          />
        ))}
      </div>
      <p className={`text-[11px] ${score <= 1 ? "text-destructive" : score <= 2 ? "text-warning" : score <= 3 ? "text-info" : "text-success"}`}>
        {label}
      </p>
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-9"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function RoleSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const roles = [
    { value: "staff", label: "HR Staff", icon: Shield },
    { value: "admin", label: "HR Admin", icon: ShieldCheck },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {roles.map((role) => (
        <button
          key={role.value}
          type="button"
          onClick={() => onChange(role.value)}
          className={`rounded-lg border p-2 transition-all duration-150 flex items-center gap-2 ${
            value === role.value
              ? "border-primary bg-primary/5 ring-1 ring-primary/30"
              : "border-border hover:border-border/80 hover:bg-muted/30"
          }`}
        >
          <role.icon className={`w-3.5 h-3.5 ${value === role.value ? "text-primary" : "text-muted-foreground"}`} />
          <span className={`text-xs font-semibold ${value === role.value ? "text-primary" : "text-foreground"}`}>
            {role.label}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function UserManagement() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "staff">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const [formState, setFormState] = useState({ name: "", email: "", password: "", confirmPassword: "", role: "staff", activeOnCreate: true });
  const [formErrors, setFormErrors] = useState<{ name?: string; email?: string; password?: string; confirmPassword?: string }>({});
  const [editFormState, setEditFormState] = useState({ name: "", email: "", password: "", confirmPassword: "", role: "staff" });

  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? u.isActive : !u.isActive);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  const createMutation = useMutation({
    mutationFn: (payload: typeof formState) => createUser({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      role: payload.role,
      isActive: payload.activeOnCreate
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowCreate(false);
      setFormState({ name: "", email: "", password: "", confirmPassword: "", role: "staff", activeOnCreate: true });
      toast({ title: "User created", description: "The user account was added." });
    },
    onError: (error) => {
      toast({ title: "Create failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; email: string; role: string; password?: string } }) =>
      updateUser(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setShowEdit(false);
      setEditingUserId(null);
      toast({ title: "User updated", description: "Changes saved." });
    },
    onError: (error) => {
      toast({ title: "Update failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: "User deleted", description: "The user was removed." });
    },
    onError: (error) => {
      toast({ title: "Delete failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setUserStatus(id, isActive),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({
        title: vars.isActive ? "User activated" : "User deactivated",
        description: "Account status updated."
      });
    },
    onError: (error) => {
      toast({ title: "Status update failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => resetUserPassword(id, password),
    onSuccess: () => {
      setShowResetPassword(false);
      setResetTarget(null);
      setNewPassword("");
      setResetPasswordError("");
      toast({ title: "Password reset", description: "New password has been set." });
    },
    onError: (error) => {
      toast({ title: "Reset failed", description: (error as Error).message, variant: "destructive" });
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage user roles, account status, and credentials</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add User</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Improved modal</DialogTitle></DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const nextErrors: { name?: string; email?: string; password?: string; confirmPassword?: string } = {};
                if (isWeakPassword(formState.password)) {
                  nextErrors.password = "Password is too weak. Use at least 8 characters and mix upper/lowercase, number, or symbol.";
                }
                if (formState.password !== formState.confirmPassword) {
                  nextErrors.confirmPassword = "Passwords do not match";
                }
                if (nextErrors.password || nextErrors.confirmPassword) {
                  setFormErrors(nextErrors);
                  return;
                }
                setFormErrors({});
                createMutation.mutate(formState);
              }}
            >
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={formState.name} onChange={(e) => setFormState((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input type="email" value={formState.email} onChange={(e) => setFormState((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <PasswordInput
                  id="pwd-create"
                  value={formState.password}
                  onChange={(v) => {
                    setFormState((p) => ({ ...p, password: v }));
                    setFormErrors((prev) => ({ ...prev, password: undefined }));
                  }}
                  placeholder="Enter password"
                />
                <PasswordStrengthBar password={formState.password} />
                {formErrors.password && (
                  <p className="text-xs text-destructive">{formErrors.password}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Confirm Password</Label>
                <PasswordInput
                  id="pwd-confirm-create"
                  value={formState.confirmPassword}
                  onChange={(v) => setFormState((p) => ({ ...p, confirmPassword: v }))}
                  placeholder="Re-enter password"
                />
                {formErrors.confirmPassword && (
                  <p className="text-xs text-destructive">{formErrors.confirmPassword}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <RoleSelector
                  value={formState.role}
                  onChange={(v) => setFormState((p) => ({ ...p, role: v }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Account Status</Label>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <span className="text-sm text-foreground">Active on creation</span>
                  <Switch checked={formState.activeOnCreate} onCheckedChange={(checked) => setFormState((p) => ({ ...p, activeOnCreate: checked }))} />
                </div>
              </div>
              <Button className="w-full" type="submit" disabled={createMutation.isPending}>Create User</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="relative sm:col-span-1">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input className="pl-9" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as "all" | "admin" | "staff") }>
              <SelectTrigger><SelectValue placeholder="Filter by role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="admin">HR Admin</SelectItem>
                <SelectItem value="staff">HR Staff</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "inactive") }>
              <SelectTrigger><SelectValue placeholder="Filter by status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!editingUserId) return;
              const nextErrors: { name?: string; email?: string; password?: string; confirmPassword?: string } = {};
              if (editFormState.password) {
                if (isWeakPassword(editFormState.password)) {
                  nextErrors.password = "Password is too weak. Use at least 8 characters and mix upper/lowercase, number, or symbol.";
                }
                if (editFormState.password !== editFormState.confirmPassword) {
                  nextErrors.confirmPassword = "Passwords do not match";
                }
              }
              if (nextErrors.password || nextErrors.confirmPassword) {
                setFormErrors(nextErrors);
                return;
              }
              setFormErrors({});
              updateMutation.mutate({
                id: editingUserId,
                payload: {
                  name: editFormState.name,
                  email: editFormState.email,
                  role: editFormState.role,
                  ...(editFormState.password ? { password: editFormState.password } : {})
                }
              });
            }}
          >
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={editFormState.name} onChange={(e) => setEditFormState((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input type="email" value={editFormState.email} onChange={(e) => setEditFormState((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>New Password (optional)</Label>
              <PasswordInput
                id="pwd-edit"
                value={editFormState.password}
                onChange={(v) => {
                  setEditFormState((p) => ({ ...p, password: v }));
                  setFormErrors((prev) => ({ ...prev, password: undefined }));
                }}
                placeholder="Leave blank to keep current password"
              />
              {editFormState.password && <PasswordStrengthBar password={editFormState.password} />}
              {formErrors.password && (
                <p className="text-xs text-destructive">{formErrors.password}</p>
              )}
            </div>
            {editFormState.password && (
              <div className="space-y-2">
                <Label>Confirm Password</Label>
                <PasswordInput
                  id="pwd-confirm-edit"
                  value={editFormState.confirmPassword}
                  onChange={(v) => setEditFormState((p) => ({ ...p, confirmPassword: v }))}
                  placeholder="Re-enter password"
                />
                {formErrors.confirmPassword && (
                  <p className="text-xs text-destructive">{formErrors.confirmPassword}</p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label>Role</Label>
              <RoleSelector
                value={editFormState.role}
                onChange={(v) => setEditFormState((p) => ({ ...p, role: v }))}
              />
            </div>
            <Button className="w-full" type="submit" disabled={updateMutation.isPending}>Save Changes</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetPassword} onOpenChange={setShowResetPassword}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
            <DialogDescription>
              Set a new password for {resetTarget?.name ?? "selected user"}.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!resetTarget) return;
                if (isWeakPassword(newPassword)) {
                  setResetPasswordError("Password is too weak. Use at least 8 characters and mix upper/lowercase, number, or symbol.");
                  return;
                }
                setResetPasswordError("");
              resetPasswordMutation.mutate({ id: resetTarget.id, password: newPassword });
            }}
          >
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                  minLength={8}
                  placeholder="Use a strong password"
                value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setResetPasswordError("");
                  }}
              />
                <PasswordStrengthBar password={newPassword} />
                {resetPasswordError && <p className="text-xs text-destructive">{resetPasswordError}</p>}
            </div>
            <Button className="w-full" type="submit" disabled={resetPasswordMutation.isPending}>Reset Password</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">{deleteTarget?.name}</span>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => {
              if (deleteTarget) {
                deleteMutation.mutate(deleteTarget.id);
                setShowDeleteConfirm(false);
              }
            }}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="border border-border/50 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/70 bg-primary text-primary-foreground hover:bg-primary">
                  <TableHead className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Name</TableHead>
                  <TableHead className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Email</TableHead>
                  <TableHead className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Role</TableHead>
                  <TableHead className="h-12 px-4 text-[11px] font-semibold text-primary-foreground uppercase tracking-wide">Status</TableHead>
                  <TableHead className="h-12 px-4 text-[11px] font-semibold text-right text-primary-foreground uppercase tracking-wide">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u, idx) => {
                  const isCurrentUser = currentUser?.id === u.id;
                  return (
                    <TableRow
                      key={u.id}
                      className={`border-b border-border/20 h-14 transition-colors ${
                        idx % 2 === 0 ? "bg-background hover:bg-muted/30" : "bg-muted/10 hover:bg-muted/20"
                      }`}
                    >
                      <TableCell className="px-4 py-3 text-sm font-medium text-foreground">{u.name}</TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">{u.email}</TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
                          {u.role === "admin" ? "HR Admin" : "HR Staff"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge variant={u.isActive ? "secondary" : "outline"} className="text-xs">
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Open actions menu">
                              <Ellipsis className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem
                              onClick={() => statusMutation.mutate({ id: u.id, isActive: !u.isActive })}
                              disabled={statusMutation.isPending || (isCurrentUser && u.isActive)}
                            >
                              {u.isActive ? <UserX className="w-4 h-4 mr-2" /> : <UserCheck className="w-4 h-4 mr-2" />}
                              {u.isActive ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setResetTarget({ id: u.id, name: u.name });
                                setNewPassword("");
                                setResetPasswordError("");
                                setShowResetPassword(true);
                              }}
                            >
                              <KeyRound className="w-4 h-4 mr-2" />
                              Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingUserId(u.id);
                                setEditFormState({
                                  name: u.name,
                                  email: u.email,
                                  password: "",
                                  confirmPassword: "",
                                  role: u.role
                                });
                                setShowEdit(true);
                              }}
                            >
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={isCurrentUser || deleteMutation.isPending}
                              onClick={() => {
                                setDeleteTarget({ id: u.id, name: u.name });
                                setShowDeleteConfirm(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No users found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}