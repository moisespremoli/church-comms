"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Utilizadores" },
  { href: "/admin/canais", label: "Canais" },
  { href: "/admin/equipas", label: "Equipas" },
  { href: "/admin/auditoria", label: "Auditoria" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secções de administração" className="flex gap-2 overflow-x-auto">
      {TABS.map((tab) => {
        const active = tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-xl px-4 text-sm font-semibold ${
              active ? "bg-accent text-surface-0" : "bg-surface-2 text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
