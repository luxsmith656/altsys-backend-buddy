import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CentralDashboard from '@/pages/CentralDashboard';

const mockLocations = [
  { id: 'lamot1', name: 'Lamot 1', lgu: 'Calauan, Laguna' },
  { id: 'lamot2', name: 'Lamot 2', lgu: 'Calauan, Laguna' },
];

let mockActiveLocationId: string | null = null;
const mockSetActiveLocationId = vi.fn((id: string | null) => {
  mockActiveLocationId = id;
});

vi.mock('@/hooks/useLocations', () => ({
  useLocations: () => ({
    locations: mockLocations,
    activeLocationId: mockActiveLocationId,
    setActiveLocationId: mockSetActiveLocationId,
    isSuperAdmin: true,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'bookings') {
        return {
          select: () => ({
            order: () => Promise.resolve({
              data: [
                {
                  id: 'bk-1',
                  location_id: 'lamot1',
                  booking_date: '2026-10-02',
                  status: 'confirmed',
                  group_size: 4,
                  notes: JSON.stringify({ amountPaid: 1200 }),
                  created_at: '2026-10-01T10:00:00Z',
                },
                {
                  id: 'bk-2',
                  location_id: 'lamot2',
                  booking_date: '2026-10-02',
                  status: 'confirmed',
                  group_size: 2,
                  notes: JSON.stringify({ amountPaid: 600 }),
                  created_at: '2026-10-01T11:00:00Z',
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'hiker_sessions') {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: [
                { id: 's-1', location_id: 'lamot1', status: 'active', participant_role: 'hiker' },
                { id: 's-2', location_id: 'lamot2', status: 'active', participant_role: 'hiker' },
              ],
              error: null,
            }),
          }),
        };
      }
      return {
        select: () => Promise.resolve({ data: [], error: null }),
      };
    },
  },
}));

vi.mock('@/components/layout/LocationSwitcher', () => ({
  default: () => <div data-testid="location-switcher">Location Switcher</div>,
}));

vi.mock('@/components/admin/RealtimeMonitorMap', () => ({
  default: ({ locationId }: { locationId: string | null }) => (
    <div data-testid="realtime-monitor-map">Map: {locationId || 'all'}</div>
  ),
}));

describe('CentralDashboard', () => {
  beforeEach(() => {
    mockActiveLocationId = null;
    mockSetActiveLocationId.mockClear();
  });

  it('does NOT render any walk-in registration buttons or dialogs', async () => {
    render(<CentralDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/Central/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Register Walk-In/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /walk-in/i })).not.toBeInTheDocument();
  });

  it('relies on the location dropdown switcher and has no filter pill buttons', async () => {
    render(<CentralDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('location-switcher')).toBeInTheDocument();
    });

    // Verify filter pill buttons and card filter buttons have been cleanly removed
    expect(screen.queryByRole('button', { name: 'All Trailheads' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Filter to Lamot 1/i })).not.toBeInTheDocument();
  });

  it('renders actual bookings breakdown table with real data', async () => {
    render(<CentralDashboard />);
    await waitFor(() => {
      expect(screen.getByText(/Actual Bookings Record/i)).toBeInTheDocument();
    });

    expect(screen.getByText('4 pax')).toBeInTheDocument();
    expect(screen.getByText('2 pax')).toBeInTheDocument();
  });
});
