import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AmbientAudio } from '../audio/audio';
import { Simulation } from '../engine/sim';
import type { TrackItem } from '../engine/types';
import { PART_MAP } from '../parts';
import { PRESETS } from '../tracks/presets';
import { IconBack, IconMute, IconPause, IconPlay, IconReplay, IconSound } from './icons';
import { Panel } from './Panel';
import { Stage } from './Stage';

type Mode = 'build' | 'run' | 'paused' | 'done';

const STORE_KEY = 'glowfall.track.v1';
const MARBLES = 30;
const PANEL_W = 340;

let uidCounter = 0;
const newUid = () => `p${Date.now().toString(36)}${(uidCounter++).toString(36)}`;

function fromPreset(id: string): TrackItem[] {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  return p.parts.filter((pid) => PART_MAP.has(pid)).map((partId) => ({ uid: newUid(), partId }));
}

function loadTrack(): TrackItem[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const t = (JSON.parse(raw) as TrackItem[]).filter((i) => PART_MAP.has(i.partId));
      if (Array.isArray(t)) return t;
    }
  } catch {
    /* storage unavailable */
  }
  return fromPreset(PRESETS[0].id);
}

function makeSim(track: TrackItem[]) {
  return new Simulation(
    track.map((item) => ({ item, def: PART_MAP.get(item.partId)! })),
    { marbleCount: MARBLES, seed: Math.floor(Math.random() * 1e9) },
  );
}

export function App() {
  const [track, setTrack] = useState<TrackItem[]>(loadTrack);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('build');
  const [runSim, setRunSim] = useState<Simulation | null>(null);
  const [muted, setMuted] = useState(false);
  const [collected, setCollected] = useState(0);
  const [focus, setFocus] = useState<{ y: number; n: number } | null>(null);
  const audio = useRef<AmbientAudio>(null as unknown as AmbientAudio);
  if (!audio.current) audio.current = new AmbientAudio();

  const previewSim = useMemo(() => makeSim(track), [track]);
  const sim = mode === 'build' || !runSim ? previewSim : runSim;

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(track));
    } catch {
      /* ignore */
    }
  }, [track]);

  // Camera glides to the selected part while building.
  const select = useCallback(
    (uid: string | null) => {
      setSelected(uid);
      if (!uid) return;
      const p = previewSim.parts.find((x) => x.uid === uid);
      if (p) setFocus({ y: p.originY + p.height / 2, n: Math.random() });
    },
    [previewSim],
  );

  // After the track changes, keep the camera on the selection.
  useEffect(() => {
    if (!selected) return;
    const p = previewSim.parts.find((x) => x.uid === selected);
    if (p) setFocus({ y: p.originY + p.height / 2, n: Math.random() });
  }, [previewSim]);

  const add = (partId: string) => {
    const item = { uid: newUid(), partId };
    const i = selected ? track.findIndex((t) => t.uid === selected) : -1;
    const next = i >= 0 ? [...track.slice(0, i + 1), item, ...track.slice(i + 1)] : [...track, item];
    setTrack(next);
    setSelected(item.uid);
  };

  const preset = (id: string) => {
    if (id === '__clear') setTrack([]);
    else setTrack(fromPreset(id));
    setSelected(null);
    setFocus({ y: 0, n: Math.random() });
  };

  const run = () => {
    const s = makeSim(track);
    s.onHit((e) => audio.current.hit(e));
    s.onFinish(() => {
      setMode('done');
      audio.current.finale();
    });
    s.start();
    setRunSim(s);
    setCollected(0);
    setMode('run');
    audio.current.start();
  };

  const togglePause = () => {
    if (mode === 'run') {
      setMode('paused');
      audio.current.pause();
    } else if (mode === 'paused') {
      setMode('run');
      audio.current.resume();
    }
  };

  const backToBuild = () => {
    setMode('build');
    setRunSim(null);
    audio.current.stop();
  };

  // HUD counter
  useEffect(() => {
    if (!runSim) return;
    const id = setInterval(() => setCollected(runSim.collectedCount()), 300);
    return () => clearInterval(id);
  }, [runSim]);

  // Pause when the tab/app goes to the background.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && mode === 'run') togglePause();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  });

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    audio.current.setMuted(m);
  };

  const building = mode === 'build';

  return (
    <div className={`app mode-${mode}`}>
      <Panel track={track} selected={selected} onChange={setTrack} onSelect={select} onAdd={add} onPreset={preset} />
      <main className="stage-wrap">
        <Stage
          sim={sim}
          running={mode === 'run' || mode === 'done'}
          editing={building}
          highlightUid={building ? selected : null}
          finale={mode === 'done'}
          focus={focus}
          insetLeft={building ? PANEL_W : 0}
          onPick={(uid) => select(uid === selected ? null : uid)}
        />

        <div className="hud-top">
          {!building && (
            <div className="counter" aria-live="polite">
              {collected} / {MARBLES} <span className="dim">at rest</span>
            </div>
          )}
          <button className="icon-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <IconMute /> : <IconSound />}
          </button>
        </div>

        <div className="controls">
          {building ? (
            <button className="play" onClick={run} aria-label="Release the marbles">
              <IconPlay />
              <span>Release</span>
            </button>
          ) : (
            <>
              <button className="icon-btn big" onClick={backToBuild} aria-label="Back to building">
                <IconBack />
              </button>
              {mode === 'done' ? (
                <button className="play" onClick={run} aria-label="Run again">
                  <IconReplay />
                  <span>Again</span>
                </button>
              ) : (
                <button className="play round" onClick={togglePause} aria-label={mode === 'run' ? 'Pause' : 'Resume'}>
                  {mode === 'run' ? <IconPause /> : <IconPlay />}
                </button>
              )}
            </>
          )}
        </div>

        {mode === 'done' && <div className="finale-msg">All the light has settled.</div>}
      </main>
    </div>
  );
}
