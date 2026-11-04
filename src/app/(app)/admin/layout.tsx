import { AdminTabs } from "./tabs";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="space-y-4">
        <h1 className="text-2xl font-bold">Administração</h1>
        <AdminTabs />
      </header>
      {children}
    </main>
  );
}
