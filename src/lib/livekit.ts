import "server-only";

import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";

/**
 * Integração LiveKit (servidor). As credenciais nunca chegam ao browser:
 * o cliente recebe apenas um token curto, emitido depois de validar a
 * pertença ao canal na base de dados.
 *
 * Variáveis: LIVEKIT_URL (wss://…), LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
 */
export function isLiveKitConfigured(): boolean {
  return Boolean(process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
}

function config() {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) throw new Error("LiveKit não configurado (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).");
  return { url, key, secret };
}

/** Uma sala LiveKit por canal. */
export function radioRoomName(channelId: string): string {
  return `canal-${channelId}`;
}

export const TOKEN_TTL_SECONDS = 15 * 60;

/**
 * Token para ouvir. Ninguém pode publicar à partida: a permissão de microfone
 * é dada pelo servidor só a quem obtém o turno de fala.
 */
export async function createListenerToken(input: { userId: string; name: string; channelId: string }) {
  const { url, key, secret } = config();
  const token = new AccessToken(key, secret, {
    identity: input.userId,
    name: input.name,
    ttl: TOKEN_TTL_SECONDS,
  });
  token.addGrant({
    room: radioRoomName(input.channelId),
    roomJoin: true,
    canSubscribe: true,
    canPublish: false,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  return { url, token: await token.toJwt(), room: radioRoomName(input.channelId) };
}

function roomService() {
  const { url, key, secret } = config();
  return new RoomServiceClient(url.replace(/^ws/, "http"), key, secret);
}

/** Dá ou retira a permissão de transmitir (só microfone). */
export async function setTalkPermission(channelId: string, userId: string, canTalk: boolean) {
  await roomService().updateParticipant(radioRoomName(channelId), userId, {
    permission: {
      canSubscribe: true,
      canPublish: canTalk,
      canPublishData: false,
      canPublishSources: canTalk ? [TrackSource.MICROPHONE] : [],
    },
  });
}
