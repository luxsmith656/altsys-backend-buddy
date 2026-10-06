import { supabase } from '@/integrations/supabase/client';

export async function setGuideAccountActiveAtLocation(guideId: string, locationId: string, isActive: boolean) {
  const { data, error } = await supabase.from('guides')
    .update({ is_active: isActive })
    .eq('id', guideId)
    .eq('location_id', locationId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Guide status was not changed. Refresh and try again.');
  return data;
}
