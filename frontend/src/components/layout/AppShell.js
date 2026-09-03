import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Cpu, Network, Puzzle, Settings, User, Shield, Terminal, Power,
  CircleDot, Menu, X, Command, ArrowUpRight, Server,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";
import TopTicker from "@/components/layout/TopTicker";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, tid: TEST_IDS.shell.navDashboard },
  { to: "/owner-control", label: "Owner Control", icon: Command, tid: TEST_IDS.shell.navOwnerControl },
  { to: "/ai", label: "AI Core", icon: Cpu, tid: TEST_IDS.shell.navAI },
  { to: "/brokers", label: "Brokers", icon: Network, tid: TEST_IDS.shell.navBrokers },
  { to: "/orders", label: "Orders", icon: ArrowUpRight, tid: TEST_IDS.shell.navOrders },
  { to: "/positions", label: "Positions", icon: Server, tid: TEST_IDS.shell.navPositions },
  { to: "/holdings", label: "Holdings", icon: Server },
  { to: "/funds", label: "Funds", icon: Server },
  { to: "/trade-history", label: "Trade History", icon: Server },
  { to: "/market-data", label: "Market Data", icon: Server },
  { to: "/strategies", label: "Strategies", icon: Puzzle, tid: TEST_IDS.shell.navStrategies },
  { to: "/plugins", label: "Plugins", icon: Puzzle, tid: TEST_IDS.shell.navPlugins },
  { to: "/roles", label: "Roles", icon: Shield, tid: TEST_IDS.shell.navRoles },
  { to: "/logs", label: "Audit Logs", icon: Terminal, tid: TEST_IDS.shell.navLogs },
  { to: "/settings", label: "Settings", icon: Settings, tid: TEST_IDS.shell.navSettings },
  { to: "/profile", label: "Profile", icon: User, tid: TEST_IDS.shell.navProfile },
];

function SidebarContent({ health, onNavClick }) {
  return (
    <>
      <div className="h-14 px-4 flex items-center border-b border-term-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 border border-term-accent grid place-items-center">
            <CircleDot size={12} className="text-term-accent" />
          </div>
          <div>
            <div className="font-display text-sm font-bold tracking-tight">TERMINAL/PRO</div>
            <div className="font-mono text-[10px] text-term-muted uppercase">v1.0.0 · owner</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV.map((n) => (
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
            <n.icon size={14} />
            <span className="font-medium">{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-term-border shrink-0">
        <div className="font-mono text-[10px] text-term-muted uppercase mb-1">DB</div>
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className={`h-1.5 w-1.5 ${health.ok ? "bg-term-success" : "bg-term-danger"}`} />
          <span className={health.ok ? "text-term-success" : "text-term-danger"}>
            {health.ok ? "connected" : "offline"}
          </span>
        </div>
      </div>
    </>
  );
}

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [health, setHealth] = useState({ ok: null });
  const [clock, setClock] = useState(new Date());
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const t = setInterval(() => setClock(new Date()), 1000);
    api.get("/health").then((r) => alive && setHealth(r.data)).catch(() => alive && setHealth({ ok: false }));
    return () => { alive = false; clearInterval(t); };
  }, []);

  const doLogout = async () => { await logout(); navigate("/login"); };

  return (
    <div className="min-h-screen flex bg-term-bg text-term-text">
      {/* Desktop sidebar */}
      <aside
        data-testid={TEST_IDS.shell.sidebar}
        className="hidden lg:flex w-60 shrink-0 border-r border-term-border bg-term-panel flex-col"
      >
        <SidebarContent health={health} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex" data-testid={TEST_IDS.shell.mobileDrawer}>
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 max-w-[80%] border-r border-term-border bg-term-panel flex flex-col">
            <SidebarContent health={health} onNavClick={() => setMobileOpen(false)} />
          </aside>
          <button
            data-testid={TEST_IDS.shell.mobileClose}
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute top-3 right-3 h-9 w-9 grid place-items-center border border-term-border bg-term-surface"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header
          data-testid={TEST_IDS.shell.topbar}
          className="h-14 border-b border-term-border bg-term-panel px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger — mobile only */}
            <button
              data-testid={TEST_IDS.shell.mobileToggle}
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden h-9 w-9 grid place-items-center border border-term-border shrink-0"
            >
              <Menu size={16} />
            </button>

            <div className="font-mono text-[11px] text-term-muted uppercase hidden md:block">SYSTEM</div>
            <div className="font-mono text-[11px] flex items-center gap-2 shrink-0">
              <span className="h-1.5 w-1.5 bg-term-success" />
              <span className="text-term-success hidden sm:inline">OPERATIONAL</span>
              <span className="text-term-success sm:hidden">OK</span>
            </div>
            <div className="w-px h-4 bg-term-border hidden md:block" />
            <div className="font-mono text-[11px] text-term-secondary hidden md:block truncate">
              {clock.toISOString().replace("T", " ").slice(0, 19)} UTC
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div data-testid={TEST_IDS.shell.userMenu} className="hidden sm:flex items-center gap-2 px-3 h-8 border border-term-border">
              <div className="h-2 w-2 bg-term-accent" />
              <span className="font-mono text-[11px]">{user?.username}</span>
              <span className="font-mono text-[10px] text-term-muted uppercase">{user?.role}</span>
            </div>
            <button
              data-testid={TEST_IDS.shell.logout}
              onClick={doLogout}
              className="h-8 px-2 sm:px-3 border border-term-border hover:border-term-danger hover:text-term-danger flex items-center gap-1.5 text-[12px]"
            >
              <Power size={12} />
              <span className="font-mono hidden sm:inline">LOGOUT</span>
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
