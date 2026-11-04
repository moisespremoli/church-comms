import {
  DoorOpen,
  Hash,
  Mic,
  Music,
  Radio,
  Shield,
  Siren,
  Users,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const CHANNEL_ICONS: Record<string, LucideIcon> = {
  mic: Mic,
  shield: Shield,
  door: DoorOpen,
  video: Video,
  music: Music,
  wrench: Wrench,
  siren: Siren,
  hash: Hash,
  radio: Radio,
  users: Users,
};

export const CHANNEL_ICON_OPTIONS = Object.keys(CHANNEL_ICONS);

export function channelIcon(name: string): LucideIcon {
  return CHANNEL_ICONS[name] ?? Hash;
}

type ColorTokens = { label: string; text: string; soft: string; border: string; dot: string };

// Classes estáticas para o Tailwind as detetar.
export const CHANNEL_COLORS: Record<string, ColorTokens> = {
  slate: { label: "Cinzento", text: "text-slate-300", soft: "bg-slate-500/15", border: "border-slate-500/40", dot: "bg-slate-400" },
  sky: { label: "Azul", text: "text-sky-300", soft: "bg-sky-500/15", border: "border-sky-500/40", dot: "bg-sky-400" },
  emerald: { label: "Verde", text: "text-emerald-300", soft: "bg-emerald-500/15", border: "border-emerald-500/40", dot: "bg-emerald-400" },
  amber: { label: "Âmbar", text: "text-amber-300", soft: "bg-amber-500/15", border: "border-amber-500/40", dot: "bg-amber-400" },
  rose: { label: "Rosa", text: "text-rose-300", soft: "bg-rose-500/15", border: "border-rose-500/40", dot: "bg-rose-400" },
  violet: { label: "Violeta", text: "text-violet-300", soft: "bg-violet-500/15", border: "border-violet-500/40", dot: "bg-violet-400" },
  orange: { label: "Laranja", text: "text-orange-300", soft: "bg-orange-500/15", border: "border-orange-500/40", dot: "bg-orange-400" },
  cyan: { label: "Ciano", text: "text-cyan-300", soft: "bg-cyan-500/15", border: "border-cyan-500/40", dot: "bg-cyan-400" },
  red: { label: "Vermelho", text: "text-red-300", soft: "bg-red-500/15", border: "border-red-500/50", dot: "bg-red-400" },
};

export const CHANNEL_COLOR_OPTIONS = Object.keys(CHANNEL_COLORS);

export function channelColor(name: string): ColorTokens {
  return CHANNEL_COLORS[name] ?? CHANNEL_COLORS.slate;
}

/** Forma mínima de canal partilhada entre servidor e cliente. */
export type ChannelSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: "active" | "archived";
  is_emergency: boolean;
  sort_order: number;
};

export const CHANNEL_SUMMARY_COLUMNS =
  "id, slug, name, description, icon, color, status, is_emergency, sort_order" as const;
