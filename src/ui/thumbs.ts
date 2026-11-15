import { renderPartThumb } from '../engine/render';
import { Simulation } from '../engine/sim';
import type { PartDef } from '../engine/types';

const cache = new Map<string, string>();

/** Data-URL thumbnail of a part's geometry. Fixed pixel box; the part is fitted inside. */
export function partThumb(def: PartDef, w = 72, h = 96): string {
  const key = `${def.id}:${w}x${h}`;
  let url = cache.get(key);
  if (!url) {
    try {
      const sim = new Simulation([{ item: { uid: 'thumb', partId: def.id }, def }], { bare: true });
      url = renderPartThumb(sim, w, h);
    } catch (e) {
      console.error('thumbnail failed', def.id, e);
      url = '';
    }
    cache.set(key, url);
  }
  return url;
}
