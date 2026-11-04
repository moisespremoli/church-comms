import type { Metadata } from "next";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Auditoria" };

const ACTIONS: Record<string, string> = { insert: "Criou", update: "Alterou", delete: "Removeu" };
const ENTITIES: Record<string, string> = {
  profiles: "perfil",
  teams: "equipa",
  team_members: "membro de equipa",
  channels: "canal",
  channel_members: "membro de canal",
};

const dateTime = new Intl.DateTimeFormat("pt-PT", { dateStyle: "short", timeStyle: "medium" });

export default async function AuditPage() {
  const supabase = await getServerSupabase();
  const [{ data: logs }, { data: profiles }] = await Promise.all([
    supabase
      .from("activity_logs")
      .select("id, actor_id, action, entity_type, entity_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("profiles").select("id, full_name"),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name || "Sem nome"]));

  return (
    <section aria-labelledby="auditoria" className="space-y-3">
      <h2 id="auditoria" className="text-lg font-bold">
        Registo de auditoria <span className="text-sm font-normal text-ink-faint">(últimos 200 eventos)</span>
      </h2>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-surface-2 text-ink-muted">
            <tr>
              <th scope="col" className="p-3 font-semibold">Quando</th>
              <th scope="col" className="p-3 font-semibold">Quem</th>
              <th scope="col" className="p-3 font-semibold">Ação</th>
              <th scope="col" className="p-3 font-semibold">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {(logs ?? []).map((log) => (
              <tr key={log.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap p-3 text-ink-faint">{dateTime.format(new Date(log.created_at))}</td>
                <td className="p-3">{log.actor_id ? (names.get(log.actor_id) ?? "—") : "Sistema"}</td>
                <td className="p-3">
                  {ACTIONS[log.action] ?? log.action} {ENTITIES[log.entity_type] ?? log.entity_type}
                </td>
                <td className="p-3">
                  <details>
                    <summary className="cursor-pointer text-ink-muted">{log.entity_id}</summary>
                    <pre className="mt-2 max-w-xl overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-surface-1 p-2 text-xs text-ink-muted">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
