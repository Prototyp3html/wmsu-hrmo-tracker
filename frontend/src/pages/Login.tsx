import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Eye, EyeOff, Shield, Mail, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  const [isLoading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const result = await login(email, password);
    setIsLoading(false);
    if (result.ok) {
      toast({ title: "Welcome back!", description: "You have logged in successfully." });
    } else {
      toast({
        title: "Login failed",
        description: result.error ?? "Invalid email or password.",
        variant: "destructive",
      });
    }
  };

  const handleForgotPassword = async () => {
    const targetEmail = forgotEmail.trim() || email.trim();
    if (!targetEmail) {
      toast({
        title: "Email required",
        description: "Enter your work email to request a reset.",
        variant: "destructive",
      });
      return;
    }
    setForgotLoading(true);
    try {
      await requestPasswordReset(targetEmail);
      toast({
        title: "Reset link sent",
        description: "If the email exists, instructions were sent to that inbox.",
      });
      setForgotOpen(false);
    } catch (error) {
      toast({
        title: "Request failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setForgotLoading(false);
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
      {/* Layered overlay: dark gradient + strong blur */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-red-950/60 to-black/80 backdrop-blur-[2px]" />

      {/* Subtle vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* ── Main layout: two-column on lg ── */}
      <div className="relative z-10 flex flex-1 flex-col lg:flex-row">

        {/* Left panel — branding / info (hidden on small) */}
        <div
          className="hidden lg:flex flex-col justify-between flex-1 p-14 text-white"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateX(0)" : "translateX(-20px)",
            transition: "opacity 0.7s ease, transform 0.7s ease",
          }}
        >
          {/* Logo + title */}
          <div className="flex items-center gap-3">
            <img src="/wmsu-seal.png" alt="WMSU Seal" className="w-10 h-10 drop-shadow-lg" />
            <span className="font-bold text-lg tracking-tight drop-shadow">
              WMSU <span className="text-red-400">HRMO</span> Tracker
            </span>
          </div>

          {/* Center quote / description */}
          <div className="space-y-5 max-w-md">
            <div className="w-10 h-1 rounded-full bg-red-400" />
            <h2 className="text-4xl font-extrabold leading-snug tracking-tight drop-shadow-lg">
              Streamlining HR Operations in WMSU
            </h2>
            <p className="text-white/65 leading-relaxed text-base">
              Manage vacancies, track applicants, evaluate candidates, and generate
              reports — all in one secure platform built for the HR Office.
            </p>
            {/* Feature pills */}
            <div className="flex flex-wrap gap-2 pt-2">
              {["Vacancy Management", "Applicant Tracking", "Evaluations", "Reports"].map((f) => (
                <span
                  key={f}
                  className="px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-medium text-white/80 backdrop-blur-sm"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Footer note */}
          <p className="text-white/40 text-xs">
            Western Mindanao State University · HR Management Office
          </p>
        </div>

        {/* Right panel — login form */}
        <div className="flex flex-col items-center justify-center w-full lg:w-[480px] shrink-0 p-6 lg:p-14">
          <div
            className="w-full max-w-sm space-y-8"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(20px)",
              transition: "opacity 0.65s ease 0.1s, transform 0.65s ease 0.1s",
            }}
          >
            {/* Mobile-only header */}
            <div className="flex flex-col items-center gap-3 lg:hidden text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 backdrop-blur-sm flex items-center justify-center shadow-xl">
                <img src="/wmsu-seal.png" alt="WMSU seal" className="w-10 h-10" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight drop-shadow">
                  WMSU <span className="text-red-400">HRMO</span> Tracker
                </h1>
                <p className="text-white/60 text-xs mt-0.5">Human Resource Management Office</p>
              </div>
            </div>

            {/* Form card */}
            <div className="rounded-2xl bg-white/[0.97] dark:bg-card shadow-2xl shadow-black/40 border border-white/20 overflow-hidden">
              {/* Card top accent */}
              <div className="h-1 w-full bg-gradient-to-r from-red-700 via-red-500 to-red-700" />

              <div className="p-8 space-y-6">
                {/* Form header */}
                <div className="space-y-1">
                  {/* Desktop logo inside card */}
                  <div className="hidden lg:flex items-center gap-2.5 mb-5">
                    <div className="w-9 h-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center">
                      <img src="/wmsu-seal.png" alt="WMSU" className="w-6 h-6" />
                    </div>
                    <span className="font-bold text-sm text-foreground tracking-tight">
                      WMSU <span className="text-primary">HRMO</span> Tracker
                    </span>
                  </div>
                  <h2 className="text-2xl font-extrabold text-foreground tracking-tight">
                    Sign in
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Use your authorized HR credentials to access the system.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-semibold text-foreground">
                      Email Address
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="name@wmsu.edu.ph"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-9 h-11 rounded-lg border-border/70 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-sm font-semibold text-foreground">
                        Password
                      </Label>
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
                            <p className="text-xs text-muted-foreground">
                              We'll send a password reset link if the account exists.
                            </p>
                            <div className="flex justify-end gap-3">
                              <Button
                                variant="outline"
                                type="button"
                                onClick={() => setForgotOpen(false)}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                onClick={handleForgotPassword}
                                disabled={forgotLoading}
                              >
                                {forgotLoading ? "Sending…" : "Send reset link"}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-9 pr-10 h-11 rounded-lg border-border/70 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Submit */}
                  <Button
                    type="submit"
                    className="w-full h-11 rounded-lg font-semibold text-sm shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all disabled:opacity-60"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <svg
                          className="animate-spin w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle
                            className="opacity-25"
                            cx="12" cy="12" r="10"
                            stroke="currentColor" strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v8H4z"
                          />
                        </svg>
                        Signing in…
                      </span>
                    ) : (
                      "Sign In"
                    )}
                  </Button>
                </form>


              </div>
            </div>

            {/* Footer note */}
            <div className="flex items-center justify-center gap-2 text-white/50 text-xs">
              <Shield className="w-3.5 h-3.5" />
              Access restricted to authorized HR personnel only.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}