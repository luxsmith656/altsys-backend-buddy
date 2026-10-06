import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import L from 'leaflet';
import RealtimeMonitorMap from '@/components/admin/RealtimeMonitorMap';

const fixture = vi.hoisted(() => ({ rows: {} as Record<string, Record<string, unknown>[]>, calls: [] as string[], errors: {} as Record<string, boolean>, locations: [] as Record<string, unknown>[] }));
vi.mock('@/hooks/useLocations', () => ({ useLocations: () => ({ locations: fixture.locations, activeLocationId: 'north' }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    let rows = fixture.rows[table] ?? [];
    const query = {
      select: () => query, order: () => query, limit: () => query,
      eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return query; },
      like: () => query,
      then: (resolve: (value: unknown) => unknown) => { fixture.calls.push(table); return Promise.resolve({ data: fixture.errors[table] ? null : rows, error: fixture.errors[table] ? { message: 'Temporary unavailable' } : null }).then(resolve); },
    };
    return query;
  },
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
  removeChannel: vi.fn(),
} }));

beforeEach(() => {
  Object.defineProperty(L.Browser, 'svg', { value: true, configurable: true });
  fixture.calls = [];
  fixture.errors = {};
  fixture.locations = [];
  fixture.rows = {
    hiker_sessions: [
      { id: 'lead-session', user_id: 'lead', booking_id: 'booking', location_id: 'north', status: 'active', participant_role: 'hiker', tracking_phase: 'ascent', start_time: '2026-09-08T00:00:00Z' },
      { id: 'guide-session', user_id: 'guide', booking_id: 'booking', location_id: 'north', status: 'active', participant_role: 'guide', tracking_phase: 'ascent', start_time: '2026-09-08T00:00:00Z' },
      { id: 'waiting-session', user_id: 'waiting', booking_id: 'waiting-booking', location_id: 'north', status: 'active', tracking_phase: 'peak', start_time: '2026-09-08T00:00:00Z' },
      { id: 'other-session', user_id: 'other', booking_id: 'other-booking', location_id: 'south', status: 'active', start_time: '2026-09-08T00:00:00Z' },
    ],
    bookings: [
      { id: 'booking', location_id: 'north', group_size: 3, notes: JSON.stringify({ fullName: 'Sam Lead', preferredGuide: 'Requested Guide', companions: ['Jo Companion', 'Pat Companion'] }) },
      { id: 'waiting-booking', location_id: 'north', group_size: 1, notes: JSON.stringify({ fullName: 'Waiting Lead' }) },
      { id: 'other-booking', location_id: 'south', group_size: 8, notes: JSON.stringify({ fullName: 'Private South Lead' }) },
    ],
    profiles: [{ user_id: 'guide', full_name: 'Actual Guide' }],
    hiker_locations: [{ session_id: 'guide-session', latitude: 14.15, longitude: 121.34, timestamp: '2026-09-08T01:02:00Z' }],
  };
});
afterEach(cleanup);

