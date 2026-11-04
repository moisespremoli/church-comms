import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createChannel } from "../actions";
import { ChannelFields } from "./channel-fields";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { ChannelGlyph } from "@/components/channel-glyph";
import { Field, TextInput } from "@/components/ui/field";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Canais" };

export default async function AdminChannelsPage() {
  const supabase = await getServerSupabase();
  const [{ data: channels }, { data: memberRows }] = await Promise.all([
    supabase.from("channels").select("id, slug, name, description, icon, color, status, is_emergency").order("sort_order").order("name"),
    supabase.from("channel_members").select("channel_id"),
  ]);
  const counts = new Map<string, number>();
  for (const row of memberRows ?? []) counts.set(row.channel_id, (counts.get(row.channel_id) ?? 0) + 1);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section aria-labelledby="lista-canais" className="space-y-3">
        <h2 id="lista-canais" className="text-lg font-bold">
          Canais ({channels?.length ?? 0})
        </h2>
        <ul className="space-y-2">
          {(channels ?? []).map((channel) => (
            <li key={channel.id}>
              <Link
                href={`/admin/canais/${channel.id}`}
                className={`flex items-center gap-3 rounded-2xl border bg-surface-1 p-3 hover:bg-surface-2 ${
                  channel.status === "archived" ? "border-dashed border-line-strong opacity-70" : "border-line"
                }`}
              >
                <ChannelGlyph icon={channel.icon} color={channel.color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{channel.name}</p>
                  <p className="truncate text-sm text-ink-faint">
                    {counts.get(channel.id) ?? 0} membros · {channel.status === "archived" ? "Arquivado" : "Ativo"}
                    {channel.is_emergency ? " · Emergências" : ""}
                  </p>
                </div>
                <ChevronRight className="size-5 text-ink-faint" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="novo-canal" className="h-fit space-y-4 rounded-2xl border border-line bg-surface-1 p-5">
        <h2 id="novo-canal" className="text-lg font-bold">
          Novo canal
        </h2>
        <ActionForm action={createChannel} resetOnSuccess>
          <ChannelFields idPrefix="new" />
          <Field label="Identificador (URL)" htmlFor="new-slug" hint="Opcional. Gerado a partir do nome.">
            <TextInput id="new-slug" name="slug" maxLength={48} pattern="[a-z0-9-]*" />
          </Field>
          <SubmitButton className="w-full" pendingLabel="A criar…">
            Criar canal
          </SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
