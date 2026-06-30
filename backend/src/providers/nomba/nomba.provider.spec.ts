import { describe, expect, it, jest } from '@jest/globals';
import { createHmac } from 'node:crypto';
import { NombaProvider } from './nomba.provider';

const payload = {
  event_type: 'payment_success',
  requestId: 'request-1',
  data: {
    merchant: { userId: 'user-1', walletId: 'wallet-1' },
    transaction: {
      aliasAccountNumber: '9391076543',
      sessionId: 'session-1',
      transactionId: 'tx-1',
      type: 'vact_transfer',
      responseCode: '',
      transactionAmount: 1000,
      time: '2026-06-24T10:00:00Z',
    },
    customer: {
      senderName: 'Amina Balogun',
      accountNumber: '1234567890',
    },
  },
};

function provider(secret = 'secret') {
  return new NombaProvider({
    getOrThrow: () => ({ mode: 'test', webhookSecret: secret, mock: true }),
  } as never);
}

function realProvider(secret = 'secret') {
  return new NombaProvider({
    getOrThrow: () => ({ mode: 'test', webhookSecret: secret, mock: false }),
  } as never);
}

describe('NombaProvider', () => {
  it('maps Nomba payment_success webhook payloads into provider transactions', () => {
    const transaction = provider().parseWebhookTransaction(payload);
    expect(transaction).toMatchObject({
      providerReference: 'tx-1',
      nombaReference: 'session-1',
      amount: '1000',
      recipientAccountNumber: '9391076543',
      senderName: 'Amina Balogun',
      senderAccountNumber: '1234567890',
    });
  });

  it('requeries Nomba before trusting webhook payloads outside mock mode', async () => {
    const nomba = realProvider();
    const fetchTransaction = jest.spyOn(nomba, 'fetchTransaction').mockResolvedValue({
      providerReference: 'tx-1',
      nombaReference: 'verified-session-1',
      amount: '1000',
      currency: 'NGN',
      recipientAccountNumber: '9391076543',
      metadata: { raw: { status: 'SUCCESS' } },
    });

    const transaction = await nomba.verifyTransaction('tx-1', payload);

    expect(fetchTransaction).toHaveBeenCalledWith('tx-1');
    expect(transaction).toMatchObject({
      providerReference: 'tx-1',
      nombaReference: 'verified-session-1',
      senderName: 'Amina Balogun',
      senderAccountNumber: '1234567890',
      recipientAccountNumber: '9391076543',
    });
  });
  it('verifies Nomba HMAC signatures', async () => {
    const timestamp = '2026-06-24T10:00:01Z';
    const hashingPayload = 'payment_success:request-1:user-1:wallet-1:tx-1:vact_transfer:2026-06-24T10:00:00Z::2026-06-24T10:00:01Z';
    const signature = createHmac('sha256', 'secret').update(hashingPayload).digest('base64');
    await expect(provider().verifyWebhook(payload, signature, timestamp)).resolves.toBe(true);
    await expect(provider().verifyWebhook(payload, 'bad', timestamp)).resolves.toBe(false);
  });
});
