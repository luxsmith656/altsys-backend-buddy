import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import CentralPricingManagement from '@/components/admin/CentralPricingManagement';
import { resetPricingConfig, getPricingConfig } from '@/lib/pricingService';

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'super-admin-user', email: 'central@kalisungan.ph' },
    role: 'super_admin',
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(function () {
      return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
    rpc: vi.fn(function () {
      return Promise.resolve({ data: null, error: null });
    }),
  },
}));

describe('CentralPricingManagement Component', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetPricingConfig();
  });

  it('renders all official fare configuration inputs with default rates', async () => {
    render(<CentralPricingManagement />);

    expect(screen.getByText(/Official Fare & Pricing Schedule/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Registration \/ Entry Fee/i)).toHaveValue(30);
    expect(screen.getByLabelText(/Environmental \/ DSPA Fee/i)).toHaveValue(20);
    expect(screen.getByLabelText(/Morning Hike/i)).toHaveValue(800);
    expect(screen.getByLabelText(/Night Hike/i)).toHaveValue(1000);
    expect(screen.getByLabelText(/Overnight Camp/i)).toHaveValue(1600);
  });

  it('updates input values and alters live simulation', async () => {
    render(<CentralPricingManagement />);

    const entryInput = screen.getByLabelText(/Registration \/ Entry Fee/i);
    fireEvent.change(entryInput, { target: { value: '50' } });
    expect(entryInput).toHaveValue(50);

    // Click Publish Rates
    const publishBtn = screen.getByRole('button', { name: /Publish Rates/i });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(getPricingConfig().entryFee).toBe(50);
    });
  });

  it('resets rates when Reset Defaults button is clicked', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<CentralPricingManagement />);

    const entryInput = screen.getByLabelText(/Registration \/ Entry Fee/i);
    fireEvent.change(entryInput, { target: { value: '100' } });

    const publishBtn = screen.getByRole('button', { name: /Publish Rates/i });
    fireEvent.click(publishBtn);

    await waitFor(() => {
      expect(getPricingConfig().entryFee).toBe(100);
    });

    const resetBtn = screen.getByRole('button', { name: /Reset Defaults/i });
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(getPricingConfig().entryFee).toBe(30);
    });
  });

  it('shows compact capacity controls with direct numeric inputs', async () => {
    render(<CentralPricingManagement />);

    expect(screen.queryByLabelText(/Maximum people per slot/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/Capacity per start: 15 hikers/i)).toBeInTheDocument();
    expect(screen.getByText(/Shared pool/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Maximum hiker per group/i)).toHaveValue(5);
    expect(screen.getByRole('button', { name: /Review & save/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Groups allowed per start time/i), { target: { value: '4' } });

    expect(screen.getByText(/Capacity per start: 20 hikers/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Review & save/i })).toBeEnabled();
  });
});
