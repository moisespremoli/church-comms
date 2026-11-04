import type { Metadata } from "next";
import { AlertSettings } from "./alert-settings";
import { PasswordForm, ProfileForm } from "./forms";
import { InstallHint } from "@/components/pwa/install-hint";
import { requireUser, ROLE_LABELS } from "@/lib/auth";

export const metadata: Metadata = { title: "Perfil" };

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">Perfil</h1>
        <p className="text-sm text-ink-faint">
          {user.email} · {ROLE_LABELS[user.role]}
        </p>
      </header>

      <InstallHint />

      <section className="space-y-4 rounded-2xl border border-line bg-surface-1 p-5">
        <div>
          <h2 className="text-lg font-bold">Alertas neste dispositivo</h2>
          <p className="text-sm text-ink-faint">Como este aparelho avisa quando chega uma mensagem nova.</p>
        </div>
        <AlertSettings />
      </section>

      <section className="space-y-4 rounded-2xl border border-line bg-surface-1 p-5">
        <h2 className="text-lg font-bold">Dados pessoais</h2>
        <ProfileForm fullName={user.fullName} />
      </section>

      <section className="space-y-4 rounded-2xl border border-line bg-surface-1 p-5">
        <h2 className="text-lg font-bold">Palavra-passe</h2>
        <PasswordForm />
      </section>

      <form action="/auth/sair" method="post" className="lg:hidden">
        <button type="submit" className="min-h-12 w-full rounded-xl border border-line-strong font-semibold text-ink-muted">
          Terminar sessão
        </button>
      </form>
    </main>
  );
}
