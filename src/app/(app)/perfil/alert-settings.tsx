"use client";

import { BellRing, Smartphone, Volume2 } from "lucide-react";
import { useAlertPrefs, type AlertPrefs } from "@/lib/alerts/prefs";

const OPTIONS: { key: keyof AlertPrefs; label: string; hint: string; Icon: typeof BellRing }[] = [
  {
    key: "flash",
    label: "Sinal luminoso",
    hint: "O ecrã inteiro pisca com a cor do canal quando chega uma mensagem.",
    Icon: BellRing,
  },
  { key: "sound", label: "Som", hint: "Toca um aviso sonoro (depois de tocar uma vez na app).", Icon: Volume2 },
  { key: "vibrate", label: "Vibração", hint: "Vibra o telemóvel (Android; o iPhone não permite).", Icon: Smartphone },
];

/** Preferências de alerta deste dispositivo. */
export function AlertSettings() {
  const [prefs, update] = useAlertPrefs();
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">Alertas de novas mensagens neste dispositivo</legend>
      {OPTIONS.map(({ key, label, hint, Icon }) => (
        <label key={key} className="flex min-h-16 cursor-pointer items-center gap-4 rounded-xl bg-surface-2 px-4 py-3">
          <Icon className="size-6 shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{label}</span>
            <span className="block text-sm text-ink-faint">{hint}</span>
          </span>
          <input
            type="checkbox"
            checked={prefs[key]}
            onChange={(e) => update({ [key]: e.target.checked })}
            className="size-6 accent-sky-400"
          />
        </label>
      ))}
    </fieldset>
  );
}
