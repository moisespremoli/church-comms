import type { Metadata } from "next";
import { addTeamMember, createTeam, removeTeamMember } from "../actions";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Field, Select, TextInput } from "@/components/ui/field";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Equipas" };

export default async function AdminTeamsPage() {
  const supabase = await getServerSupabase();
  const [{ data: teams }, { data: teamMembers }, { data: profiles }] = await Promise.all([
    supabase.from("teams").select("id, name, description").order("name"),
    supabase.from("team_members").select("team_id, user_id, is_lead"),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name || "Sem nome"]));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section aria-labelledby="lista-equipas" className="space-y-3">
        <h2 id="lista-equipas" className="text-lg font-bold">
          Equipas ({teams?.length ?? 0})
        </h2>
        {(teams ?? []).length === 0 ? <p className="text-sm text-ink-faint">Ainda não há equipas.</p> : null}
        <ul className="space-y-3">
          {(teams ?? []).map((team) => {
            const members = (teamMembers ?? []).filter((m) => m.team_id === team.id);
            const memberIds = new Set(members.map((m) => m.user_id));
            return (
              <li key={team.id} className="space-y-3 rounded-2xl border border-line bg-surface-1 p-4">
                <div>
                  <p className="font-bold">{team.name}</p>
                  {team.description ? <p className="text-sm text-ink-faint">{team.description}</p> : null}
                </div>
                <ul className="flex flex-wrap gap-2">
                  {members.map((m) => (
                    <li key={m.user_id}>
                      <ActionForm action={removeTeamMember} className="flex" showSuccess={false}>
                        <input type="hidden" name="team_id" value={team.id} />
                        <input type="hidden" name="user_id" value={m.user_id} />
                        <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-surface-3 py-1 pl-3 pr-1 text-sm">
                          {names.get(m.user_id) ?? "Inativo"}
                          {m.is_lead ? <span className="text-xs text-ink-faint">· líder</span> : null}
                          <SubmitButton variant="ghost" className="!min-h-7 !px-2" aria-label={`Remover ${names.get(m.user_id) ?? ""} da equipa`} pendingLabel="…">
                            ×
                          </SubmitButton>
                        </span>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
                <ActionForm action={addTeamMember} className="flex flex-wrap items-center gap-2" resetOnSuccess showSuccess={false}>
                  <input type="hidden" name="team_id" value={team.id} />
                  <label className="sr-only" htmlFor={`tm-${team.id}`}>
                    Adicionar à equipa
                  </label>
                  <Select id={`tm-${team.id}`} name="user_id" required defaultValue="" className="min-h-11 max-w-64 py-0 text-sm">
                    <option value="" disabled>
                      Adicionar pessoa…
                    </option>
                    {(profiles ?? [])
                      .filter((p) => !memberIds.has(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name || "Sem nome"}
                        </option>
                      ))}
                  </Select>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" name="is_lead" className="size-5 accent-sky-400" /> Líder
                  </label>
                  <SubmitButton variant="secondary" pendingLabel="…">
                    Adicionar
                  </SubmitButton>
                </ActionForm>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="nova-equipa" className="h-fit space-y-4 rounded-2xl border border-line bg-surface-1 p-5">
        <h2 id="nova-equipa" className="text-lg font-bold">
          Nova equipa
        </h2>
        <ActionForm action={createTeam} resetOnSuccess>
          <Field label="Nome" htmlFor="team-name">
            <TextInput id="team-name" name="name" required maxLength={60} />
          </Field>
          <Field label="Descrição" htmlFor="team-description">
            <TextInput id="team-description" name="description" maxLength={280} />
          </Field>
          <SubmitButton className="w-full" pendingLabel="A criar…">
            Criar equipa
          </SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
