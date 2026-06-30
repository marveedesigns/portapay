export const queueNames = {
  verification: 'verification-queue',
  reconciliation: 'reconciliation-queue',
  providerSync: 'provider-sync-queue',
  webhookDispatch: 'webhook-dispatch-queue',
  statementGeneration: 'statement-generation-queue',
  auditLog: 'audit-log-queue',
  riskAnalysis: 'risk-analysis-queue',
  notification: 'notification-queue',
} as const;