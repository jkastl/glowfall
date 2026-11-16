import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AmbientAudio } from '../audio/audio';
import { Simulation } from '../engine/sim';
import type { TrackItem } from '../engine/types';
import { PART_MAP } from '../parts';
import { PRESETS } from '../tracks/presets';
import { DEFAULT_FEEL, FeelPanel, type Feel } from './FeelPanel';
import { IconBack, IconMute, IconPause, IconPlay, IconReplay, IconSound, IconTune } from './icons';
import { Panel } from './Panel';
import { Stage } from './Stage';
import { justUpdatedFrom, registerServiceWorker } from '../pwa';
import { VERSION } from '../version';

type Mode = 'build' | 'run' | 'paused' | 'done';

const STORE_KEY = 'glowfall.track.v1';
const FEEL_KEY = 'glowfall.feel.v1';
const MARBLES = 30;
const PANEL_W = 340;

// Read once per page load (outside React, so StrictMode's double render can't swallow it).
const UPDATED_FROM = justUpdatedFrom();

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

function loadFeel(): Feel {
  try {
    const raw = localStorage.getItem(FEEL_KEY);
    if (raw) {
      const f = JSON.parse(raw) as Partial<Feel>;
      const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
      return { speed: num(f.speed, 1), gravity: num(f.gravity, 1), bounce: num(f.bounce, 1), loop: f.loop === true };
    }
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_FEEL;
}

function makeSim(track: TrackItem[], feel: Feel = DEFAULT_FEEL) {
  return new Simulation(
    track.map((item) => ({ item, def: PART_MAP.get(item.partId)! })),
    { marbleCount: MARBLES, seed: Math.floor(Math.random() * 1e9), gravity: feel.gravity, bounce: feel.bounce, loop: feel.loop },
  );
}

export function App() {
  const [track, setTrack] = useState<TrackItem[]>(loadTrack);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('build');
  const [runSim, setRunSim] = useState<Simulation | null>(null);
  const [muted, setMuted] = useState(false);
  const [feel, setFeel] = useState<Feel>(loadFeel);
  const [feelOpen, setFeelOpen] = useState(false);
  const [applyUpdate, setApplyUpdate] = useState<(() => void) | null>(null);
  const [toast, setToast] = useState<string | null>(UPDATED_FROM ? `Updated to v${VERSION}` : null);

  useEffect(() => registerServiceWorker((apply) => setApplyUpdate(() => apply)), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);
  const [collected, setCollected] = useState(0);
  const [lap, setLap] = useState(1);
  const [focus, setFocus] = useState<{ y: number; n: number } | null>(null);
  const audio = useRef<AmbientAudio>(null as unknown as AmbientAudio);
  if (!audio.current) audio.current = new AmbientAudio();

  // The preview shows the track as it will run: with the pool, or open-ended when looping.
  const previewSim = useMemo(() => makeSim(track, { ...DEFAULT_FEEL, loop: feel.loop }), [track, feel.loop]);
  const sim = mode === 'build' || !runSim ? previewSim : runSim;

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(track));
    } catch {
      /* ignore */
    }
  }, [track]);

  // Feel changes apply live to the running sim and persist.
  useEffect(() => {
    runSim?.setGravity(feel.gravity);
    runSim?.setBounce(feel.bounce);
    try {
      localStorage.setItem(FEEL_KEY, JSON.stringify(feel));
    } catch {
      /* ignore */
    }
  }, [feel, runSim]);

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
    const s = makeSim(track, feel);
    s.onHit((e) => audio.current.hit(e));
    s.onFinish(() => {
      setMode('done');
      audio.current.finale();
    });
    s.start();
    setRunSim(s);
    setCollected(0);
    setLap(1);
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
    const id = setInterval(() => (runSim.loop ? setLap(runSim.lap()) : setCollected(runSim.collectedCount())), 300);
    return () => clearInterval(id);
  }, [runSim]);

  // Keep the screen awake while marbles are moving: an endless run is a screensaver, and the iPad
  // would otherwise auto-lock a couple of minutes in. The lock is dropped on pause and back, and
  // the browser drops it whenever the page is hidden, so it is asked for again on return.
  useEffect(() => {
    if (mode !== 'run' || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let live = true;
    const acquire = async () => {
      if (!live || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        const l = await navigator.wakeLock.request('screen');
        if (live && !(lock && !lock.released)) lock = l;
        else void l.release().catch(() => {});
      } catch {
        /* refused (low battery, no permission): the run just carries on without it */
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
    };
  }, [mode]);

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
      <Panel track={track} selected={selected} onChange={setTrack} onSelect={select} onAdd={add} onPreset={preset} loop={feel.loop} />
      <main className="stage-wrap">
        <Stage
          sim={sim}
          running={mode === 'run' || mode === 'done'}
          editing={building}
          highlightUid={building ? selected : null}
          finale={mode === 'done'}
          speed={feel.speed}
          focus={focus}
          insetLeft={building ? PANEL_W : 0}
          onPick={(uid) => select(uid === selected ? null : uid)}
        />

        <div className="hud-top">
          {applyUpdate && (building || mode === 'done') && (
            <button className="update-pill" onClick={applyUpdate}>
              New version ready <span className="update-go">Update</span>
            </button>
          )}
          {!building && (
            <div className="counter" aria-live="polite">
              {sim.loop ? (
                <>
                  ↻ <span className="dim">lap</span> {lap}
                </>
              ) : (
                <>
                  {collected} / {MARBLES} <span className="dim">at rest</span>
                </>
              )}
            </div>
          )}
          <button
            className={`icon-btn${feelOpen ? ' on' : ''}`}
            onClick={() => setFeelOpen(!feelOpen)}
            aria-label="Run settings"
            aria-expanded={feelOpen}
          >
            <IconTune />
          </button>
          <button className="icon-btn" onClick={toggleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <IconMute /> : <IconSound />}
          </button>
        </div>

        {feelOpen && <FeelPanel feel={feel} onChange={setFeel} loopPending={!building && sim.loop !== feel.loop} />}

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

        {toast && <div className="toast">{toast}</div>}
        {mode === 'done' && <div className="finale-msg">All the light has settled.</div>}
      </main>
    </div>
  );
}
