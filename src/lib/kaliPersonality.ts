import type { KaliExpression, KaliRole } from './kaliContext';

export function getKaliExpression(content: string): KaliExpression {
  if (/(warning|storm|danger|emergency|unsafe|minor|verify|stay on|reschedule)/i.test(content)) return 'alert';
  if (/(sorry|unavailable|couldn't|cannot reach|offline|take your time)/i.test(content)) return 'reassuring';
  if (/(congratulations|well done|completed your hike|thank you|thanks)/i.test(content)) return 'celebrating';
  if (/(you can do|you've got|comfortable pace|take breaks|one step)/i.test(content)) return 'encouraging';
  if (/(route|trailhead|jump.off|station|map|direction)/i.test(content)) return 'map';
  if (/(because|documents|guide|fee|bring|means|require)/i.test(content)) return 'explaining';
  if (/(recommend|weather|date|time|consider|plan)/i.test(content)) return 'thinking';
  if (/\?/.test(content)) return 'listening';
  return 'happy';
}

export function getKaliQuickReplies(role: KaliRole): string[] {
  if (role === 'guide') return ['Who is in my next booking?', 'Show my active group', 'How do I request reassignment?'];
  if (role === 'admin') return ['How many hikers are on my trailhead now?', 'Show today\'s pending bookings', 'Which guides are on duty?'];
  if (role === 'super_admin') return ['How many hikers are on the mountain now?', 'Compare the three trailheads today', 'Show open emergency alerts'];
  if (role === 'ranger') return ['Show active groups on my trailhead', 'What should I check during an emergency?', 'Explain last-known locations'];
  if (role === 'mdrrmo') return ['Explain last-known locations', 'What should I check during an emergency?', 'Explain offline location updates'];
  return ['Help me plan my hike', 'Weather and best time', 'What should my group bring?'];
}
