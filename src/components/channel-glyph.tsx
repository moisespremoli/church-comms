import { channelColor, channelIcon } from "@/lib/channels";

export function ChannelGlyph({ icon, color, size = "md" }: { icon: string; color: string; size?: "md" | "lg" }) {
  const Icon = channelIcon(icon);
  const tokens = channelColor(color);
  const dims = size === "lg" ? "size-12 rounded-2xl" : "size-10 rounded-xl";
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-center justify-center border ${tokens.border} ${tokens.soft} ${tokens.text} ${dims}`}>
      <Icon className={size === "lg" ? "size-6" : "size-5"} />
    </span>
  );
}
