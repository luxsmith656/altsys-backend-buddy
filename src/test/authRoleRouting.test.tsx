import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const authHarness = vi.hoisted(() => ({
  authChange: null as null | ((event: string, session: { user: User } | null) => void),
  roleResult: null as null | ((value: { data: { role: string }[] | null; error: Error | null }) => void),
}));

vi.mock('@/integrations/supabase/client', () => {
  const roleQuery = {
    select: vi.fn(() => roleQuery),
    eq: vi.fn(
      () =>
        new Promise<{ data: { role: string }[] | null; error: Error | null }>((resolve) => {
          authHarness.roleResult = resolve;
        }),
    ),
  };

  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn((callback) => {
          authHarness.authChange = callback;
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        }),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
      from: vi.fn((table: string) => {
        if (table !== 'user_roles') throw new Error(`Unexpected table ${table}`);
        return roleQuery;
      }),
    },
  };
});

import { AuthProvider, useAuth } from '@/hooks/useAuth';

function AuthStateProbe() {
  const { user, role, loading } = useAuth();
  return (
    <output data-testid="auth-state">
      {loading ? 'loading' : 'ready'}:{user?.email ?? 'signed-out'}:{role ?? 'unresolved'}
    </output>
  );
}

const ADMIN_USER = {
  id: 'admin-user-1',
  email: 'lamot1@kalisungan.ph',
  user_metadata: {},
  app_metadata: {},
} as User;

describe('role-aware authentication routing', () => {
  beforeEach(() => {
    authHarness.authChange = null;
    authHarness.roleResult = null;
  });

  it('returns to loading while a newly signed-in account role is still resolving', async () => {
    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await screen.findByText('ready:signed-out:unresolved');

    act(() => {
      authHarness.authChange?.('SIGNED_IN', { user: ADMIN_USER });
    });

    expect(screen.getByTestId('auth-state')).toHaveTextContent(
      'loading:lamot1@kalisungan.ph:unresolved',
    );

    await act(async () => {
      authHarness.roleResult?.({ data: [{ role: 'admin' }], error: null });
    });

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent(
        'ready:lamot1@kalisungan.ph:admin',
      );
    });
  });

  it('never silently grants hiker access when role lookup fails', async () => {
    const staffUser = {
      ...ADMIN_USER,
      id: 'staff-not-in-seed-list',
      email: 'operations@example.com',
    } as User;

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await screen.findByText('ready:signed-out:unresolved');
    act(() => authHarness.authChange?.('SIGNED_IN', { user: staffUser }));

    await act(async () => {
      authHarness.roleResult?.({ data: null, error: new Error('role database unavailable') });
    });

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent(
        'ready:operations@example.com:unresolved',
      );
    });
  });

  it('uses an explicit hiker role without querying unrelated staff tables', async () => {
    const hikerUser = {
      ...ADMIN_USER,
      id: 'hiker-user-1',
      email: 'walker@example.com',
    } as User;

    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    await screen.findByText('ready:signed-out:unresolved');
    act(() => authHarness.authChange?.('SIGNED_IN', { user: hikerUser }));
    await act(async () => {
      authHarness.roleResult?.({ data: [{ role: 'hiker' }], error: null });
    });

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent(
        'ready:walker@example.com:hiker',
      );
    });
  });
});
