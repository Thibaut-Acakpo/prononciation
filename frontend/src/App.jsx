import { Routes, Route, Navigate } from "react-router-dom";
import AppShell from "./layout/AppShell";
import HomeScreen from "./pages/HomeScreen";
import PracticeScreen from "./pages/PracticeScreen";
import MatchScreen from "./pages/MatchScreen";
import DailyChallengeScreen from "./pages/DailyChallengeScreen";
import HistoryScreen from "./pages/HistoryScreen";
import LoginScreen from "./pages/LoginScreen";
import ForgotPasswordScreen from "./pages/ForgotPasswordScreen";
import RegisterScreen from "./pages/RegisterScreen";
import ProfileScreen from "./pages/ProfileScreen";
import CameraDiagnosticScreen from "./pages/CameraDiagnosticScreen";
import VerifyEmailScreen from "./pages/VerifyEmailScreen";
import PremiumScreen from "./pages/PremiumScreen";
import PremiumInsightsScreen from "./pages/PremiumInsightsScreen";
import AdminDashboardScreen from "./pages/AdminDashboardScreen";
import AdminUsersScreen from "./pages/AdminUsersScreen";
import AdminPaymentsScreen from "./pages/AdminPaymentsScreen";
import AdminUserDetailScreen from "./pages/AdminUserDetailScreen";
import AdminRoute from "./auth/AdminRoute";
import AdminLayout from "./layout/AdminLayout";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/practice" element={<PracticeScreen />} />
        <Route path="/match" element={<MatchScreen />} />
        <Route path="/daily" element={<DailyChallengeScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
        <Route path="/camera-diagnostic" element={<CameraDiagnosticScreen />} />
        <Route path="/verify-email" element={<VerifyEmailScreen />} />
        <Route path="/premium" element={<PremiumScreen />} />
        <Route path="/premium/insights" element={<PremiumInsightsScreen />} />
      </Route>
      <Route element={<AdminRoute><AdminLayout /></AdminRoute>}>
        <Route path="/admin" element={<AdminDashboardScreen />} />
        <Route path="/admin/users" element={<AdminUsersScreen />} />
        <Route path="/admin/payments" element={<AdminPaymentsScreen />} />
        <Route path="/admin/users/:id" element={<AdminUserDetailScreen />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
