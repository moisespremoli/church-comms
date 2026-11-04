"use server";

import { redirect } from "next/navigation";
import { EMAIL_RE, field, rawField, type ActionResult } from "@/lib/action-result";
import { siteUrl } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";
import { getServerSupabase } from "@/lib/supabase/server";

export async function signIn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const email = field(formData, "email").toLowerCase();
  const password = rawField(formData, "password");
  const next = safeNextPath(field(formData, "next"));

  if (!EMAIL_RE.test(email) || !password) {
    return { ok: false, message: "Indique o email e a palavra-passe." };
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Mensagem genérica: não revela se o email existe.
    const throttled = error.status === 429;
    return {
      ok: false,
      message: throttled
        ? "Demasiadas tentativas. Aguarde alguns minutos."
        : "Email ou palavra-passe incorretos.",
    };
  }
  redirect(next);
}

export async function requestPasswordReset(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const email = field(formData, "email").toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, message: "Indique um email válido." };

  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=/nova-palavra-passe`,
  });
  if (error?.status === 429) {
    return { ok: false, message: "Demasiados pedidos. Aguarde alguns minutos." };
  }
  // Mesma resposta quer o email exista ou não (evita enumeração de contas).
  return {
    ok: true,
    message: "Se existir uma conta com este email, receberá uma ligação para definir uma nova palavra-passe.",
  };
}
