"use client";

import { BellRing, Siren, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useRealtimeHub } from "@/components/realtime/realtime-hub";
import { currentFlash, flashReducer, shouldFlash } from "@/lib/alerts/flash-queue";
import { useAlertPrefs } from "@/lib/alerts/prefs";
import { channelColor, type ChannelSummary } from "@/lib/channels";
import type { MessageRow } from "@/lib/database.types";
import { formatMessageTime } from "@/lib/format";
import { getBrowserSupabase } from "@/lib/supabase/browser";

/**
 * Sinal luminoso de nova mensagem.
 *
 *  - Fora do canal: o ecrã inteiro pisca com a cor do canal e mostra um cartão
 *    grande com a mensagem até a pessoa tocar em "Ver" ou "Fechar".
 *  - Dentro do canal: as margens do ecrã brilham durante ~2 s.
 *
 * Segurança fotossensível (WCAG 2.3.1): no máximo 2 clarões por segundo e só
 * durante os primeiros segundos; depois fica um brilho contínuo lento. Com
 * "reduzir movimento" ativo no sistema não há clarões, só cor fixa.
 */
export function MessageFlash({ myId, channels }: { myId: string; channels: ChannelSummary[] }) {
  const hub = useRealtimeHub();
  const router = useRouter();
  const pathname = usePathname();
  const [prefs] = useAlertPrefs();
  const [state, dispatch] = useReducer(flashReducer, { items: [] });
  const [pulse, setPulse] = useState<{ color: string; key: number } | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  const pathRef = useRef(pathname);
  const prefsRef = useRef(prefs);
  const channelsRef = useRef(channels);
  const audioCtx = useRef<AudioContext | null>(null);
  const baseTitle = useRef<string | null>(null);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  useEffect(() => {
    channelsRef.current = channels;
  }, [channels]);

  // Os browsers só deixam tocar som depois de um gesto do utilizador:
  // "desbloqueia" o áudio no primeiro toque/tecla.
  useEffect(() => {
    const unlock = () => {
      try {
        audioCtx.current ??= new AudioContext();
        void audioCtx.current.resume();
      } catch {}
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const beep = useCallback((emergency: boolean) => {
    const ctx = audioCtx.current;
    if (!ctx || ctx.state !== "running") return;
    const tones = emergency ? [880, 660, 880, 660] : [880, 1320];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }, []);

  const resolveName = useCallback(async (authorId: string | null) => {
    if (!authorId) return;
    setNames((current) => {
      if (current[authorId]) return current;
      void getBrowserSupabase()
        .from("profiles")
        .select("full_name")
        .eq("id", authorId)
        .maybeSingle()
        .then(({ data }) => setNames((n) => ({ ...n, [authorId]: data?.full_name || "Membro" })));
      return { ...current, [authorId]: "…" };
    });
  }, []);

  // Escuta todas as mensagens novas.
  useEffect(() => {
    return hub.subscribeAll((message: MessageRow) => {
      const channel = channelsRef.current.find((c) => c.id === message.channel_id);
      if (!channel) return;
      const viewing =
        pathRef.current === `/canais/${channel.slug}` && document.visibilityState === "visible";
      const mode = shouldFlash({
        authorId: message.author_id,
        myId,
        enabled: prefsRef.current.flash,
        isViewingChannel: viewing,
      });

      if (message.author_id !== myId) {
        if (prefsRef.current.sound) beep(channel.is_emergency);
        if (prefsRef.current.vibrate && "vibrate" in navigator) {
          navigator.vibrate(channel.is_emergency ? [400, 150, 400, 150, 400] : [250, 120, 250]);
        }
      }

      if (mode === "pulse") {
        setPulse({ color: channel.is_emergency ? "red" : channel.color, key: Date.now() });
      } else if (mode === "overlay") {
        void resolveName(message.author_id);
        dispatch({
          type: "push",
          item: {
            message,
            channelId: channel.id,
            channelSlug: channel.slug,
            channelName: channel.name,
            channelColor: channel.is_emergency ? "red" : channel.color,
            isEmergency: channel.is_emergency,
          },
        });
      }
    });
  }, [hub, myId, beep, resolveName]);

  // Ao abrir o canal, as mensagens dele deixam de estar "por ver".
  useEffect(() => {
    const channel = channels.find((c) => pathname === `/canais/${c.slug}`);
    if (channel) dispatch({ type: "dismiss-channel", channelId: channel.id });
  }, [pathname, channels]);

  // Título do separador a piscar quando a app está em segundo plano.
  const pending = state.items.length;
  useEffect(() => {
    baseTitle.current ??= document.title;
    if (pending === 0) {
      if (baseTitle.current) document.title = baseTitle.current;
      return;
    }
    let on = false;
    const timer = setInterval(() => {
      on = !on;
      document.title = on ? `(${pending}) NOVA MENSAGEM` : (baseTitle.current ?? "Church Comms");
    }, 1000);
    return () => clearInterval(timer);
  }, [pending]);

  useEffect(() => {
    if (!pulse) return;
    const timer = setTimeout(() => setPulse(null), 2200);
    return () => clearTimeout(timer);
  }, [pulse]);

  const current = currentFlash(state);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "dismiss-all" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current]);

  return (
    <>
      {pulse ? (
        <div
          key={pulse.key}
          aria-hidden
          className="cc-edge-pulse pointer-events-none fixed inset-0 z-40"
          style={{ "--cc-flash-rgb": channelColor(pulse.color).rgb } as React.CSSProperties}
        />
      ) : null}

      {current ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="cc-flash-title"
          aria-describedby="cc-flash-body"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ "--cc-flash-rgb": channelColor(current.channelColor).rgb } as React.CSSProperties}
        >
          {/* Fundo luminoso: clarões nos primeiros segundos, depois brilho contínuo. */}
          <div key={current.message.id} aria-hidden className="cc-flash-backdrop absolute inset-0" />

          <div className="relative w-full max-w-lg rounded-3xl border-4 bg-surface-0 p-6 shadow-2xl cc-flash-card">
            <p className="flex items-center gap-2 text-sm font-black uppercase tracking-widest" style={{ color: `rgb(${channelColor(current.channelColor).rgb})` }}>
              {current.isEmergency ? <Siren className="size-6" aria-hidden /> : <BellRing className="size-6" aria-hidden />}
              {current.isEmergency ? "Emergência" : "Nova mensagem"}
              {pending > 1 ? <span className="ml-auto rounded-full bg-surface-3 px-2.5 py-0.5 text-xs text-ink">+{pending - 1} por ver</span> : null}
            </p>
            <h2 id="cc-flash-title" className="mt-3 text-3xl font-black leading-tight text-ink sm:text-4xl">
              {current.channelName}
            </h2>
            <p className="mt-1 text-base text-ink-muted">
              {current.message.author_id ? (names[current.message.author_id] ?? "…") : "Antigo membro"} ·{" "}
              {formatMessageTime(current.message.created_at)}
            </p>
            <p
              id="cc-flash-body"
              className="mt-4 line-clamp-5 whitespace-pre-wrap break-words rounded-2xl bg-surface-2 p-4 text-2xl font-bold leading-snug text-ink"
            >
              {current.message.body}
            </p>
            <div className="mt-6 grid grid-cols-[1fr_auto] gap-3">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  dispatch({ type: "dismiss-channel", channelId: current.channelId });
                  router.push(`/canais/${current.channelSlug}`);
                }}
                className="min-h-16 rounded-2xl text-lg font-black text-surface-0"
                style={{ background: `rgb(${channelColor(current.channelColor).rgb})` }}
              >
                Ver mensagem
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "dismiss-all" })}
                className="inline-flex min-h-16 items-center gap-2 rounded-2xl border border-line-strong bg-surface-3 px-5 text-lg font-bold text-ink"
              >
                <X className="size-5" aria-hidden /> Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
