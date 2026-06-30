import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  CreateVirtualAccountRequest,
  CreateVirtualAccountResponse,
  PaymentProvider,
  ProviderTransaction,
} from '../payment-provider.interface';

interface NombaConfig {
  mode: 'test' | 'live';
  baseUrl: string;
  clientId?: string;
  clientSecret?: string;
  parentAccountId?: string;
  subAccountId?: string;
  webhookSecret?: string;
  webhookUrl?: string;
  mock?: boolean;
}

interface NombaTokenResponse {
  data?: {
    access_token?: string;
    accessToken?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  access_token?: string;
  accessToken?: string;
  expires_in?: number;
}

@Injectable()
export class NombaProvider implements PaymentProvider {
  private accessToken?: string;
  private accessTokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {}

  async createVirtualAccount(request: CreateVirtualAccountRequest): Promise<CreateVirtualAccountResponse> {
    const cfg = this.getConfig();
    if (cfg.mock) {
      return this.mockVirtualAccount(request);
    }

    this.assertConfigured(cfg, ['clientId', 'clientSecret', 'parentAccountId']);
    const token = await this.getAccessToken(cfg);
    const accountRef = this.buildAccountRef(request.customerId);
    const endpoint = cfg.subAccountId ? `/v1/accounts/virtual/${cfg.subAccountId}` : '/v1/accounts/virtual';
    const response = await this.request<{ data: Record<string, unknown> }>(cfg, endpoint, {
      method: 'POST',
      token,
      body: {
        accountRef,
        accountName: this.safeAccountName(request.customerName),
        bvn: request.bvn,
        expectedAmount: request.expectedAmount,
        expiryDate: request.expiryDate,
      },
    });

    const data = response.data ?? {};
    return {
      providerAccountId: String(data.accountHolderId ?? data.accountRef ?? accountRef),
      accountNumber: String(data.bankAccountNumber ?? data.accountNumber ?? ''),
      accountName: String(data.bankAccountName ?? data.accountName ?? request.customerName),
      bankName: String(data.bankName ?? 'Nomba'),
      metadata: {
        provider: 'nomba',
        mode: cfg.mode,
        accountRef,
        parentAccountId: cfg.parentAccountId,
        subAccountId: cfg.subAccountId,
        raw: data,
      },
    };
  }

  async verifyTransaction(reference: string, webhookPayload?: unknown): Promise<ProviderTransaction> {
    const fromWebhook = this.parseWebhookTransaction(webhookPayload);
    const cfg = this.getConfig();
    if (cfg.mock && fromWebhook) {
      return fromWebhook;
    }

    const fetched = await this.fetchTransaction(reference);
    if (!fromWebhook) {
      return fetched;
    }

    return {
      ...fetched,
      senderName: fetched.senderName ?? fromWebhook.senderName,
      senderAccountNumber: fetched.senderAccountNumber ?? fromWebhook.senderAccountNumber,
      recipientAccountNumber: fetched.recipientAccountNumber || fromWebhook.recipientAccountNumber,
      paidAt: fetched.paidAt ?? fromWebhook.paidAt,
      metadata: {
        ...fromWebhook.metadata,
        ...fetched.metadata,
        rawWebhook: fromWebhook.metadata?.rawWebhook,
      },
    };
  }

  async fetchTransaction(reference: string): Promise<ProviderTransaction> {
    const cfg = this.getConfig();
    if (cfg.mock) {
      return {
        providerReference: reference,
        amount: '0.00',
        currency: 'NGN',
        recipientAccountNumber: '',
        metadata: { mode: 'mock' },
      };
    }

    this.assertConfigured(cfg, ['clientId', 'clientSecret', 'parentAccountId']);
    const token = await this.getAccessToken(cfg);
    const query = new URLSearchParams({ transactionRef: reference });
    const endpoint = cfg.subAccountId
      ? `/v1/transactions/accounts/${cfg.subAccountId}/single?${query.toString()}`
      : `/v1/transactions/accounts/single?${query.toString()}`;
    const response = await this.request<{ data: Record<string, unknown> }>(cfg, endpoint, { method: 'GET', token });
    const data = response.data ?? {};
    this.assertSuccessfulTransaction(data);
    return this.mapTransaction(data, reference);
  }

  async verifyWebhook(payload: unknown, signature?: string, timestamp?: string): Promise<boolean> {
    const cfg = this.getConfig();
    if (!cfg.webhookSecret) {
      return cfg.mock === true;
    }
    if (!signature || !timestamp) {
      return false;
    }

    const computed = this.generateWebhookSignature(payload, cfg.webhookSecret, timestamp);
    const left = Buffer.from(signature.trim());
    const right = Buffer.from(computed);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  async fetchTransactions(): Promise<ProviderTransaction[]> {
    return [];
  }

  async closeAccount(): Promise<void> {
    return undefined;
  }

  parseWebhookTransaction(payload: unknown): ProviderTransaction | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const root = payload as Record<string, any>;
    const transaction = root.data?.transaction ?? root.transaction ?? root.data ?? {};
    const customer = root.data?.customer ?? root.customer ?? {};
    const providerReference = String(transaction.transactionId ?? transaction.id ?? transaction.sessionId ?? root.requestId ?? '');
    const recipientAccountNumber = String(transaction.aliasAccountNumber ?? transaction.recipientAccountNumber ?? transaction.accountNumber ?? '');
    if (!providerReference && !recipientAccountNumber) {
      return null;
    }

    return {
      providerReference,
      nombaReference: String(transaction.sessionId ?? transaction.transactionId ?? providerReference),
      amount: String(transaction.transactionAmount ?? transaction.amount ?? '0'),
      currency: 'NGN',
      senderName: customer.senderName ? String(customer.senderName) : undefined,
      senderAccountNumber: customer.accountNumber ? String(customer.accountNumber) : undefined,
      recipientAccountNumber,
      paidAt: transaction.time ? String(transaction.time) : undefined,
      metadata: { rawWebhook: payload },
    };
  }

