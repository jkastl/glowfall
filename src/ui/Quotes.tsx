import { useEffect, useState } from 'react';

/** Original lines; some serene, some zen AF. */
export const QUOTES = [
  'The marble does not hurry. It still arrives.',
  'Every path down is the right one.',
  'Bounce. Settle. Begin again.',
  'Gravity asks nothing. It simply holds.',
  'The pegs do not judge the fall.',
  'Even the long way round ends at rest.',
  'There are no wrong turns, only other notes.',
  'Stillness is motion that has finished its sentence.',
  'Breathe in on the bounce. Breathe out on the roll.',
  'Nothing to fix. Nothing to win. Just watch it go.',
  'A stuck marble is only a marble taking a moment.',
  'What you stop gripping, the current carries.',
  'Each bounce is the first one.',
  'Slow is a speed too.',
  'What falls, glows.',
  'Be the funnel: wide to receive, narrow to let go.',
  'Ten thousand bounces, one quiet pool.',
  'Rest is where all motion is headed.',
  'You cannot plan the bounce. Plinko knows.',
  'Round and round, and never the same twice.',
  'Unclench your jaw. The marbles have this.',
  'Drop your shoulders. Let the marbles do the falling.',
  'Some marbles take the scenic route. So can you.',
  'You are not the marble. You are the watching.',
  'The deep is patient. Be the deep.',
  'Light finds its way down. So will you.',
  'Nowhere to be. The marbles agree.',
  'Every pool was once a fall.',
  'Let the next thing happen.',
  'No marble has ever been late.',
];

function shuffled(): string[] {
  const a = [...QUOTES];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const FIRST_DELAY = 7000;
const SHOW = 11000;
const GAP = 26000;

/**
 * A quiet caption at the bottom of the screen while marbles fall: one line fades in, lingers,
 * fades out, and the next comes much later. At the finale one line stays put.
 */
export function Quotes({ mode }: { mode: 'build' | 'run' | 'paused' | 'done' }) {
  const [deck] = useState(shuffled);
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(false);
  const running = mode === 'run';

  useEffect(() => {
    if (!running) {
      setVisible(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      setVisible(true);
      timer = setTimeout(hide, SHOW);
    };
    const hide = () => {
      setVisible(false);
      timer = setTimeout(() => {
        setI((n) => n + 1);
        show();
      }, GAP);
    };
    timer = setTimeout(show, FIRST_DELAY);
    return () => clearTimeout(timer);
  }, [running]);

  if (mode === 'build') return null;
  if (mode === 'done') return <div className="quote quote-finale">{deck[i % deck.length]}</div>;
  return (
    <div className={`quote${visible ? ' on' : ''}`} aria-live="polite">
      {deck[i % deck.length]}
    </div>
  );
}
