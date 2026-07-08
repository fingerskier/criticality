import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PARAMETERS,
  clamp01,
  createRandomSeed,
  createSeededRandom,
  createWorld,
  stepWorld,
  type Agent,
  type HistorySample,
  type RandomSource,
  type WorldParameters,
  type WorldState
} from "./simulation/criticality";

type ParameterKey = keyof WorldParameters;

interface ControlDefinition {
  key: ParameterKey;
  label: string;
  min: number;
  max: number;
  step: number;
  helper: string;
  format?: (value: number) => string;
}

const GRID_CONTROLS: ControlDefinition[] = [
  {
    key: "width",
    label: "Width",
    min: 32,
    max: 256,
    step: 1,
    helper: "Agents across the canvas. Reset rebuilds the grid."
  },
  {
    key: "height",
    label: "Height",
    min: 24,
    max: 192,
    step: 1,
    helper: "Agents down the canvas. Reset rebuilds the grid."
  }
];

const WORLD_CONTROLS: ControlDefinition[] = [
  {
    key: "triggerRate",
    label: "Trigger rate",
    min: 0,
    max: 1,
    step: 0.01,
    helper: "Probability that a random external excitation occurs each step.",
    format: formatPercent
  },
  {
    key: "triggerMagnitude",
    label: "Trigger magnitude",
    min: 0,
    max: 1,
    step: 0.01,
    helper: "Maximum energy added by a trigger; the actual spike is random.",
    format: formatDecimal
  },
  {
    key: "dissipationRate",
    label: "Dissipation",
    min: 0,
    max: 1,
    step: 0.01,
    helper: "Fraction of each agent's energy lost to the environment each step.",
    format: formatPercent
  },
  {
    key: "conversionRate",
    label: "Conversion rate",
    min: 0,
    max: 1,
    step: 0.005,
    helper: "Fuel that an active agent can convert into energy each step.",
    format: formatDecimal
  },
  {
    key: "ticksPerSecond",
    label: "Speed",
    min: 1,
    max: 60,
    step: 1,
    helper: "Simulation steps per second while Auto is running."
  }
];

const AGENT_CONTROLS: ControlDefinition[] = [
  {
    key: "defaultThreshold",
    label: "Threshold",
    min: 0,
    max: 1,
    step: 0.01,
    helper: "Energy level above which activation can occur.",
    format: formatDecimal
  },
  {
    key: "defaultPropensity",
    label: "Propensity threshold",
    min: 0,
    max: 1,
    step: 0.01,
    helper: "The PLAN rule flips state when random() is greater than this value.",
    format: formatDecimal
  },
  {
    key: "defaultCoupling",
    label: "Coupling",
    min: 0,
    max: 1,
    step: 0.01,
    helper: "Proportion of neighboring released energy an agent absorbs.",
    format: formatDecimal
  },
  {
    key: "defaultVigor",
    label: "Vigor",
    min: 0,
    max: 0.1,
    step: 0.001,
    helper: "Fuel recovered by inactive agents each step.",
    format: formatSmallDecimal
  },
  {
    key: "maxHistory",
    label: "History length",
    min: 30,
    max: 600,
    step: 10,
    helper: "Number of samples retained in the charts."
  }
];

const HEAT_RAMP: [Rgb, Rgb, Rgb] = [
  [254, 240, 138],
  [249, 115, 22],
  [185, 28, 28]
];

const COOL_RAMP: [Rgb, Rgb, Rgb] = [
  [49, 46, 129],
  [37, 99, 235],
  [34, 197, 94]
];

const initialSeed = createRandomSeed();

type Rgb = readonly [number, number, number];

