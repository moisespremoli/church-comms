import { NextResponse } from "next/server";
import { UUID_RE } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { isLiveKitConfigured, setTalkPermission } from "@/lib/livekit";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * Turno de fala (Push-to-Talk).
 *   { channelId, action: "request", preempt? }  → pede/renova o turno
 *   { channelId, action: "release" }            → liberta o turno
 *
 * A decisão é tomada na base de dados (request_floor / release_floor) e
 * aplicada no LiveKit: só quem tem o turno pode publicar microfone; quem o
 * perde (interrupção ou expiração) fica sem permissão de imediato.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !user.isActive) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  if (!isLiveKitConfigured()) {
    return NextResponse.json({ error: "O rádio ainda não está configurado no servidor." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as
    | { channelId?: unknown; action?: unknown; preempt?: unknown }
    | null;
  const channelId = typeof body?.channelId === "string" ? body.channelId : "";
  const action = body?.action;
  if (!UUID_RE.test(channelId) || (action !== "request" && action !== "release")) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const supabase = await getServerSupabase();

  if (action === "release") {
    const { data: released } = await supabase.rpc("release_floor", { p_channel_id: channelId });
    await setTalkPermission(channelId, user.id, false).catch(() => {});
    return NextResponse.json({ released: Boolean(released) }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data, error } = await supabase.rpc("request_floor", {
    p_channel_id: channelId,
    p_preempt: body?.preempt === true,
  });
  if (error) {
    const forbidden = error.code === "42501";
    return NextResponse.json(
      { error: forbidden ? "Sem permissão para falar neste canal." : "Não foi possível pedir a palavra." },
      { status: forbidden ? 403 : 500 },
    );
  }

  const result = data?.[0];
  if (!result) return NextResponse.json({ error: "Resposta inesperada." }, { status: 500 });

  let speakerName: string | null = null;
  if (!result.granted && result.speaker_id) {
    const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", result.speaker_id).maybeSingle();
    speakerName = profile?.full_name ?? null;
  }

  if (result.granted) {
    // Quem perdeu o turno deixa de poder publicar.
    if (result.previous_speaker_id && result.previous_speaker_id !== user.id) {
      await setTalkPermission(channelId, result.previous_speaker_id, false).catch(() => {});
    }
    if (result.reason !== "renewed") {
      try {
        await setTalkPermission(channelId, user.id, true);
      } catch {
        // Ainda não está ligado à sala: devolve o turno para não bloquear o canal.
        await supabase.rpc("release_floor", { p_channel_id: channelId });
        return NextResponse.json({ error: "Ligue-se ao rádio antes de falar." }, { status: 409 });
      }
    }
  } else if (result.reason === "max_duration") {
    await supabase.rpc("release_floor", { p_channel_id: channelId });
    await setTalkPermission(channelId, user.id, false).catch(() => {});
  }

  return NextResponse.json(
    {
      granted: result.granted,
      reason: result.reason,
      speakerId: result.speaker_id,
      speakerName,
      expiresAt: result.expires_at,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
