"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "cc.install-hint.dismissed";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Sugere a instalação da PWA. Android/desktop: botão nativo quando o browser o
 * permite. iOS: instruções (o Safari não expõe um prompt programático).
 */
export function InstallHint() {
  const [mode, setMode] = useState<"hidden" | "ios" | "prompt">("hidden");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    if (dismissed || isStandalone()) return;

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) setMode("ios");

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setMode("prompt");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (mode === "hidden") return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setMode("hidden");
  };

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4">
      <Download className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-ink">Instalar no ecrã principal</p>
        {mode === "ios" ? (
          <p className="mt-1 text-ink-muted">
            No Safari, toque em <strong>Partilhar</strong> e depois em{" "}
            <strong>Adicionar ao ecrã principal</strong>.
          </p>
        ) : (
          <button
            type="button"
            className="mt-2 rounded-xl bg-accent px-4 py-2 font-semibold text-surface-0"
            onClick={async () => {
              if (!deferred) return;
              await deferred.prompt();
              await deferred.userChoice;
              setDeferred(null);
              setMode("hidden");
            }}
          >
            Instalar aplicação
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-lg p-1 text-ink-faint hover:text-ink"
        aria-label="Fechar sugestão de instalação"
      >
        <X className="size-5" aria-hidden />
      </button>
    </div>
  );
}
