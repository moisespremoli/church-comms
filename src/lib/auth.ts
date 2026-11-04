import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import type { AppRole } from "@/lib/database.types";
import { getServerSupabase } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string;
  avatarUrl: string | null;
  role: AppRole;
  isActive: boolean;
};

/**
 * Data Access Layer: lê e valida a sessão no servidor (getUser contacta o
 * Supabase Auth, não confia apenas no cookie). Memorizado por pedido.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;

  return {
    id: profile.id,
    email: user.email ?? null,
    fullName: profile.full_name || user.email || "Sem nome",
    avatarUrl: profile.avatar_url,
    role: profile.role,
    isActive: profile.is_active,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isActive) redirect("/login?estado=inativo");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/?erro=sem-permissao");
  return user;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrador",
  coordinator: "Coordenador",
  member: "Membro",
};
