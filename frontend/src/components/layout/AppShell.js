import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Cpu,
  Network,
  Puzzle,
  Settings,
  User,
  Shield,
  Terminal,
  Power,
  CircleDot,
  Menu,
  X,
  Command,
  ArrowUpRight,
  Server,
  Moon,
  Sun,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { api } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";
import TopTicker from "@/components/layout/TopTicker";


/*
|--------------------------------------------------------------------------
| Navigation
|--------------------------------------------------------------------------
|
| Keep all authenticated application navigation centralized here.
| Routes themselves remain defined in App.js.
|
*/

const NAV = [
  {
    to: "/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    tid: TEST_IDS.shell.navDashboard,
  },
  {
    to: "/owner-control",
    label: "Owner Control",
    icon: Command,
    tid: TEST_IDS.shell.navOwnerControl,
  },
  {
    to: "/ai",
    label: "AI Core",
    icon: Cpu,
    tid: TEST_IDS.shell.navAI,
  },
  {
    to: "/brokers",
    label: "Brokers",
    icon: Network,
    tid: TEST_IDS.shell.navBrokers,
  },
  {
    to: "/orders",
    label: "Orders",
    icon: ArrowUpRight,
    tid: TEST_IDS.shell.navOrders,
  },
  {
    to: "/positions",
    label: "Positions",
    icon: Server,
    tid: TEST_IDS.shell.navPositions,
  },
  {
    to: "/holdings",
    label: "Holdings",
    icon: Server,
  },
  {
    to: "/funds",
    label: "Funds",
    icon: Server,
  },
  {
    to: "/trade-history",
    label: "Trade History",
    icon: Server,
  },
  {
    to: "/market-data",
    label: "Market Data",
    icon: Server,
  },
  {
    to: "/strategies",
    label: "Strategies",
    icon: Puzzle,
    tid: TEST_IDS.shell.navStrategies,
  },
  {
    to: "/plugins",
    label: "Plugins",
    icon: Puzzle,
    tid: TEST_IDS.shell.navPlugins,
  },
  {
    to: "/roles",
    label: "Roles",
    icon: Shield,
    tid: TEST_IDS.shell.navRoles,
  },
  {
    to: "/logs",
    label: "Audit Logs",
    icon: Terminal,
    tid: TEST_IDS.shell.navLogs,
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    tid: TEST_IDS.shell.navSettings,
  },
  {
    to: "/profile",
    label: "Profile",
    icon: User,
    tid: TEST_IDS.shell.navProfile,
  },
];


/*
|--------------------------------------------------------------------------
| Sidebar
|--------------------------------------------------------------------------
*/

