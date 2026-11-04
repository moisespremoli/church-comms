import type { Metadata } from "next";
import { createUser, setUserActive, setUserRole } from "./actions";
import { ActionForm, SubmitButton } from "@/components/admin/action-form";
import { Avatar } from "@/components/ui/avatar";
import { Field, Select, TextInput } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { MIN_PASSWORD_LENGTH } from "@/lib/action-result";
import { ROLE_LABELS, requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Utilizadores" };

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const supabase = await getServerSupabase();

  const [{ data: profiles }, { data: teams }, { data: channels }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, is_active, created_at").order("full_name"),
    supabase.from("teams").select("id, name").order("name"),
    supabase.from("channels").select("id, name").eq("status", "active").order("sort_order"),
  ]);

  // Emails vivem só em auth.users: lidos no servidor com a chave secreta.
  let emails = new Map<string, string>();
  let secretKeyMissing = false;
  try {
    const { data } = await getAdminSupabase().auth.admin.listUsers({ page: 1, perPage: 1000 });
    emails = new Map((data?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  } catch {
    secretKeyMissing = true;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section aria-labelledby="lista-utilizadores" className="space-y-3">
        <h2 id="lista-utilizadores" className="text-lg font-bold">
          Utilizadores ({profiles?.length ?? 0})
        </h2>
        {secretKeyMissing ? (
          <Notice tone="error">
            SUPABASE_SECRET_KEY não está configurada no servidor: não é possível criar utilizadores nem ver emails.
          </Notice>
        ) : null}
        <ul className="space-y-2">
          {(profiles ?? []).map((profile) => (
            <li
              key={profile.id}
              className={`flex flex-wrap items-center gap-3 rounded-2xl border bg-surface-1 p-3 ${
                profile.is_active ? "border-line" : "border-dashed border-line-strong opacity-70"
              }`}
            >
              <Avatar name={profile.full_name || "?"} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {profile.full_name || "Sem nome"} {profile.id === me.id ? <span className="text-ink-faint">(eu)</span> : null}
                </p>
                <p className="truncate text-sm text-ink-faint">
                  {emails.get(profile.id) ?? "—"} · {profile.is_active ? "Ativo" : "Desativado"}
                </p>
              </div>
              <ActionForm action={setUserRole} className="flex items-center gap-2" showSuccess={false}>
                <input type="hidden" name="user_id" value={profile.id} />
                <label className="sr-only" htmlFor={`role-${profile.id}`}>
                  Papel
                </label>
                <Select id={`role-${profile.id}`} name="role" defaultValue={profile.role} className="min-h-11 w-40 py-0 text-sm">
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
                <SubmitButton variant="secondary" pendingLabel="…">
                  Aplicar
                </SubmitButton>
              </ActionForm>
              {profile.id !== me.id ? (
                <ActionForm action={setUserActive} className="flex" showSuccess={false}>
                  <input type="hidden" name="user_id" value={profile.id} />
                  <input type="hidden" name="active" value={profile.is_active ? "false" : "true"} />
                  <SubmitButton variant={profile.is_active ? "ghost" : "secondary"} pendingLabel="…">
                    {profile.is_active ? "Desativar" : "Reativar"}
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="novo-utilizador" className="h-fit space-y-4 rounded-2xl border border-line bg-surface-1 p-5">
        <h2 id="novo-utilizador" className="text-lg font-bold">
          Novo utilizador
        </h2>
        <ActionForm action={createUser} resetOnSuccess>
          <Field label="Nome" htmlFor="new-name">
            <TextInput id="new-name" name="full_name" required maxLength={120} autoComplete="off" />
          </Field>
          <Field label="Email" htmlFor="new-email">
            <TextInput id="new-email" name="email" type="email" required autoComplete="off" />
          </Field>
          <Field
            label="Palavra-passe inicial"
            htmlFor="new-password"
            hint={`Opcional (mín. ${MIN_PASSWORD_LENGTH}). Se ficar vazio, é enviado um convite por email.`}
          >
            <TextInput id="new-password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} />
          </Field>
          <Field label="Papel" htmlFor="new-role">
            <Select id="new-role" name="role" defaultValue="member">
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Equipa" htmlFor="new-team">
            <Select id="new-team" name="team_id" defaultValue="">
              <option value="">Sem equipa</option>
              {(teams ?? []).map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-ink-muted">Canais</legend>
            <div className="grid grid-cols-1 gap-1">
              {(channels ?? []).map((channel) => (
                <label key={channel.id} className="flex min-h-10 items-center gap-3 rounded-lg px-2 hover:bg-surface-2">
                  <input type="checkbox" name="channel_ids" value={channel.id} className="size-5 accent-sky-400" />
                  <span className="text-sm">{channel.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <SubmitButton className="w-full" pendingLabel="A criar…" disabled={secretKeyMissing}>
            Criar utilizador
          </SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
