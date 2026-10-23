// ---------------------------------------------------------------------------
// emoji.ts — the one switchable emoji layer (DESIGN.md §7).
//
// Six reactions, drawn as Apple-style PNGs from public/emoji-apple/ (restored
// P1-STEP-1 from git af7911c^) unless VITE_EMOJI_SET=native. The switch is
// read once at build time; emojiSrc() and <Emoji> hide the rest. If an image
// fails to load, <Emoji> falls back to the native character — a reaction
// never disappears (§7).
// ---------------------------------------------------------------------------

/** The room's six reactions. `file` matches public/emoji-apple/<file>;
 *  `char` is the native fallback and the key the room's reaction state uses. */
export const REACTIONS = [
  { id: 'red-heart', char: '\u{2764}\u{FE0F}', file: 'red-heart_2764-fe0f.png', label: 'red heart' },
  { id: 'thumbs-up', char: '\u{1F44D}', file: 'thumbs-up_1f44d.png', label: 'thumbs up' },
  { id: 'face-with-tears-of-joy', char: '\u{1F602}', file: 'face-with-tears-of-joy_1f602.png', label: 'face with tears of joy' },
  { id: 'face-with-open-mouth', char: '\u{1F62E}', file: 'face-with-open-mouth_1f62e.png', label: 'face with open mouth' },
  { id: 'fire', char: '\u{1F525}', file: 'fire_1f525.png', label: 'fire' },
  { id: 'folded-hands', char: '\u{1F64F}', file: 'folded-hands_1f64f.png', label: 'folded hands' },
] as const;

export type ReactionId = (typeof REACTIONS)[number]['id'];

/** 'apple' (default) renders the bundled PNGs; 'native' renders text glyphs. */
export const EMOJI_SET: 'apple' | 'native' =
  (import.meta.env.VITE_EMOJI_SET as string | undefined) === 'native' ? 'native' : 'apple';

const BY_ID = new Map<string, (typeof REACTIONS)[number]>(REACTIONS.map((r) => [r.id, r]));
const BY_CHAR = new Map<string, (typeof REACTIONS)[number]>(REACTIONS.map((r) => [r.char, r]));

export const reactionById = (id: string) => BY_ID.get(id);
export const reactionByChar = (char: string) => BY_CHAR.get(char);

/** Public URL of the PNG for a reaction id, or undefined when unknown. */
export const emojiSrc = (id: string): string | undefined => {
  const r = BY_ID.get(id);
  return r ? `/emoji-apple/${r.file}` : undefined;
};

/** Native character for an id or char key (the fallback and 'native' mode). */
export const emojiChar = (key: string): string =>
  BY_ID.get(key)?.char ?? BY_CHAR.get(key)?.char ?? key;

/** Load the six PNGs into the HTTP cache the first time the picker opens
 *  (not on page load), so reactions also work offline after first use. */
let preloaded = false;
export function preloadReactionEmoji(): void {
  if (preloaded || EMOJI_SET !== 'apple') return;
  preloaded = true;
  for (const r of REACTIONS) {
    const img = new Image();
    img.decoding = 'async';
    img.src = `/emoji-apple/${r.file}`;
  }
}
