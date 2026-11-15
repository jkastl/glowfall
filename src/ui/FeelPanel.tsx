import { BOUNCE_RANGE, GRAVITY_RANGE } from '../engine/sim';

export const SPEED_RANGE = { min: 0.25, max: 3, step: 0.05 } as const;

export interface Feel {
  /** Time scale: the physics runs this many times faster than real time. */
  speed: number;
  gravity: number;
  bounce: number;
}
export const DEFAULT_FEEL: Feel = { speed: 1, gravity: 1, bounce: 1 };

function Slider(props: {
  label: string;
  lo: string;
  hi: string;
  value: number;
  range: { min: number; max: number; step: number };
  onChange: (v: number) => void;
}) {
  const { range, value } = props;
  // Mark where "as designed" (1×) sits on the track.
  const home = ((1 - range.min) / (range.max - range.min)) * 100;
  return (
    <label className="feel-row">
      <span className="feel-label">
        {props.label}
        <span className="feel-val">{value.toFixed(2)}×</span>
      </span>
      <span className="feel-track" style={{ ['--home' as string]: home }}>
        <input
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={value}
          onChange={(e) => {
            let v = Number(e.target.value);
            if (Math.abs(v - 1) < range.step * 1.5) v = 1; // gentle detent at 1×
            props.onChange(v);
          }}
        />
      </span>
      <span className="feel-ends">
        <span>{props.lo}</span>
        <span>{props.hi}</span>
      </span>
    </label>
  );
}

/** Popover with the run settings: speed, gravity, bounce. Changes apply live, even mid-run. */
export function FeelPanel({ feel, onChange }: { feel: Feel; onChange: (f: Feel) => void }) {
  const changed = feel.speed !== 1 || feel.gravity !== 1 || feel.bounce !== 1;
  return (
    <div className="feel" role="dialog" aria-label="Run settings">
      <Slider label="Speed" lo="Slow-mo" hi="Brisk" value={feel.speed} range={SPEED_RANGE} onChange={(speed) => onChange({ ...feel, speed })} />
      <Slider label="Gravity" lo="Drifting" hi="Heavy" value={feel.gravity} range={GRAVITY_RANGE} onChange={(gravity) => onChange({ ...feel, gravity })} />
      <Slider label="Bounce" lo="Soft" hi="Lively" value={feel.bounce} range={BOUNCE_RANGE} onChange={(bounce) => onChange({ ...feel, bounce })} />
      <div className="feel-foot">
        <span className="feel-hint">Applies live, even mid-run.</span>
        <button className="feel-reset" disabled={!changed} onClick={() => onChange(DEFAULT_FEEL)}>
          Reset
        </button>
      </div>
    </div>
  );
}
