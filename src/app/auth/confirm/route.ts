import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/routes";
import { getServerSupabase } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["recovery", "invite", "email", "magiclink", "signup", "email_change"];

/**
 * Destino das ligações enviadas por email (recuperação/convite).
 * Suporta o fluxo token_hash (recomendado: funciona noutro dispositivo) e o
 * fluxo PKCE com ?code=.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  const supabase = await getServerSupabase();
  let ok = false;

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  const target = request.nextUrl.clone();
  target.search = "";
  if (ok) {
    target.pathname = next;
  } else {
    target.pathname = "/login";
    target.searchParams.set("erro", "ligacao-invalida");
  }
  return NextResponse.redirect(target);
}
