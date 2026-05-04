import { useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { resetPassword } from "@/lib/api";

export default function ResetPassword() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!token) {
      toast({ title: "Missing token", description: "The reset link is invalid or incomplete.", variant: "destructive" });
      return;
    }

    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "Use at least 6 characters.", variant: "destructive" });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", description: "Check both password fields and try again.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      toast({ title: "Password updated", description: "You can now sign in with your new password." });
      navigate("/login", { replace: true });
    } catch (error) {
      toast({
        title: "Reset failed",
        description: (error as Error).message,
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-card ring-1 ring-border flex items-center justify-center shadow-lg">
            <img src="/wmsu-seal.png" alt="WMSU seal" className="w-10 h-10" />
          </div>
          <div>
            <h1 className="text-3xl font-bold font-brand tracking-tight">
              <span className="text-foreground">Reset </span>
              <span className="text-primary">Password</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Create a new password for your HRMO account</p>
          </div>
        </div>

        <Card className="shadow-lg border-border/50">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Enter your new password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter your new password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting || !token}>
                {isSubmitting ? "Updating..." : "Update Password"}
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/login">Back to Login</Link>
              </Button>
              {!token && (
                <p className="text-xs text-destructive text-center">
                  The reset link is missing its token. Please request a new password reset.
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
