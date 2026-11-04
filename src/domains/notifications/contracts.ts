/**
 * Contratos do domínio de NOTIFICAÇÕES (Fase 2). Ainda não implementado.
 *
 * Web Push com chaves VAPID geridas só no servidor; fila durável no backend
 * para tentativas e repetições. Um dispositivo offline, sem permissão ou em
 * modo de foco pode não mostrar a notificação: a UI tem de o dizer.
 */
export type PushSubscriptionRecord = {
  id: string;
  userId: string;
  endpoint: string;
  userAgent: string | null;
  createdAt: string;
  revokedAt: string | null;
};

export type NotificationAttemptState = "queued" | "sent_to_provider" | "provider_rejected" | "expired_subscription";

export interface NotificationsService {
  registerDevice(subscription: PushSubscriptionJSON): Promise<PushSubscriptionRecord>;
  revokeDevice(id: string): Promise<void>;
}
