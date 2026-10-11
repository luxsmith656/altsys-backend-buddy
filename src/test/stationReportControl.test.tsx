import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ enqueue: vi.fn(), sync: vi.fn(), success: vi.fn(), error: vi.fn(), map: {} }));
vi.mock('react-leaflet', () => ({ useMap: () => state.map }));
vi.mock('leaflet', () => ({ default: {
  Control: class {
    onAdd!: () => HTMLElement;
    element?: HTMLElement;
    addTo() { this.element = this.onAdd(); document.body.appendChild(this.element); }
    remove() { this.element?.remove(); }
  },
  DomEvent: { disableClickPropagation: vi.fn(), disableScrollPropagation: vi.fn() },
} }));
vi.mock('@/lib/offlineDb', () => ({ enqueue: state.enqueue }));
vi.mock('@/lib/tracking/syncEngine', () => ({ syncOnce: state.sync }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
import StationReportControl from '@/components/map/StationReportControl';
beforeEach(() => { vi.clearAllMocks(); state.enqueue.mockResolvedValue(undefined); state.sync.mockResolvedValue(undefined); });
it('durably queues the selected station with the current participant and session before syncing', async () => {
  render(<StationReportControl sessionId="active-session" userId="hiker" />);
  fireEvent.change(screen.getByLabelText('Current station'), { target: { value: '6' } });
  fireEvent.click(screen.getByRole('button', { name: /I'm here/ }));
  await waitFor(() => expect(state.success).toHaveBeenCalled());
  expect(state.enqueue).toHaveBeenCalledWith({ kind: 'station', payload: expect.objectContaining({ session_id: 'active-session', user_id: 'hiker', station: 6, id: expect.any(String), reported_at: expect.any(String) }) });
  expect(state.sync).toHaveBeenCalledTimes(1);
});
it('does not claim success when local persistence fails', async () => {
  state.enqueue.mockRejectedValue(new Error('Disk full'));
  render(<StationReportControl sessionId="active-session" userId="guide" />);
  fireEvent.click(screen.getByRole('button', { name: /I'm here/ }));
  await waitFor(() => expect(state.error).toHaveBeenCalled());
  expect(state.success).not.toHaveBeenCalled();
  expect(state.sync).not.toHaveBeenCalled();
});
