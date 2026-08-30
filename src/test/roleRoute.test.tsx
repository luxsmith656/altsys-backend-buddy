import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

const roleState = vi.hoisted(() => ({
  user: {
    id: 'admin-user-1',
    email: 'lamot1@kalisungan.ph',
    user_metadata: {},
    app_metadata: {},
  } as User,
  role: null as 'admin' | 'hiker' | null,
  loading: false,
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => roleState,
}));

import RoleRoute from '@/components/auth/RoleRoute';

describe('RoleRoute', () => {
  afterEach(() => {
    roleState.role = null;
    roleState.loading = false;
  });

  it('does not grant hiker access while an authenticated role is unresolved', () => {
    render(
      <MemoryRouter initialEntries={['/hiker']}>
        <Routes>
          <Route
            path="/hiker"
            element={
              <RoleRoute allowedRoles={['hiker']}>
                <div>Hiker dashboard content</div>
              </RoleRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Hiker dashboard content')).not.toBeInTheDocument();
    expect(screen.getByText(/checking access/i)).toBeInTheDocument();
  });

  it('redirects an admin away from the hiker-only dashboard', () => {
    roleState.role = 'admin';

    render(
      <MemoryRouter initialEntries={['/hiker']}>
        <Routes>
          <Route
            path="/hiker"
            element={
              <RoleRoute allowedRoles={['hiker']}>
                <div>Hiker dashboard content</div>
              </RoleRoute>
            }
          />
          <Route path="/admin" element={<div>Admin dashboard content</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Hiker dashboard content')).not.toBeInTheDocument();
    expect(screen.getByText('Admin dashboard content')).toBeInTheDocument();
  });
});
