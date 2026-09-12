import { describe, expect, it } from 'vitest';
import { bookingReceipt, canChangeBooking } from '@/lib/bookingReceipt';

describe('booking receipts', () => {
  it('keeps the original quote and adds itemized extras once', () => {
    const receipt = bookingReceipt({ group_size: 1, notes: JSON.stringify({
      originalQuote: { total: 850, capturedAt: '2026-09-09T00:00:00Z' }, totalFee: 850,
      peakExtensionHours: 1, horseHelpRequests: [{ fee: 1000, stationLabel: 'Stations 5-3', status: 'requested' }, { fee: 500, status: 'cancelled' }],
      additionalExpenses: [{ id: 'water', label: 'Water', amount: 60, recordedAt: '2026-09-09' }, { id: 'porter', label: 'Porter', amount: 300, recordedAt: '2026-09-09' }], amountPaid: 850,
    }) });
    expect(receipt.originalTotal).toBe(850);
    expect(receipt.total).toBe(2310);
    expect(receipt.balance).toBe(1460);
    expect(receipt.extras.map(item => item.label)).toContain('Water');
  });
  it('does not double-charge peak and horse fees already included by legacy price edits', () => {
    const receipt = bookingReceipt({ group_size: 1, notes: JSON.stringify({ totalFee: 1450, peakExtensionHours: 1, emergencyHorseFee: 500,
      priceAdjustments: [{ previousAmount: 850, newAmount: 1450, breakdown: { entryFee: 30, envFee: 20, guideFee: 800, peakExtensionFee: 100, emergencyHorseFee: 500, customAdjustment: 0 } }],
    }) });
    expect(receipt.originalTotal).toBe(850);
    expect(receipt.total).toBe(1450);
  });
  it('does not invent an original quote for legacy records without history', () => {
    expect(bookingReceipt({ group_size: 1, notes: '{}' }).originalTotal).toBeNull();
  });
  it('does not count prepaid walk-in extras twice', () => {
    const receipt = bookingReceipt({ group_size: 1, notes: JSON.stringify({ isWalkIn: true, totalFee: 1450, entryFee: 30, envFee: 20, guideFee: 800, peakExtensionFee: 100, emergencyHorseFee: 500, amountPaid: 1450 }) });
    expect(receipt.total).toBe(1450);
    expect(receipt.balance).toBe(0);
  });
  it('preserves recorded zero amounts and net payments', () => {
    const receipt = bookingReceipt({ group_size: 1, notes: JSON.stringify({ baseFee: 0, amountPaid: 100, refundAmount: 100 }) });
    expect(receipt.total).toBe(0);
    expect(receipt.paid).toBe(0);
  });
  it.each([{ status: 'completed' }, { status: 'ended' }, { status: 'cancelled' }, { status: 'confirmed', notes: '{"hikeCompletedAt":"2026-09-09"}' }, { status: 'confirmed', notes: '{"onsiteStartConfirmed":true}' }, { status: 'confirmed', notes: '{"groupPhase":"completed"}' }])('blocks date changes after start or finish: %j', booking => {
    expect(canChangeBooking(booking)).toBe(false);
  });
  it('allows an unstarted confirmed booking but blocks an already ended session', () => {
    expect(canChangeBooking({ status: 'confirmed' })).toBe(true);
    expect(canChangeBooking({ status: 'confirmed' }, [{ status: 'completed' }])).toBe(false);
  });
});
