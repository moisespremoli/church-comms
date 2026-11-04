import { describe, expect, it } from "vitest";
import {
  createPendingMessage,
  describeSendError,
  fromServer,
  latestServerTimestamp,
  markFailed,
  markPending,
  mergeMessages,
  newClientId,
  validateMessageBody,
  type ChatMessage,
} from "@/lib/messages/model";
import type { MessageRow } from "@/lib/database.types";

const CHANNEL = "c0000000-0000-4000-8000-000000000001";
const ME = "a0000000-0000-4000-8000-000000000001";
const OTHER = "a0000000-0000-4000-8000-000000000002";

function row(partial: Partial<MessageRow> & Pick<MessageRow, "id" | "client_id" | "created_at">): MessageRow {
  return {
    channel_id: CHANNEL,
    author_id: OTHER,
    body: "olá",
    kind: "text",
    reply_to_id: null,
    ...partial,
  };
}

describe("mergeMessages", () => {
  it("ordena por hora do servidor e desempata por id", () => {
    const a = fromServer(row({ id: "b", client_id: "1", created_at: "2026-11-04T10:00:00.000Z" }));
    const b = fromServer(row({ id: "a", client_id: "2", created_at: "2026-11-04T10:00:00.000Z" }));
    const c = fromServer(row({ id: "c", client_id: "3", created_at: "2026-11-04T09:00:00.000Z" }));
    expect(mergeMessages([], [a, b, c]).map((m) => m.id)).toEqual(["c", "a", "b"]);
  });

  it("não duplica quando a mesma mensagem chega por Broadcast e pela sincronização", () => {
    const m = fromServer(row({ id: "x", client_id: "1", created_at: "2026-11-04T10:00:00.000Z" }));
    const once = mergeMessages([], [m]);
    const twice = mergeMessages(once, [m, { ...m }]);
    expect(twice).toHaveLength(1);
  });

  it("substitui a cópia otimista pela linha confirmada (mesmo client_id)", () => {
    const pending = createPendingMessage({ channelId: CHANNEL, authorId: ME, clientId: "cid-1", body: "PRECISO DE APOIO" });
    const confirmed = fromServer(
      row({ id: "server-id", client_id: "cid-1", author_id: ME, body: "PRECISO DE APOIO", created_at: "2026-11-04T10:00:00.000Z" }),
    );
    const merged = mergeMessages([pending], [confirmed]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "server-id", status: "sent" });
  });

  it("uma versão confirmada nunca regressa a pendente", () => {
    const confirmed = fromServer(row({ id: "s", client_id: "cid", author_id: ME, created_at: "2026-11-04T10:00:00.000Z" }));
    const stale = createPendingMessage({ channelId: CHANNEL, authorId: ME, clientId: "cid", body: "olá" });
    const merged = mergeMessages([confirmed], [stale]);
    expect(merged[0].status).toBe("sent");
    expect(merged[0].id).toBe("s");
  });

  it("mantém mensagens por confirmar no fim da lista", () => {
    const pending = createPendingMessage({
      channelId: CHANNEL,
      authorId: ME,
      clientId: "p",
      body: "a enviar",
      now: new Date("2026-11-04T08:00:00.000Z"),
    });
    const later = fromServer(row({ id: "l", client_id: "l", created_at: "2026-11-04T10:00:00.000Z" }));
    expect(mergeMessages([pending], [later]).map((m) => m.id)).toEqual(["l", "p"]);
  });

  it("mesmo client_id de autores diferentes são mensagens diferentes", () => {
    const a = fromServer(row({ id: "1", client_id: "same", author_id: ME, created_at: "2026-11-04T10:00:00.000Z" }));
    const b = fromServer(row({ id: "2", client_id: "same", author_id: OTHER, created_at: "2026-11-04T10:00:01.000Z" }));
    expect(mergeMessages([], [a, b])).toHaveLength(2);
  });
});

describe("estados de envio", () => {
  it("marca falha e volta a pendente para repetir com o mesmo client_id", () => {
    const pending = createPendingMessage({ channelId: CHANNEL, authorId: ME, clientId: "cid", body: "x" });
    const failed = markFailed([pending], "cid", "Sem ligação", true);
    expect(failed[0]).toMatchObject({ status: "failed", retryable: true, client_id: "cid" });
    const retry = markPending(failed, "cid");
    expect(retry[0]).toMatchObject({ status: "pending", client_id: "cid" });
    expect(retry[0].error).toBeUndefined();
  });

  it("não marca como falhada uma mensagem já confirmada", () => {
    const sent: ChatMessage = fromServer(row({ id: "s", client_id: "cid", author_id: ME, created_at: "2026-11-04T10:00:00.000Z" }));
    expect(markFailed([sent], "cid", "erro", true)[0].status).toBe("sent");
  });
});

describe("cursor de sincronização", () => {
  it("usa apenas mensagens confirmadas", () => {
    const sent = fromServer(row({ id: "s", client_id: "s", created_at: "2026-11-04T10:00:00.000Z" }));
    const pending = createPendingMessage({
      channelId: CHANNEL,
      authorId: ME,
      clientId: "p",
      body: "x",
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    expect(latestServerTimestamp([sent, pending])).toBe("2026-11-04T10:00:00.000Z");
    expect(latestServerTimestamp([pending])).toBeNull();
  });
});

describe("validateMessageBody", () => {
  it("rejeita vazio e só espaços", () => {
    expect(validateMessageBody("").ok).toBe(false);
    expect(validateMessageBody("   \n ").ok).toBe(false);
  });
  it("normaliza espaços nas pontas", () => {
    expect(validateMessageBody("  ESTÁ TUDO PRONTO ")).toEqual({ ok: true, value: "ESTÁ TUDO PRONTO" });
  });
  it("aplica o limite de 2000 caracteres", () => {
    expect(validateMessageBody("a".repeat(2000)).ok).toBe(true);
    expect(validateMessageBody("a".repeat(2001)).ok).toBe(false);
  });
});

describe("describeSendError", () => {
  it("reconhece limite de frequência", () => {
    expect(describeSendError({ message: "RATE_LIMITED: demasiadas", code: "P0001" })).toMatchObject({ retryable: true });
  });
  it("falta de permissão não é repetível", () => {
    expect(
      describeSendError({ message: 'new row violates row-level security policy for table "messages"', code: "42501" }),
    ).toMatchObject({ retryable: false });
  });
  it("erros de rede são repetíveis", () => {
    expect(describeSendError({ message: "TypeError: Failed to fetch" })).toMatchObject({ retryable: true });
  });
});

describe("newClientId", () => {
  it("gera UUID v4 únicos", () => {
    const ids = new Set(Array.from({ length: 100 }, () => newClientId()));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
