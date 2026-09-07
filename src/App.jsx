import React, {
  useEffect,
  useState,
} from "react";

import {
  AppProvider,
  useAuth,
} from "./context.jsx";

import {
  Alert,
  Button,
  Loading,
  ThemeToggle,
} from "./components/UI.jsx";

import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Broker from "./pages/Broker.jsx";
import Orders from "./pages/Orders.jsx";
import Positions from "./pages/Positions.jsx";
import Strategies from "./pages/Strategies.jsx";
import Backtest from "./pages/Backtest.jsx";
import Risk from "./pages/Risk.jsx";
import OwnerControl from "./pages/OwnerControl.jsx";
import Logs from "./pages/Logs.jsx";
import Settings from "./pages/Settings.jsx";
import AI from "./pages/AI.jsx";
import Plugins from "./pages/Plugins.jsx";
import Profile from "./pages/Profile.jsx";
import System from "./pages/System.jsx";

/* ============================================================
   OWNER TRADING APPLICATION SHELL
   ------------------------------------------------------------
   Responsibilities:
   - Global AppProvider
   - Authentication gate
   - Hash-based navigation
   - Main application navigation
   - Theme control
   - Logout
   - Page rendering
   ============================================================ */

/* ============================================================
   ROUTE DEFINITIONS
   ============================================================ */

const ROUTES = [
  {
    path: "dashboard",
    label: "Dashboard",
    component: Dashboard,
  },
  {
    path: "broker",
    label: "Broker",
    component: Broker,
  },
  {
    path: "orders",
    label: "Orders",
    component: Orders,
  },
  {
    path: "positions",
    label: "Positions",
    component: Positions,
  },
  {
    path: "strategies",
    label: "Strategies",
    component: Strategies,
  },
  {
    path: "backtest",
    label: "Backtest",
    component: Backtest,
  },
  {
    path: "risk",
    label: "Risk",
    component: Risk,
  },
  {
    path: "owner-control",
    label: "Owner Control",
    component: OwnerControl,
  },
  {
    path: "logs",
    label: "Logs",
    component: Logs,
  },
  {
    path: "settings",
    label: "Settings",
    component: Settings,
  },
  {
    path: "ai",
    label: "AI",
    component: AI,
  },
  {
    path: "plugins",
    label: "Plugins",
    component: Plugins,
  },
  {
    path: "profile",
    label: "Profile",
    component: Profile,
  },
  {
    path: "system",
    label: "System",
    component: System,
  },
];

/* ============================================================
   HASH ROUTE HELPERS
   ============================================================ */

function getRouteFromHash() {
  if (
    typeof window === "undefined"
  ) {
    return "dashboard";
  }

  const hash =
    window.location.hash || "";

  const cleaned =
    hash
      .replace(/^#\/?/, "")
      .split("?")[0]
      .replace(/\/+$/, "");

  if (!cleaned) {
    return "dashboard";
  }

  return cleaned;
}

function navigate(path) {
  if (
    typeof window === "undefined"
  ) {
    return;
  }

  const normalized =
    String(path)
      .replace(/^#\/?/, "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");

  window.location.hash =
    `#/${normalized}`;
}

/* ============================================================
   ROUTE LOOKUP
   ============================================================ */

function resolveRoute(path) {
  return (
    ROUTES.find(
      (route) =>
        route.path === path
    ) ||
    ROUTES[0]
  );
}

/* ============================================================
   AUTHENTICATION GATE
   ============================================================ */

function AuthenticationGate() {
  const {
    isAuthenticated,
    authLoading,
    authError,
  } = useAuth();

  if (authLoading) {
    return (
      <div className="app-loading-screen">
        <Loading
          label="Restoring Owner Trading session..."
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  if (authError) {
    /*
     * Authentication errors that are not a normal 401 are
     * displayed without preventing the user from using the
     * login/authentication surface.
     */
    return (
      <>
        <div className="app-auth-warning">
          <Alert
            variant="warning"
            title="Authentication"
            message={authError}
          />
        </div>

        <Login />
      </>
    );
  }

  return <AuthenticatedApplication />;
}

/* ============================================================
   AUTHENTICATED APPLICATION
   ============================================================ */

function AuthenticatedApplication() {
  const {
    user,
    logout,
    authLoading,
  } = useAuth();

  const [
    currentRoute,
    setCurrentRoute,
  ] = useState(
    getRouteFromHash()
  );

  /* ==========================================================
     HASH NAVIGATION
     ========================================================== */

  useEffect(() => {
    const handleHashChange =
      () => {
        setCurrentRoute(
          getRouteFromHash()
        );
      };

    window.addEventListener(
      "hashchange",
      handleHashChange
    );

    return () => {
      window.removeEventListener(
        "hashchange",
        handleHashChange
      );
    };
  }, []);

  /* ==========================================================
     ROUTE VALIDATION
     ========================================================== */

  useEffect(() => {
    const route =
      resolveRoute(
        currentRoute
      );

    if (
      route.path !==
      currentRoute
    ) {
      navigate(
        route.path
      );
    }
  }, [
    currentRoute,
  ]);

  /* ==========================================================
     LOGOUT
     ========================================================== */

  const handleLogout =
    async () => {
      await logout();

      navigate(
        "login"
      );
    };

  const route =
    resolveRoute(
      currentRoute
    );

  const Page =
    route.component;

  return (
    <div className="app-shell">
      {/* ====================================================
          TOP BAR
          ==================================================== */}

      <header className="topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="brand-button"
            onClick={() =>
              navigate(
                "dashboard"
              )
            }
            aria-label="Open Dashboard"
          >
            <span className="brand-mark">
              OT
            </span>

            <span className="brand-name">
              Owner Trading
            </span>
          </button>
        </div>

        <div className="topbar-right">
          <span className="topbar-user">
            {user?.name ||
              user?.username ||
              "Owner"}
          </span>

          <ThemeToggle />

          <Button
            variant="secondary"
            size="sm"
            onClick={
              handleLogout
            }
            loading={
              authLoading
            }
          >
            Logout
          </Button>
        </div>
      </header>

      {/* ====================================================
          MAIN APPLICATION AREA
          ==================================================== */}

      <div className="app-body">
        {/* ==================================================
            SIDE NAVIGATION
            ================================================== */}

        <aside className="sidebar">
          <nav
            className="sidebar-nav"
            aria-label="Owner Trading navigation"
          >
            {ROUTES.map(
              (item) => {
                const active =
                  item.path ===
                  route.path;

                return (
                  <button
                    key={
                      item.path
                    }
                    type="button"
                    className={
                      active
                        ? "nav-item active"
                        : "nav-item"
                    }
                    onClick={() =>
                      navigate(
                        item.path
                      )
                    }
                  >
                    {item.label}
                  </button>
                );
              }
            )}
          </nav>
        </aside>

        {/* ==================================================
            PAGE CONTENT
            ================================================== */}

        <main className="main-content">
          <Page />
        </main>
      </div>
    </div>
  );
}

/* ============================================================
   ROOT APPLICATION
   ============================================================ */

export default function App() {
  return (
    <AppProvider>
      <AuthenticationGate />
    </AppProvider>
  );
}