export function App() {
  const [parameters, setParameters] = useState<WorldParameters>(DEFAULT_PARAMETERS);
  const [seed, setSeed] = useState(initialSeed);
  const randomRef = useRef<RandomSource>(createSeededRandom(initialSeed));
  const parametersRef = useRef(parameters);
  const [world, setWorld] = useState<WorldState>(() =>
    createWorld(DEFAULT_PARAMETERS, randomRef.current)
  );
  const [running, setRunning] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    parametersRef.current = parameters;
  }, [parameters]);

  useEffect(() => {
    drawWorld(canvasRef.current, world);
  }, [world]);

  useEffect(() => {
    if (!running) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setWorld((current) => stepWorld(current, parametersRef.current, randomRef.current));
    }, 1000 / Math.max(1, parameters.ticksPerSecond));

    return () => window.clearInterval(interval);
  }, [running, parameters.ticksPerSecond]);

  const updateParameter = useCallback((key: ParameterKey, value: number) => {
    setParameters((current) => ({
      ...current,
      [key]: normalizeControlValue(key, value)
    }));
  }, []);

  const step = useCallback(() => {
    setWorld((current) => stepWorld(current, parametersRef.current, randomRef.current));
  }, []);

  const reset = useCallback(() => {
    randomRef.current = createSeededRandom(seed);
    setWorld(createWorld(parametersRef.current, randomRef.current));
  }, [seed]);

  const randomizeSeed = useCallback(() => {
    const nextSeed = createRandomSeed();
    setSeed(nextSeed);
    randomRef.current = createSeededRandom(nextSeed);
    setWorld(createWorld(parametersRef.current, randomRef.current));
  }, []);

  const displayStats = useMemo(() => makeDisplayStats(world), [world]);

  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">Self-organizing criticality</p>
          <h1 id="page-title">Criticality Simulator</h1>
          <p className="hero-copy">
            Each pixel is an agent with random initial fuel, energy, threshold,
            propensity, coupling, and vigor. Random shocks excite the world;
            active agents convert fuel into energy and neighbors absorb released energy.
          </p>
        </div>
        <div className="runner-card" aria-label="World runner controls">
          <button
            className="primary-button"
            type="button"
            onClick={() => setRunning((current) => !current)}
          >
            {running ? "Pause Auto" : "Start Auto"}
          </button>
          <button type="button" onClick={step}>
            Step
          </button>
          <button type="button" onClick={reset}>
            Reset
          </button>
          <button type="button" onClick={randomizeSeed}>
            New seed
          </button>
          <label className="seed-input">
            Seed
            <input
              type="number"
              value={seed}
              onChange={(event) => setSeed(Number(event.target.value) || 0)}
            />
          </label>
        </div>
      </section>

      <section className="dashboard">
        <div className="simulation-panel">
          <div className="canvas-frame">
            <canvas
              ref={canvasRef}
              width={world.width}
              height={world.height}
              aria-label="Agent grid visualization"
            />
          </div>
          <div className="legend" aria-label="Color legend">
            <span><i className="legend-swatch cool" />Inactive: indigo → blue → green by fuel</span>
            <span><i className="legend-swatch heat" />Active: yellow → orange → red by energy</span>
          </div>
          <div className="stats-grid" aria-label="Current simulation statistics">
            {displayStats.map((stat) => (
              <article className="stat-card" key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </article>
            ))}
          </div>
          <div className="charts" aria-label="Time-series charts">
            <MiniChart
              label="Active ratio"
              samples={world.history}
              getValue={(sample) => sample.activeRatio}
              color="#f97316"
            />
            <MiniChart
              label="Average energy"
              samples={world.history}
              getValue={(sample) => sample.averageEnergy}
              color="#ef4444"
            />
            <MiniChart
              label="Average fuel"
              samples={world.history}
              getValue={(sample) => sample.averageFuel}
              color="#22c55e"
            />
          </div>
        </div>

        <aside className="control-panel" aria-label="Simulation parameters">
          <ControlGroup
            title="Grid"
            description="Dimensions take effect when the world is reset."
            controls={GRID_CONTROLS}
            parameters={parameters}
            onChange={updateParameter}
          />
          <ControlGroup
            title="World variables"
            description="Applied immediately on the next simulation step."
            controls={WORLD_CONTROLS}
            parameters={parameters}
            onChange={updateParameter}
          />
          <ControlGroup
            title="Agent defaults"
            description="Fuel is randomized from 0 to 0.5 on reset; these defaults are copied into each agent."
            controls={AGENT_CONTROLS}
            parameters={parameters}
            onChange={updateParameter}
          />
        </aside>
      </section>
    </main>
  );
}

function ControlGroup({
  title,
  description,
  controls,
  parameters,
  onChange
}: {
  title: string;
  description: string;
  controls: ControlDefinition[];
  parameters: WorldParameters;
  onChange: (key: ParameterKey, value: number) => void;
}) {
  return (
    <section className="control-group">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {controls.map((control) => (
        <ParameterControl
          control={control}
          key={control.key}
          value={parameters[control.key]}
          onChange={onChange}
        />
      ))}
    </section>
  );
}

