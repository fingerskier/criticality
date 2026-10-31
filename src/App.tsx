import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PARAMETERS,
  clamp01,
  createRandomSeed,
  createSeededRandom,
  createWorld,
  reconfigureWorld,
  stepWorld,
  type Agent,
  type HistorySample,
  type RandomSource,
  type WorldParameters,
  type WorldState
} from "./simulation/criticality";
import { PRESETS } from "./simulation/presets";
import {
  deleteSavedParameterSet,
  loadCurrentSettings,
  loadSavedParameterSets,
  saveCurrentSettings,
  saveParameterSet,
  type AppSettings,
  type SavedParameterSet
} from "./storage/settings";

const REPOSITORY_URL = "https://github.com/fingerskier/criticality";
const MAX_SEED = 0xffff_ffff;

type ParameterKey = keyof WorldParameters;

interface ControlDefinition {
  key: ParameterKey;
  label: string;
  min: number;
  max: number;
  step: number;
  helper: string;
}

const WORLD_CONTROLS: ControlDefinition[] = [
  {
    key: "triggerRate",
    label: "Trigger rate",
    min: 0,
    max: 1,
    step: 0.01,
    helper: "Probability that a random external excitation starts each step."
  },
  {
    key: "triggerMagnitude",
    label: "Trigger magnitude",
    min: 0,
    max: 1,
    step: 0.01,
    helper: "Maximum energy a trigger adds per step; the actual spike is random."
  },
  {
    key: "quiescence",
    label: "Quiescence",
    min: 0,
    max: 1,
    step: 0.01,
    helper: "Suppresses new triggers as average energy rises."
  },
  {
    key: "dissipationRate",
    label: "Dissipation",
    min: 0,
    max: 1,
    step: 0.001,
    helper: "Fraction of each agent's energy lost to the environment each step."
  },
  {
    key: "conversionRate",
    label: "Conversion rate",
    min: 0,
    max: 1,
    step: 0.005,
    helper: "Fuel an active agent converts into energy each step."
  }
];

const AGENT_CONTROLS: ControlDefinition[] = [
  {
    key: "defaultThreshold",
    label: "Threshold",
    min: 0,
    max: 1,
    step: 0.01,
    helper: "Energy above which an agent may activate."
  },
  {
    key: "defaultActivationProbability",
    label: "Activation prob.",
    min: 0,
    max: 1,
    step: 0.01,
    helper: "Chance an agent above its threshold activates each step."
  },
  {
    key: "defaultDeactivationProbability",
    label: "Deactivation prob.",
    min: 0,
    max: 1,
    step: 0.01,
    helper: "Chance an active agent below its threshold deactivates each step."
  },
  {
    key: "defaultResistance",
    label: "Resistance",
    min: 0,
    max: 1,
    step: 0.01,
    helper: "Fraction of a neighbor's excess energy resisted instead of absorbed."
  },
  {
    key: "defaultVigor",
    label: "Vigor",
    min: 0,
    max: 0.1,
    step: 0.001,
    helper: "Fuel an inactive agent recovers each step."
  },
  {
    key: "variability",
    label: "Variability",
    min: 0,
    max: 0.5,
    step: 0.01,
    helper: "Random ± spread of each agent's properties around the defaults."
  }
];

