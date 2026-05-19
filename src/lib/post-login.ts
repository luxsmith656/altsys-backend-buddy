import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the path to navigate to after Google sign-in.
 * - New / incomplete users go to /onboarding
 * - Completed users go to the requested redirect or /dashboard
 */
export async function resolvePostLoginPath(userId: string, redirect?: string | null): Promise<string> {
  const target = redirect || '/dashboard';
  try {
    const { data } = await supabase
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data?.onboarding_completed_at) {
      return redirect ? `/onboarding?redirect=${encodeURIComponent(redirect)}` : '/onboarding';
    }
  } catch {
    // If we can't read the profile (rare), let onboarding decide.
    return '/onboarding';
  }
  return target;
}
