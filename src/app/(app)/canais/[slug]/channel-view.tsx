"use client";

import { Check, ChevronLeft, Clock, Loader, RotateCw, Search, SendHorizontal, TriangleAlert, Users, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChannelGlyph } from "@/components/channel-glyph";
import { useRealtimeHub } from "@/components/realtime/realtime-hub";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { MessageRow } from "@/lib/database.types";
import { formatMessageTime } from "@/lib/format";
import {
  MAX_MESSAGE_LENGTH,
  MESSAGE_COLUMNS,
  MESSAGE_PAGE_SIZE,
  createPendingMessage,
  describeSendError,
  fromServer,
  latestServerTimestamp,
  markFailed,
  markPending,
  mergeMessages,
  newClientId,
  oldestServerTimestamp,
  validateMessageBody,
  type ChatMessage,
} from "@/lib/messages/model";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export type MemberInfo = { id: string; name: string; isLead: boolean };

type ChannelInfo = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  status: "active" | "archived";
  is_emergency: boolean;
};

const SYNC_LIMIT = 200;

export function ChannelView({
  channel,
  me,
  isMember,
  canPost,
  members,
  initialMessages,
  initialHasMore,
}: {
  channel: ChannelInfo;
  me: { id: string; name: string };
  isMember: boolean;
  canPost: boolean;
  members: MemberInfo[];
  initialMessages: MessageRow[];
  initialHasMore: boolean;
}) {
  const hub = useRealtimeHub();
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages.map(fromServer));
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(members.map((m) => [m.id, m.name])),
  );
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Mensagens de outras pessoas que acabaram de chegar (destaque temporário).
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());

  const messagesRef = useRef(messages);
  const namesRef = useRef(names);
  const stickToBottom = useRef(true);
  const preserveFromBottom = useRef<number | null>(null);
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncing = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    namesRef.current = names;
  }, [names]);

  const markReadNow = useCallback(() => {
    if (readTimer.current) {
      clearTimeout(readTimer.current);
      readTimer.current = null;
    }
    if (!isMember || document.visibilityState !== "visible") return;
    hub.clearUnread(channel.id);
    // Os builders do Supabase são preguiçosos: só executam com .then()/await.
    getBrowserSupabase()
      .rpc("mark_channel_read", { p_channel_id: channel.id })
      .then(({ error }) => {
        if (error) console.warn("[canal] Falha ao marcar como lido", error.message);
      });
  }, [channel.id, hub, isMember]);

  // Com mensagens a chegar em rajada, agrupa as marcações de leitura.
  const scheduleMarkRead = useCallback(() => {
    if (!isMember) return;
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(markReadNow, 400);
  }, [isMember, markReadNow]);

  const resolveNames = useCallback(async (authorIds: (string | null)[]) => {
    const missing = Array.from(new Set(authorIds.filter((id): id is string => !!id && !namesRef.current[id])));
    if (missing.length === 0) return;
    const { data } = await getBrowserSupabase().from("profiles").select("id, full_name").in("id", missing);
    setNames((current) => {
      const next = { ...current };
      for (const id of missing) next[id] = data?.find((p) => p.id === id)?.full_name || "Antigo membro";
      return next;
    });
  }, []);

  const sendToServer = useCallback(
    async (clientId: string, body: string) => {
      const { data, error } = await getBrowserSupabase().rpc("send_message", {
        p_channel_id: channel.id,
        p_client_id: clientId,
        p_body: body,
      });
      if (error || !data) {
        const described = describeSendError(error);
        setMessages((current) => markFailed(current, clientId, described.message, described.retryable));
        return;
      }
      setMessages((current) => mergeMessages(current, [fromServer(data)]));
    },
    [channel.id],
  );

  const retry = useCallback(
    (message: ChatMessage) => {
      setMessages((current) => markPending(current, message.client_id));
      void sendToServer(message.client_id, message.body);
    },
    [sendToServer],
  );

  /** Recupera o que chegou enquanto a ligação esteve em baixo, sem duplicar. */
  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const supabase = getBrowserSupabase();
      const cursor = latestServerTimestamp(messagesRef.current);
      let query = supabase
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("channel_id", channel.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(SYNC_LIMIT);
      if (cursor) query = query.gte("created_at", cursor);
      const { data, error } = await query;
      if (error || !data) return;

      const fetched = data.reverse().map(fromServer);
      if (data.length === SYNC_LIMIT) {
        // Falhou muita coisa: recomeça pela página mais recente (sem buracos)
        // mantendo apenas as mensagens locais ainda não confirmadas.
        setMessages((current) => mergeMessages(current.filter((m) => m.status !== "sent"), fetched));
        setHasMore(true);
      } else {
        setMessages((current) => mergeMessages(current, fetched));
      }
      void resolveNames(fetched.map((m) => m.author_id));

      // Reenvia automaticamente o que falhou por falta de rede (mesmo client_id).
      for (const message of messagesRef.current) {
        if (message.status === "failed" && message.retryable) retry(message);
      }
      scheduleMarkRead();
    } finally {
      syncing.current = false;
    }
  }, [channel.id, resolveNames, retry, scheduleMarkRead]);

  // Subscrição ao hub de tempo real.
  useEffect(() => {
    hub.setActiveChannel(channel.id);
    const unsubscribe = hub.subscribe(channel.id, {
      onMessage: (row) => {
        setMessages((current) => mergeMessages(current, [fromServer(row)]));
        if (row.author_id !== me.id) {
          setFreshIds((ids) => new Set(ids).add(row.id));
          setTimeout(() => {
            setFreshIds((ids) => {
              const next = new Set(ids);
              next.delete(row.id);
              return next;
            });
          }, 5000);
        }
        void resolveNames([row.author_id]);
        if (row.author_id !== me.id) scheduleMarkRead();
      },
      onResync: () => void sync(),
    });
    markReadNow();
    void sync();
    const onVisible = () => {
      if (document.visibilityState === "visible") markReadNow();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      hub.setActiveChannel(null);
      // Sair do canal com uma marcação pendente: enviar já.
      if (readTimer.current) markReadNow();
    };
  }, [channel.id]);

  // Scroll: acompanhar o fim da conversa quando o utilizador já lá está.
  useEffect(() => {
    const onScroll = () => {
      const distance = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      stickToBottom.current = distance < 120;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    if (preserveFromBottom.current !== null) {
      window.scrollTo({ top: document.documentElement.scrollHeight - preserveFromBottom.current });
      preserveFromBottom.current = null;
      return;
    }
    if (stickToBottom.current) {
      window.scrollTo({ top: document.documentElement.scrollHeight });
    }
  }, [messages]);

  const loadOlder = async () => {
    const before = oldestServerTimestamp(messagesRef.current);
    if (!before) return;
    setLoadingOlder(true);
    const { data } = await getBrowserSupabase()
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("channel_id", channel.id)
      .lt("created_at", before)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(MESSAGE_PAGE_SIZE + 1);
    setLoadingOlder(false);
    if (!data) return;
    setHasMore(data.length > MESSAGE_PAGE_SIZE);
    const older = data.slice(0, MESSAGE_PAGE_SIZE).reverse().map(fromServer);
    preserveFromBottom.current = document.documentElement.scrollHeight - window.scrollY;
    setMessages((current) => mergeMessages(current, older));
    void resolveNames(older.map((m) => m.author_id));
  };

  const send = (body: string) => {
    const clientId = newClientId();
    stickToBottom.current = true;
    setMessages((current) =>
      mergeMessages(current, [createPendingMessage({ channelId: channel.id, authorId: me.id, clientId, body })]),
    );
    void sendToServer(clientId, body);
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
      <header
        className="sticky z-10 border-b border-line bg-surface-0/95 backdrop-blur"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + var(--cc-banner-h, 0px))" }}
      >
        <div className="flex items-center gap-3 px-3 py-3 sm:px-5">
          <Link
            href="/"
            className="inline-flex size-11 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-2 lg:hidden"
            aria-label="Voltar ao painel"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
          <ChannelGlyph icon={channel.icon} color={channel.color} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold">{channel.name}</h1>
            <p className="truncate text-xs text-ink-faint">{channel.description}</p>
          </div>
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-expanded={searchOpen}
            className="inline-flex size-11 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-2"
            aria-label="Pesquisar no histórico"
          >
            <Search className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setShowMembers((v) => !v)}
            aria-expanded={showMembers}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-ink-muted hover:bg-surface-2"
          >
            <Users className="size-5" aria-hidden />
            <span>{members.length}</span>
            <span className="sr-only">membros</span>
          </button>
        </div>
        {searchOpen ? <SearchPanel channelId={channel.id} names={names} onClose={() => setSearchOpen(false)} /> : null}
        {showMembers ? <MembersPanel members={members} /> : null}
      </header>

      {channel.is_emergency ? (
        <div className="px-4 pt-3">
          <Notice tone="error">
            Canal de emergências. O Church Comms não substitui os meios oficiais de emergência (112) nem os
            procedimentos de segurança da igreja.
          </Notice>
        </div>
      ) : null}

      <section className="flex flex-1 flex-col px-3 py-4 sm:px-5">
        {hasMore ? (
          <div className="mb-4 flex justify-center">
            <Button variant="secondary" onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder ? <Loader className="size-4 animate-spin" aria-hidden /> : null}
              Carregar mensagens anteriores
            </Button>
          </div>
        ) : null}

        {messages.length === 0 ? (
          <p className="my-auto text-center text-ink-faint">Ainda não há mensagens neste canal.</p>
        ) : (
          <ol role="log" aria-label={`Mensagens de ${channel.name}`} aria-live="polite" className="flex flex-col gap-1">
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const grouped =
                previous &&
                previous.author_id === message.author_id &&
                new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < 5 * 60_000;
              return (
                <MessageItem
                  key={`${message.author_id}:${message.client_id}`}
                  message={message}
                  authorName={message.author_id ? (names[message.author_id] ?? "…") : "Antigo membro"}
                  isOwn={message.author_id === me.id}
                  grouped={Boolean(grouped)}
                  onRetry={retry}
                  fresh={freshIds.has(message.id)}
                />
              );
            })}
          </ol>
        )}
      </section>

      <div className="pb-safe sticky bottom-20 z-10 border-t border-line bg-surface-0/95 px-3 py-3 backdrop-blur sm:px-5 lg:bottom-0">
        {canPost ? (
          <Composer onSend={send} />
        ) : (
          <Notice>
            {channel.status === "archived"
              ? "Este canal está arquivado: só leitura."
              : "Tem acesso de leitura a este canal. Para escrever, peça permissão ao responsável."}
          </Notice>
        )}
      </div>
    </main>
  );
}

