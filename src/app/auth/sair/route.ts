import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/** Terminar sessão (POST para evitar logout por pré-carregamento de links). */
export async function POST(request: NextRequest) {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url, { status: 303 });
}