describe('live map group details', () => {
  it('renders the published path even when live sessions fail on initial load', async () => {
    fixture.rows.trail_zones = [{ id: 'route', location_id: 'north', name: 'Published north', status: 'active', is_official: true, review_status: 'approved', coordinates_json: [{ lat: 14.15, lng: 121.34 }, { lat: 14.16, lng: 121.35 }] }];
    fixture.errors.hiker_sessions = true;
    render(<RealtimeMonitorMap locationId="north" />);
    await waitFor(() => expect(document.querySelectorAll('.leaflet-overlay-pane path').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Expand group panel' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Live data could not');
    fixture.errors.trail_zones = true;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('alert');
    expect(document.querySelectorAll('.leaflet-overlay-pane path').length).toBeGreaterThan(0);
  });
  it('selects one live group, showing lead, actual guide, pax and companions without recentering', async () => {
    const recenter = vi.spyOn(L.Map.prototype, 'setView');
    render(<RealtimeMonitorMap locationId="north" />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand group panel' }));
    const row = await screen.findByRole('button', { name: /Sam Lead.*3 pax/i });
    const count = recenter.mock.calls.length;
    fireEvent.click(row);
    const details = screen.getByRole('region', { name: 'Selected group details' });
    expect(within(details).getByText('Actual Guide')).toBeInTheDocument();
    expect(within(details).getByText('Jo Companion')).toBeInTheDocument();
    expect(within(details).getByText(/09:02.*PHT/)).toBeInTheDocument();
    expect(within(details).getByText(/ago/)).toBeInTheDocument();
    expect(within(details).queryByText('Requested Guide')).not.toBeInTheDocument();
    expect(recenter.mock.calls.length).toBe(count);
    fireEvent.click(screen.getByRole('button', { name: 'Locate selected group' }));
    expect(recenter.mock.calls.length).toBeGreaterThan(count);
    recenter.mockRestore();
  });

  it('keeps no-GPS groups selectable but never fabricates a position or ETA', async () => {
    render(<RealtimeMonitorMap locationId="north" />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand group panel' }));
    fireEvent.click(await screen.findByRole('button', { name: /Waiting Lead.*1 pax/i }));
    const details = screen.getByRole('region', { name: 'Selected group details' });
    expect(within(details).getByText('Awaiting GPS')).toBeInTheDocument();
    expect(within(details).getByText(/Unavailable/)).toBeInTheDocument();
    expect(within(details).getByText('Peak')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Locate selected group' })).toBeDisabled();
    expect(screen.getAllByRole('region', { name: 'Selected group details' })).toHaveLength(1);
  });

  it('excludes other locations and closes details when switching scope', async () => {
    const { rerender } = render(<RealtimeMonitorMap locationId="north" />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand group panel' }));
    fireEvent.click(await screen.findByRole('button', { name: /Sam Lead.*3 pax/i }));
    expect(screen.queryByText(/Private South Lead/)).not.toBeInTheDocument();
    rerender(<RealtimeMonitorMap locationId="south" />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand group panel' }));
    await waitFor(() => expect(screen.queryByText('Jo Companion')).not.toBeInTheDocument());
    expect(await screen.findByRole('button', { name: /Private South Lead.*8 pax/i })).toBeInTheDocument();
  });

  it('exposes a separate keyboard-operable details toggle with truthful expanded state', async () => {
    render(<RealtimeMonitorMap locationId="north" />);
    expect(screen.getByRole('button', { name: 'Expand group panel' })).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Expand group panel' }));
    await screen.findByRole('button', { name: /Sam Lead.*3 pax/i });
    const toggle = screen.getByRole('button', { name: /group panel/i });
    const initial = toggle.getAttribute('aria-expanded');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', initial === 'true' ? 'false' : 'true');
  });

  it('labels central station markers and filters the map to one trailhead', async () => {
    fixture.locations = [
      { id: 'l1', name: 'Sitio Lamot 1', slug: 'lamot-1', center_lat: 14.147, center_lng: 121.323 },
      { id: 'l2', name: 'Sitio Lamot 2', slug: 'lamot-2', center_lat: 14.148, center_lng: 121.339 },
      { id: 'st', name: 'Sto. Tomas', slug: 'sto-tomas', center_lat: 14.166, center_lng: 121.339 },
    ];
    fixture.rows.trail_zones = fixture.locations.map((location, index) => ({
      id: `route-${index}`,
      location_id: location.id,
      name: `${location.name} official route`,
      status: 'active',
      is_official: true,
      review_status: 'approved',
      coordinates_json: [{ lat: 14.14 + index * 0.01, lng: 121.32 }, { lat: 14.15 + index * 0.01, lng: 121.33 }],
    }));

    render(<RealtimeMonitorMap locationId={null} />);
    await waitFor(() => expect(document.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(3));
    fireEvent.click(screen.getByRole('button', { name: 'Routes' }));
    const stationFilter = screen.getByRole('combobox', { name: 'Filter central map by station' });
    expect(within(stationFilter).getByRole('option', { name: 'Lamot 1' })).toBeInTheDocument();
    expect(within(stationFilter).getByRole('option', { name: 'Lamot 2' })).toBeInTheDocument();
    expect(within(stationFilter).getByRole('option', { name: 'Sto. Tomas' })).toBeInTheDocument();
    expect(document.querySelector('.leaflet-marker-icon[title*="Lamot 1"]')).toBeInTheDocument();

    fireEvent.change(stationFilter, { target: { value: 'l2' } });
    await waitFor(() => expect(document.querySelectorAll('.leaflet-overlay-pane path')).toHaveLength(1));
    expect(document.querySelector('.leaflet-marker-icon[title*="Lamot 2"]')).toBeInTheDocument();
    expect(document.querySelector('.leaflet-marker-icon[title*="Lamot 1"]')).not.toBeInTheDocument();
  });
});
