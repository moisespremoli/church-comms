import { Radio } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChannelGlyph } from "@/components/channel-glyph";
import { Notice } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth";
import { CHANNEL_SUMMARY_COLUMNS } from "@/lib/channels";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Rádio" };

export default async function RadioIndexPage() {
  const user = await requireUser();
  const supabase = await getServerSupabase();
  const [{ data: channels }, { data: memberships }] = await Promise.all([
    supabase
      .from("channels")
      .select(CHANNEL_SUMMARY_COLUMNS)
      .eq("status", "active")
      .eq("has_voice_room", true)
      .order("sort_order"),
    supabase.from("channel_members").select("channel_id").eq("user_id", user.id),
  ]);
  const mine = new Set((memberships ?? []).map((m) => m.channel_id));
  const list = (channels ?? []).filter((c) => user.role === "admin" || mine.has(c.id));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="flex items-center gap-3">
        <Radio className="size-8 text-accent" aria-hidden />
        <div>
          <h1 className="text-2xl font-bold">Rádio</h1>
          <p className="text-sm text-ink-faint">Escolha o canal. Carregue no botão grande para falar.</p>
        </div>
      </header>
      {list.length === 0 ? (
        <Notice>Nenhum dos seus canais tem rádio. Peça a um administrador para o ativar.</Notice>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {list.map((channel) => (
            <li key={channel.id} className="min-w-0">
              <Link
                href={`/radio/${channel.slug}`}
                className={`flex min-h-24 items-center gap-4 rounded-2xl border bg-surface-1 p-4 hover:bg-surface-2 ${
                  channel.is_emergency ? "border-red-500/50" : "border-line"
                }`}
              >
                <ChannelGlyph icon={channel.icon} color={channel.color} size="lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-bold">{channel.name}</span>
                  <span className="block truncate text-sm text-ink-faint">{channel.description}</span>
                </span>
                <Radio className="size-6 text-ink-faint" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
