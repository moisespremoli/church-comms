import { Settings } from "lucide-react";

/** Mostrado quando o Supabase ainda não está configurado (.env.local). */
export function SetupRequired() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 p-6">
      <div className="flex items-center gap-3">
        <Settings className="size-8 text-warn" aria-hidden />
        <h1 className="text-2xl font-bold">Configuração necessária</h1>
      </div>
      <p className="text-ink-muted">
        O Church Comms ainda não está ligado a um projeto Supabase. Nenhum dado é simulado: é preciso configurar o
        backend antes de usar a aplicação.
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-ink-muted">
        <li>Crie um projeto em supabase.com.</li>
        <li>
          Aplique as migrações em <code className="text-ink">supabase/migrations</code>.
        </li>
        <li>
          Copie <code className="text-ink">.env.example</code> para <code className="text-ink">.env.local</code> e
          preencha os valores.
        </li>
        <li>Reinicie o servidor e crie o primeiro administrador (ver README).</li>
      </ol>
    </main>
  );
}
