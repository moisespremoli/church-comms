"use client";

import { Bell, ChevronRight, Headphones, Users } from "lucide-react";
import Link from "next/link";
import { ChannelGlyph } from "@/components/channel-glyph";
import { InstallHint } from "@/components/pwa/install-hint";
import { useRealtimeHub } from "@/components/realtime/realtime-hub";
import { Avatar } from "@/components/ui/avatar";
import { Notice } from "@/components/ui/notice";
import type { ChannelSummary } from "@/lib/channels";
import { formatMessageTime } from "@/lib/format";

type DashboardChannel = ChannelSummary & { isMember: boolean; isLead: boolean; lastMessageAt: string | null };

export function Dashboard({
  userName,
  roleLabel,
  isAdmin,
  permissionError,
  channels,
}: {
  userName: string;
  roleLabel: string;
  isAdmin: boolean;
  permissionError: boolean;
  channels: DashboardChannel[];
}) {
  const { unread, onlineUsers, connection } = useRealtimeHub();
  const mine = channels.filter((c) => c.isMember);
  const others = channels.filter((c) => !c.isMember);
  const totalUnread = mine.reduce((sum, c) => sum + (unread[c.id] ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-faint">{roleLabel}</p>
          <h1 className="text-2xl font-bold sm:text-3xl">Olá, {userName.split(" ")[0]}</h1>
        </div>
        <p className="text-sm text-ink-muted" aria-live="polite">
          {connection === "connected" ? "Tempo real ativo" : connection === "offline" ? "Sem ligação" : "A ligar…"}
        </p>
      </header>

      {permissionError ? <Notice tone="error">Não tem permissão para aceder a essa área.</Notice> : null}

      <InstallHint />

      <section aria-label="Resumo" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Por ler" value={totalUnread} icon={<Bell className="size-5" aria-hidden />} />
        <Stat label="Online agora" value={onlineUsers.length} icon={<Users className="size-5" aria-hidden />} />
        <Stat label="Os meus canais" value={mine.length} icon={<ChevronRight className="size-5" aria-hidden />} />
        <PhaseCard />
      </section>

      <section aria-labelledby="meus-canais" className="space-y-3">
        <h2 id="meus-canais" className="text-lg font-bold">
          Os meus canais
        </h2>
        {mine.length === 0 ? (
          <Notice>
            Ainda não foi adicionado a nenhum canal. Peça a um administrador ou coordenador para o adicionar à sua
            equipa.
          </Notice>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {mine.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} unread={unread[channel.id] ?? 0} />
            ))}
          </ul>
        )}
      </section>

      {isAdmin && others.length > 0 ? (
        <section aria-labelledby="outros-canais" className="space-y-3">
          <h2 id="outros-canais" className="text-lg font-bold">
            Outros canais <span className="text-sm font-normal text-ink-faint">(acesso de administrador)</span>
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {others.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} unread={0} />
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="online" className="space-y-3">
        <h2 id="online" className="text-lg font-bold">
          Online agora
        </h2>
        {onlineUsers.length === 0 ? (
          <p className="text-sm text-ink-faint">A aguardar dados de presença…</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {onlineUsers.map((u) => (
              <li key={u.id} className="flex items-center gap-2 rounded-full border border-line bg-surface-1 py-1 pl-1 pr-3 text-sm">
                <Avatar name={u.name} size="sm" />
                <span>{u.name}</span>
                <span className="size-2 rounded-full bg-ok" aria-hidden />
                <span className="sr-only">online</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-1 p-4">
      <div className="flex items-center gap-2 text-ink-faint">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function PhaseCard() {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface-1 p-4 text-sm text-ink-faint">
      <div className="flex items-center gap-2">
        <Headphones className="size-5" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide">Próximas fases</span>
      </div>
      <p className="mt-2">Alertas (Fase 2) e áudio/Push-to-Talk (Fase 3) ainda não estão ativos.</p>
    </div>
  );
}

function ChannelCard({ channel, unread }: { channel: DashboardChannel; unread: number }) {
  return (
    <li>
      <Link
        href={`/canais/${channel.slug}`}
        className={`flex min-h-20 items-center gap-4 rounded-2xl border bg-surface-1 p-4 transition-colors hover:bg-surface-2 ${
          channel.is_emergency ? "border-red-500/50" : "border-line"
        }`}
      >
        <ChannelGlyph icon={channel.icon} color={channel.color} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-bold">
            <span className="truncate">{channel.name}</span>
            {channel.isLead ? (
              <span className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] font-semibold text-ink-muted">Responsável</span>
            ) : null}
          </p>
          <p className="truncate text-sm text-ink-faint">
            {channel.lastMessageAt ? `Última atividade ${formatMessageTime(channel.lastMessageAt)}` : channel.description}
          </p>
        </div>
        {unread > 0 ? (
          <span className="rounded-full bg-accent px-2.5 py-1 text-sm font-bold text-surface-0">
            {unread > 99 ? "99+" : unread}
            <span className="sr-only"> por ler</span>
          </span>
        ) : (
          <ChevronRight className="size-5 text-ink-faint" aria-hidden />
        )}
      </Link>
    </li>
  );
}
