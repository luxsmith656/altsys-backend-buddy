import { describe, expect, it } from 'vitest';
import { isMissingTotalAmountColumn, withoutTotalAmount } from '@/lib/walkInBooking';

describe('walk-in booking schema compatibility', () => {
  it('only retries for the known missing total_amount schema-cache error', () => {
    expect(isMissingTotalAmountColumn({
      code: 'PGRST204',
      message: "Could not find the 'total_amount' column of 'bookings' in the schema cache",
    })).toBe(true);
    expect(isMissingTotalAmountColumn({
      code: 'PGRST204',
      message: "Could not find the 'location_id' column of 'bookings' in the schema cache",
    })).toBe(false);
    expect(isMissingTotalAmountColumn({
      code: '23505',
      message: "duplicate key value violates unique constraint 'bookings_pkey'",
    })).toBe(false);
  });

  it('keeps the quoted total in application metadata while omitting only the legacy column', () => {
    const payload = { id: 'booking-1', total_amount: 850, notes: '{"totalFee":850}' };
    expect(withoutTotalAmount(payload)).toEqual({ id: 'booking-1', notes: '{"totalFee":850}' });
  });
});
