import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/layout/AppShell";

import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import OwnerControlPage from "@/pages/OwnerControlPage";
import AIProvidersPage from "@/pages/AIProvidersPage";
import BrokersPage from "@/pages/BrokersPage";
import PluginsPage from "@/pages/PluginsPage";
import SettingsPage from "@/pages/SettingsPage";
import ProfilePage from "@/pages/ProfilePage";
import LogsPage from "@/pages/LogsPage";

function Shell({ children }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <div className="dark">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Shell><DashboardPage /></Shell>} />
            <Route path="/owner-control" element={<Shell><OwnerControlPage /></Shell>} />
            {/* Legacy /roles route redirects into Owner Control */}
            <Route path="/roles" element={<Navigate to="/owner-control" replace />} />
            <Route path="/ai" element={<Shell><AIProvidersPage /></Shell>} />
            <Route path="/brokers" element={<Shell><BrokersPage /></Shell>} />
            <Route path="/plugins" element={<Shell><PluginsPage /></Shell>} />
            <Route path="/settings" element={<Shell><SettingsPage /></Shell>} />
            <Route path="/profile" element={<Shell><ProfilePage /></Shell>} />
            <Route path="/logs" element={<Shell><LogsPage /></Shell>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          <Toaster
            position="bottom-right"
            theme="dark"
            toastOptions={{
              style: {
                background: "#121214",
                border: "1px solid #27272A",
                color: "#F4F4F5",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: "12px",
                borderRadius: "2px",
              },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
