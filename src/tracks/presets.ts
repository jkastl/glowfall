/** How a starter track wants to run. Choosing the track applies these (not the Background volume). */
export interface PresetFeel {
  speed: number;
  gravity: number;
  bounce: number;
  loop: boolean;
}

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  parts: string[];
  feel: PresetFeel;
}

/** Starter tracks. Unknown part ids are skipped, so presets degrade gracefully. */
export const PRESETS: Preset[] = [
  {
    id: 'first-light',
    name: 'First Light',
    blurb: 'A gentle drift through the shallows.',
    parts: ['switchback', 'plinko', 'wave-slide', 'serpentine', 'chimes', 'vortex'],
    // The first thing anyone sees: everything as designed.
    feel: { speed: 1, gravity: 1, bounce: 1, loop: false },
  },
  {
    id: 'clockwork-tide',
    name: 'Clockwork Tide',
    blurb: 'Patient machines in the deep. Heavy, soft, unhurried.',
    parts: ['flip-flop', 'waterwheel', 'serpentine', 'tipping-buckets', 'color-sorter', 'turnstile'],
    feel: { speed: 0.85, gravity: 1.3, bounce: 0.4, loop: false },
  },
  {
    id: 'rainfall',
    name: 'Rainfall',
    blurb: 'Chimes, pegs and bells, with a lively bounce.',
    parts: ['splitter-comb', 'chimes', 'plinko', 'bumper-garden', 'wave-slide', 'vortex'],
    feel: { speed: 1, gravity: 0.9, bounce: 1.6, loop: false },
  },
  {
    id: 'moon-garden',
    name: 'Moon Garden',
    blurb: 'Low gravity, high bounce, round and round forever.',
    parts: ['bumper-garden', 'plinko', 'chimes', 'splitter-comb', 'wave-slide'],
    feel: { speed: 1.3, gravity: 0.4, bounce: 1.8, loop: true },
  },
  {
    id: 'night-drift',
    name: 'Night Drift',
    blurb: 'Endless and slow. A screensaver for the deep.',
    parts: ['switchback', 'serpentine', 'waterwheel', 'wave-slide', 'turnstile', 'vortex'],
    feel: { speed: 0.7, gravity: 0.75, bounce: 0.8, loop: true },
  },
  {
    id: 'grand-tour',
    name: 'Grand Tour',
    blurb: 'Every part, top to bottom, at a brisk clip.',
    parts: [
      'switchback', 'turnstile', 'plinko', 'flip-flop', 'wave-slide', 'chimes', 'waterwheel',
      'serpentine', 'color-sorter', 'bumper-garden', 'tipping-buckets', 'splitter-comb', 'vortex',
    ],
    feel: { speed: 1.5, gravity: 1.1, bounce: 1, loop: false },
  },
];

/** "gravity 0.4× · bounce 1.8× · endless": what a preset changes from the defaults. */
export function describeFeel(f: PresetFeel): string {
  const bits: string[] = [];
  if (f.speed !== 1) bits.push(`speed ${f.speed}×`);
  if (f.gravity !== 1) bits.push(`gravity ${f.gravity}×`);
  if (f.bounce !== 1) bits.push(`bounce ${f.bounce}×`);
  if (f.loop) bits.push('endless');
  return bits.join(' · ');
}
