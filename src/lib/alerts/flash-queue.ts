import type { MessageRow } from "@/lib/database.types";

/** Mensagens por ver que acionaram o sinal luminoso. */
export type FlashItem = {
  message: MessageRow;
  channelId: string;
  channelSlug: string;
  channelName: string;
  channelColor: string;
  isEmergency: boolean;
};

export type FlashState = { items: FlashItem[] };

export type FlashAction =
  | { type: "push"; item: FlashItem }
  | { type: "dismiss-channel"; channelId: string }
  | { type: "dismiss-all" };

export const MAX_FLASH_ITEMS = 50;

export function flashReducer(state: FlashState, action: FlashAction): FlashState {
  switch (action.type) {
    case "push": {
      if (state.items.some((i) => i.message.id === action.item.message.id)) return state;
      const items = [...state.items, action.item];
      return { items: items.slice(-MAX_FLASH_ITEMS) };
    }
    case "dismiss-channel":
      return { items: state.items.filter((i) => i.channelId !== action.channelId) };
    case "dismiss-all":
      return { items: [] };
  }
}

/**
 * O que mostrar: a mensagem mais recente, mas uma de EMERGÊNCIAS tem sempre
 * prioridade sobre as restantes.
 */
export function currentFlash(state: FlashState): FlashItem | null {
  if (state.items.length === 0) return null;
  for (let i = state.items.length - 1; i >= 0; i--) {
    if (state.items[i].isEmergency) return state.items[i];
  }
  return state.items[state.items.length - 1];
}

/** Decide se uma mensagem recebida deve acionar o sinal luminoso. */
export function shouldFlash(input: {
  authorId: string | null;
  myId: string;
  enabled: boolean;
  isViewingChannel: boolean;
}): "overlay" | "pulse" | "none" {
  if (!input.enabled || input.authorId === input.myId) return "none";
  // Já está a olhar para o canal: brilho curto nas margens, sem tapar a conversa.
  return input.isViewingChannel ? "pulse" : "overlay";
}
