import { describe, expect, it } from 'vitest';
import { isGuideEligibleForAssignment } from '@/lib/guideAvailability';

describe('guide assignment roster eligibility', () => {
  it('keeps reassignment-requested guides visible until schedule checking rejects them', () => {
    expect(isGuideEligibleForAssignment('reassigned_pending')).toBe(true);
    expect(isGuideEligibleForAssignment('reassignment_requested')).toBe(true);
    expect(isGuideEligibleForAssignment('declined')).toBe(true);
  });

  it('hides only explicit inactive or off-duty guide states', () => {
    expect(isGuideEligibleForAssignment('off_duty')).toBe(false);
    expect(isGuideEligibleForAssignment('off-duty')).toBe(false);
    expect(isGuideEligibleForAssignment('inactive')).toBe(false);
    expect(isGuideEligibleForAssignment('deactivated')).toBe(false);
    expect(isGuideEligibleForAssignment('available')).toBe(true);
  });
});
