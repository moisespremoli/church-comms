import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { Notice } from "@/components/ui/notice";
import { getCurrentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/routes";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; estado?: string; erro?: string }>;
}) {
  const { next, estado, erro } = await searchParams;
  const user = await getCurrentUser();

  if (user && user.isActive) redirect(safeNextPath(next));

  if (user && !user.isActive) {
    return (
      <div className="space-y-4">
        <Notice tone="error">A sua conta está desativada. Contacte um administrador.</Notice>
        <form action="/auth/sair" method="post">
          <button type="submit" className="min-h-12 w-full rounded-xl bg-surface-3 font-semibold">
            Terminar sessão
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Entrar</h1>
      {estado === "palavra-passe-alterada" ? (
        <Notice tone="success">Palavra-passe alterada. Entre com a nova palavra-passe.</Notice>
      ) : null}
      {erro === "ligacao-invalida" ? (
        <Notice tone="error">A ligação expirou ou é inválida. Peça uma nova.</Notice>
      ) : null}
      <LoginForm next={safeNextPath(next)} />
      <p className="text-sm text-ink-faint">
        As contas são criadas pela administração da igreja. Não existe registo público.
      </p>
    </div>
  );
}
