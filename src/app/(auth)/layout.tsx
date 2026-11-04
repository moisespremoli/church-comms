import { SetupRequired } from "@/components/setup-required";
import { isSupabaseConfigured } from "@/lib/env";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) return <SetupRequired />;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 p-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-accent text-lg font-black text-surface-0">
          CC
        </span>
        <div>
          <p className="text-xl font-bold leading-tight">Church Comms</p>
          <p className="text-sm text-ink-faint">Comunicação operacional</p>
        </div>
      </div>
      {children}
    </main>
  );
}
