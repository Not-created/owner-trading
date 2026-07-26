import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { TEST_IDS } from "@/constants/testIds";

export default function RolesPermissionsPage() {
  const [roles, setRoles] = useState([]);
  const [matrix, setMatrix] = useState([]);
  useEffect(() => {
    api.get("/roles").then(({ data }) => { setRoles(data.roles); setMatrix(data.matrix); }).catch(() => {});
  }, []);
  return (
    <div data-testid={TEST_IDS.roles.root} className="p-6 space-y-6 max-w-[1400px]">
      <div>
        <div className="font-mono text-[10px] text-term-muted uppercase tracking-wider">// rbac.matrix</div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Roles &amp; Permissions</h1>
        <p className="text-term-secondary text-[13px] mt-1">Permission matrix baked into the platform. Additional custom roles ship in Part 2.</p>
      </div>

      <section className="border border-term-border bg-term-surface overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-term-border">
            <tr className="font-mono text-[10px] text-term-muted uppercase">
              <th className="px-4 h-10 sticky left-0 bg-term-surface">Permission</th>
              {roles.map((r) => <th key={r} className="px-4 h-10 text-center">{r.replace("_", " ")}</th>)}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.permission} className="border-b border-term-border/50">
                <td className="px-4 h-9 font-mono text-[11px] sticky left-0 bg-term-surface">{row.permission}</td>
                {roles.map((r) => (
                  <td key={r} className="px-4 h-9 text-center">
                    {row[r] ? <Check size={14} className="inline text-term-success" /> : <X size={14} className="inline text-term-muted" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
