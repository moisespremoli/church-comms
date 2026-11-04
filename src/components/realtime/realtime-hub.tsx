"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MessageRow } from "@/lib/database.types";
import { getBrowserSupabase } from "@/lib/supabase/browser";

/**
 * Ponto único de ligação ao Supabase Realtime.
 *
 *  - Uma subscrição Broadcast privada por canal autorizado (`channel:<id>`),
 *    partilhada pelo dashboard, pela barra lateral e pela vista do canal.
 *  - Presença em `presence:online`.
 *  - Emite "resync" quando uma subscrição volta depois de cair, ou quando o
 *    browser recupera rede / a app volta ao primeiro plano, para que as vistas
 *    recuperem pelo histórico o que possam ter perdido.
 */

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";

export type OnlineUser = { id: string; name: string };

type Listener = {
  onMessage?: (message: MessageRow) => void;
  onResync?: () => void;
};

type HubValue = {
  connection: ConnectionState;
  onlineUsers: OnlineUser[];
  unread: Record<string, number>;
  subscribe: (channelId: string, listener: Listener) => () => void;
  setActiveChannel: (channelId: string | null) => void;
  clearUnread: (channelId: string) => void;
};

const HubContext = createContext<HubValue | null>(null);

export function useRealtimeHub(): HubValue {
  const value = useContext(HubContext);
  if (!value) throw new Error("useRealtimeHub tem de ser usado dentro de RealtimeHubProvider");
  return value;
}

type TopicStatus = "joining" | "joined" | "error";

export function RealtimeHubProvider({
  userId,
  userName,
  channelIds,
  initialUnread,
  children,
}: {
  userId: string;
  userName: string;
  channelIds: string[];
  initialUnread: Record<string, number>;
  children: ReactNode;
}) {
  const [unread, setUnread] = useState<Record<string, number>>(initialUnread);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [topicStatus, setTopicStatus] = useState<Record<string, TopicStatus>>({});
  const [browserOnline, setBrowserOnline] = useState(true);

  const listeners = useRef(new Map<string, Set<Listener>>());
  const activeChannel = useRef<string | null>(null);
  const channelKey = channelIds.join(",");

  const emitResync = useCallback((channelId?: string) => {
    const targets = channelId ? [channelId] : Array.from(listeners.current.keys());
    for (const id of targets) listeners.current.get(id)?.forEach((l) => l.onResync?.());
  }, []);

  const refreshUnread = useCallback(async () => {
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase.rpc("get_unread_counts");
    if (error || !data) return;
    setUnread(() => {
      const next: Record<string, number> = {};
      for (const row of data) {
        next[row.channel_id] = row.channel_id === activeChannel.current ? 0 : Number(row.unread);
      }
      return next;
    });
  }, []);

  // Subscrições Broadcast por canal + presença.
  useEffect(() => {
    const supabase = getBrowserSupabase();
    const ids = channelKey ? channelKey.split(",") : [];
    const channels: RealtimeChannel[] = [];
    const joinedOnce = new Set<string>();
    let disposed = false;

    (async () => {
      // Garante que o Realtime usa o JWT do utilizador (canais privados + RLS).
      await supabase.realtime.setAuth();
      if (disposed) return;

      for (const channelId of ids) {
        setTopicStatus((s) => ({ ...s, [channelId]: "joining" }));
        const channel = supabase
          .channel(`channel:${channelId}`, { config: { private: true } })
          .on("broadcast", { event: "message.created" }, ({ payload }) => {
            const message = (payload as { message?: MessageRow })?.message;
            if (!message || message.channel_id !== channelId) return;

            listeners.current.get(channelId)?.forEach((l) => l.onMessage?.(message));

            const isOwn = message.author_id === userId;
            const isViewing =
              activeChannel.current === channelId && document.visibilityState === "visible";
            if (!isOwn && !isViewing) {
              setUnread((u) => ({ ...u, [channelId]: (u[channelId] ?? 0) + 1 }));
            }
          })
          .subscribe((status) => {
            if (disposed) return;
            if (status === "SUBSCRIBED") {
              setTopicStatus((s) => ({ ...s, [channelId]: "joined" }));
              // Sempre que (re)entra no tópico, as vistas recuperam o que possa
              // ter chegado antes da subscrição ficar ativa.
              emitResync(channelId);
              if (joinedOnce.has(channelId)) void refreshUnread();
              joinedOnce.add(channelId);
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
              setTopicStatus((s) => ({ ...s, [channelId]: "error" }));
            }
          });
        channels.push(channel);
      }

      const presence = supabase
        .channel("presence:online", { config: { private: true, presence: { key: userId } } })
        .on("presence", { event: "sync" }, () => {
          const state = presence.presenceState<{ name?: string }>();
          setOnlineUsers(
            Object.entries(state)
              .map(([id, metas]) => ({ id, name: metas[0]?.name ?? "Utilizador" }))
              .sort((a, b) => a.name.localeCompare(b.name, "pt")),
          );
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await presence.track({ name: userName, since: new Date().toISOString() });
          }
        });
      channels.push(presence);
    })();

    return () => {
      disposed = true;
      for (const channel of channels) void supabase.removeChannel(channel);
    };
  }, [channelKey, userId, userName, emitResync, refreshUnread]);

  // Rede do browser e regresso ao primeiro plano.
  useEffect(() => {
    setBrowserOnline(navigator.onLine);
    const onOnline = () => {
      setBrowserOnline(true);
      emitResync();
      void refreshUnread();
    };
    const onOffline = () => setBrowserOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        // Em iOS/Android o socket pode ter sido suspenso em segundo plano.
        emitResync();
        void refreshUnread();
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [emitResync, refreshUnread]);

  const connection: ConnectionState = useMemo(() => {
    if (!browserOnline) return "offline";
    const statuses = Object.values(topicStatus);
    if (statuses.length === 0) return channelKey ? "connecting" : "connected";
    if (statuses.some((s) => s === "error")) return "reconnecting";
    if (statuses.some((s) => s === "joining")) return "connecting";
    return "connected";
  }, [browserOnline, topicStatus, channelKey]);

  const subscribe = useCallback((channelId: string, listener: Listener) => {
    let set = listeners.current.get(channelId);
    if (!set) {
      set = new Set();
      listeners.current.set(channelId, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) listeners.current.delete(channelId);
    };
  }, []);

  const setActiveChannel = useCallback((channelId: string | null) => {
    activeChannel.current = channelId;
  }, []);

  const clearUnread = useCallback((channelId: string) => {
    setUnread((u) => (u[channelId] ? { ...u, [channelId]: 0 } : u));
  }, []);

  const value = useMemo<HubValue>(
    () => ({ connection, onlineUsers, unread, subscribe, setActiveChannel, clearUnread }),
    [connection, onlineUsers, unread, subscribe, setActiveChannel, clearUnread],
  );

  return <HubContext value={value}>{children}</HubContext>;
}
