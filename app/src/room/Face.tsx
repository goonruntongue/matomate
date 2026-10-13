// A participant's small picture, wherever a member is listed: the chosen character (dx edition),
// or a pin in the member's colour (pin edition).
import { avatarThumb } from './avatars';
import { EDITION, PIN_COLORS, PIN_NEUTRAL } from './edition';
import { useSession, type Member } from './session';

/**
 * Pin edition: a member's colour is their place in the team, in the order people joined it, so two
 * teammates never share one (until a team outgrows the palette). It changes only when someone ahead leaves.
 */
export function pinColor(members: Record<string, Member>, uid: string): string {
  const me = members[uid];
  if (!me?.team) return PIN_NEUTRAL;
  const order = Object.entries(members)
    .filter(([, m]) => m.team === me.team)
    .sort(([a, x], [b, y]) => (x.joinedAt ?? 0) - (y.joinedAt ?? 0) || a.localeCompare(b))
    .map(([id]) => id);
  return PIN_COLORS[Math.max(0, order.indexOf(uid)) % PIN_COLORS.length];
}

export function usePinColor(uid: string): string {
  return useSession((s) => pinColor(s.members, uid));
}

export function PinIcon({ color, className = '', title }: { color: string; className?: string; title?: string }) {
  return (
    <svg className={`avatar-face ${className}`} viewBox="0 0 32 32" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <ellipse cx="16" cy="29" rx="6" ry="1.6" fill="rgba(0,0,0,0.25)" />
      <path d="M16 12.5c-4.2 0-6.5 3-6.5 7.2 0 4.6 2.6 8.3 6.5 8.3s6.5-3.7 6.5-8.3c0-4.2-2.3-7.2-6.5-7.2z" fill={color} stroke="rgba(0,0,0,0.45)" strokeWidth="1" />
      <circle cx="16" cy="8" r="5.5" fill={color} stroke="rgba(0,0,0,0.45)" strokeWidth="1" />
    </svg>
  );
}

/** `uid` decides the pin's colour; `avatar` the character. A member who has left shows as a neutral pin. */
export function Face({ uid, avatar, className = '', title }: { uid: string; avatar?: number; className?: string; title?: string }) {
  const color = usePinColor(uid);
  if (EDITION === 'pin' || !avatar) return <PinIcon color={color} className={className} title={title} />;
  return <img className={`avatar-face ${className}`} src={avatarThumb(avatar)} alt="" title={title} draggable={false} />;
}
