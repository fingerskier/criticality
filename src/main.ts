import "./style.css";
import {
  DEFAULT_PARAMETERS,
  createInitialState,
  createRandomSeed,
  createSeededRandom,
  measureSimulation,
  stepSimulation,
  type RandomSource,
  type SimulationParameters,
  type SimulationState
} from "./simulation/criticality";

type ParameterKey = keyof SimulationParameters;

interface ControlDefinition {
  key: ParameterKey;
  label: string;
  min: number;
  max: number;
  step: number;
  help: string;
  format?: (value: number) => string;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const decimal = (value: number) => value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");

const CONTROL_DEFINITIONS: ControlDefinition[] = [
  {
    key: "width",
    label: "Grid width",
    min: 24,
    max: 240,
    step: 1,
    help: "Number of items across the simulated rectangle."
  },
  {
    key: "height",
    label: "Grid height",
    min: 16,
    max: 160,
    step: 1,
    help: "Number of items from top to bottom."
  },
  {
    key: "initialPathologyProbability",
    label: "Initial pathology",
    min: 0,
    max: 0.15,
    step: 0.001,
    format: percent,
    help: "Chance that an item starts at or below the pathology threshold."
  },
  {
    key: "externalTriggerProbability",
    label: "External event chance",
    min: 0,
    max: 1,
    step: 0.001,
    format: percent,
    help: "Probability each tick that a random item is damaged by the outside world."
  },
  {
    key: "neighborTriggerProbability",
    label: "Neighbor trigger chance",
    min: 0,
    max: 1,
    step: 0.001,
    format: percent,
    help: "Probability that each pathological item damages each adjacent neighbor."
  },
  {
    key: "pathologyDamage",
    label: "Pathology damage",
    min: 0.01,
    max: 1,
    step: 0.01,
    format: percent,
    help: "How much health is removed by a pathology event."
  },
  {
    key: "pathologyThreshold",
    label: "Pathology threshold",
    min: 0.01,
    max: 0.99,
    step: 0.01,
    format: percent,
    help: "Items at or below this health are considered pathological."
  },
  {
    key: "recoveryRate",
    label: "Healing amount",
    min: 0,
    max: 0.08,
    step: 0.001,
    format: percent,
    help: "Health restored when a healing attempt succeeds. Healthy neighbors make pathological items more likely to heal."
  },
  {
    key: "ticksPerSecond",
    label: "Simulation speed",
    min: 1,
    max: 120,
    step: 1,
    help: "How many simulation updates run per second."
  }
];

const RESET_KEYS = new Set<ParameterKey>([
  "width",
  "height",
  "initialPathologyProbability"
]);

const rootElement = document.querySelector<HTMLDivElement>("#app");

if (!rootElement) {
  throw new Error("Missing #app root element");
}

const root = rootElement;

root.innerHTML = `
  <header class="hero">
    <p class="eyebrow">Self-organizing critical system simulator</p>
    <h1>Criticality</h1>
    <p class="lede">
      Each pixel is an item with health from 0 to 1. Low-health items become
      pathological, can damage neighbors, heal more easily near healthy neighbors,
      and may be triggered by external shocks.
    </p>
  </header>

  <main class="layout">
    <section class="simulator-card" aria-labelledby="simulator-title">
      <div class="card-title-row">
        <div>
          <h2 id="simulator-title">System state</h2>
          <p id="seed-label" class="muted"></p>
        </div>
        <div class="button-row">
          <button id="toggle-run" type="button" class="primary">Pause</button>
          <button id="step-once" type="button">Step</button>
          <button id="reset" type="button">Reset</button>
          <button id="new-seed" type="button">New seed</button>
        </div>
      </div>

      <div class="canvas-frame">
        <canvas
          id="simulation-canvas"
          role="img"
          aria-label="Pixel grid where color shows item health"
        ></canvas>
      </div>

      <dl class="stats-grid" aria-live="polite">
        <div>
          <dt>Tick</dt>
          <dd id="tick-stat">0</dd>
        </div>
        <div>
          <dt>Average health</dt>
          <dd id="avg-health-stat">100%</dd>
        </div>
        <div>
          <dt>Pathological</dt>
          <dd id="pathological-stat">0</dd>
        </div>
        <div>
          <dt>Last tick events</dt>
          <dd id="events-stat">0 external · 0 spread</dd>
        </div>
      </dl>
    </section>

    <aside class="control-card" aria-labelledby="controls-title">
      <h2 id="controls-title">Parameters</h2>
      <p class="muted">
        Tune the balance between neighbor-supported healing, contagious damage,
        and random external shocks. Dimension and initial-state changes reset the run.
      </p>
      <div id="controls" class="controls"></div>
    </aside>
  </main>
`;

const canvas = requireElement<HTMLCanvasElement>("#simulation-canvas");
const canvasContext = canvas.getContext("2d");
const controls = requireElement<HTMLDivElement>("#controls");
const toggleRun = requireElement<HTMLButtonElement>("#toggle-run");
const stepOnce = requireElement<HTMLButtonElement>("#step-once");
const resetButton = requireElement<HTMLButtonElement>("#reset");
const newSeedButton = requireElement<HTMLButtonElement>("#new-seed");
const seedLabel = requireElement<HTMLParagraphElement>("#seed-label");
const tickStat = requireElement<HTMLElement>("#tick-stat");
const avgHealthStat = requireElement<HTMLElement>("#avg-health-stat");
const pathologicalStat = requireElement<HTMLElement>("#pathological-stat");
const eventsStat = requireElement<HTMLElement>("#events-stat");

if (!canvasContext) {
  throw new Error("Could not create a 2D canvas context");
}

const context = canvasContext;

let parameters: SimulationParameters = { ...DEFAULT_PARAMETERS };
let seed = createRandomSeed();
let random: RandomSource = createSeededRandom(seed);
let state: SimulationState = createInitialState(parameters, random);
let running = true;
let lastFrameTime = performance.now();
let accumulatedSeconds = 0;

buildControls();
render();
requestAnimationFrame(animate);

toggleRun.addEventListener("click", () => {
  running = !running;
  toggleRun.textContent = running ? "Pause" : "Play";
  toggleRun.classList.toggle("primary", running);
});

stepOnce.addEventListener("click", () => {
  state = stepSimulation(state, parameters, random);
  render();
});

resetButton.addEventListener("click", () => resetSimulation());

newSeedButton.addEventListener("click", () => {
  seed = createRandomSeed();
  resetSimulation();
});

function animate(now: number): void {
  const elapsedSeconds = Math.min((now - lastFrameTime) / 1_000, 0.25);
  lastFrameTime = now;

  if (running) {
    accumulatedSeconds += elapsedSeconds;
    const timestep = 1 / Math.max(1, parameters.ticksPerSecond);
    let steps = 0;

    while (accumulatedSeconds >= timestep && steps < 24) {
      state = stepSimulation(state, parameters, random);
      accumulatedSeconds -= timestep;
      steps += 1;
    }

    if (steps > 0) {
      render();
    }
  }

  requestAnimationFrame(animate);
}

function resetSimulation(): void {
  random = createSeededRandom(seed);
  state = createInitialState(parameters, random);
  accumulatedSeconds = 0;
  render();
}

function buildControls(): void {
  for (const definition of CONTROL_DEFINITIONS) {
    const group = document.createElement("label");
    group.className = "control";
    group.htmlFor = `control-${definition.key}`;

    const titleRow = document.createElement("span");
    titleRow.className = "control-title-row";

    const label = document.createElement("span");
    label.textContent = definition.label;

    const valueLabel = document.createElement("span");
    valueLabel.className = "control-value";

    titleRow.append(label, valueLabel);

    const inputRow = document.createElement("span");
    inputRow.className = "control-input-row";

    const range = document.createElement("input");
    range.id = `control-${definition.key}`;
    range.type = "range";
    range.min = String(definition.min);
    range.max = String(definition.max);
    range.step = String(definition.step);

    const number = document.createElement("input");
    number.type = "number";
    number.min = String(definition.min);
    number.max = String(definition.max);
    number.step = String(definition.step);
    number.ariaLabel = `${definition.label} number input`;

    const help = document.createElement("span");
    help.className = "control-help";
    help.textContent = definition.help;

    const sync = (value: number): void => {
      const normalized = clampToDefinition(value, definition);
      const textValue = String(normalized);
      range.value = textValue;
      number.value = textValue;
      valueLabel.textContent = definition.format
        ? definition.format(normalized)
        : decimal(normalized);
    };

    const onInput = (rawValue: string): void => {
      const previousWidth = parameters.width;
      const previousHeight = parameters.height;
      const nextValue = clampToDefinition(Number(rawValue), definition);
      parameters = { ...parameters, [definition.key]: nextValue };
      sync(nextValue);

      if (
        RESET_KEYS.has(definition.key) ||
        previousWidth !== parameters.width ||
        previousHeight !== parameters.height
      ) {
        resetSimulation();
        return;
      }

      state = { ...state, stats: measureSimulation(state, parameters) };
      render();
    };

    range.addEventListener("input", () => onInput(range.value));
    number.addEventListener("input", () => onInput(number.value));

    sync(parameters[definition.key]);
    inputRow.append(range, number);
    group.append(titleRow, inputRow, help);
    controls.append(group);
  }
}

function render(): void {
  seedLabel.textContent = `Seed ${seed.toString(16).padStart(8, "0")} · ${state.width} × ${state.height} items`;

  if (canvas.width !== state.width || canvas.height !== state.height) {
    canvas.width = state.width;
    canvas.height = state.height;
  }

  const image = context.createImageData(state.width, state.height);

  for (let index = 0; index < state.health.length; index += 1) {
    const [red, green, blue] = colorForHealth(state.health[index]);
    const offset = index * 4;
    image.data[offset] = red;
    image.data[offset + 1] = green;
    image.data[offset + 2] = blue;
    image.data[offset + 3] = 255;
  }

  context.putImageData(image, 0, 0);

  const stats = measureSimulation(state, parameters);
  tickStat.textContent = stats.tick.toLocaleString();
  avgHealthStat.textContent = percent(stats.averageHealth);
  pathologicalStat.textContent = `${stats.pathologicalCount.toLocaleString()} (${percent(stats.pathologicalRatio)})`;
  eventsStat.textContent = `${stats.externalEvents} external · ${stats.spreadEvents.toLocaleString()} spread`;
}

function colorForHealth(health: number): readonly [number, number, number] {
  const low = [127, 29, 29] as const;
  const mid = [245, 158, 11] as const;
  const high = [20, 184, 166] as const;
  const clampedHealth = Math.max(0, Math.min(1, health));

  if (clampedHealth < 0.5) {
    return lerpColor(low, mid, clampedHealth / 0.5);
  }

  return lerpColor(mid, high, (clampedHealth - 0.5) / 0.5);
}

function lerpColor(
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  amount: number
): readonly [number, number, number] {
  return [
    Math.round(start[0] + (end[0] - start[0]) * amount),
    Math.round(start[1] + (end[1] - start[1]) * amount),
    Math.round(start[2] + (end[2] - start[2]) * amount)
  ];
}

function clampToDefinition(value: number, definition: ControlDefinition): number {
  const fallback = parameters[definition.key];
  const finiteValue = Number.isFinite(value) ? value : fallback;
  const clamped = Math.min(definition.max, Math.max(definition.min, finiteValue));
  const stepped =
    Math.round((clamped - definition.min) / definition.step) * definition.step +
    definition.min;
  const precision = Math.max(0, decimalPlaces(definition.step));
  return Number(stepped.toFixed(precision));
}

function decimalPlaces(value: number): number {
  const text = String(value);
  const decimalIndex = text.indexOf(".");
  return decimalIndex === -1 ? 0 : text.length - decimalIndex - 1;
}

function requireElement<T extends Element>(selector: string): T {
  const element = root.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}
