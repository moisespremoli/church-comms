/**
 * Contratos do domínio de ÁUDIO (Fase 3). Ainda não implementado.
 *
 * LiveKit (SFU) como transporte WebRTC. Tokens emitidos EXCLUSIVAMENTE no
 * backend, após validar a pertença ao canal (can_view_channel) e com validade
 * curta. O Push-to-Talk é uma camada de controlo da aplicação sobre a sala:
 * pedido de fala, concessão temporária, libertação ao largar ou por timeout,
 * e bloqueio de transmissões concorrentes em modo exclusivo.
 *
 * Limitação conhecida: em iOS/PWA o microfone e o áudio não se mantêm ativos
 * com o ecrã bloqueado ou a app em segundo plano.
 */
export type VoiceMode = "direct_call" | "channel_room" | "push_to_talk";

export type VoiceTokenRequest = { channelId: string; mode: VoiceMode };

export type VoiceToken = {
  serverUrl: string;
  token: string;
  roomName: string;
  expiresAt: string;
  canPublish: boolean;
};

export type FloorState =
  | { status: "idle" }
  | { status: "granted"; speakerId: string; grantedAt: string; expiresAt: string }
  | { status: "queued"; queue: string[] };

export interface FloorControl {
  request(channelId: string): Promise<FloorState>;
  release(channelId: string): Promise<FloorState>;
}
