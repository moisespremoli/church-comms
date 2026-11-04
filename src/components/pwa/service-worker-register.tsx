"use client";

import { useEffect } from "react";

/** Regista o Service Worker (só em produção, para não interferir com o HMR). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error) => {
      console.warn("[pwa] Falha ao registar o Service Worker", error);
    });
  }, []);
  return null;
}
