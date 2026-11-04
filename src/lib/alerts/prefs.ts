"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Preferências de alerta por DISPOSITIVO (localStorage). Não precisam de ir para
 * o servidor: dependem do aparelho (um tablet na mesa de som pode querer luz e
 * som; um telemóvel no bolso só vibração).
 */
export type AlertPrefs = {
  flash: boolean; // sinal luminoso em ecrã inteiro
  sound: boolean; // aviso sonoro
  vibrate: boolean; // vibração (Android)
};

export const DEFAULT_ALERT_PREFS: AlertPrefs = { flash: true, sound: true, vibrate: true };

const KEY = "cc.alert-prefs.v1";
const EVENT = "cc:alert-prefs";

export function readAlertPrefs(): AlertPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ALERT_PREFS;
    return { ...DEFAULT_ALERT_PREFS, ...(JSON.parse(raw) as Partial<AlertPrefs>) };
  } catch {
    return DEFAULT_ALERT_PREFS;
  }
}

export function writeAlertPrefs(prefs: AlertPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

export function useAlertPrefs(): [AlertPrefs, (next: Partial<AlertPrefs>) => void] {
  const [prefs, setPrefs] = useState<AlertPrefs>(DEFAULT_ALERT_PREFS);

  useEffect(() => {
    const sync = () => setPrefs(readAlertPrefs());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((next: Partial<AlertPrefs>) => {
    const merged = { ...readAlertPrefs(), ...next };
    writeAlertPrefs(merged);
    setPrefs(merged);
  }, []);

  return [prefs, update];
}
