export interface CreateVirtualAccountRequest {
  customerId: string;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  type: 'STATIC' | 'DYNAMIC';
  bvn?: string;
  expectedAmount?: string;
  expiryDate?: string;
}

export interface CreateVirtualAccountResponse {
  providerAccountId: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderTransaction {
  providerReference: string;
  nombaReference?: string;
  amount: string;
  currency: string;
  senderName?: string;
  senderAccountNumber?: string;
  recipientAccountNumber: string;
  paidAt?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentProvider {
  createVirtualAccount(request: CreateVirtualAccountRequest): Promise<CreateVirtualAccountResponse>;
  verifyTransaction(reference: string, webhookPayload?: unknown): Promise<ProviderTransaction>;
  fetchTransaction(reference: string): Promise<ProviderTransaction>;
  verifyWebhook(payload: unknown, signature?: string, timestamp?: string): Promise<boolean>;
  fetchTransactions(cursor?: string): Promise<ProviderTransaction[]>;
  closeAccount(providerAccountId: string): Promise<void>;
}