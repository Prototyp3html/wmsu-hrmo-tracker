import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Briefcase,
  Users,
  ClipboardCheck,
  BarChart3,
  ArrowRight,
  Monitor,
  Shield,
  ChevronDown,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchReportsSummary } from "@/lib/api";

const features = [
  {
    icon: Briefcase,
    title: "Job Vacancy Management",
    description:
      "Create, manage, and track open positions across all departments with ease.",
    stat: "12 Active",
  },
  {
    icon: Users,
    title: "Applicant Tracking",
    description:
      "Monitor applicants from submission through every stage of the hiring pipeline.",
    stat: "148 Total",
  },
  {
    icon: ClipboardCheck,
    title: "Evaluation & Ranking",
    description:
      "Score exams and interviews, then automatically rank candidates per vacancy.",
    stat: "37 Pending",
  },
  {
    icon: BarChart3,
    title: "Reports & Analytics",
    description:
      "Generate hiring summaries, export PDFs, and gain data-driven insights.",
    stat: "24 Hired",
  },
];

const defaultStats = [
  { value: "12", label: "Open Vacancies" },
  { value: "148", label: "Total Applicants" },
  { value: "37", label: "Under Screening" },
  { value: "24", label: "Successfully Hired" },
];

/* ── Animated counter hook ── */
function useCountUp(target: number, duration = 1200, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      setCount(Math.floor(progress * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [start, target, duration]);
  return count;
}

function AnimatedStat({
  value,
  label,
  delay,
  visible,
}: {
  value: string;
  label: string;
  delay: number;
  visible: boolean;
}) {
  const num = parseInt(value, 10);
  const count = useCountUp(num, 1000, visible);
  return (
    <div
      className="text-center transition-all duration-700"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      <p className="text-4xl font-bold text-primary tabular-nums">{count}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

const LandingPage = () => {
  const navigate = useNavigate();

  /* ── Intersection observer for scroll-reveal ── */
  const featuresRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const [featuresVisible, setFeaturesVisible] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);
  const [aboutVisible, setAboutVisible] = useState(false);
  const { data: summary, isLoading: loadingSummary } = useQuery({ queryKey: ["reports-summary"], queryFn: fetchReportsSummary });

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.target === featuresRef.current && e.isIntersecting)
            setFeaturesVisible(true);
          if (e.target === statsRef.current && e.isIntersecting)
            setStatsVisible(true);
          if (e.target === aboutRef.current && e.isIntersecting)
            setAboutVisible(true);
        });
      },
      { threshold: 0.15 }
    );
    if (featuresRef.current) io.observe(featuresRef.current);
    if (statsRef.current) io.observe(statsRef.current);
    if (aboutRef.current) io.observe(aboutRef.current);
    return () => io.disconnect();
  }, []);

  /* ── Hero text reveal on mount ── */
  const [heroVisible, setHeroVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans overflow-x-hidden">

      {/* ── NAVBAR ── */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto flex items-center justify-between h-16 px-6">
          <div className="flex items-center gap-3">
            <img src="/wmsu-seal.png" alt="WMSU Seal" className="w-9 h-9 drop-shadow-sm" />
            <span className="font-bold text-lg tracking-tight hidden sm:inline">
              <span className="text-foreground">WMSU </span>
              <span className="text-primary">HRMO</span>
              <span className="text-foreground"> Tracker</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => navigate("/login")}
              className="rounded-full px-6 shadow-sm hover:shadow-md transition-shadow"
            >
              Log In
            </Button>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="relative flex-1 flex items-center overflow-hidden">
        {/* Decorative background blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-primary/6 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-[400px] h-[400px] rounded-full bg-primary/4 blur-3xl" />
          {/* Subtle dot grid */}
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage:
                "radial-gradient(circle, currentColor 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />
        </div>

        <div className="container mx-auto px-6 py-20 md:py-28 relative">
          <div className="grid lg:grid-cols-2 gap-14 items-center">

            {/* Left – Text */}
            <div className="space-y-7 max-w-xl">
              <div
                className="transition-all duration-700"
                style={{
                  opacity: heroVisible ? 1 : 0,
                  transform: heroVisible ? "translateY(0)" : "translateY(16px)",
                  transitionDelay: "0ms",
                }}
              >
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wide uppercase">
                  <Shield className="w-3.5 h-3.5" />
                  Internal HR System
                </span>
              </div>

              <div
                className="transition-all duration-700"
                style={{
                  opacity: heroVisible ? 1 : 0,
                  transform: heroVisible ? "translateY(0)" : "translateY(16px)",
                  transitionDelay: "120ms",
                }}
              >
                <h1 className="text-5xl md:text-6xl font-extrabold leading-[1.1] tracking-tight">
                  <span className="text-foreground">WMSU </span>
                  <span className="text-primary">HRMO</span>
                  <br />
                  <span className="text-foreground">Tracker</span>
                </h1>
              </div>

              <div
                className="transition-all duration-700"
                style={{
                  opacity: heroVisible ? 1 : 0,
                  transform: heroVisible ? "translateY(0)" : "translateY(16px)",
                  transitionDelay: "240ms",
                }}
              >
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Streamlining Recruitment and Hiring Management for the HR&nbsp;Office
                  of Western Mindanao State University.
                </p>
                <p className="mt-3 text-muted-foreground">
                  Manage vacancies, track applicants, evaluate candidates, and generate
                  reports — all in one secure platform.
                </p>
              </div>

              <div
                className="flex flex-wrap gap-3 pt-1 transition-all duration-700"
                style={{
                  opacity: heroVisible ? 1 : 0,
                  transform: heroVisible ? "translateY(0)" : "translateY(16px)",
                  transitionDelay: "360ms",
                }}
              >
                <Button
                  size="lg"
                  className="rounded-full px-8 gap-2 shadow-md hover:shadow-lg hover:translate-y-[-1px] active:translate-y-0 transition-all"
                  onClick={() => navigate("/login")}
                >
                  Go to Login
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full px-8 gap-2 hover:bg-accent transition-colors"
                  onClick={() =>
                    featuresRef.current?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  Learn More
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Right – Dashboard card */}
            <div
              className="hidden lg:flex justify-center transition-all duration-1000"
              style={{
                opacity: heroVisible ? 1 : 0,
                transform: heroVisible ? "translateY(0) scale(1)" : "translateY(24px) scale(0.97)",
                transitionDelay: "200ms",
              }}
            >
              <div className="relative w-full max-w-md">
                {/* Glow */}
                <div className="absolute -inset-6 rounded-3xl bg-primary/8 blur-3xl" />
                {/* Floating accent chips */}
                <div className="absolute -top-4 -right-4 z-10 flex items-center gap-1.5 bg-green-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  Live Data
                </div>
                <div className="absolute -bottom-3 -left-3 z-10 bg-card border border-border text-xs font-medium px-3 py-1.5 rounded-full shadow-md text-muted-foreground">
                  Updated just now
                </div>

                <Card className="relative border border-border/60 shadow-2xl rounded-2xl overflow-hidden backdrop-blur-sm">
                  <CardContent className="p-0">
                    {/* Card header */}
                    <div className="bg-primary px-6 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Monitor className="w-5 h-5 text-primary-foreground/90" />
                        <span className="text-primary-foreground font-semibold text-sm tracking-wide">
                          Dashboard Preview
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        {["bg-red-400","bg-yellow-400","bg-green-400"].map(c => (
                          <span key={c} className={`w-2.5 h-2.5 rounded-full ${c} opacity-80`} />
                        ))}
                      </div>
                    </div>

                    <div className="p-6 space-y-5 bg-card">
                      {/* Stat grid */}
                      <div className="grid grid-cols-2 gap-3">
                        {(
                          loadingSummary || !summary
                            ? [
                                { label: "Open Vacancies", value: "12", delta: "+2", up: true },
                                { label: "Total Applicants", value: "148", delta: "+14", up: true },
                                { label: "Under Screening", value: "37", delta: "-3", up: false },
                                { label: "Hired", value: "24", delta: "+5", up: true }
                              ]
                            : [
                                { label: "Open Vacancies", value: String(summary.totalJobs ?? 0), delta: "", up: true },
                                { label: "Total Applicants", value: String(summary.totalApplicants ?? 0), delta: "", up: true },
                                { label: "Under Screening", value: String(summary.applicationsByStatus?.find((s)=>/screen/i.test(s.status))?.count ?? 0), delta: "", up: true },
                                { label: "Hired", value: String(summary.applicationsByStatus?.find((s)=>s.status === "Hired")?.count ?? 0), delta: "", up: true }
                              ]
                        ).map((s) => (
                          <div
                            key={s.label}
                            className="rounded-xl bg-muted/60 border border-border/40 p-3.5 space-y-1 hover:bg-muted transition-colors"
                          >
                            <p className="text-2xl font-bold text-foreground tabular-nums">
                              {s.value}
                            </p>
                            <p className="text-[11px] text-muted-foreground leading-tight">
                              {s.label}
                            </p>
                            <span
                              className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                s.up
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                  : "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                              }`}
                            >
                              {s.delta} {s.delta ? "this month" : ""}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Bar chart */}
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                          Monthly Hiring Activity
                        </p>
                        <div className="flex items-end gap-1.5 h-16">
                          {[40, 65, 50, 80, 55, 70, 45].map((h, i) => (
                            <div
                              key={i}
                              className="flex-1 rounded-t bg-primary/70 hover:bg-primary transition-all duration-300 cursor-default"
                              style={{ height: `${h}%` }}
                              title={`Month ${i + 1}`}
                            />
                          ))}
                        </div>
                        <div className="flex justify-between mt-1">
                          {["Jan","Feb","Mar","Apr","May","Jun","Jul"].map(m => (
                            <span key={m} className="text-[9px] text-muted-foreground flex-1 text-center">{m}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-muted-foreground/50 animate-bounce">
          <ChevronDown className="w-5 h-5" />
        </div>
      </section>

      {/* ── STATS STRIP ── */}
      <div
        ref={statsRef}
        className="border-y border-border bg-muted/30"
      >
        <div className="container mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
            {(loadingSummary || !summary ? defaultStats : [
              { value: String(summary.totalJobs ?? 0), label: "Open Vacancies" },
              { value: String(summary.totalApplicants ?? 0), label: "Total Applicants" },
              {
                value: String(
                  summary.applicationsByStatus?.find((s) => /screen/i.test(s.status))?.count ?? 0
                ),
                label: "Under Screening"
              },
              { value: String(summary.applicationsByStatus?.find((s) => s.status === "Hired")?.count ?? 0), label: "Successfully Hired" }
            ]).map((s, i) => (
              <AnimatedStat
                key={s.label}
                value={s.value}
                label={s.label}
                delay={i * 100}
                visible={statsVisible}
              />
            ))}
          </div>
      </div>

      {/* ── FEATURES ── */}
      <section ref={featuresRef} className="border-b border-border bg-card">
        <div className="container mx-auto px-6 py-20 md:py-24">
          <div
            className="text-center mb-14 transition-all duration-700"
            style={{
              opacity: featuresVisible ? 1 : 0,
              transform: featuresVisible ? "translateY(0)" : "translateY(20px)",
            }}
          >
            <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-3">
              What's Inside
            </span>
            <h2 className="text-4xl font-extrabold text-foreground tracking-tight">
              Core Features
            </h2>
            <p className="mt-3 text-muted-foreground max-w-md mx-auto leading-relaxed">
              Everything the HR Office needs to manage the hiring process efficiently.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="transition-all duration-700"
                style={{
                  opacity: featuresVisible ? 1 : 0,
                  transform: featuresVisible ? "translateY(0)" : "translateY(28px)",
                  transitionDelay: `${i * 80}ms`,
                }}
              >
                <Card className="group h-full border border-border hover:border-primary/40 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 rounded-xl cursor-default">
                  <CardContent className="p-6 space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground group-hover:scale-110 transition-all duration-300">
                      <f.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground mb-1">{f.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {f.description}
                      </p>
                    </div>
                    <div className="pt-1 border-t border-border">
                      <span className="text-xs font-semibold text-primary">{f.stat}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ABOUT ── */}
      <section ref={aboutRef} className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[1px] bg-gradient-to-r from-transparent via-border to-transparent" />
        </div>

        <div
          className="container mx-auto px-6 py-20 md:py-24 max-w-2xl text-center space-y-5 transition-all duration-700"
          style={{
            opacity: aboutVisible ? 1 : 0,
            transform: aboutVisible ? "translateY(0)" : "translateY(24px)",
          }}
        >
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary">
            About
          </span>
          <h2 className="text-4xl font-extrabold text-foreground tracking-tight">
            About This System
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            The WMSU HRMO Tracker is an internal tool developed for the Human Resource
            Management Office of Western Mindanao State University. It is designed to
            digitize and streamline the recruitment lifecycle — from posting vacancies and
            receiving applications to evaluating candidates and generating hiring reports.
          </p>
          <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full border border-border bg-muted/40 text-sm text-muted-foreground">
            <Shield className="w-4 h-4 text-primary" />
            Access is restricted to authorized HR personnel only.
          </div>
        </div>
      </section>

      {/* ── CTA BAND ── */}
      <section className="bg-primary text-primary-foreground">
        <div className="container mx-auto px-6 py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-bold">Ready to get started?</h3>
            <p className="text-primary-foreground/70 text-sm mt-1">
              Log in with your authorized HR credentials.
            </p>
          </div>
          <Button
            size="lg"
            variant="secondary"
            className="rounded-full px-8 gap-2 shrink-0 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all"
            onClick={() => navigate("/login")}
          >
            Go to Login
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border bg-foreground text-background">
        <div className="container mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-3">
            <img
              src="/wmsu-seal.png"
              alt="WMSU Seal"
              className="w-7 h-7 brightness-200"
            />
            <span className="font-bold tracking-tight">WMSU HRMO Tracker</span>
          </div>
          <p className="text-background/50 text-xs">
            HR Office — Western Mindanao State University &copy;{" "}
            {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;