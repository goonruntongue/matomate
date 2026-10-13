// Mato mate is published as two editions built from this one source:
//  - pin (https://matomate.web.app): no avatar to choose. Everyone is a plain pin, coloured automatically.
//  - dx  (https://matomate-dx.web.app): each participant picks one of the 21 mini characters.
// The edition is the Vite mode (`vite build --mode dx`); everything else is the same game.
// Each edition has a room of its own in the database, so two classes can use them at the same time.
export type Edition = 'pin' | 'dx';

export const EDITION: Edition = import.meta.env.MODE === 'dx' ? 'dx' : 'pin';

/** Root of this edition's room in the Realtime Database (see database.rules.room.json). */
export const ROOM = EDITION === 'dx' ? 'roomDx' : 'room';

/** Pin colours, given to a team's members in the order they joined. Kept away from the tray colours. */
export const PIN_COLORS = ['#2F6BFF', '#FF4FA3', '#18A558', '#F4F4F4', '#7B3FE4', '#9A5B2E', '#8E99A8'] as const;
/** Someone who is not in a team yet. */
export const PIN_NEUTRAL = '#B9C2CF';
