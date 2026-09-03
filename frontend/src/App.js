import "@/index.css";

import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { Toaster } from "sonner";

import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/layout/AppShell";

// Core pages
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import OwnerControlPage from "@/pages/OwnerControlPage";

// Platform management
import AIProvidersPage from "@/pages/AIProvidersPage";
import BrokersPage from "@/pages/BrokersPage";
import PluginsPage from "@/pages/PluginsPage";
import SettingsPage from "@/pages/SettingsPage";
import ProfilePage from "@/pages/ProfilePage";
import RolesPermissionsPage from "@/pages/RolesPermissionsPage";
import LogsPage from "@/pages/LogsPage";

// Trading
import OrdersPage from "@/pages/OrdersPage";
import PositionsPage from "@/pages/PositionsPage";
import StrategiesPage from "@/pages/StrategiesPage";
import BrokerDataPage from "@/pages/BrokerDataPage";
import MarketDataPage from "@/pages/MarketDataPage";


/*
|--------------------------------------------------------------------------
| Protected Application Shell
|--------------------------------------------------------------------------
|
| Every authenticated application page goes through the same shell.
| This keeps authentication, navigation and global layout centralized.
|
*/

function Shell({ children }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}


/*
|--------------------------------------------------------------------------
| Application Routes
|--------------------------------------------------------------------------
|
| Keep route definitions centralized.
|
| Future modules should be added as independent pages/routes rather than
| modifying authentication or the application shell.
|
*/

function AppRoutes() {
  return (
    <Routes>

      {/* ---------------------------------------------------------------- */}
      {/* Public                                                          */}
      {/* ---------------------------------------------------------------- */}

      <Route
        path="/login"
        element={<LoginPage />}
      />


      {/* ---------------------------------------------------------------- */}
      {/* Root                                                             */}
      {/* ---------------------------------------------------------------- */}

      <Route
        path="/"
        element={<Navigate to="/dashboard" replace />}
      />


      {/* ---------------------------------------------------------------- */}
      {/* Owner Dashboard                                                  */}
      {/* ---------------------------------------------------------------- */}

      <Route
        path="/dashboard"
        element={
          <Shell>
            <DashboardPage />
          </Shell>
        }
      />

      <Route
        path="/owner-control"
        element={
          <Shell>
            <OwnerControlPage />
          </Shell>
        }
      />


      {/* ---------------------------------------------------------------- */}
      {/* Broker / Execution Layer                                         */}
      {/* ---------------------------------------------------------------- */}

      <Route
        path="/brokers"
        element={
          <Shell>
            <BrokersPage />
          </Shell>
        }
      />


      {/* ---------------------------------------------------------------- */}
      {/* Strategy Layer                                                   */}
      {/* ---------------------------------------------------------------- */}

      <Route
        path="/strategies"
        element={
          <Shell>
            <StrategiesPage />
          </Shell>
        }
      />


      {/* ---------------------------------------------------------------- */}
      {/* Trading Operations                                               */}
      {/* ---------------------------------------------------------------- */}

      <Route
        path="/orders"
        element={
          <Shell>
            <OrdersPage />
          </Shell>
        }
      />

      <Route
        path="/positions"
        element={
          <Shell>
            <PositionsPage />
          </Shell>
        }
      />

      <Route path="/holdings" element={<Shell><BrokerDataPage title="Holdings" endpoint="/brokers/holdings" dataKey="holdings" /></Shell>} />
      <Route path="/funds" element={<Shell><BrokerDataPage title="Funds" endpoint="/brokers/funds" dataKey="funds" /></Shell>} />
      <Route path="/trade-history" element={<Shell><BrokerDataPage title="Trade History" endpoint="/brokers/trade-history" dataKey="trade_history" /></Shell>} />
      <Route path="/market-data" element={<Shell><MarketDataPage /></Shell>} />


      {/* ---------------------------------------------------------------- */}
      {/* AI / Automation                                                  */}
      {/* ---------------------------------------------------------------- */}

      <Route
        path="/ai"
        element={
          <Shell>
            <AIProvidersPage />
          </Shell>
        }
      />

      <Route
        path="/plugins"
        element={
          <Shell>
            <PluginsPage />
          </Shell>
        }
      />


      {/* ---------------------------------------------------------------- */}
      {/* Account / Administration                                         */}
      {/* ---------------------------------------------------------------- */}

      <Route
        path="/settings"
        element={
          <Shell>
            <SettingsPage />
          </Shell>
        }
      />

      <Route
        path="/profile"
        element={
          <Shell>
            <ProfilePage />
          </Shell>
        }
      />

      <Route
        path="/roles"
        element={
          <Shell>
            <RolesPermissionsPage />
          </Shell>
        }
      />

      <Route
        path="/logs"
        element={
          <Shell>
            <LogsPage />
          </Shell>
        }
      />


      {/* ---------------------------------------------------------------- */}
      {/* Unknown route                                                    */}
      {/* ---------------------------------------------------------------- */}

      <Route
        path="*"
        element={<Navigate to="/dashboard" replace />}
      />

    </Routes>
  );
}


/*
|--------------------------------------------------------------------------
| Root Application
|--------------------------------------------------------------------------
*/

export default function App() {
  return (
    <div className="dark min-h-screen">

      <BrowserRouter>

        <AuthProvider>

          <AppRoutes />

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
