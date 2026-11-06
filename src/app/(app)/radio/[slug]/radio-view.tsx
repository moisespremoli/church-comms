"use client";

import { ChevronLeft, Loader, Mic, Radio, Volume2, VolumeX, WifiOff } from "lucide-react";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
} from "livekit-client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChannelGlyph } from "@/components/channel-glyph";
import { Notice } from "@/components/ui/notice";
import { busyTone, incomingTone, rogerTone, talkPermitTone, unlockAudio } from "@/lib/alerts/tones";
import { channelColor } from "@/lib/channels";

type ChannelInfo = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: "active" | "archived";
  is_emergency: boolean;
};

type Phase = "offline" | "connecting" | "ready" | "reconnecting";
type TalkState = "idle" | "requesting" | "talking";

const RENEW_EVERY_MS = 10_000;

/**
 * Walkie-talkie de um canal.
 *
 * Ouvir: toda a gente ligada à sala ouve quem tem o turno.
 * Falar: manter o botão carregado → o servidor concede o turno (um de cada vez)
 * e só então dá permissão de microfone no LiveKit → largar liberta o turno.
 */
export function RadioView({
  channel,
  me,
  configured,
}: {
  channel: ChannelInfo;
  me: { id: string; name: string };
  configured: boolean;
}) {
  const color = channelColor(channel.is_emergency ? "red" : channel.color);

  const roomRef = useRef<Room | null>(null);
  const audioBox = useRef<HTMLDivElement>(null);
  const holding = useRef(false);
  const renewTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const lastSpeaker = useRef<string | null>(null);

  const [phase, setPhase] = useState<Phase>("offline");
  const [talk, setTalk] = useState<TalkState>("idle");
  const [canTalk, setCanTalk] = useState(false);
  const [canPreempt, setCanPreempt] = useState(false);
  const [preempt, setPreempt] = useState(false);
  const [speaker, setSpeaker] = useState<{ id: string; name: string } | null>(null);
  const [listeners, setListeners] = useState<{ id: string; name: string }[]>([]);
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  // O browser bloqueou a reprodução de áudio (precisa de um toque do utilizador).
  const [audioBlocked, setAudioBlocked] = useState(false);
  // Nível do sinal recebido (0–1) de quem está a falar.
  const [level, setLevel] = useState(0);

  // ── Estado da sala ────────────────────────────────────────────────────────
  const refreshRoomState = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const remotes = Array.from(room.remoteParticipants.values());
    setListeners(
      [{ id: me.id, name: me.name }, ...remotes.map((p) => ({ id: p.identity, name: p.name || "Membro" }))].sort(
        (a, b) => a.name.localeCompare(b.name, "pt"),
      ),
    );
    const talking = remotes.find((p) => {
      const pub = p.getTrackPublication(Track.Source.Microphone);
      return pub && !pub.isMuted;
    });
    const next = talking ? { id: talking.identity, name: talking.name || "Membro" } : null;
    if (next?.id !== lastSpeaker.current) {
      if (next) {
        incomingTone();
        if ("vibrate" in navigator) navigator.vibrate(80);
      } else if (lastSpeaker.current) {
        rogerTone();
      }
      lastSpeaker.current = next?.id ?? null;
    }
    setSpeaker(next);
  }, [me.id, me.name]);

  const stopTalkingLocally = useCallback(async () => {
    if (renewTimer.current) {
      clearInterval(renewTimer.current);
      renewTimer.current = null;
    }
    const room = roomRef.current;
    const pub = room?.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (room && pub?.track) {
      await room.localParticipant.unpublishTrack(pub.track, true).catch(() => {});
    }
  }, []);

  const callFloor = useCallback(
    async (action: "request" | "release", options: { keepalive?: boolean } = {}) => {
      const response = await fetch("/api/radio/falar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channel.id, action, preempt: action === "request" && preempt }),
        keepalive: options.keepalive,
      });
      const json = (await response.json().catch(() => ({}))) as {
        granted?: boolean;
        reason?: string;
        speakerName?: string | null;
        error?: string;
      };
      return { ok: response.ok, ...json };
    },
    [channel.id, preempt],
  );

  // ── Ligar / desligar ─────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    // IMPORTANTE: tudo o que desbloqueia o som tem de acontecer AQUI, no próprio
    // toque, antes de qualquer "await" — senão o iPhone/Android bloqueia o áudio.
    unlockAudio();
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    roomRef.current = room;
    void room.startAudio().catch(() => {});
    setNotice(null);
    setPhase("connecting");
    try {
      // Pede o microfone já, para o primeiro "carregar para falar" ser imediato.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        setNotice({ tone: "info", text: "Sem acesso ao microfone: pode ouvir, mas não falar. Autorize o microfone nas definições do browser." });
      }

      const response = await fetch("/api/radio/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channel.id }),
      });
      const grant = (await response.json()) as {
        url?: string;
        token?: string;
        canTalk?: boolean;
        canPreempt?: boolean;
        error?: string;
      };
      if (!response.ok || !grant.url || !grant.token) throw new Error(grant.error ?? "Não foi possível ligar ao rádio.");

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach() as HTMLAudioElement;
            el.setAttribute("data-radio-audio", "");
            el.setAttribute("playsinline", "");
            el.autoplay = true;
            el.volume = 1;
            audioBox.current?.appendChild(el);
            el.play().catch(() => setAudioBlocked(true));
          }
          refreshRoomState();
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach().forEach((el) => el.remove());
          refreshRoomState();
        })
        .on(RoomEvent.TrackPublished, refreshRoomState)
        .on(RoomEvent.TrackUnpublished, refreshRoomState)
        .on(RoomEvent.TrackMuted, refreshRoomState)
        .on(RoomEvent.TrackUnmuted, refreshRoomState)
        .on(RoomEvent.ParticipantConnected, refreshRoomState)
        .on(RoomEvent.ParticipantDisconnected, refreshRoomState)
        .on(RoomEvent.ParticipantPermissionsChanged, (_prev, participant: Participant) => {
          // Turno retirado pelo servidor (interrupção pela coordenação ou expiração).
          if (participant.identity === room.localParticipant.identity && !participant.permissions?.canPublish) {
            if (holding.current) {
              holding.current = false;
              void stopTalkingLocally();
              setTalk("idle");
              busyTone();
              setNotice({ tone: "error", text: "A transmissão foi interrompida (prioridade da coordenação ou tempo esgotado)." });
            }
          }
        })
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setAudioBlocked(!room.canPlaybackAudio))
        .on(RoomEvent.Reconnecting, () => setPhase("reconnecting"))
        .on(RoomEvent.Reconnected, () => {
          setPhase("ready");
          refreshRoomState();
        })
        .on(RoomEvent.Disconnected, () => {
          setPhase("offline");
          setTalk("idle");
          setSpeaker(null);
        });

      await room.connect(grant.url, grant.token);
      await room.startAudio().catch(() => {});
      setAudioBlocked(!room.canPlaybackAudio);
      setCanTalk(Boolean(grant.canTalk));
      setCanPreempt(Boolean(grant.canPreempt));
      setPhase("ready");
      refreshRoomState();

      // Manter o ecrã ligado enquanto o rádio está aberto.
      try {
        wakeLock.current = await navigator.wakeLock?.request("screen");
      } catch {}
    } catch (error) {
      void room.disconnect();
      roomRef.current = null;
      setPhase("offline");
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Não foi possível ligar ao rádio." });
    }
  }, [channel.id, refreshRoomState, stopTalkingLocally]);

  useEffect(() => {
    return () => {
      if (holding.current) void callFloor("release", { keepalive: true });
      void stopTalkingLocally();
      void roomRef.current?.disconnect();
      roomRef.current = null;
      void wakeLock.current?.release().catch(() => {});
    };
  }, []);

  // ── Carregar para falar ──────────────────────────────────────────────────
  const startTalking = useCallback(async () => {
    const maybeRoom = roomRef.current;
    if (!maybeRoom) return;
    const room: Room = maybeRoom;
    if (room.state !== ConnectionState.Connected || !canTalk || holding.current) return;
    holding.current = true;
    unlockAudio();
    setNotice(null);
    setTalk("requesting");

    type FloorResult = { ok: boolean; granted?: boolean; reason?: string; speakerName?: string | null; error?: string };
    const result: FloorResult = await callFloor("request").catch(() => ({ ok: false, granted: false, error: "Sem ligação." }));
    if (!holding.current) {
      // Largou antes da resposta.
      if (result.granted) void callFloor("release");
      setTalk("idle");
      return;
    }
    if (!result.ok || !result.granted) {
      holding.current = false;
      setTalk("idle");
      busyTone();
      if ("vibrate" in navigator) navigator.vibrate([60, 60, 60]);
      setNotice({
        tone: "error",
        text:
          result.reason === "busy"
            ? `Canal ocupado: ${result.speakerName || "alguém"} está a falar.`
            : (result.error ?? "Não foi possível falar agora."),
      });
      return;
    }

    // Aguarda a permissão de publicar dada pelo servidor.
    if (!room.localParticipant.permissions?.canPublish) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(done, 4000);
        function done() {
          clearTimeout(timeout);
          room.off(RoomEvent.ParticipantPermissionsChanged, onChange);
          resolve();
        }
        function onChange(_prev: unknown, participant: Participant) {
          if (participant.identity === room.localParticipant.identity && participant.permissions?.canPublish) done();
        }
        room.on(RoomEvent.ParticipantPermissionsChanged, onChange);
      });
    }

    if (!holding.current) {
      void callFloor("release");
      setTalk("idle");
      return;
    }

    try {
      await room.localParticipant.setMicrophoneEnabled(true);
    } catch {
      holding.current = false;
      void callFloor("release");
      setTalk("idle");
      busyTone();
      setNotice({ tone: "error", text: "Não foi possível usar o microfone." });
      return;
    }

    setTalk("talking");
    talkPermitTone();
    if ("vibrate" in navigator) navigator.vibrate(120);

    renewTimer.current = setInterval(async () => {
      const renewal = await callFloor("request").catch(() => null);
      if (renewal && !renewal.granted && holding.current) {
        holding.current = false;
        await stopTalkingLocally();
        setTalk("idle");
        busyTone();
        setNotice({
          tone: "error",
          text: renewal.reason === "max_duration" ? "Tempo máximo de transmissão (2 min). Volte a carregar para continuar." : "A transmissão terminou.",
        });
      }
    }, RENEW_EVERY_MS);
  }, [canTalk, callFloor, stopTalkingLocally]);

  const stopTalking = useCallback(async () => {
    if (!holding.current) return;
    holding.current = false;
    const wasTalking = talk === "talking";
    await stopTalkingLocally();
    setTalk("idle");
    if (wasTalking) rogerTone();
    void callFloor("release");
  }, [talk, callFloor, stopTalkingLocally]);

  // Largar quando a app vai para segundo plano ou perde o foco.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void stopTalking();
    };
    window.addEventListener("blur", stopTalking);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("blur", stopTalking);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [stopTalking]);

  // Medidor do sinal recebido: confirma visualmente que o áudio está a chegar.
  useEffect(() => {
    if (!speaker) {
      setLevel(0);
      return;
    }
    const timer = setInterval(() => {
      const p = roomRef.current?.remoteParticipants.get(speaker.id);
      setLevel(Math.min(1, (p?.audioLevel ?? 0) * 3));
    }, 100);
    return () => clearInterval(timer);
  }, [speaker]);

  const enableSound = useCallback(() => {
    unlockAudio();
    const room = roomRef.current;
    if (!room) return;
    void room.startAudio().then(() => setAudioBlocked(!room.canPlaybackAudio)).catch(() => {});
    audioBox.current?.querySelectorAll("audio").forEach((el) => void el.play().catch(() => {}));
  }, []);

  // ── Interface ─────────────────────────────────────────────────────────────
  const meTalking = talk === "talking";
  const busy = !meTalking && Boolean(speaker);
  const buttonLabel = meTalking
    ? "A FALAR — SOLTE PARA TERMINAR"
    : talk === "requesting"
      ? "A PEDIR A PALAVRA…"
      : busy
        ? `OCUPADO — ${speaker?.name}`
        : "CARREGUE PARA FALAR";

  return (
    <main
      className="mx-auto flex w-full max-w-xl flex-1 flex-col"
      style={{ "--cc-flash-rgb": color.rgb } as React.CSSProperties}
    >
      <header className="flex items-center gap-3 border-b border-line px-3 py-3">
        <Link
          href="/radio"
          className="inline-flex size-11 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-2"
          aria-label="Voltar aos canais de rádio"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </Link>
        <ChannelGlyph icon={channel.icon} color={channel.is_emergency ? "red" : channel.color} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">Rádio · {channel.name}</h1>
          <p className="text-xs text-ink-faint" role="status">
            {phase === "ready"
              ? `Ligado · ${listeners.length} ${listeners.length === 1 ? "pessoa" : "pessoas"} a ouvir`
              : phase === "connecting"
                ? "A ligar…"
                : phase === "reconnecting"
                  ? "Ligação instável — a reconectar…"
                  : "Desligado"}
          </p>
        </div>
        <Link href={`/canais/${channel.slug}`} className="rounded-xl px-3 py-2 text-sm font-semibold text-ink-muted hover:bg-surface-2">
          Mensagens
        </Link>
      </header>

      {/* Fora do ecrã mas não "display:none", para nenhum browser recusar tocar. */}
      <div ref={audioBox} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px overflow-hidden" />

      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-6">
        {!configured ? (
          <Notice tone="error">O rádio ainda não está configurado no servidor (faltam as credenciais LiveKit).</Notice>
        ) : phase === "offline" || phase === "connecting" ? (
          <button
            type="button"
            onClick={connect}
            disabled={phase === "connecting"}
            className="flex aspect-square w-[min(72vw,20rem)] flex-col items-center justify-center gap-3 rounded-full border-4 text-2xl font-black text-ink"
            style={{ borderColor: `rgb(${color.rgb})`, background: `rgb(${color.rgb} / 0.15)` }}
          >
            {phase === "connecting" ? <Loader className="size-14 animate-spin" aria-hidden /> : <Radio className="size-16" aria-hidden />}
            {phase === "connecting" ? "A ligar…" : "Ligar rádio"}
          </button>
        ) : (
          <>
            {audioBlocked ? (
              <button
                type="button"
                onClick={enableSound}
                className="flex min-h-20 w-full items-center justify-center gap-3 rounded-3xl bg-amber-400 px-4 text-xl font-black text-surface-0"
              >
                <VolumeX className="size-8" aria-hidden /> O som está bloqueado — toque aqui para ouvir
              </button>
            ) : null}

            {/* Quem está a falar */}
            <div
              role="status"
              aria-live="assertive"
              className={`w-full rounded-3xl border-2 p-5 text-center ${speaker || meTalking ? "cc-radio-live" : "border-line bg-surface-1"}`}
            >
              {meTalking ? (
                <p className="flex items-center justify-center gap-3 text-3xl font-black text-red-200">
                  <Mic className="size-8" aria-hidden /> A TRANSMITIR
                </p>
              ) : speaker ? (
                <>
                  <p className="flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-widest text-ink">
                    <Volume2 className="size-5" aria-hidden /> A falar
                  </p>
                  <p className="mt-1 truncate text-3xl font-black text-ink">{speaker.name}</p>
                  <div className="mx-auto mt-3 h-3 w-full max-w-xs overflow-hidden rounded-full bg-surface-0/60" aria-hidden>
                    <div className="h-full rounded-full bg-ink transition-[width] duration-100" style={{ width: `${Math.round(level * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-ink">{level > 0.02 ? "Sinal de áudio a chegar" : "À espera de som…"}</p>
                </>
              ) : (
                <p className="text-2xl font-bold text-ink-muted">Canal livre</p>
              )}
            </div>

            {/* Botão Push-to-Talk */}
            {canTalk ? (
              <button
                type="button"
                aria-pressed={meTalking}
                aria-label={buttonLabel}
                disabled={phase !== "ready"}
                onPointerDown={(e) => {
                  e.preventDefault();
                  enableSound();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  void startTalking();
                }}
                onPointerUp={() => void stopTalking()}
                onPointerCancel={() => void stopTalking()}
                onLostPointerCapture={() => void stopTalking()}
                onContextMenu={(e) => e.preventDefault()}
                onKeyDown={(e) => {
                  if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                    e.preventDefault();
                    void startTalking();
                  }
                }}
                onKeyUp={(e) => {
                  if (e.key === " " || e.key === "Enter") void stopTalking();
                }}
                className={`cc-ptt flex aspect-square w-[min(80vw,22rem)] touch-none select-none flex-col items-center justify-center gap-3 rounded-full border-8 px-6 text-center text-xl font-black leading-tight transition-transform active:scale-95 disabled:opacity-50 ${
                  meTalking ? "cc-ptt-talking border-red-300 bg-red-600 text-white" : busy ? "border-line-strong bg-surface-3 text-ink-muted" : "text-surface-0"
                }`}
                style={!meTalking && !busy ? { background: `rgb(${color.rgb})`, borderColor: `rgb(${color.rgb} / 0.5)` } : undefined}
              >
                <Mic className="size-20" aria-hidden />
                <span>{buttonLabel}</span>
              </button>
            ) : (
              <Notice>Tem acesso só para ouvir este canal.</Notice>
            )}

            {canPreempt && canTalk ? (
              <label className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface-1 px-4">
                <input type="checkbox" checked={preempt} onChange={(e) => setPreempt(e.target.checked)} className="size-6 accent-red-400" />
                <span>
                  <span className="block font-semibold">Falar com prioridade</span>
                  <span className="block text-sm text-ink-faint">Interrompe um membro que esteja a falar (coordenação).</span>
                </span>
              </label>
            ) : null}

            {phase === "reconnecting" ? (
              <p className="flex items-center gap-2 text-sm text-amber-200">
                <WifiOff className="size-4" aria-hidden /> A reconectar ao rádio…
              </p>
            ) : null}

            <details className="w-full text-sm">
              <summary className="cursor-pointer text-ink-muted">A ouvir ({listeners.length})</summary>
              <ul className="mt-2 grid grid-cols-2 gap-1">
                {listeners.map((l) => (
                  <li key={l.id} className="truncate text-ink-faint">
                    {l.name}
                    {l.id === me.id ? " (eu)" : ""}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}

        {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

        <p className="text-center text-xs text-ink-faint">
          Mantenha este ecrã aberto para ouvir. Com o ecrã bloqueado ou noutra app, o telemóvel pode cortar o áudio
          (sobretudo no iPhone).
        </p>
      </section>
    </main>
  );
}
