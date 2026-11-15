// Page counts with GoatCounter (no cookies, no personal data), same site code as jkastl.github.io.
// Only counts on github.io, so local dev and tests never do. Loaded from the built app only, so the
// repo-root redirect page doesn't double count.
export function countVisit() {
  const code = 'jkastl';
  if (typeof location === 'undefined' || !/\.github\.io$/.test(location.hostname)) return;
  const endpoint = `https://${code}.goatcounter.com/count`;
  const w = window as unknown as { goatcounter?: Record<string, unknown> };
  w.goatcounter = { ...(w.goatcounter ?? {}), endpoint, path: '/gbc/' };
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.v4.js';
  s.integrity = 'sha384-nRw6qfbWyJha9LhsOtSb2YJDyZdKvvCFh0fJYlkquSFjUxp9FVNugbfy8q1jdxI+';
  s.crossOrigin = 'anonymous';
  s.setAttribute('data-goatcounter', endpoint);
  document.head.appendChild(s);
}
