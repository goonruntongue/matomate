// Builds database.rules.json (what Firebase deploys) from database.rules.room.json (what we edit).
// The two editions (pin, dx) each have a room of their own with exactly the same rules:
// `room` is written once in the source and copied to `roomDx` here.
// Run after every change to the source: npm --prefix app run rules:build
import { readFileSync, writeFileSync } from 'node:fs';

const source = JSON.parse(readFileSync(new URL('../../database.rules.room.json', import.meta.url), 'utf8'));
const room = source.rules.room;
// Inside a rule, other parts of the room are reached as root.child('room/…').
const forDx = JSON.parse(JSON.stringify(room).replaceAll("'room/", "'roomDx/"));
if (JSON.stringify(forDx).includes("'room/")) throw new Error('a rule still points at the pin room');

const out = { rules: { ...source.rules, room, roomDx: forDx } };
writeFileSync(new URL('../../database.rules.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('database.rules.json: room + roomDx');
