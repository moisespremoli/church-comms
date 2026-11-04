"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { field, rawField, validatePassword, type ActionResult } from "@/lib/action-result";
import { requireUser } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";

export async function updateProfile(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const fullName = field(formData, "full_name");
  if (fullName.length < 2 || fullName.length > 120) {
    return { ok: false, message: "O nome deve ter entre 2 e 120 caracteres." };
  }
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
  if (error) return { ok: false, message: "Não foi possível guardar o perfil." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Perfil atualizado." };
}

export async function changePassword(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const password = rawField(formData, "password");
  const confirm = rawField(formData, "confirm");
  const invalid = validatePassword(password);
  if (invalid) return { ok: false, message: invalid };
  if (password !== confirm) return { ok: false, message: "As palavras-passe não coincidem." };

  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "same_password"
          ? "A nova palavra-passe tem de ser diferente da atual."
          : error.code === "weak_password"
            ? "Palavra-passe demasiado fraca."
            : "Não foi possível alterar a palavra-passe.",
    };
  }
  if (field(formData, "after") === "login") {
    await supabase.auth.signOut();
    redirect("/login?estado=palavra-passe-alterada");
  }
  return { ok: true, message: "Palavra-passe alterada." };
}
