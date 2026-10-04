import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import CentralAdminManagement from '@/components/admin/CentralAdminManagement';
import AdminUserManagement from '@/components/admin/AdminUserManagement';

vi.mock('@/hooks/useLocations', () => ({
  useLocations: () => ({
    locations: [
      { id: 'lamot1', name: 'Lamot 1', slug: 'lamot-1' },
      { id: 'lamot2', name: 'Lamot 2', slug: 'lamot-2' },
      { id: 'stotomas', name: 'Sto. Tomas', slug: 'sto-tomas' },
    ],
    activeLocationId: null,
    setActiveLocationId: vi.fn(),
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-1', email: 'central@kalisungan.ph' },
    role: 'super_admin',
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    functions: {
      invoke: vi.fn().mockImplementation(async (_name: string, opts?: { body?: { action?: string } }) => {
        if (opts?.body?.action === 'list_admins') {
          const mk = (slug: string, name: string, loc: string) => ({
            id: `admin-${slug}`, userId: `admin-${slug}`, email: `${slug}@kalisungan.ph`, fullName: name,
            phone: '', role: 'admin', locationId: slug, locationName: loc, createdAt: '2026-06-01T00:00:00Z', status: 'active',
          });
          return {
            data: {
              success: true,
              admins: [
                mk('lamot1', 'Lamot 1 Admin', 'Lamot 1 Trailhead'),
                mk('lamot2', 'Lamot 2 Admin', 'Lamot 2 Trailhead'),
                mk('stotomas', 'Sto. Tomas Admin', 'Sto. Tomas Trailhead'),
              ],
            },
            error: null,
          };
        }
        return { data: { success: true }, error: null };
      }),
    },
    auth: {
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

describe('CentralAdminManagement Component', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders trailhead administrators list for Central Admin', async () => {
    render(<CentralAdminManagement />);

    await waitFor(() => {
      expect(screen.getByText('Lamot 1 Admin')).toBeInTheDocument();
      expect(screen.getByText('Lamot 2 Admin')).toBeInTheDocument();
      expect(screen.getByText('Sto. Tomas Admin')).toBeInTheDocument();
    });

    expect(screen.getByText('lamot1@kalisungan.ph')).toBeInTheDocument();
    expect(screen.getByText('lamot2@kalisungan.ph')).toBeInTheDocument();
  });

  it('opens password reset dialog for admin and handles password reset', async () => {
    render(<CentralAdminManagement />);

    await waitFor(() => {
      expect(screen.getByText('Lamot 1 Admin')).toBeInTheDocument();
    });

    const resetButtons = screen.getAllByRole('button', { name: /Reset Pass/i });
    fireEvent.click(resetButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Reset Password for Lamot 1 Admin/i)).toBeInTheDocument();
    });

    const inputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(inputs[0], { target: { value: 'newpassword123' } });
    fireEvent.change(inputs[1], { target: { value: 'newpassword123' } });

    const submitBtn = screen.getByRole('button', { name: /Confirm Reset Password/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Confirm Reset Password/i)).not.toBeInTheDocument();
    });
  });

  it('opens edit info dialog for admin', async () => {
    render(<CentralAdminManagement />);

    await waitFor(() => {
      expect(screen.getByText('Lamot 1 Admin')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: /Edit Info/i });
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Edit Administrator Details/i)).toBeInTheDocument();
    });
  });
});

describe('AdminUserManagement Component (Trailhead Admins)', () => {
  it('renders guides and hikers list for trailhead admin', async () => {
    render(<AdminUserManagement locationId="lamot1" locationName="Lamot 1" />);

    await waitFor(() => {
      expect(screen.getByText(/User Management: Guides & Hikers/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Test Guide')).toBeInTheDocument();
      expect(screen.getByText('Test Hiker')).toBeInTheDocument();
    });
  });

  it('filters between All, Guides, and Hikers', async () => {
    render(<AdminUserManagement locationId="lamot1" locationName="Lamot 1" />);

    await waitFor(() => {
      expect(screen.getByText('Test Guide')).toBeInTheDocument();
      expect(screen.getByText('Test Hiker')).toBeInTheDocument();
    });

    // Click Guides filter
    const guideFilterBtn = screen.getByRole('button', { name: /Guides \(/i });
    fireEvent.click(guideFilterBtn);

    expect(screen.getByText('Test Guide')).toBeInTheDocument();
    expect(screen.queryByText('Test Hiker')).not.toBeInTheDocument();

    // Click Hikers filter
    const hikerFilterBtn = screen.getByRole('button', { name: /Hikers \(/i });
    fireEvent.click(hikerFilterBtn);

    expect(screen.getByText('Test Hiker')).toBeInTheDocument();
    expect(screen.queryByText('Test Guide')).not.toBeInTheDocument();
  });

  it('opens change password dialog for a user and submits', async () => {
    render(<AdminUserManagement locationId="lamot1" locationName="Lamot 1" />);

    await waitFor(() => {
      expect(screen.getByText('Test Guide')).toBeInTheDocument();
    });

    const passButtons = screen.getAllByRole('button', { name: /Pass/i });
    fireEvent.click(passButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Change Password: Test Guide/i)).toBeInTheDocument();
    });

    const inputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(inputs[0], { target: { value: 'secureguide123' } });
    fireEvent.change(inputs[1], { target: { value: 'secureguide123' } });

    const updateBtn = screen.getByRole('button', { name: /Update Password/i });
    fireEvent.click(updateBtn);

    await waitFor(() => {
      expect(screen.queryByText(/Update Password/i)).not.toBeInTheDocument();
    });
  });

  it('opens remove account confirmation dialog', async () => {
    render(<AdminUserManagement locationId="lamot1" locationName="Lamot 1" />);

    await waitFor(() => {
      expect(screen.getByText('Test Guide')).toBeInTheDocument();
    });

    const removeButtons = screen.getAllByRole('button', { name: /Remove/i });
    fireEvent.click(removeButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Permanently Remove Account\?/i)).toBeInTheDocument();
    });
  });
});