function ParameterControl({
  control,
  value,
  onChange
}: {
  control: ControlDefinition;
  value: number;
  onChange: (key: ParameterKey, value: number) => void;
}) {
  const formatted = control.format?.(value) ?? String(Math.round(value * 1000) / 1000);

  return (
    <label className="parameter-control">
      <span className="control-heading">
        <span>{control.label}</span>
        <output>{formatted}</output>
      </span>
      <span className="control-inputs">
        <input
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={value}
          onChange={(event) => onChange(control.key, Number(event.target.value))}
        />
        <input
          type="number"
          min={control.min}
          max={control.max}
          step={control.step}
          value={roundForInput(value)}
          onChange={(event) => onChange(control.key, Number(event.target.value))}
        />
      </span>
      <small>{control.helper}</small>
    </label>
  );
}

function MiniChart({
  label,
  samples,
  getValue,
  color
}: {
  label: string;
  samples: HistorySample[];
  getValue: (sample: HistorySample) => number;
  color: string;
}) {
  const points = samples
    .map((sample, index) => {
      const x = samples.length <= 1 ? 0 : (index / (samples.length - 1)) * 100;
      const y = 34 - clamp01(getValue(sample)) * 30;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const latest = samples.at(-1);
  const latestValue = latest ? formatPercent(getValue(latest)) : "0%";

  return (
    <figure className="mini-chart">
      <figcaption>
        <span>{label}</span>
        <strong>{latestValue}</strong>
      </figcaption>
      <svg viewBox="0 0 100 36" role="img" aria-label={`${label} history`}>
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" />
      </svg>
    </figure>
  );
}

function drawWorld(canvas: HTMLCanvasElement | null, world: WorldState): void {
  if (!canvas) {
    return;
  }

  if (canvas.width !== world.width) {
    canvas.width = world.width;
  }

  if (canvas.height !== world.height) {
    canvas.height = world.height;
  }

  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const image = context.createImageData(world.width, world.height);

  for (let index = 0; index < world.agents.length; index += 1) {
    const agent = world.agents[index];

    if (!agent) {
      continue;
    }

    const [red, green, blue] = agentColor(agent);
    const offset = index * 4;
    image.data[offset] = red;
    image.data[offset + 1] = green;
    image.data[offset + 2] = blue;
    image.data[offset + 3] = 255;
  }

  context.putImageData(image, 0, 0);
}

function agentColor(agent: Agent): Rgb {
  return agent.active ? ramp(clamp01(agent.energy), HEAT_RAMP) : ramp(clamp01(agent.fuel), COOL_RAMP);
}

function ramp(value: number, [low, mid, high]: [Rgb, Rgb, Rgb]): Rgb {
  if (value <= 0.5) {
    return mix(low, mid, value * 2);
  }

  return mix(mid, high, (value - 0.5) * 2);
}

function mix(start: Rgb, end: Rgb, amount: number): Rgb {
  const t = clamp01(amount);
  return [
    Math.round(start[0] + (end[0] - start[0]) * t),
    Math.round(start[1] + (end[1] - start[1]) * t),
    Math.round(start[2] + (end[2] - start[2]) * t)
  ];
}

function makeDisplayStats(world: WorldState): Array<{ label: string; value: string }> {
  return [
    { label: "Tick", value: String(world.stats.tick) },
    { label: "Active", value: `${world.stats.activeCount} (${formatPercent(world.stats.activeRatio)})` },
    { label: "Avg energy", value: formatDecimal(world.stats.averageEnergy) },
    { label: "Avg fuel", value: formatDecimal(world.stats.averageFuel) },
    { label: "Avalanche", value: String(world.stats.avalanche) },
    {
      label: "Last trigger",
      value: world.stats.triggered
        ? `#${world.stats.triggeredIndex ?? "?"} +${formatDecimal(world.stats.triggeredEnergy)}`
        : "none"
    }
  ];
}

function normalizeControlValue(key: ParameterKey, value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_PARAMETERS[key];
  }

  if (key === "width" || key === "height" || key === "ticksPerSecond" || key === "maxHistory") {
    return Math.max(1, Math.round(value));
  }

  return clamp01(value);
}

function roundForInput(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatPercent(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function formatDecimal(value: number): string {
  return clamp01(value).toFixed(2);
}

function formatSmallDecimal(value: number): string {
  return clamp01(value).toFixed(3);
}