  private generateWebhookSignature(payload: unknown, secret: string, timeStamp: string) {
    const root = typeof payload === 'object' && payload !== null ? (payload as Record<string, any>) : {};
    const merchant = root.data?.merchant ?? {};
    const transaction = root.data?.transaction ?? {};
    let responseCode = transaction.responseCode ?? '';
    if (responseCode === 'null') {
      responseCode = '';
    }

    const hashingPayload = [
      root.event_type ?? root.eventType ?? '',
      root.requestId ?? '',
      merchant.userId ?? '',
      merchant.walletId ?? '',
      transaction.transactionId ?? '',
      transaction.type ?? '',
      transaction.time ?? '',
      responseCode ?? '',
      timeStamp,
    ].join(':');

    return createHmac('sha256', secret).update(hashingPayload).digest('base64');
  }

  private async getAccessToken(cfg: NombaConfig) {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
      return this.accessToken;
    }

    const response = await this.request<NombaTokenResponse>(cfg, '/v1/auth/token/issue', {
      method: 'POST',
      body: {
        grant_type: 'client_credentials',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      },
      skipAuth: true,
    });
    const token = response.data?.access_token ?? response.data?.accessToken ?? response.access_token ?? response.accessToken;
    if (!token) {
      throw new UnauthorizedException('Nomba did not return an access token');
    }
    const expiresIn = Number(response.data?.expires_in ?? response.expires_in ?? 1800);
    this.accessToken = token;
    this.accessTokenExpiresAt = Date.now() + Math.max(60, expiresIn - 300) * 1000;
    return token;
  }

  private async request<T>(cfg: NombaConfig, endpoint: string, options: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    token?: string;
    body?: Record<string, unknown>;
    skipAuth?: boolean;
  }): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      accountId: cfg.parentAccountId ?? '',
    };
    if (!options.skipAuth && options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    const res = await fetch(`${cfg.baseUrl}${endpoint}`, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok || (json.code && json.code !== '00')) {
      throw new ServiceUnavailableException(`Nomba request failed: ${json.description ?? res.statusText}`);
    }
    return json as T;
  }

  private mapTransaction(data: Record<string, unknown>, fallbackReference: string): ProviderTransaction {
    return {
      providerReference: String(data.id ?? data.transactionId ?? data.paymentVendorReference ?? fallbackReference),
      nombaReference: String(data.paymentVendorReference ?? data.sessionId ?? data.id ?? fallbackReference),
      amount: String(data.amount ?? data.transactionAmount ?? '0'),
      currency: 'NGN',
      senderName: data.senderName ? String(data.senderName) : undefined,
      senderAccountNumber: data.senderAccountNumber ? String(data.senderAccountNumber) : undefined,
      recipientAccountNumber: String(data.aliasAccountNumber ?? data.recipientAccountNumber ?? ''),
      paidAt: data.timeCreated ? String(data.timeCreated) : undefined,
      metadata: { raw: data, providerStatus: data.status ?? data.transactionStatus ?? data.responseCode },
    };
  }

  private assertSuccessfulTransaction(data: Record<string, unknown>) {
    const status = data.status ?? data.transactionStatus;
    if (status && !['SUCCESS', 'SUCCESSFUL', 'COMPLETED'].includes(String(status).toUpperCase())) {
      throw new ServiceUnavailableException(`Nomba transaction is not successful: ${String(status)}`);
    }

    const responseCode = data.responseCode;
    if (responseCode && String(responseCode) !== '00') {
      throw new ServiceUnavailableException(`Nomba transaction verification failed with response code: ${String(responseCode)}`);
    }
  }
  private getConfig(): NombaConfig {
    return this.config.getOrThrow<NombaConfig>('app.nomba');
  }

  private assertConfigured(cfg: NombaConfig, keys: Array<keyof NombaConfig>) {
    const missing = keys.filter((key) => !cfg[key]);
    if (missing.length) {
      throw new ServiceUnavailableException(`Missing Nomba ${cfg.mode} config: ${missing.join(', ')}`);
    }
  }

  private buildAccountRef(customerId: string) {
    return `pp${customerId.replace(/-/g, '')}`.slice(0, 34).padEnd(16, '0');
  }

  private safeAccountName(name: string) {
    return name.trim().replace(/\s+/g, ' ').slice(0, 64).padEnd(8, ' ');
  }

  private mockVirtualAccount(request: CreateVirtualAccountRequest): CreateVirtualAccountResponse {
    const sandboxSuffix = request.customerId.replace(/-/g, '').slice(0, 10);
    return {
      providerAccountId: `nomba_mock_${sandboxSuffix}`,
      accountNumber: `9${sandboxSuffix.slice(0, 9)}`,
      accountName: request.customerName,
      bankName: 'Nomba Sandbox Bank',
      metadata: { mode: 'mock', accountRef: this.buildAccountRef(request.customerId) },
    };
  }
}
