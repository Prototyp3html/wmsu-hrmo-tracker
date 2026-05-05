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
    <div
      className="min-h-screen flex items-stretch relative overflow-hidden"
      style={{
        backgroundImage: "url('/wmsu-building.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-red-950/60 to-black/80 backdrop-blur-[2px]" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      <div className="relative z-10 flex items-center justify-center w-full min-h-screen">
        <div className="flex flex-col items-center justify-center w-full max-w-4xl p-6 lg:p-14">
          <div className="w-full max-w-sm space-y-8" style={{ transform: "translateY(0)", opacity: 1 }}>
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm flex items-center justify-center shadow-xl">
                <img src="/wmsu-seal.png" alt="WMSU seal" className="w-10 h-10" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight drop-shadow">
                  Reset <span className="text-red-400">Password</span>
                </h1>
                <p className="text-sm text-white/60 mt-0.5">Create a new password for your HRMO account</p>
              </div>
            </div>

            <div className="rounded-2xl bg-white/[0.97] dark:bg-card shadow-2xl shadow-black/40 border border-white/20 overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-red-700 via-red-500 to-red-700" />
              <div className="p-8 space-y-6">
                <div className="space-y-1">
                  <h2 className="text-2xl font-extrabold text-foreground tracking-tight">Reset Password</h2>
                  <p className="text-sm text-muted-foreground">Create a new password for your HRMO account</p>
                </div>

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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
