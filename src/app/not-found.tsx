import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-ink-muted">A página não existe ou não tem permissão para a ver.</p>
      <Link href="/" className="rounded-xl bg-accent px-5 py-3 font-semibold text-surface-0">
        Voltar ao painel
      </Link>
    </main>
  );
}
