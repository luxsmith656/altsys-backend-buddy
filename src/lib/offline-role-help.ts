import type { KaliRole } from '@/lib/kaliContext';

export interface OfflineRoleHelp {
  title: string;
  body: string;
  links: Array<{ label: string; href: string }>;
}

export function getOfflineRoleHelp(role: KaliRole | string | null | undefined): OfflineRoleHelp {
  switch (role) {
    case 'guide':
      return {
        title: 'Guide Operations Help',
        body: 'Use Assignments to review your groups. During a hike, use the emergency SOS control only when help is needed, and mark attendance at check-in, peak, descent, and return so the group record stays accurate.',
        links: [{ label: 'Open Assignments', href: '/guide' }, { label: 'Open Trail Map', href: '/map' }],
      };
    case 'admin':
      return {
        title: 'Basecamp Quick Directory',
        body: 'Use the QR scanner for check-in, Daily Capacity to adjust a date, and the Check-in Manifest to confirm every group before departure.',
        links: [{ label: 'QR Scanner', href: '/admin?tab=scan' }, { label: 'Daily Capacity', href: '/admin?tab=capacity' }, { label: 'Check-in Manifest', href: '/admin?tab=requests' }],
      };
    case 'super_admin':
      return {
        title: 'Admin Quick Actions',
        body: 'Use Revenue Report for collections, Analytics Dashboard for visitor and hike trends, and the multi-barangay overview for the combined trailhead view.',
        links: [{ label: 'Revenue Report', href: '/central?tab=analytics' }, { label: 'Analytics Dashboard', href: '/central?tab=analytics' }, { label: 'Multi-barangay Overview', href: '/central?tab=overview' }],
      };
    case 'mdrrmo':
      return {
        title: 'Emergency Response Help',
        body: 'Use the live map for active groups and last-known locations. Open a group for its trail, guide, and last update before coordinating assistance.',
        links: [{ label: 'Open Emergency Map', href: '/mdrrmo' }],
      };
    case 'ranger':
      return {
        title: 'Trail Staff Help',
        body: 'Use your checkpoint dashboard to confirm attendance and report trail conditions. Keep the group count aligned with the manifest.',
        links: [{ label: 'Open Checkpoints', href: '/ranger' }],
      };
    default:
      return {
        title: 'Trail FAQ',
        body: 'Booking requires a confirmed date, trailhead, group details, and guide assignment. Bring water, rain protection, a charged phone with offline maps, and follow the marked route. GPS can work without mobile data, but live sync waits until signal returns.',
        links: [{ label: 'Book a Hike', href: '/booking' }, { label: 'Safety & Directions', href: '/about' }],
      };
  }
}
