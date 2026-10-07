import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CentralAccountManagement from '@/components/admin/CentralAccountManagement';

const accounts = vi.hoisted(() => ({ admins: vi.fn(), users: vi.fn() }));
vi.mock('@/hooks/useLocations', () => ({ useLocations: () => ({ locations: [], activeLocationId: null, setActiveLocationId: vi.fn() }) }));
vi.mock('@/lib/adminManagementService', () => ({
  fetchAdminsList: accounts.admins,
  fetchUsersList: accounts.users,
  resetAdminPassword: vi.fn(),
  updateAdminInfo: vi.fn(),
  createAdminAccount: vi.fn(),
  changeUserPassword: vi.fn(),
  editUserInfo: vi.fn(),
  deleteUserAccount: vi.fn(),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));

beforeEach(() => {
  accounts.admins.mockResolvedValue([{
    id: 'admin-row-1', userId: 'admin-user-1', email: 'lamot1@example.test', fullName: 'Lamot 1 Admin',
    phone: '09170000001', role: 'admin', locationId: 'lamot1', locationName: 'Lamot 1',
    photoUrl: 'https://images.example.test/admin.webp', createdAt: '2026-01-01T00:00:00Z',
  }]);
  accounts.users.mockResolvedValue([{
    id: 'guide-row-1', userId: 'guide-user-1', email: 'guide@example.test', fullName: 'Maya Guide',
    phone: '09170000000', role: 'guide', locationId: null, locationName: 'Lamot 2',
    photoUrl: 'https://images.example.test/maya.webp', createdAt: '2026-01-01T00:00:00Z',
  }]);
});

describe('central account profile photos', () => {
  it('shows the uploaded photo in the central roster and account details', async () => {
    render(<CentralAccountManagement />);
    await waitFor(() => expect(screen.getByText('Maya Guide')).toBeInTheDocument());
    expect(screen.getByRole('img', { name: 'Maya Guide profile' })).toHaveAttribute('src', 'https://images.example.test/maya.webp');

    fireEvent.click(screen.getByRole('button', { name: /View Details/i }));
    expect(await screen.findByRole('img', { name: 'Maya Guide profile' })).toHaveAttribute('src', 'https://images.example.test/maya.webp');
  });

  it('shows a local admin photo returned from the profile record', async () => {
    render(<CentralAccountManagement />);
    await waitFor(() => expect(screen.getByText('Lamot 1 Admin')).toBeInTheDocument());
    expect(screen.getByRole('img', { name: 'Lamot 1 Admin profile' })).toHaveAttribute('src', 'https://images.example.test/admin.webp');
  });
});
