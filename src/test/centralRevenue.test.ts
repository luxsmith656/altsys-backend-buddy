import { describe, expect, it } from 'vitest';
import { getRecordedRevenue } from '@/lib/payments';

describe('recorded booking revenue', () => {
  it('counts money received, not the unpaid booking quote', () => {
    expect(getRecordedRevenue({ totalFee: 1050, paymentStatus: 'unpaid' })).toBe(0);
    expect(getRecordedRevenue({ amountPaid: 300, totalFee: 1050, paymentStatus: 'partial' })).toBe(300);
  });
  it('removes legacy returned overpayment without subtracting settled cash change twice', () => {
    expect(getRecordedRevenue({ amountPaid: 1500, refundAmount: 450 })).toBe(1050);
    expect(getRecordedRevenue({ amountPaid: 1050, cashTendered: 1500, changeReturned: 450, paymentSettledAt: '2026-09-06T00:00:00Z' })).toBe(1050);
  });
  it('does not turn malformed payment values into NaN or negative totals', () => {
    expect(getRecordedRevenue({ amountPaid: Number.NaN })).toBe(0);
    expect(getRecordedRevenue({ amountPaid: -100 })).toBe(0);
    expect(getRecordedRevenue({ amountPaid: 100, refundAmount: 150 })).toBe(0);
  });
});
