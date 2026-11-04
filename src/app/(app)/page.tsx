import type { Metadata } from "next";
import { Dashboard } from "./dashboard";
import { requireUser, ROLE_LABELS } from "@/lib/auth";
import { CHANNEL_SUMMARY_COLUMNS } from "@/lib/channels";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Painel" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await requireUser();
  const supabase = await getServerSupabase();
  const { erro } = await searchParams;

  const [{ data: channels }, { data: memberships }, { data: unreadRows }] = await Promise.all([
    supabase.from("channels").select(CHANNEL_SUMMARY_COLUMNS).eq("status", "active").order("sort_order").order("name"),
    supabase.from("channel_members").select("channel_id, member_role").eq("user_id", user.id),
    supabase.rpc("get_unread_counts"),
  ]);

  const memberOf = new Map((memberships ?? []).map((m) => [m.channel_id, m.member_role]));
  const lastActivity: Record<string, string | null> = {};
  for (const row of unreadRows ?? []) lastActivity[row.channel_id] = row.last_message_at;

  return (
    <Dashboard
      userName={user.fullName}
      roleLabel={ROLE_LABELS[user.role]}
      isAdmin={user.role === "admin"}
      permissionError={erro === "sem-permissao"}
      channels={(channels ?? []).map((c) => ({
        ...c,
        isMember: memberOf.has(c.id),
        isLead: memberOf.get(c.id) === "lead",
        lastMessageAt: lastActivity[c.id] ?? null,
      }))}
    />
  );
}