const GRID_CONTROLS: ControlDefinition[] = [
  {
    key: "width",
    label: "Width",
    min: 32,
    max: 256,
    step: 1,
    helper: "Agents across. Resizes the live grid; existing agents keep their place."
  },
  {
    key: "height",
    label: "Height",
    min: 24,
    max: 192,
    step: 1,
    helper: "Agents down. Resizes the live grid; existing agents keep their place."
  },
  {
    key: "ticksPerSecond",
    label: "Speed",
    min: 1,
    max: 60,
    step: 1,
    helper: "Simulation steps per second while running."
  },
  {
    key: "maxHistory",
    label: "History",
    min: 30,
    max: 600,
    step: 10,
    helper: "Samples retained in the charts."
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

type Rgb = readonly [number, number, number];

interface Scenario {
  value: string;
  name: string;
  description: string;
  seed: number;
  parameters: WorldParameters;
  savedId?: string;
}

const PRESET_SCENARIOS: Scenario[] = PRESETS.map((preset) => ({
  value: `preset:${preset.id}`,
  name: preset.name,
  description: preset.description,
  seed: preset.seed,
  parameters: preset.parameters
}));

export function App() {
  const initialSettingsRef = useRef<AppSettings | null>(null);

  if (!initialSettingsRef.current) {
    initialSettingsRef.current = createInitialSettings();
  }

  const initialSettings = initialSettingsRef.current;
  const [parameters, setParameters] = useState<WorldParameters>(initialSettings.parameters);
  const [seed, setSeed] = useState(initialSettings.seed);
  const randomRef = useRef<RandomSource>(createSeededRandom(initialSettings.seed));
  const parametersRef = useRef(parameters);
  const [world, setWorld] = useState<WorldState>(() =>
    createWorld(initialSettings.parameters, randomRef.current)
  );
  const [running, setRunning] = useState(false);
  const [savedSets, setSavedSets] = useState<SavedParameterSet[]>(() =>
    loadSavedParameterSets()
  );
  const [saveName, setSaveName] = useState("");
  const [storageStatus, setStorageStatus] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    saveCurrentSettings({ parameters, seed });
  }, [parameters, seed]);

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

  // Every setting applies to the live world at once; nothing waits for Reset.
  const updateParameter = useCallback((key: ParameterKey, value: number) => {
    const previous = parametersRef.current;
    const next = { ...previous, [key]: normalizeControlValue(key, value) };

    if (next[key] === previous[key]) {
      return;
    }

    parametersRef.current = next;
    setParameters(next);
    setWorld((current) => reconfigureWorld(current, previous, next, randomRef.current));
  }, []);

  const rebuildWorld = useCallback((nextSeed: number, nextParameters: WorldParameters) => {
    randomRef.current = createSeededRandom(nextSeed);
    setWorld(createWorld(nextParameters, randomRef.current));
  }, []);

  const applySettings = useCallback(
    (settings: AppSettings) => {
      parametersRef.current = settings.parameters;
      setParameters(settings.parameters);
      setSeed(settings.seed);
      rebuildWorld(settings.seed, settings.parameters);
    },
    [rebuildWorld]
  );

  const applySeed = useCallback(
    (nextSeed: number) => {
      setSeed(nextSeed);
      rebuildWorld(nextSeed, parametersRef.current);
    },
    [rebuildWorld]
  );

  const step = useCallback(() => {
    setWorld((current) => stepWorld(current, parametersRef.current, randomRef.current));
  }, []);

  const reset = useCallback(() => rebuildWorld(seed, parametersRef.current), [rebuildWorld, seed]);

  const scenarios = useMemo<Scenario[]>(
    () => [
      ...PRESET_SCENARIOS,
      ...savedSets.map((set) => ({
        value: `saved:${set.id}`,
        name: set.name,
        description: `Saved ${new Date(set.updatedAt).toLocaleString()}.`,
        seed: set.seed,
        parameters: set.parameters,
        savedId: set.id
      }))
    ],
    [savedSets]
  );

  const activeScenario = scenarios.find(
    (scenario) => scenario.seed === seed && sameParameters(scenario.parameters, parameters)
  );

  const selectScenario = useCallback(
    (value: string) => {
      const scenario = scenarios.find((candidate) => candidate.value === value);

      if (scenario) {
        applySettings({ parameters: scenario.parameters, seed: scenario.seed });
        setStorageStatus("");
      }
    },
    [applySettings, scenarios]
  );

  const saveScenario = useCallback(() => {
    const saved = saveParameterSet({
      name: saveName,
      parameters,
      seed,
      history: world.history
    });

    if (!saved) {
      setStorageStatus("Unable to save this setup.");
      return;
    }

    setSavedSets(loadSavedParameterSets());
    setSaveName("");
    setStorageStatus(`Saved "${saved.name}".`);
  }, [saveName, parameters, seed, world.history]);

  const deleteScenario = useCallback(() => {
    if (!activeScenario?.savedId) {
      return;
    }

    setSavedSets(deleteSavedParameterSet(activeScenario.savedId));
    setStorageStatus(`Deleted "${activeScenario.name}".`);
  }, [activeScenario]);

  const displayStats = useMemo(() => makeDisplayStats(world), [world]);

  return (
    <div className="app-shell">
      <GitHubCorner />
      <header className="topbar">
        <div className="brand">
          <h1>Criticality</h1>
          <p>Self-organizing critical system</p>
        </div>
        <div className="runner" role="group" aria-label="World runner controls">
          <button
            className="primary-button"
            type="button"
            onClick={() => setRunning((current) => !current)}
          >
            {running ? "Pause" : "Run"}
          </button>
          <button type="button" onClick={step} disabled={running}>
            Step
          </button>
          <button type="button" onClick={reset} title="Rebuild the world from the current seed">
            Reset
          </button>
        </div>
        <div className="legend" aria-label="Color legend">
          <span><i className="legend-swatch cool" />Inactive · fuel</span>
          <span><i className="legend-swatch heat" />Active · energy</span>
        </div>
      </header>

      <main className="dashboard">
        <section className="simulation-panel" aria-label="Simulation">
          <div className="canvas-frame">
            <canvas
              ref={canvasRef}
              width={world.width}
              height={world.height}
              aria-label="Agent grid visualization"
            />
          </div>
          <dl className="stats-strip" aria-label="Current simulation statistics">
            {displayStats.map((stat) => (
              <div className={`stat ${stat.className ?? ""}`} key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
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
        </section>

        <aside className="control-panel" aria-label="Simulation parameters">
          <section className="control-group span-all scenario">
            <div className="scenario-row">
              <label className="field scenario-select">
                <span>Scenario</span>
                <select
                  value={activeScenario?.value ?? ""}
                  onChange={(event) => selectScenario(event.target.value)}
                >
                  <option value="" disabled>
                    Custom
                  </option>
                  <optgroup label="Presets">
                    {PRESET_SCENARIOS.map((scenario) => (
                      <option key={scenario.value} value={scenario.value}>
                        {scenario.name}
                      </option>
                    ))}
                  </optgroup>
                  {savedSets.length > 0 ? (
                    <optgroup label="Saved">
                      {scenarios
                        .filter((scenario) => scenario.savedId)
                        .map((scenario) => (
                          <option key={scenario.value} value={scenario.value}>
                            {scenario.name}
                          </option>
                        ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              <label className="field seed-field">
                <span>Seed</span>
                <NumberField
                  label="Seed"
                  min={0}
                  max={MAX_SEED}
                  step={1}
                  value={seed}
                  onCommit={(value) => applySeed(Math.round(value))}
                />
              </label>
              <button
                type="button"
                                onClick={() => applySeed(createRandomSeed())}
                title="New random seed"
              >
                Reroll
              </button>
            </div>
            <p className="scenario-note" aria-live="polite">
              {storageStatus ||
                activeScenario?.description ||
                "Custom settings. Name and save them to keep them."}
            </p>
            <form
              className="save-row"
              onSubmit={(event) => {
                event.preventDefault();
                saveScenario();
              }}
            >
              <input
                type="text"
                value={saveName}
                placeholder="Name this setup…"
                aria-label="Saved setup name"
                onChange={(event) => setSaveName(event.target.value)}
              />
              <button type="submit" disabled={saveName.trim().length === 0}>
                Save
              </button>
              <button
                type="button"
                onClick={deleteScenario}
                disabled={!activeScenario?.savedId}
                title="Delete the selected saved setup"
              >
                Delete
              </button>
            </form>
          </section>
          <ControlGroup
            title="World"
            controls={WORLD_CONTROLS}
            parameters={parameters}
            onChange={updateParameter}
          />
          <ControlGroup
            title="Agents"
            controls={AGENT_CONTROLS}
            parameters={parameters}
            onChange={updateParameter}
          />
          <ControlGroup
            className="span-all grid-and-time"
            title="Grid & time"
            controls={GRID_CONTROLS}
            parameters={parameters}
            onChange={updateParameter}
          />
        </aside>
      </main>
    </div>
  );
}

function createInitialSettings(): AppSettings {
  return loadCurrentSettings() ?? {
    parameters: DEFAULT_PARAMETERS,
    seed: createRandomSeed()
  };
}

function GitHubCorner() {
  // Octocat corner after tholman/github-corners (MIT).
  return (
    <a
      className="github-corner"
      href={REPOSITORY_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="View source on GitHub"
      title="View source on GitHub"
    >
      <svg viewBox="0 0 250 250" aria-hidden="true">
        <path d="M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z" className="octo-flag" />
        <path
          className="octo-arm"
          d="M128.3,109.0 C113.8,99.7 119.0,89.6 119.0,89.6 C122.0,82.7 120.5,78.6 120.5,78.6 C119.2,72.0 123.4,76.3 123.4,76.3 C127.3,80.9 125.5,87.3 125.5,87.3 C122.9,97.6 130.6,101.9 134.4,103.2"
        />
        <path
          className="octo-body"
          d="M115.0,115.0 C114.9,115.1 118.7,116.5 119.8,115.4 L133.7,101.6 C136.9,99.2 139.9,98.4 142.2,98.6 C133.8,88.0 127.5,74.4 143.8,58.0 C148.5,53.4 154.0,51.2 159.7,51.0 C160.3,49.4 163.2,43.6 171.4,40.1 C171.4,40.1 176.1,42.5 178.8,56.2 C183.1,58.6 187.2,61.8 190.9,65.4 C194.5,69.0 197.7,73.2 200.1,77.6 C213.8,80.2 216.3,84.9 216.3,84.9 C212.7,93.1 206.9,96.0 205.4,96.6 C205.1,102.4 203.0,107.8 198.3,112.5 C181.9,128.9 168.3,122.5 157.7,114.1 C157.9,116.9 156.7,120.9 152.7,124.9 L141.0,136.5 C139.8,137.7 141.6,141.9 141.8,141.8 Z"
        />
      </svg>
    </a>
  );
}

function ControlGroup({
  title,
  controls,
  parameters,
  onChange,
  className = ""
}: {
  title: string;
  controls: ControlDefinition[];
  parameters: WorldParameters;
  onChange: (key: ParameterKey, value: number) => void;
  className?: string;
}) {
  return (
    <section className={`control-group ${className}`}>
      <h2>{title}</h2>
      <div className="control-list">
        {controls.map((control) => (
          <ParameterControl
            control={control}
            key={control.key}
            value={parameters[control.key]}
            onChange={onChange}
          />
        ))}
      </div>
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
  return (
    <div className="parameter-control" title={control.helper}>
      <div className="control-heading">
        <span>{control.label}</span>
        <NumberField
          label={control.label}
          min={control.min}
          max={control.max}
          step={control.step}
          value={value}
          onCommit={(next) => onChange(control.key, next)}
        />
      </div>
      <input
        type="range"
        aria-label={control.label}
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        onChange={(event) => onChange(control.key, Number(event.target.value))}
      />
    </div>
  );
}

/**
 * Numeric input that applies as you type, but only once the text is an
 * in-range number: typing "200" into a 32-256 field must not resize the grid
 * to 2 and then 20 on the way. Out-of-range text is clamped on blur or Enter.
 */
function NumberField({
  label,
  min,
  max,
  step,
  value,
  onCommit
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string, final: boolean) => {
    const parsed = raw.trim() === "" ? Number.NaN : Number(raw);
    const inRange = Number.isFinite(parsed) && parsed >= min && parsed <= max;
    const next = inRange || !final ? parsed : Math.min(max, Math.max(min, parsed));

    // Only real edits commit: re-committing the shown (rounded) value would
    // nudge precise values and, for the seed, needlessly rebuild the world.
    if (Number.isFinite(next) && (inRange || final) && next !== roundForInput(value)) {
      onCommit(next);
    }

    if (final) {
      setDraft(null);
    }
  };

  return (
    <input
      type="number"
      aria-label={`${label} value`}
      min={min}
      max={max}
      step={step}
      value={draft ?? String(roundForInput(value))}
      onChange={(event) => {
        setDraft(event.target.value);
        commit(event.target.value, false);
      }}
      onBlur={() => {
        if (draft !== null) {
          commit(draft, true);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && draft !== null) {
          commit(draft, true);
        }
      }}
    />
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
      <svg viewBox="0 0 100 36" preserveAspectRatio="none" role="img" aria-label={`${label} history`}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
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

function makeDisplayStats(
  world: WorldState
): Array<{ label: string; value: string; className?: string }> {
  return [
    { label: "Tick", value: String(world.stats.tick) },
    {
      label: "Active",
      className: "medium",
      value: `${world.stats.activeCount} (${formatPercent(world.stats.activeRatio)})`
    },
    { label: "Avalanche", value: String(world.stats.avalanche) },
    { label: "Triggers", value: String(world.stats.activeTriggerCount) },
    {
      label: "Last trigger",
      className: "wide",
      value: world.stats.triggered
        ? `#${world.stats.triggeredIndex ?? "?"} +${formatDecimal(world.stats.triggeredEnergy)}${
            world.stats.triggeredDuration > 0 ? ` ×${world.stats.triggeredDuration}` : ""
          }`
        : "none"
    }
  ];
}

function sameParameters(left: WorldParameters, right: WorldParameters): boolean {
  return (Object.keys(DEFAULT_PARAMETERS) as ParameterKey[]).every(
    (key) => Math.abs(left[key] - right[key]) < 1e-9
  );
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
