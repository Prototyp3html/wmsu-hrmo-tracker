import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, Navigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { requestPasswordReset } from "@/lib/api";

export default function Login() {
  const { user, login } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await login(email, password);
    if (result.ok) {
      toast({ title: "Welcome back!", description: "You have logged in successfully." });
    } else {
      toast({
        title: "Login failed",
        description: result.error ?? "Invalid email or password.",
        variant: "destructive"
      });
    }
  };

  const handleForgotPassword = async () => {
    const targetEmail = forgotEmail.trim() || email.trim();
    if (!targetEmail) {
      toast({ title: "Email required", description: "Enter your work email to request a reset.", variant: "destructive" });
      return;
    }

    setForgotLoading(true);
    try {
      await requestPasswordReset(targetEmail);
      toast({
        title: "Reset link sent",
        description: "If the email exists, instructions were sent to that inbox."
      });
      setForgotOpen(false);
    } catch (error) {
      toast({ title: "Request failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-card ring-1 ring-border flex items-center justify-center shadow-lg">
            <img src="/wmsu-seal.png" alt="WMSU seal" className="w-10 h-10" />
          </div>
          <div>
            <h1 className="text-3xl font-bold font-brand tracking-tight">
              <span className="text-foreground">WMSU </span>
              <span className="text-primary">HRMO</span>
              <span className="text-foreground"> Tracker</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Human Resource Management Office Tracker</p>
            <p className="text-xs text-muted-foreground">Western Mindanao State University</p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="shadow-lg border-border/50">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@wmsu.edu.ph"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-end">
                  <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
                    <DialogTrigger asChild>
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={() => setForgotEmail(email)}
                      >
                        Forgot password?
                      </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Reset your password</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="forgot-email">Work Email</Label>
                          <Input
                            id="forgot-email"
                            type="email"
                            placeholder="name@wmsu.edu.ph"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                          />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          We will send a password reset link if the account exists.
                        </div>
                        <div className="flex justify-end gap-3">
                          <Button variant="outline" type="button" onClick={() => setForgotOpen(false)}>
                            Cancel
                          </Button>
                          <Button type="button" onClick={handleForgotPassword} disabled={forgotLoading}>
                            {forgotLoading ? "Sending..." : "Send reset link"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              <Button type="submit" className="w-full">
                Sign In
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/">←</Link>
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Use your assigned WMSU HRMO account. Admin and staff accounts can use the forgot-password link if they cannot log in.
        </p>
      </div>
    </div>
  );
}
