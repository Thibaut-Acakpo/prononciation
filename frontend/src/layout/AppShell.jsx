import { Outlet } from "react-router-dom";
import BottomNav from "./BottomNav";
import InstallPrompt from "../components/InstallPrompt";
import InstallAnalytics from "../components/InstallAnalytics";
import OfflineNotifier from "../components/OfflineNotifier";
import EmailVerifyBanner from "../components/EmailVerifyBanner";
import AdminPreviewBanner from "../components/AdminPreviewBanner";

export default function AppShell() {
  return (
    <div className="app-shell">
      <OfflineNotifier />
      <main className="app-shell__content">
        <AdminPreviewBanner />
        <EmailVerifyBanner />
        <Outlet />
      </main>
      <BottomNav />
      <InstallPrompt />
      <InstallAnalytics />
    </div>
  );
}
