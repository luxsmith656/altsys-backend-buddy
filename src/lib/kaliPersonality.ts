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
  if (role === 'guide') return ['How do I accept an assignment?', 'How do referral links work?', 'Help me prepare my group'];
  if (role === 'admin' || role === 'super_admin' || role === 'ranger') return ['Help me review a check-in', 'What should I check before starting a group?', 'Explain guide assignments'];
  if (role === 'mdrrmo') return ['Explain last-known locations', 'What should I check during an emergency?', 'Explain offline location updates'];
  return ['Help me plan my hike', 'Weather and best time', 'What should my group bring?'];
}
