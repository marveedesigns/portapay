import { describe, expect, it } from '@jest/globals';
import { ReconciliationService } from './reconciliation.service';

describe('ReconciliationService preview scoring', () => {
  const service = new ReconciliationService(null as never, null as never, null as never);

  it('scores a clean verified payment high enough for auto reconciliation', () => {
    const score = service.previewScore({
      accountFound: true,
      accountStatus: 'ACTIVE',
      customerStatus: 'ACTIVE',
      transactionVerified: true,
      duplicate: false,
      kycAllowed: true,
      nameMatched: true,
    });
    expect(score.confidenceScore).toBe(100);
  });


  it('accepts Apidog-friendly score preview field names', () => {
    const score = service.previewScore({
      accountActive: true,
      customerActive: true,
      providerVerified: true,
      duplicate: false,
      kycAllowed: true,
      senderNameMatched: true,
    });
    expect(score.confidenceScore).toBe(100);
  });

  it('penalizes KYC blocked payments', () => {
    const score = service.previewScore({
      accountFound: true,
      accountStatus: 'ACTIVE',
      customerStatus: 'ACTIVE',
      transactionVerified: true,
      duplicate: false,
      kycAllowed: false,
      nameMatched: true,
    });
    expect(score.confidenceScore).toBeLessThan(90);
  });

  it('matches sender names regardless of order, punctuation, and approved historical names', () => {
    const nameMatches = (service as unknown as { nameMatches: (senderName: string, candidates: string[]) => boolean }).nameMatches.bind(service);
    expect(nameMatches('Balogun, Amina B.', ['Amina B Balogun'])).toBe(true);
    expect(nameMatches('Amina Balogun', ['Amina Bello', 'Amina Balogun'])).toBe(true);
    expect(nameMatches('Samuel Adebayo', ['Amina Balogun'])).toBe(false);
  });
  it('scores duplicate events at zero', () => {
    const score = service.previewScore({
      accountFound: true,
      accountStatus: 'ACTIVE',
      customerStatus: 'ACTIVE',
      transactionVerified: true,
      duplicate: true,
      kycAllowed: true,
      nameMatched: true,
    });
    expect(score.confidenceScore).toBe(0);
  });
});