function SidebarContent({ health, onNavClick }) {
  const { theme } = useTheme();

  return (
    <>
      <div className="h-14 px-4 flex items-center border-b border-term-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 border border-term-accent grid place-items-center">
            <CircleDot size={12} className="text-term-accent" />
          </div>

          <div>
            <div className="font-display text-sm font-bold tracking-tight">
              TERMINAL/PRO
            </div>

            <div className="font-mono text-[10px] text-term-muted uppercase">
              v1.0.0 · owner
            </div>
          </div>
        </div>
      </div>

      <nav
        className="flex-1 p-2 space-y-0.5 overflow-y-auto"
        aria-label="Primary navigation"
      >
        {NAV.map((n) => {
          const Icon = n.icon;

          return (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={onNavClick}
              data-testid={n.tid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 h-9 text-[13px] border-l-2 ${
                  isActive
                    ? "bg-term-hover border-term-accent text-term-text"
                    : "border-transparent text-term-secondary hover:bg-term-surface hover:text-term-text"
                }`
              }
            >
              <Icon size={14} aria-hidden="true" />
              <span className="font-medium">{n.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-term-border shrink-0">
        <div className="font-mono text-[10px] text-term-muted uppercase mb-1">
          DB
        </div>

        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span
            className={`h-1.5 w-1.5 ${
              health.ok
                ? "bg-term-success"
                : health.ok === false
                  ? "bg-term-danger"
                  : "bg-term-warning"
            }`}
            aria-hidden="true"
          />

          <span
            className={
              health.ok
                ? "text-term-success"
                : health.ok === false
                  ? "text-term-danger"
                  : "text-term-warning"
            }
          >
            {health.ok === true
              ? "connected"
              : health.ok === false
                ? "offline"
                : "checking"}
          </span>
        </div>
      </div>
    </>
  );
}


/*
|--------------------------------------------------------------------------
| Theme Toggle
|--------------------------------------------------------------------------
|
| One global application-level theme control.
|
| Theme state itself lives in ThemeContext. This component only exposes
| the action and current state through the shell UI.
|
*/

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === "dark";
  const nextThemeLabel = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      aria-label={nextThemeLabel}
      title={nextThemeLabel}
      aria-pressed={!isDark}
      onClick={toggleTheme}
      className="h-8 w-8 sm:w-auto sm:px-2.5 border border-term-border hover:border-term-accent hover:text-term-accent flex items-center justify-center gap-1.5 text-[12px] shrink-0"
    >
      {isDark ? (
        <Sun size={14} aria-hidden="true" />
      ) : (
        <Moon size={14} aria-hidden="true" />
      )}

      <span className="font-mono text-[10px] hidden xl:inline uppercase">
        {isDark ? "LIGHT" : "DARK"}
      </span>
    </button>
  );
}


/*
|--------------------------------------------------------------------------
| Application Shell
|--------------------------------------------------------------------------
*/

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [health, setHealth] = useState({ ok: null });
  const [clock, setClock] = useState(new Date());
  const [mobileOpen, setMobileOpen] = useState(false);

  /*
   * Lightweight system clock + one health request.
   *
   * The clock is local UI state only and does not make network requests.
   * Health is intentionally checked once when the shell mounts.
   */
  useEffect(() => {
    let alive = true;

    const timer = setInterval(() => {
      setClock(new Date());
    }, 1000);

    api
      .get("/health")
      .then((response) => {
        if (alive) {
          setHealth(
            response?.data && typeof response.data === "object"
              ? response.data
              : { ok: false }
          );
        }
      })
      .catch(() => {
        if (alive) {
          setHealth({ ok: false });
        }
      });

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  /*
   * Close the mobile drawer whenever the viewport is moved back to
   * desktop size. This prevents a stale mobile drawer state.
   */
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const doLogout = async () => {
    await logout();
    navigate("/login");
  };

  const closeMobileNavigation = () => {
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-term-bg text-term-text">
      {/* ---------------------------------------------------------------- */}
      {/* Desktop sidebar                                                 */}
      {/* ---------------------------------------------------------------- */}

      <aside
        data-testid={TEST_IDS.shell.sidebar}
        className="hidden lg:flex w-60 shrink-0 border-r border-term-border bg-term-panel flex-col"
      >
        <SidebarContent health={health} />
      </aside>


      {/* ---------------------------------------------------------------- */}
      {/* Mobile drawer                                                    */}
      {/* ---------------------------------------------------------------- */}

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex"
          data-testid={TEST_IDS.shell.mobileDrawer}
        >
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
            onClick={closeMobileNavigation}
          />

          <aside className="relative w-64 max-w-[80%] border-r border-term-border bg-term-panel flex flex-col">
            <SidebarContent
              health={health}
              onNavClick={closeMobileNavigation}
            />
          </aside>

          <button
            type="button"
            data-testid={TEST_IDS.shell.mobileClose}
            aria-label="Close menu"
            title="Close menu"
            onClick={closeMobileNavigation}
            className="absolute top-3 right-3 h-9 w-9 grid place-items-center border border-term-border bg-term-surface hover:bg-term-hover"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}


      {/* ---------------------------------------------------------------- */}
      {/* Main application area                                            */}
      {/* ---------------------------------------------------------------- */}

      <div className="flex-1 flex flex-col min-w-0">
        <header
          data-testid={TEST_IDS.shell.topbar}
          className="h-14 border-b border-term-border bg-term-panel px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger — mobile only */}
            <button
              type="button"
              data-testid={TEST_IDS.shell.mobileToggle}
              aria-label="Open menu"
              title="Open menu"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
              className="lg:hidden h-9 w-9 grid place-items-center border border-term-border shrink-0 hover:bg-term-hover"
            >
              <Menu size={16} aria-hidden="true" />
            </button>

            <div className="font-mono text-[11px] text-term-muted uppercase hidden md:block">
              SYSTEM
            </div>

            <div className="font-mono text-[11px] flex items-center gap-2 shrink-0">
              <span
                className="h-1.5 w-1.5 bg-term-success"
                aria-hidden="true"
              />

              <span className="text-term-success hidden sm:inline">
                OPERATIONAL
              </span>

              <span className="text-term-success sm:hidden">
                OK
              </span>
            </div>

            <div className="w-px h-4 bg-term-border hidden md:block" />

            <div className="font-mono text-[11px] text-term-secondary hidden md:block truncate">
              {clock.toISOString().replace("T", " ").slice(0, 19)} UTC
            </div>
          </div>


          {/* ---------------------------------------------------------------- */}
          {/* Right-side controls                                               */}
          {/* ---------------------------------------------------------------- */}

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <ThemeToggle />

            <div
              data-testid={TEST_IDS.shell.userMenu}
              className="hidden sm:flex items-center gap-2 px-3 h-8 border border-term-border"
            >
              <div
                className="h-2 w-2 bg-term-accent"
                aria-hidden="true"
              />

              <span className="font-mono text-[11px] max-w-[140px] truncate">
                {user?.username || "OWNER"}
              </span>

              {user?.role && (
                <span className="font-mono text-[10px] text-term-muted uppercase">
                  {user.role}
                </span>
              )}
            </div>

            <button
              type="button"
              data-testid={TEST_IDS.shell.logout}
              onClick={doLogout}
              className="h-8 px-2 sm:px-3 border border-term-border hover:border-term-danger hover:text-term-danger flex items-center gap-1.5 text-[12px]"
            >
              <Power size={12} aria-hidden="true" />

              <span className="font-mono hidden sm:inline">
                LOGOUT
              </span>
            </button>
          </div>
        </header>

        <TopTicker />

        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
    }
