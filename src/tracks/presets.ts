export interface Preset {
  id: string;
  name: string;
  blurb: string;
  parts: string[];
}

/** Starter tracks. Unknown part ids are skipped, so presets degrade gracefully. */
export const PRESETS: Preset[] = [
  {
    id: 'first-light',
    name: 'First Light',
    blurb: 'A gentle drift through the shallows.',
    parts: ['switchback', 'plinko', 'wave-slide', 'serpentine', 'chimes', 'vortex'],
  },
  {
    id: 'clockwork-tide',
    name: 'Clockwork Tide',
    blurb: 'Patient machines in the deep.',
    parts: ['flip-flop', 'waterwheel', 'serpentine', 'tipping-buckets', 'color-sorter', 'turnstile'],
  },
  {
    id: 'rainfall',
    name: 'Rainfall',
    blurb: 'Chimes, pegs and soft bells.',
    parts: ['splitter-comb', 'chimes', 'plinko', 'bumper-garden', 'wave-slide', 'vortex'],
  },
  {
    id: 'grand-tour',
    name: 'Grand Tour',
    blurb: 'Every part, top to bottom.',
    parts: [
      'switchback', 'turnstile', 'plinko', 'flip-flop', 'wave-slide', 'chimes', 'waterwheel',
      'serpentine', 'color-sorter', 'bumper-garden', 'tipping-buckets', 'splitter-comb', 'vortex',
    ],
  },
];
