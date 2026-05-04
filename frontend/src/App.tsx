import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import JobVacancies from "./pages/JobVacancies";
import Applicants from "./pages/Applicants";
import ApplicationTracking from "./pages/ApplicationTracking";
import Evaluations from "./pages/Evaluations";
import Reports from "./pages/Reports";
import UserManagement from "./pages/UserManagement";
import AuditLogs from "./pages/AuditLogs";
import Archive from "./pages/Archive";
import ErrorPage from "./pages/ErrorPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/vacancies" element={<JobVacancies />} />
              <Route path="/applicants" element={<Applicants />} />
              <Route path="/tracking" element={<ApplicationTracking />} />
              <Route path="/evaluations" element={<Evaluations />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/audit-logs" element={<AuditLogs />} />
              <Route path="/archive" element={<Archive />} />
            </Route>
            <Route path="/error/:code" element={<ErrorPage />} />
            <Route path="*" element={<ErrorPage code={404} />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