function MessageItem({
  message,
  authorName,
  isOwn,
  grouped,
  onRetry,
  fresh,
}: {
  message: ChatMessage;
  authorName: string;
  isOwn: boolean;
  grouped: boolean;
  onRetry: (message: ChatMessage) => void;
  fresh: boolean;
}) {
  return (
    <li
      className={`flex gap-3 rounded-xl px-2 ${grouped ? "py-0.5" : "mt-2 py-1.5"} ${
        message.status === "failed" ? "bg-red-500/10" : isOwn ? "bg-surface-1" : ""
      } ${fresh ? "cc-msg-new" : ""}`}
    >
      <div className="w-10 shrink-0">{grouped ? null : <Avatar name={authorName} />}</div>
      <div className="min-w-0 flex-1">
        {grouped ? null : (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-bold text-ink">{isOwn ? `${authorName} (eu)` : authorName}</span>
            <time dateTime={message.created_at} className="text-xs text-ink-faint">
              {formatMessageTime(message.created_at)}
            </time>
            {message.kind === "quick" ? (
              <span className="rounded bg-surface-3 px-1.5 text-[11px] font-semibold text-ink-muted">Resposta rápida</span>
            ) : null}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">{message.body}</p>
        {isOwn ? <DeliveryState message={message} onRetry={onRetry} /> : null}
      </div>
    </li>
  );
}

function DeliveryState({ message, onRetry }: { message: ChatMessage; onRetry: (m: ChatMessage) => void }) {
  if (message.status === "pending") {
    return (
      <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-faint">
        <Clock className="size-3.5" aria-hidden /> A enviar…
      </p>
    );
  }
  if (message.status === "failed") {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-red-200" role="alert">
        <p className="flex items-start gap-1.5">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>Não enviada: {message.error}</span>
        </p>
        <button
          type="button"
          onClick={() => onRetry(message)}
          className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-surface-3 px-2 font-semibold text-ink"
        >
          <RotateCw className="size-3.5" aria-hidden /> Repetir
        </button>
      </div>
    );
  }
  // Fase 1: só "registada no servidor" é confirmável (sem recibos de entrega/leitura).
  return (
    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-faint">
      <Check className="size-3.5" aria-hidden /> Enviada
    </p>
  );
}

function Composer({ onSend }: { onSend: (body: string) => void }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const result = validateMessageBody(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setDraft("");
    onSend(result.value);
    textarea.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const remaining = MAX_MESSAGE_LENGTH - draft.trim().length;

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <label htmlFor="composer" className="sr-only">
          Mensagem
        </label>
        <textarea
          id="composer"
          ref={textarea}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Escrever mensagem…"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "composer-error" : undefined}
          className="min-h-14 flex-1 resize-none rounded-2xl border border-line-strong bg-surface-1 px-4 py-3.5 text-base text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          className="inline-flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-surface-0 hover:bg-accent-strong"
          aria-label="Enviar mensagem"
        >
          <SendHorizontal className="size-6" aria-hidden />
        </button>
      </div>
      {error ? (
        <p id="composer-error" className="text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : remaining < 200 ? (
        <p className={`text-xs ${remaining < 0 ? "text-red-200" : "text-ink-faint"}`}>{remaining} caracteres restantes</p>
      ) : null}
    </form>
  );
}

function MembersPanel({ members }: { members: MemberInfo[] }) {
  const { onlineUsers } = useRealtimeHub();
  const online = new Set(onlineUsers.map((u) => u.id));
  const sorted = [...members].sort(
    (a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.name.localeCompare(b.name, "pt"),
  );
  return (
    <div className="max-h-72 overflow-y-auto border-t border-line px-4 py-3">
      <ul className="grid gap-2 sm:grid-cols-2">
        {sorted.map((member) => (
          <li key={member.id} className="flex items-center gap-2 text-sm">
            <Avatar name={member.name} size="sm" />
            <span className="truncate">{member.name}</span>
            {member.isLead ? <span className="text-xs text-ink-faint">· Responsável</span> : null}
            <span className="ml-auto flex items-center gap-1 text-xs text-ink-faint">
              <span className={`size-2 rounded-full ${online.has(member.id) ? "bg-ok" : "bg-line-strong"}`} aria-hidden />
              {online.has(member.id) ? "Online" : "Offline"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SearchPanel({
  channelId,
  names,
  onClose,
}: {
  channelId: string;
  names: Record<string, string>;
  onClose: () => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<MessageRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (event: FormEvent) => {
    event.preventDefault();
    const q = term.trim();
    if (q.length < 2) return;
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await getBrowserSupabase()
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("channel_id", channelId)
      .textSearch("search", q, { config: "portuguese", type: "websearch" })
      .order("created_at", { ascending: false })
      .limit(30);
    setLoading(false);
    if (queryError) setError("Não foi possível pesquisar.");
    setResults(data ?? []);
  };

  return (
    <div className="border-t border-line px-4 py-3">
      <form onSubmit={run} className="flex gap-2" role="search">
        <label htmlFor="channel-search" className="sr-only">
          Pesquisar mensagens
        </label>
        <input
          id="channel-search"
          autoFocus
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Pesquisar mensagens…"
          className="min-h-11 flex-1 rounded-xl border border-line-strong bg-surface-1 px-3 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
        <Button type="submit" variant="secondary" disabled={loading}>
          {loading ? <Loader className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />}
          Pesquisar
        </Button>
        <Button variant="ghost" onClick={onClose} aria-label="Fechar pesquisa">
          <X className="size-4" aria-hidden />
        </Button>
      </form>
      {error ? <p className="mt-2 text-sm text-red-200">{error}</p> : null}
      {results ? (
        results.length === 0 ? (
          <p className="mt-3 text-sm text-ink-faint">Sem resultados.</p>
        ) : (
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {results.map((m) => (
              <li key={m.id} className="rounded-xl bg-surface-1 p-2 text-sm">
                <p className="text-xs text-ink-faint">
                  {m.author_id ? (names[m.author_id] ?? "Membro") : "Antigo membro"} · {formatMessageTime(m.created_at)}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
