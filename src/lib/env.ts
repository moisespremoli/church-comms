// Leitura centralizada e validada das variáveis de ambiente públicas.
// As variáveis NEXT_PUBLIC_* são substituídas em build, por isso têm de ser
// referenciadas literalmente (não por process.env[nome]).

export class MissingEnvError extends Error {
  constructor(name: string) {
    super(
      `Variável de ambiente em falta: ${name}. Copie .env.example para .env.local e preencha os valores do projeto Supabase.`,
    );
    this.name = "MissingEnvError";
  }
}

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") throw new MissingEnvError(name);
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabasePublishableKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
