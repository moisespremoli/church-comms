import { NextResponse } from "next/server";
import { UUID_RE } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { createListenerToken, isLiveKitConfigured } from "@/lib/livekit";
import { getServerSupabase } from "@/lib/supabase/server";

/** Emite um token LiveKit para ouvir o rádio de um canal (após validar acesso). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.isActive) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  if (!isLiveKitConfigured()) {
    return NextResponse.json({ error: "O rádio ainda não está configurado no servidor." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { channelId?: unknown } | null;
  const channelId = typeof body?.channelId === "string" ? body.channelId : "";
  if (!UUID_RE.test(channelId)) return NextResponse.json({ error: "Canal inválido." }, { status: 400 });

  // A RLS só devolve o canal a quem o pode ver.
  const supabase = await getServerSupabase();
  const { data: channel } = await supabase
    .from("channels")
    .select("id, status, has_voice_room")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel || !channel.has_voice_room || channel.status !== "active") {
    return NextResponse.json({ error: "Sem acesso ao rádio deste canal." }, { status: 403 });
  }

  const [{ data: canTalk }, { data: canPreempt }] = await Promise.all([
    supabase.rpc("can_post", { p_channel_id: channelId }),
    supabase.rpc("can_preempt_floor", { p_channel_id: channelId }),
  ]);

  const grant = await createListenerToken({ userId: user.id, name: user.fullName, channelId });
  return NextResponse.json(
    { ...grant, canTalk: Boolean(canTalk), canPreempt: Boolean(canPreempt) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
