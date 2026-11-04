"use server";

import { revalidatePath } from "next/cache";
import { EMAIL_RE, UUID_RE, field, rawField, validatePassword, type ActionResult } from "@/lib/action-result";
import { requireAdmin } from "@/lib/auth";
import { CHANNEL_COLOR_OPTIONS, CHANNEL_ICON_OPTIONS } from "@/lib/channels";
import type { AppRole, ChannelMemberRole } from "@/lib/database.types";
import { siteUrl } from "@/lib/env";
import { slugify } from "@/lib/format";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getServerSupabase } from "@/lib/supabase/server";

/*
 * Todas as ações: (1) requireAdmin() no servidor; (2) escrita com o cliente do
 * próprio utilizador sempre que possível, para que a RLS e a auditoria
 * (actor_id) se apliquem; (3) a chave secreta só para a API de Auth.
 */

const ROLES: AppRole[] = ["admin", "coordinator", "member"];
const MEMBER_ROLES: ChannelMemberRole[] = ["lead", "member"];

function fail(message: string): ActionResult {
  return { ok: false, message };
}

function dbError(error: { message: string; code?: string } | null, fallback: string): ActionResult {
  if (!error) return fail(fallback);
  if (error.message.includes("pelo menos um administrador")) return fail("Tem de existir pelo menos um administrador ativo.");
  if (error.message.includes("responsáveis de canal")) return fail("Só coordenadores ou administradores podem ser responsáveis.");
  if (error.code === "23505") return fail("Já existe um registo com esses dados.");
  return fail(fallback);
}

function refresh() {
  revalidatePath("/", "layout");
}

// ── Utilizadores ─────────────────────────────────────────────────────────────

export async function createUser(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const email = field(formData, "email").toLowerCase();
  const fullName = field(formData, "full_name");
  const password = rawField(formData, "password");
  const role = field(formData, "role") as AppRole;
  const teamId = field(formData, "team_id");
  const channelIds = formData.getAll("channel_ids").filter((v): v is string => typeof v === "string" && UUID_RE.test(v));

  if (!EMAIL_RE.test(email)) return fail("Email inválido.");
  if (fullName.length < 2 || fullName.length > 120) return fail("O nome deve ter entre 2 e 120 caracteres.");
  if (!ROLES.includes(role)) return fail("Papel inválido.");
  if (teamId && !UUID_RE.test(teamId)) return fail("Equipa inválida.");
  if (password) {
    const invalid = validatePassword(password);
    if (invalid) return fail(invalid);
  }

  const admin = getAdminSupabase();
  const created = password
    ? await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      })
    : await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo: `${siteUrl()}/auth/confirm?next=/nova-palavra-passe`,
      });

  if (created.error || !created.data.user) {
    const exists = created.error?.code === "email_exists" || created.error?.message?.includes("already");
    return fail(exists ? "Já existe uma conta com este email." : "Não foi possível criar o utilizador.");
  }
  const userId = created.data.user.id;

  // O perfil é criado pelo trigger handle_new_user. Papel/equipa/canais com a
  // sessão do administrador (RLS + auditoria).
  const supabase = await getServerSupabase();
  if (role !== "member") {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
    if (error) return dbError(error, "Utilizador criado, mas não foi possível definir o papel.");
  }
  if (teamId) {
    const { error } = await supabase.from("team_members").insert({ team_id: teamId, user_id: userId });
    if (error) return dbError(error, "Utilizador criado, mas não foi possível adicioná-lo à equipa.");
  }
  if (channelIds.length > 0) {
    const { error } = await supabase
      .from("channel_members")
      .insert(channelIds.map((channel_id) => ({ channel_id, user_id: userId })));
    if (error) return dbError(error, "Utilizador criado, mas não foi possível adicioná-lo aos canais.");
  }

  refresh();
  return {
    ok: true,
    message: password
      ? `Conta criada para ${email}. Comunique a palavra-passe inicial por um canal seguro.`
      : `Convite enviado para ${email}.`,
  };
}

export async function setUserRole(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const userId = field(formData, "user_id");
  const role = field(formData, "role") as AppRole;
  if (!UUID_RE.test(userId) || !ROLES.includes(role)) return fail("Pedido inválido.");

  const supabase = await getServerSupabase();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return dbError(error, "Não foi possível alterar o papel.");
  refresh();
  return { ok: true, message: "Papel atualizado." };
}

export async function setUserActive(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const userId = field(formData, "user_id");
  const active = field(formData, "active") === "true";
  if (!UUID_RE.test(userId)) return fail("Pedido inválido.");
  if (userId === me.id && !active) return fail("Não pode desativar a sua própria conta.");

  const supabase = await getServerSupabase();
  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", userId);
  if (error) return dbError(error, "Não foi possível alterar o estado.");

  // Defesa adicional: bloquear o login no Supabase Auth enquanto inativo.
  const { error: banError } = await getAdminSupabase().auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : "876000h",
  });
  refresh();
  if (banError) {
    return { ok: true, message: "Estado atualizado, mas não foi possível bloquear/desbloquear o login no Auth." };
  }
  return { ok: true, message: active ? "Conta reativada." : "Conta desativada." };
}

// ── Canais ───────────────────────────────────────────────────────────────────

type ChannelValues = { name: string; description: string; icon: string; color: string };

