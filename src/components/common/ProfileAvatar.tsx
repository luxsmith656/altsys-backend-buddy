import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function profileChanged(userId: string) {
  window.dispatchEvent(new CustomEvent('profile-updated', { detail: userId }));
}

export default function ProfileAvatar({ className = 'h-9 w-9' }: { className?: string }) {
  const { user, role } = useAuth();
  const client = useQueryClient();
  const userId = user?.id;
  const { data } = useQuery({
    queryKey: ['profile-avatar', userId, role],
    enabled: Boolean(userId),
    staleTime: 60_000,
    queryFn: async () => {
      const profile = await supabase.from('profiles').select('avatar_url,full_name').eq('user_id', userId!).maybeSingle();
      if (profile.error) throw profile.error;
      if (role === 'guide') {
        const guide = await supabase.from('guides').select('photo_url,full_name').eq('user_id', userId!).maybeSingle();
        if (guide.error) throw guide.error;
        return { photo: guide.data?.photo_url || profile.data?.avatar_url, name: guide.data?.full_name || profile.data?.full_name };
      }
      return { photo: profile.data?.avatar_url, name: profile.data?.full_name };
    },
  });
  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as CustomEvent<string>).detail === userId) void client.invalidateQueries({ queryKey: ['profile-avatar', userId] });
    };
    window.addEventListener('profile-updated', refresh);
    return () => window.removeEventListener('profile-updated', refresh);
  }, [client, userId]);
  const name = data?.name || user?.user_metadata?.full_name || user?.email || 'Profile';
  const initials = String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return <Avatar className={className}>
    <AvatarImage src={data?.photo || user?.user_metadata?.avatar_url} alt={`${name} profile`} className="object-cover" />
    <AvatarFallback className="bg-primary/15 text-primary font-semibold">{initials}</AvatarFallback>
  </Avatar>;
}
