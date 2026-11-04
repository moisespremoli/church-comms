import type { Metadata } from "next";
import { PasswordForm } from "../perfil/forms";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Nova palavra-passe" };

/** Destino da ligação de recuperação (a sessão já foi criada em /auth/confirm). */
export default async function NewPasswordPage() {
  await requireUser();
  return (
    <main className="mx-auto w-full max-w-md space-y-6 p-6">
      <h1 className="text-2xl font-bold">Definir nova palavra-passe</h1>
      <PasswordForm after="login" />
    </main>
  );
}