function channelFields(formData: FormData): { error: string } | { values: ChannelValues } {
  const name = field(formData, "name");
  const description = field(formData, "description");
  const icon = field(formData, "icon") || "hash";
  const color = field(formData, "color") || "slate";
  if (name.length < 1 || name.length > 60) return { error: "O nome deve ter entre 1 e 60 caracteres." };
  if (description.length > 280) return { error: "A descrição tem no máximo 280 caracteres." };
  if (!CHANNEL_ICON_OPTIONS.includes(icon)) return { error: "Ícone inválido." };
  if (!CHANNEL_COLOR_OPTIONS.includes(color)) return { error: "Cor inválida." };
  return { values: { name, description, icon, color } };
}

export async function createChannel(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const parsed = channelFields(formData);
  if ("error" in parsed) return fail(parsed.error);
  const slug = slugify(field(formData, "slug") || parsed.values.name);
  if (!slug) return fail("Identificador inválido.");

  const supabase = await getServerSupabase();
  const { error } = await supabase.from("channels").insert({
    ...parsed.values,
    slug,
    is_emergency: field(formData, "is_emergency") === "on",
    has_voice_room: field(formData, "has_voice_room") === "on",
    created_by: me.id,
  });
  if (error) return dbError(error, "Não foi possível criar o canal.");
  refresh();
  return { ok: true, message: `Canal criado (/canais/${slug}).` };
}

export async function updateChannel(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = field(formData, "channel_id");
  if (!UUID_RE.test(id)) return fail("Pedido inválido.");
  const parsed = channelFields(formData);
  if ("error" in parsed) return fail(parsed.error);
  const sortOrder = Number.parseInt(field(formData, "sort_order") || "100", 10);

  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("channels")
    .update({
      ...parsed.values,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
      is_emergency: field(formData, "is_emergency") === "on",
      has_voice_room: field(formData, "has_voice_room") === "on",
    })
    .eq("id", id);
  if (error) return dbError(error, "Não foi possível guardar o canal.");
  refresh();
  return { ok: true, message: "Canal atualizado." };
}

export async function setChannelStatus(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = field(formData, "channel_id");
  const status = field(formData, "status");
  if (!UUID_RE.test(id) || (status !== "active" && status !== "archived")) return fail("Pedido inválido.");
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("channels").update({ status }).eq("id", id);
  if (error) return dbError(error, "Não foi possível alterar o estado do canal.");
  refresh();
  return { ok: true, message: status === "archived" ? "Canal arquivado." : "Canal reativado." };
}

export async function addChannelMember(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const channelId = field(formData, "channel_id");
  const userId = field(formData, "user_id");
  const memberRole = (field(formData, "member_role") || "member") as ChannelMemberRole;
  if (!UUID_RE.test(channelId) || !UUID_RE.test(userId) || !MEMBER_ROLES.includes(memberRole)) {
    return fail("Selecione um utilizador.");
  }
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("channel_members")
    .insert({ channel_id: channelId, user_id: userId, member_role: memberRole, can_post: true });
  if (error) return dbError(error, "Não foi possível adicionar o membro.");
  refresh();
  return { ok: true, message: "Membro adicionado." };
}

export async function updateChannelMember(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const channelId = field(formData, "channel_id");
  const userId = field(formData, "user_id");
  const memberRole = field(formData, "member_role") as ChannelMemberRole;
  const canPost = field(formData, "can_post") === "on";
  if (!UUID_RE.test(channelId) || !UUID_RE.test(userId) || !MEMBER_ROLES.includes(memberRole)) {
    return fail("Pedido inválido.");
  }
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("channel_members")
    .update({ member_role: memberRole, can_post: canPost })
    .eq("channel_id", channelId)
    .eq("user_id", userId);
  if (error) return dbError(error, "Não foi possível atualizar o membro.");
  refresh();
  return { ok: true, message: "Guardado." };
}

export async function removeChannelMember(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const channelId = field(formData, "channel_id");
  const userId = field(formData, "user_id");
  if (!UUID_RE.test(channelId) || !UUID_RE.test(userId)) return fail("Pedido inválido.");
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("channel_members").delete().eq("channel_id", channelId).eq("user_id", userId);
  if (error) return dbError(error, "Não foi possível remover o membro.");
  refresh();
  return { ok: true, message: "Membro removido." };
}

// ── Equipas ──────────────────────────────────────────────────────────────────

export async function createTeam(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const name = field(formData, "name");
  const description = field(formData, "description");
  if (name.length < 1 || name.length > 60) return fail("O nome deve ter entre 1 e 60 caracteres.");
  if (description.length > 280) return fail("A descrição tem no máximo 280 caracteres.");
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("teams").insert({ name, description });
  if (error) return dbError(error, "Não foi possível criar a equipa.");
  refresh();
  return { ok: true, message: "Equipa criada." };
}

export async function addTeamMember(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const teamId = field(formData, "team_id");
  const userId = field(formData, "user_id");
  if (!UUID_RE.test(teamId) || !UUID_RE.test(userId)) return fail("Selecione um utilizador.");
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("team_members")
    .insert({ team_id: teamId, user_id: userId, is_lead: field(formData, "is_lead") === "on" });
  if (error) return dbError(error, "Não foi possível adicionar à equipa.");
  refresh();
  return { ok: true, message: "Adicionado à equipa." };
}

export async function removeTeamMember(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const teamId = field(formData, "team_id");
  const userId = field(formData, "user_id");
  if (!UUID_RE.test(teamId) || !UUID_RE.test(userId)) return fail("Pedido inválido.");
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("team_members").delete().eq("team_id", teamId).eq("user_id", userId);
  if (error) return dbError(error, "Não foi possível remover da equipa.");
  refresh();
  return { ok: true, message: "Removido da equipa." };
}
