import { describe, expect, it } from "vitest";
import { currentFlash, flashReducer, MAX_FLASH_ITEMS, shouldFlash, type FlashItem } from "@/lib/alerts/flash-queue";

function item(id: string, channelId = "c1", isEmergency = false): FlashItem {
  return {
    message: {
      id,
      channel_id: channelId,
      author_id: "outro",
      client_id: id,
      body: `msg ${id}`,
      kind: "text",
      reply_to_id: null,
      created_at: "2026-11-04T10:00:00.000Z",
    },
    channelId,
    channelSlug: channelId,
    channelName: channelId.toUpperCase(),
    channelColor: "sky",
    isEmergency,
  };
}

describe("flashReducer", () => {
  it("não repete a mesma mensagem (Broadcast + sincronização)", () => {
    let s = flashReducer({ items: [] }, { type: "push", item: item("a") });
    s = flashReducer(s, { type: "push", item: item("a") });
    expect(s.items).toHaveLength(1);
  });

  it("dispensar um canal só remove as mensagens desse canal", () => {
    let s = { items: [item("a", "c1"), item("b", "c2"), item("c", "c1")] };
    s = flashReducer(s, { type: "dismiss-channel", channelId: "c1" });
    expect(s.items.map((i) => i.message.id)).toEqual(["b"]);
  });

  it("limita o tamanho da fila", () => {
    let s = { items: [] as FlashItem[] };
    for (let i = 0; i < MAX_FLASH_ITEMS + 10; i++) s = flashReducer(s, { type: "push", item: item(String(i)) });
    expect(s.items).toHaveLength(MAX_FLASH_ITEMS);
    expect(s.items.at(-1)?.message.id).toBe(String(MAX_FLASH_ITEMS + 9));
  });
});

describe("currentFlash", () => {
  it("mostra a mais recente", () => {
    expect(currentFlash({ items: [item("a"), item("b")] })?.message.id).toBe("b");
  });
  it("EMERGÊNCIAS tem prioridade", () => {
    expect(currentFlash({ items: [item("e", "emerg", true), item("b")] })?.message.id).toBe("e");
  });
  it("vazio", () => {
    expect(currentFlash({ items: [] })).toBeNull();
  });
});

describe("shouldFlash", () => {
  const base = { authorId: "outro", myId: "eu", enabled: true, isViewingChannel: false };
  it("mensagem de outra pessoa noutro ecrã: sinal em ecrã inteiro", () => {
    expect(shouldFlash(base)).toBe("overlay");
  });
  it("já a ver o canal: brilho curto", () => {
    expect(shouldFlash({ ...base, isViewingChannel: true })).toBe("pulse");
  });
  it("as próprias mensagens não acionam", () => {
    expect(shouldFlash({ ...base, authorId: "eu" })).toBe("none");
  });
  it("desligado nas preferências", () => {
    expect(shouldFlash({ ...base, enabled: false })).toBe("none");
  });
});
