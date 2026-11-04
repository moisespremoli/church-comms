import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "info" | "success" | "error";

const TONES: Record<Tone, { box: string; icon: typeof Info; label: string }> = {
  info: { box: "border-sky-500/40 bg-sky-500/10 text-sky-100", icon: Info, label: "Informação" },
  success: { box: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100", icon: CircleCheck, label: "Sucesso" },
  error: { box: "border-red-500/50 bg-red-500/10 text-red-100", icon: CircleAlert, label: "Erro" },
};

/** Mensagem de estado: cor + ícone + texto (nunca só cor). */
export function Notice({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const { box, icon: Icon, label } = TONES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${box}`}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <span className="sr-only">{label}: </span>
        {children}
      </div>
    </div>
  );
}
