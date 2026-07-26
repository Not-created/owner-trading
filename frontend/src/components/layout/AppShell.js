import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Cpu, Network, Puzzle, Settings, User, Shield, Terminal, Power, CircleDot,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, tid: TEST_IDS.shell.navDashboard },
  { to: "/ai", label: "AI Core", icon: Cpu, tid: TEST_IDS.shell.navAI },
  { to: "/brokers", label: "Brokers", icon: Network, tid: TEST_IDS.shell.navBrokers },
  { to: "/plugins", label: "Plugins", icon: Puzzle, tid: TEST_IDS.shell.navPlugins },
  { to: "/roles", label: "Roles", icon: Shield, tid: TEST_IDS.shell.navRoles },
  { to: "/logs", label: "Audit Logs", icon: Terminal, tid: TEST_IDS.shell.navLogs },
  { to: "/settings", label: "Settings", icon: Settings, tid: TEST_IDS.shell.navSettings },
  { to: "/profile", label: "Profile", icon: User, tid: TEST_IDS.shell.navProfile },
];

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [health, setHealth] = useState({ ok: null });
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    let alive = true;
    const t = setInterval(() => setClock(new Date()), 1000);
    api.get("/health").then((r) => alive && setHealth(r.data)).catch(() => alive && setHealth({ ok: false }));
    return () => { alive = false; clearInterval(t); };
  }, []);

  const doLogout = async () => { await logout(); navigate("/login"); };

  return (
    <div className="min-h-screen flex bg-term-bg text-term-text">
      <aside data-testid={TEST_IDS.shell.sidebar} className="w-60 shrink-0 border-r border-term-border bg-term-panel flex flex-col">
        <div className="h-14 px-4 flex items-center border-b border-term-border">
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
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
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
        <div className="p-3 border-t border-term-border">
          <div className="font-mono text-[10px] text-term-muted uppercase mb-1">DB</div>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className={`h-1.5 w-1.5 ${health.ok ? "bg-term-success" : "bg-term-danger"}`} />
            <span className={health.ok ? "text-term-success" : "text-term-danger"}>
              {health.ok ? "connected" : "offline"}
            </span>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header data-testid={TEST_IDS.shell.topbar} className="h-14 border-b border-term-border bg-term-panel px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="font-mono text-[11px] text-term-muted uppercase">SYSTEM</div>
            <div className="font-mono text-[11px] flex items-center gap-2">
              <span className="h-1.5 w-1.5 bg-term-success" />
              <span className="text-term-success">OPERATIONAL</span>
            </div>
            <div className="w-px h-4 bg-term-border" />
            <div className="font-mono text-[11px] text-term-secondary">
              {clock.toISOString().replace("T", " ").slice(0, 19)} UTC
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div data-testid={TEST_IDS.shell.userMenu} className="flex items-center gap-2 px-3 h-8 border border-term-border">
              <div className="h-2 w-2 bg-term-accent" />
              <span className="font-mono text-[11px]">{user?.username}</span>
              <span className="font-mono text-[10px] text-term-muted uppercase">{user?.role}</span>
            </div>
            <button
              data-testid={TEST_IDS.shell.logout}
              onClick={doLogout}
              className="h-8 px-3 border border-term-border hover:border-term-danger hover:text-term-danger flex items-center gap-2 text-[12px]"
            >
              <Power size={12} />
              <span className="font-mono">LOGOUT</span>
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
