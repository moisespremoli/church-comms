import type { MessageKind, MessageRow } from "@/lib/database.types";

export const MAX_MESSAGE_LENGTH = 2000;

export type DeliveryStatus = "pending" | "sent" | "failed";

/**
 * Mensagem tal como a interface a conhece.
 *  - pending: criada localmente, ainda sem confirmação do servidor
 *  - sent:    persistida no servidor (é o único estado confirmável na Fase 1)
 *  - failed:  o servidor recusou ou não respondeu; pode ser repetida com o
 *             mesmo client_id sem risco de duplicar
 */
export type ChatMessage = MessageRow & {
  status: DeliveryStatus;
  error?: string;
  retryable?: boolean;
};

export function fromServer(row: MessageRow): ChatMessage {
  return { ...row, status: "sent" };
}

export function createPendingMessage(input: {
  channelId: string;
  authorId: string;
  clientId: string;
  body: string;
  kind?: MessageKind;
  now?: Date;
}): ChatMessage {
  return {
    id: input.clientId,
    client_id: input.clientId,
    channel_id: input.channelId,
    author_id: input.authorId,
    body: input.body,
    kind: input.kind ?? "text",
    reply_to_id: null,
    created_at: (input.now ?? new Date()).toISOString(),
    status: "pending",
  };
}

function identityKey(message: Pick<MessageRow, "author_id" | "client_id">): string {
  return `${message.author_id ?? "anon"}:${message.client_id}`;
}

const STATUS_RANK: Record<DeliveryStatus, number> = { failed: 0, pending: 1, sent: 2 };

function compareMessages(a: ChatMessage, b: ChatMessage): number {
  // Mensagens ainda não confirmadas ficam sempre no fim, pela ordem local.
  const aLocal = a.status !== "sent";
  const bLocal = b.status !== "sent";
  if (aLocal !== bLocal) return aLocal ? 1 : -1;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Junta mensagens novas à lista atual sem duplicar. A identidade de uma
 * mensagem é (author_id, client_id): a cópia otimista local e a linha vinda do
 * servidor (via RPC, Broadcast ou sincronização) colapsam numa só. Uma versão
 * confirmada nunca é substituída por uma versão menos confirmada.
 */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return current;

  const byKey = new Map<string, ChatMessage>();
  for (const message of current) byKey.set(identityKey(message), message);

  for (const message of incoming) {
    const key = identityKey(message);
    const existing = byKey.get(key);
    if (!existing || STATUS_RANK[message.status] >= STATUS_RANK[existing.status]) {
      byKey.set(key, existing && message.status !== "sent" ? { ...existing, ...message } : message);
    }
  }

  return Array.from(byKey.values()).sort(compareMessages);
}

export function markFailed(
  current: ChatMessage[],
  clientId: string,
  error: string,
  retryable: boolean,
): ChatMessage[] {
  return current.map((message) =>
    message.client_id === clientId && message.status !== "sent"
      ? { ...message, status: "failed", error, retryable }
      : message,
  );
}

export function markPending(current: ChatMessage[], clientId: string): ChatMessage[] {
  return current.map((message) =>
    message.client_id === clientId && message.status === "failed"
      ? { ...message, status: "pending", error: undefined, retryable: undefined }
      : message,
  );
}

/** Cursor para sincronizar após reconexão: a última mensagem confirmada. */
export function latestServerTimestamp(messages: ChatMessage[]): string | null {
  let latest: string | null = null;
  for (const message of messages) {
    if (message.status === "sent" && (latest === null || message.created_at > latest)) {
      latest = message.created_at;
    }
  }
  return latest;
}

export function oldestServerTimestamp(messages: ChatMessage[]): string | null {
  for (const message of messages) {
    if (message.status === "sent") return message.created_at;
  }
  return null;
}

export type BodyValidation = { ok: true; value: string } | { ok: false; error: string };

export function validateMessageBody(raw: string): BodyValidation {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, error: "Escreva uma mensagem." };
  if (value.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `A mensagem tem ${value.length} caracteres (máximo ${MAX_MESSAGE_LENGTH}).` };
  }
  return { ok: true, value };
}

/** Traduz erros do servidor/rede em mensagens úteis e indica se vale a pena repetir. */
export function describeSendError(error: { message?: string; code?: string } | null | undefined): {
  message: string;
  retryable: boolean;
} {
  const text = error?.message ?? "";
  if (text.includes("RATE_LIMITED")) {
    return { message: "Demasiadas mensagens seguidas. Aguarde uns segundos.", retryable: true };
  }
  if (text.includes("row-level security") || error?.code === "42501") {
    return { message: "Sem permissão para escrever neste canal.", retryable: false };
  }
  if (error?.code === "23514" || text.includes("check constraint")) {
    return { message: "Mensagem inválida.", retryable: false };
  }
  if (/fetch|network|Failed to fetch|NetworkError|timeout/i.test(text) || !error?.code) {
    return { message: "Sem ligação. A mensagem será reenviada ao reconectar.", retryable: true };
  }
  return { message: "Não foi possível enviar.", retryable: true };
}

export function newClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (contextos não seguros): UUID v4 com getRandomValues.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const MESSAGE_COLUMNS = "id, channel_id, author_id, client_id, body, kind, reply_to_id, created_at" as const;
export const MESSAGE_PAGE_SIZE = 50;
