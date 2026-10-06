import { supabase } from '@/integrations/supabase/client';

export type GuideProfileUpdate = {
  full_name: string;
  phone: string;
  specialty: string;
  per_trip_fee: number;
  age: number | null;
  sex: 'male' | 'female' | null;
};

export async function updateGuideProfile(guideId: string, locationId: string, profile: GuideProfileUpdate) {
  const full_name = profile.full_name.trim();
  const phone = profile.phone.trim();
  const specialty = profile.specialty.trim();
  const per_trip_fee = Number(profile.per_trip_fee);
  const age = profile.age === null ? null : Number(profile.age);

  if (!guideId || !locationId) throw new Error('Guide and assigned trailhead are required.');
  if (!full_name) throw new Error('Guide name is required.');
  if (!Number.isFinite(per_trip_fee) || per_trip_fee < 0) throw new Error('Guide rate must be zero or more.');
  if (age !== null && (!Number.isInteger(age) || age < 18 || age > 120)) throw new Error('Guide age must be between 18 and 120.');
  if (profile.sex !== null && profile.sex !== 'male' && profile.sex !== 'female') throw new Error('Choose a valid sex.');

  const { data, error } = await supabase
    .from('guides')
    .update({ full_name, phone, specialty, per_trip_fee, age, sex: profile.sex })
    .eq('id', guideId)
    .eq('location_id', locationId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Guide details were not saved. Check your trailhead access and try again.');
  return data;
}
