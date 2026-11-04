"use client";

import { Loader, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRealtimeHub } from "./realtime-hub";

/** Estado de rede/tempo real: texto + ícone + cor, sempre anunciado. */
export function ConnectionBanner() {
  const { connection } = useRealtimeHub();
  const ref = useRef<HTMLDivElement>(null);
  // Evita piscar no arranque: só mostra "a ligar" se demorar.
  const [showConnecting, setShowConnecting] = useState(false);

  useEffect(() => {
    if (connection !== "connecting") return;
    const timer = setTimeout(() => setShowConnecting(true), 2500);
    return () => {
      clearTimeout(timer);
      setShowConnecting(false);
    };
  }, [connection]);

  const hidden = connection === "connected" || (connection === "connecting" && !showConnecting);

  // Expõe a altura do aviso para que cabeçalhos "sticky" fiquem por baixo dele.
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (hidden || !el) {
      root.style.setProperty("--cc-banner-h", "0px");
      return;
    }
    const update = () => root.style.setProperty("--cc-banner-h", `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty("--cc-banner-h", "0px");
    };
  }, [hidden]);

  if (hidden) {
    return <span className="sr-only" role="status">Ligado em tempo real</span>;
  }

  const offline = connection === "offline";
  return (
    <div
      ref={ref}
      role="status"
      className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold ${
        offline ? "bg-[#3a1418] text-red-100" : "bg-[#3a2a0c] text-amber-100"
      }`}
    >
      {offline ? (
        <WifiOff className="size-4 shrink-0" aria-hidden />
      ) : (
        <Loader className="size-4 shrink-0 animate-spin" aria-hidden />
      )}
      {offline
        ? "Sem ligação à internet. As mensagens serão sincronizadas ao reconectar."
        : connection === "reconnecting"
          ? "Ligação instável — a reconectar ao tempo real…"
          : "A ligar ao tempo real…"}
    </div>
  );
}
