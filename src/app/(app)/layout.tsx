import { AppShell } from "@/components/app-shell";
import { SetupRequired } from "@/components/setup-required";
import { requireUser } from "@/lib/auth";
import { CHANNEL_SUMMARY_COLUMNS, type ChannelSummary } from "@/lib/channels";
import { isSupabaseConfigured } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const user = await requireUser();
  const supabase = await getServerSupabase();

  // A RLS devolve apenas os canais que o utilizador pode ver.
  const [{ data: channels }, { data: unreadRows }] = await Promise.all([
    supabase
      .from("channels")
      .select(CHANNEL_SUMMARY_COLUMNS)
      .eq("status", "active")
      .order("sort_order")
      .order("name"),
    supabase.rpc("get_unread_counts"),
  ]);

  const visible: ChannelSummary[] = channels ?? [];
  const unread: Record<string, number> = {};
  for (const row of unreadRows ?? []) unread[row.channel_id] = Number(row.unread);

  return (
    <AppShell
      user={{ id: user.id, fullName: user.fullName, role: user.role }}
      channels={visible}
      subscribedChannelIds={visible.map((c) => c.id)}
      initialUnread={unread}
    >
      {children}
    </AppShell>
  );
}
