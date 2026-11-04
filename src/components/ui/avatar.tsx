import { initials } from "@/lib/format";

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const dims = size === "sm" ? "size-8 text-xs" : "size-10 text-sm";
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-bold text-ink-muted ring-1 ring-line-strong ${dims}`}
    >
      {initials(name)}
    </span>
  );
}
