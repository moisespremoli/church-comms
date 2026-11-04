import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChannelView, type MemberInfo } from "./channel-view";
import { requireUser } from "@/lib/auth";
import { MESSAGE_COLUMNS, MESSAGE_PAGE_SIZE } from "@/lib/messages/model";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Canal" };

export default async function ChannelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const supabase = await getServerSupabase();

  // RLS: só devolve o canal se o utilizador o puder ver.
  const { data: channel } = await supabase
    .from("channels")
    .select("id, slug, name, description, icon, color, status, is_emergency")
    .eq("slug", slug)
    .maybeSingle();
  if (!channel) notFound();

  const [{ data: membership }, { data: latest }, { data: memberRows }] = await Promise.all([
    supabase
      .from("channel_members")
      .select("member_role, can_post")
      .eq("channel_id", channel.id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("channel_id", channel.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1),
    supabase
      .from("channel_members")
      .select("user_id, member_role, profiles(id, full_name)")
      .eq("channel_id", channel.id),
  ]);

  const rows = latest ?? [];
  const hasMore = rows.length > MESSAGE_PAGE_SIZE;
  const initialMessages = rows.slice(0, MESSAGE_PAGE_SIZE).reverse();

  const members: MemberInfo[] = (memberRows ?? []).map((row) => ({
    id: row.user_id,
    name: row.profiles?.full_name || "Sem nome",
    isLead: row.member_role === "lead",
  }));
  if (!members.some((m) => m.id === user.id)) {
    members.push({ id: user.id, name: user.fullName, isLead: false });
  }

  const canPost =
    channel.status === "active" && (user.role === "admin" || Boolean(membership?.can_post));

  return (
    <ChannelView
      key={channel.id}
      channel={channel}
      me={{ id: user.id, name: user.fullName }}
      isMember={Boolean(membership)}
      canPost={canPost}
      members={members}
      initialMessages={initialMessages}
      initialHasMore={hasMore}
    />
  );
}
