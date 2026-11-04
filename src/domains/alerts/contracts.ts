/**
 * Contratos do domínio de ALERTAS (Fase 2). Ainda não implementado.
 *
 * Regras fixadas desde já (documento de arquitetura, secção 4.3):
 *  - O alerta é persistido no servidor ANTES de qualquer tentativa de notificação.
 *  - Os estados técnicos (registado → em distribuição → push aceite pelo serviço)
 *    são distintos do reconhecimento humano e da resolução.
 *  - "Entregue" nunca é inferido de o push ter sido aceite por um fornecedor.
 */
export type AlertLevel = "priority" | "urgent" | "emergency";

export type AlertState = "registered" | "dispatching" | "push_accepted" | "acknowledged" | "resolved";

export type AlertSummary = {
  id: string;
  channelId: string;
  level: AlertLevel;
  state: AlertState;
  message: string;
  raisedBy: string;
  raisedAt: string;
  escalationDeadline: string | null;
};

export type Acknowledgement = {
  alertId: string;
  userId: string;
  acknowledgedAt: string;
};

export interface AlertsService {
  raise(input: { channelId: string; level: AlertLevel; message: string; clientId: string }): Promise<AlertSummary>;
  acknowledge(alertId: string): Promise<Acknowledgement>;
  resolve(alertId: string, note?: string): Promise<AlertSummary>;
}
