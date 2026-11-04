import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addChannelMember, removeChannelMember, setChannelStatus, updateChannel, updateChannelMember } from "../../actions";
import { ChannelFields } from "../channel-fields";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Avatar } from "@/components/ui/avatar";
import { Field, Select, TextInput } from "@/components/ui/field";
import { UUID_RE } from "@/lib/action-result";
import { ROLE_LABELS } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Canal" };

export default async function AdminChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await getServerSupabase();

  const [{ data: channel }, { data: members }, { data: profiles }] = await Promise.all([
    supabase.from("channels").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("channel_members")
      .select("user_id, member_role, can_post, profiles(full_name, role, is_active)")
      .eq("channel_id", id),
    supabase.from("profiles").select("id, full_name, role").eq("is_active", true).order("full_name"),
  ]);
  if (!channel) notFound();

  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  const candidates = (profiles ?? []).filter((p) => !memberIds.has(p.id));
  const sortedMembers = [...(members ?? [])].sort((a, b) =>
    (a.profiles?.full_name ?? "").localeCompare(b.profiles?.full_name ?? "", "pt"),
  );

  return (
    <div className="space-y-6">
      <Link href="/admin/canais" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-ink-muted hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden /> Todos os canais
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="membros" className="space-y-4">
          <h2 id="membros" className="text-lg font-bold">
            Membros de {channel.name} ({sortedMembers.length})
          </h2>

          <ActionForm action={addChannelMember} className="flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-surface-1 p-3" resetOnSuccess>
            <input type="hidden" name="channel_id" value={channel.id} />
            <div className="min-w-48 flex-1">
              <Field label="Adicionar utilizador" htmlFor="add-user">
                <Select id="add-user" name="user_id" required defaultValue="">
                  <option value="" disabled>
                    Selecionar…
                  </option>
                  {candidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || "Sem nome"} — {ROLE_LABELS[p.role]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="w-40">
              <Field label="Função no canal" htmlFor="add-role">
                <Select id="add-role" name="member_role" defaultValue="member">
                  <option value="member">Membro</option>
                  <option value="lead">Responsável</option>
                </Select>
              </Field>
            </div>
            <SubmitButton pendingLabel="…">Adicionar</SubmitButton>
          </ActionForm>

          {sortedMembers.length === 0 ? (
            <p className="text-sm text-ink-faint">Este canal ainda não tem membros.</p>
          ) : (
            <ul className="space-y-2">
              {sortedMembers.map((member) => (
                <li key={member.user_id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-1 p-3">
                  <Avatar name={member.profiles?.full_name || "?"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{member.profiles?.full_name || "Sem nome"}</p>
                    <p className="text-sm text-ink-faint">
                      {member.profiles ? ROLE_LABELS[member.profiles.role] : ""}
                      {member.profiles && !member.profiles.is_active ? " · Desativado" : ""}
                    </p>
                  </div>
                  <ActionForm action={updateChannelMember} className="flex flex-wrap items-center gap-2" showSuccess={false}>
                    <input type="hidden" name="channel_id" value={channel.id} />
                    <input type="hidden" name="user_id" value={member.user_id} />
                    <label className="sr-only" htmlFor={`mr-${member.user_id}`}>
                      Função no canal
                    </label>
                    <Select id={`mr-${member.user_id}`} name="member_role" defaultValue={member.member_role} className="min-h-11 w-36 py-0 text-sm">
                      <option value="member">Membro</option>
                      <option value="lead">Responsável</option>
                    </Select>
                    <label className="flex min-h-11 items-center gap-2 px-1 text-sm">
                      <input type="checkbox" name="can_post" defaultChecked={member.can_post} className="size-5 accent-sky-400" />
                      Pode escrever
                    </label>
                    <SubmitButton variant="secondary" pendingLabel="…">
                      Guardar
                    </SubmitButton>
                  </ActionForm>
                  <ActionForm action={removeChannelMember} className="flex" showSuccess={false}>
                    <input type="hidden" name="channel_id" value={channel.id} />
                    <input type="hidden" name="user_id" value={member.user_id} />
                    <SubmitButton variant="ghost" pendingLabel="…">
                      Remover
                    </SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="h-fit space-y-6">
          <section aria-labelledby="config" className="space-y-4 rounded-2xl border border-line bg-surface-1 p-5">
            <h2 id="config" className="text-lg font-bold">
              Configuração
            </h2>
            <ActionForm action={updateChannel}>
              <input type="hidden" name="channel_id" value={channel.id} />
              <ChannelFields idPrefix="edit" defaults={channel} />
              <Field label="Ordem" htmlFor="edit-sort">
                <TextInput id="edit-sort" name="sort_order" type="number" defaultValue={channel.sort_order} />
              </Field>
              <SubmitButton className="w-full">Guardar canal</SubmitButton>
            </ActionForm>
          </section>
          <ActionForm action={setChannelStatus}>
            <input type="hidden" name="channel_id" value={channel.id} />
            <input type="hidden" name="status" value={channel.status === "active" ? "archived" : "active"} />
            <SubmitButton variant={channel.status === "active" ? "secondary" : "primary"} className="w-full">
              {channel.status === "active" ? "Arquivar canal" : "Reativar canal"}
            </SubmitButton>
          </ActionForm>
        </aside>
      </div>
    </div>
  );
}
