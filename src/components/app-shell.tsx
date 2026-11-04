"use client";

import { House, LogOut, Settings, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ChannelGlyph } from "@/components/channel-glyph";
import { ConnectionBanner } from "@/components/realtime/connection-banner";
import { RealtimeHubProvider, useRealtimeHub } from "@/components/realtime/realtime-hub";
import type { ChannelSummary } from "@/lib/channels";
import type { AppRole } from "@/lib/database.types";

type ShellUser = { id: string; fullName: string; role: AppRole };

export function AppShell({
  user,
  channels,
  subscribedChannelIds,
  initialUnread,
  children,
}: {
  user: ShellUser;
  channels: ChannelSummary[];
  subscribedChannelIds: string[];
  initialUnread: Record<string, number>;
  children: ReactNode;
}) {
  return (
    <RealtimeHubProvider
      userId={user.id}
      userName={user.fullName}
      channelIds={subscribedChannelIds}
      initialUnread={initialUnread}
    >
      <div className="flex min-h-dvh">
        <Sidebar user={user} channels={channels} />
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <div className="pt-safe sticky top-0 z-20 bg-surface-0">
            <ConnectionBanner />
          </div>
          <div className="flex min-h-0 flex-1 flex-col pb-20 lg:pb-0">{children}</div>
          <BottomNav isAdmin={user.role === "admin"} />
        </div>
      </div>
    </RealtimeHubProvider>
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto min-w-6 rounded-full bg-accent px-1.5 text-center text-xs font-bold leading-6 text-surface-0">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> mensagens por ler</span>
    </span>
  );
}

function Sidebar({ user, channels }: { user: ShellUser; channels: ChannelSummary[] }) {
  const pathname = usePathname();
  const { unread, onlineUsers } = useRealtimeHub();

  const navItem = (href: string, label: string, Icon: typeof House) => {
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${
          active ? "bg-surface-3 text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink"
        }`}
      >
        <Icon className="size-5" aria-hidden />
        {label}
      </Link>
    );
  };

  return (
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-line bg-surface-1 lg:flex">
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="inline-flex size-9 items-center justify-center rounded-xl bg-accent font-black text-surface-0">
          CC
        </span>
        <div>
          <p className="font-bold leading-tight">Church Comms</p>
          <p className="text-xs text-ink-faint">{onlineUsers.length} online</p>
        </div>
      </div>

      <nav aria-label="Principal" className="flex flex-col gap-1 px-3">
        {navItem("/", "Painel", House)}
        {user.role === "admin" ? navItem("/admin", "Administração", ShieldCheck) : null}
      </nav>

      <p className="px-6 pb-2 pt-6 text-xs font-bold uppercase tracking-wider text-ink-faint">Canais</p>
      <nav aria-label="Canais" className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4">
        {channels.length === 0 ? (
          <p className="px-3 text-sm text-ink-faint">Ainda não pertence a nenhum canal.</p>
        ) : (
          channels.map((channel) => {
            const href = `/canais/${channel.slug}`;
            const active = pathname === href;
            return (
              <Link
                key={channel.id}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-2 text-sm font-semibold ${
                  active ? "bg-surface-3 text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <ChannelGlyph icon={channel.icon} color={channel.color} />
                <span className="truncate">{channel.name}</span>
                <UnreadBadge count={unread[channel.id] ?? 0} />
              </Link>
            );
          })
        )}
      </nav>

      <div className="border-t border-line p-3">
        <Link
          href="/perfil"
          className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-ink-muted hover:bg-surface-2 hover:text-ink"
        >
          <User className="size-5" aria-hidden />
          <span className="truncate">{user.fullName}</span>
        </Link>
        <form action="/auth/sair" method="post">
          <button
            type="submit"
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-ink-muted hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="size-5" aria-hidden />
            Terminar sessão
          </button>
        </form>
      </div>
    </aside>
  );
}

function BottomNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const { unread } = useRealtimeHub();
  const totalUnread = Object.values(unread).reduce((sum, n) => sum + n, 0);

  const items = [
    { href: "/", label: "Painel", Icon: House, badge: totalUnread },
    { href: "/perfil", label: "Perfil", Icon: Settings, badge: 0 },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", Icon: ShieldCheck, badge: 0 }] : []),
  ];

  return (
    <nav
      aria-label="Navegação"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface-1/95 backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {items.map(({ href, label, Icon, badge }) => {
          const active = href === "/" ? pathname === "/" || pathname.startsWith("/canais") : pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold ${
                  active ? "text-accent" : "text-ink-muted"
                }`}
              >
                <Icon className="size-6" aria-hidden />
                {label}
                {badge ? (
                  <span className="absolute right-[calc(50%-1.6rem)] top-2 min-w-5 rounded-full bg-accent px-1 text-center text-[11px] font-bold leading-5 text-surface-0">
                    {badge > 99 ? "99+" : badge}
                    <span className="sr-only"> por ler</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
