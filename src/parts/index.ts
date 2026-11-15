import type { PartDef } from '../engine/types';

// Every file in this folder default-exports a PartDef. Drop a file in → it appears in the palette.
const mods = import.meta.glob<{ default: PartDef }>('./*.ts', { eager: true });

export const PARTS: PartDef[] = Object.entries(mods)
  .filter(([path]) => !path.endsWith('/index.ts'))
  .map(([, m]) => m.default)
  .filter((d): d is PartDef => !!d && typeof d.build === 'function')
  .sort((a, b) => a.name.localeCompare(b.name));

export const PART_MAP = new Map(PARTS.map((p) => [p.id, p]));
