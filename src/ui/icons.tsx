const s = { width: '1em', height: '1em', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export const IconPlay = () => (
  <svg viewBox="0 0 24 24" {...s}>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />
  </svg>
);
export const IconPause = () => (
  <svg viewBox="0 0 24 24" {...s}>
    <path d="M9 6v12M15 6v12" strokeWidth={3} />
  </svg>
);
export const IconBack = () => (
  <svg viewBox="0 0 24 24" {...s}>
    <path d="M4 7h11a5 5 0 0 1 0 10H8" />
    <path d="M8 3 4 7l4 4" />
  </svg>
);
export const IconReplay = () => (
  <svg viewBox="0 0 24 24" {...s}>
    <path d="M4 12a8 8 0 1 0 2.5-5.8" />
    <path d="M4 4v4h4" />
  </svg>
);
export const IconSound = () => (
  <svg viewBox="0 0 24 24" {...s}>
    <path d="M4 10v4h3l5 4V6L7 10z" fill="currentColor" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
  </svg>
);
export const IconMute = () => (
  <svg viewBox="0 0 24 24" {...s}>
    <path d="M4 10v4h3l5 4V6L7 10z" fill="currentColor" />
    <path d="m16 9 5 6M21 9l-5 6" />
  </svg>
);
export const IconGrip = () => (
  <svg viewBox="0 0 24 24" {...s} strokeWidth={2.4}>
    <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
  </svg>
);
export const IconClose = () => (
  <svg viewBox="0 0 24 24" {...s}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const IconUp = () => (
  <svg viewBox="0 0 24 24" {...s}>
    <path d="m6 15 6-6 6 6" />
  </svg>
);
export const IconDown = () => (
  <svg viewBox="0 0 24 24" {...s}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
