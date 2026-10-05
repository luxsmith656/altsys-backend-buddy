import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfileAvatar, { profileChanged } from '@/components/common/ProfileAvatar';
import type { ComponentProps } from 'react';

const state = vi.hoisted(() => ({ role: 'hiker', photo: '/uploaded.jpg', guidePhoto: '/guide.jpg', reads: vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'person', email: 'person@example.test' }, role: state.role }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => {
    state.reads(table);
    return { data: table === 'guides' ? { photo_url: state.guidePhoto, full_name: 'Guide Name' } : { avatar_url: state.photo, full_name: 'Hiker Name' }, error: null };
  } }) }) }),
} }));
// Radix waits for a browser Image load; use a plain image to inspect the chosen URL in jsdom.
vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: ComponentProps<'span'>) => <span>{children}</span>,
  AvatarFallback: ({ children }: ComponentProps<'span'>) => <span>{children}</span>,
  AvatarImage: (props: ComponentProps<'img'>) => <img {...props} />,
}));

beforeEach(() => { state.role = 'hiker'; state.photo = '/uploaded.jpg'; state.reads.mockClear(); });
describe('shared profile photos', () => {
  it('shares the profile read and refreshes every icon after an upload', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ProfileAvatar /><ProfileAvatar /></QueryClientProvider>);
    await waitFor(() => expect(screen.getAllByRole('img').every((image) => image.getAttribute('src') === '/uploaded.jpg')).toBe(true));
    expect(state.reads).toHaveBeenCalledTimes(1);
    state.photo = '/new-upload.jpg';
    act(() => profileChanged('person'));
    await waitFor(() => expect(screen.getAllByRole('img').every((image) => image.getAttribute('src') === '/new-upload.jpg')).toBe(true));
  });
  it('uses the guide roster photo for a guide account', async () => {
    state.role = 'guide';
    render(<QueryClientProvider client={new QueryClient()}><ProfileAvatar /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', '/guide.jpg'));
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Guide Name profile');
  });
});
