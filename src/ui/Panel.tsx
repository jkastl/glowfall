import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useRef } from 'react';
import type { TrackItem } from '../engine/types';
import { PART_MAP, PARTS } from '../parts';
import { PRESETS } from '../tracks/presets';
import { IconClose, IconGrip } from './icons';
import { partThumb } from './thumbs';
import { VERSION_LABEL } from '../version';

export interface PanelProps {
  track: TrackItem[];
  selected: string | null;
  onChange: (t: TrackItem[]) => void;
  onSelect: (uid: string | null) => void;
  onAdd: (partId: string) => void;
  onPreset: (presetId: string) => void;
  /** Endless mode: the track ends by returning to the top instead of in the pool. */
  loop?: boolean;
}

function Row({ item, index, selected, onSelect, onRemove }: { item: TrackItem; index: number; selected: boolean; onSelect: () => void; onRemove: () => void }) {
  const def = PART_MAP.get(item.partId);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.uid });
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);
  if (!def) return null;
  return (
    <li
      ref={(el) => {
        setNodeRef(el);
        ref.current = el;
      }}
      className={`row${selected ? ' sel' : ''}${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onSelect}
    >
      <button className="grip" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Reorder ${def.name}`} onClick={(e) => e.stopPropagation()}>
        <IconGrip />
      </button>
      <img className="thumb" src={partThumb(def, 40, 52)} alt="" draggable={false} />
      <div className="row-text">
        <span className="row-name">
          <span className="row-num">{index + 1}</span>
          {def.name}
        </span>
      </div>
      <button
        className="remove"
        aria-label={`Remove ${def.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <IconClose />
      </button>
    </li>
  );
}

export function Panel({ track, selected, onChange, onSelect, onAdd, onPreset, loop }: PanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = track.findIndex((t) => t.uid === active.id);
    const to = track.findIndex((t) => t.uid === over.id);
    onChange(arrayMove(track, from, to));
    onSelect(String(active.id));
  };

  return (
    <aside className="panel">
      <header className="panel-head">
        <h1>
          Glowfall <span className="version">{VERSION_LABEL}</span>
        </h1>
        <select
          className="presets"
          value=""
          onChange={(e) => {
            if (e.target.value) onPreset(e.target.value);
          }}
          aria-label="Load a starter track"
        >
          <option value="" disabled hidden>Starter tracks</option>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}: {p.blurb}
            </option>
          ))}
          <option value="__clear">Clear track</option>
        </select>
      </header>

      <section className="track-sec">
        <h2>
          Your track <span className="dim">· {track.length} parts</span>
        </h2>
        <ol className="track">
          <li className="row fixed">
            <span className="fixed-dot" /> Source
          </li>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={track.map((t) => t.uid)} strategy={verticalListSortingStrategy}>
              {track.map((item, i) => (
                <Row
                  key={item.uid}
                  item={item}
                  index={i}
                  selected={item.uid === selected}
                  onSelect={() => onSelect(item.uid === selected ? null : item.uid)}
                  onRemove={() => {
                    onChange(track.filter((t) => t.uid !== item.uid));
                    if (selected === item.uid) onSelect(null);
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
          {track.length === 0 && <li className="empty">Tap parts below to add them.</li>}
          {loop ? (
            <li className="row fixed">
              <span className="fixed-loop" aria-hidden="true">
                ↻
              </span>{' '}
              Back to the top
            </li>
          ) : (
            <li className="row fixed">
              <span className="fixed-dot" /> Pool
            </li>
          )}
        </ol>
      </section>

      <section className="palette-sec">
        <h2>
          Parts <span className="dim">· tap to add {selected ? 'below selected' : 'at the end'}</span>
        </h2>
        <div className="palette">
          {PARTS.filter((p) => !p.hidden).map((p) => (
            <button key={p.id} className="card" onClick={() => onAdd(p.id)}>
              <img src={partThumb(p, 64, 84)} alt="" draggable={false} />
              <span className="card-name">{p.name}</span>
              <span className="card-blurb">{p.blurb}</span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
