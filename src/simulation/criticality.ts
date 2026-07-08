export type RandomSource = () => number;

export interface Agent {
  fuel: number;
  threshold: number;
  activationProbability: number;
  deactivationProbability: number;
  resistance: number;
  vigor: number;
  energy: number;
  active: boolean;
}

export interface TriggerInput {
  agentIndex: number;
  energyPerStep: number;
  remainingSteps: number;
}

export interface WorldParameters {
  width: number;
  height: number;
  triggerRate: number;
  triggerMagnitude: number;
  dissipationRate: number;
  conversionRate: number;
  defaultThreshold: number;
  defaultActivationProbability: number;
  defaultDeactivationProbability: number;
  defaultResistance: number;
  defaultVigor: number;
  variability: number;
  quiescence: number;
  ticksPerSecond: number;
  maxHistory: number;
}

export interface WorldStats {
  tick: number;
  activeCount: number;
  activeRatio: number;
  totalEnergy: number;
  averageEnergy: number;
  totalFuel: number;
  averageFuel: number;
  triggered: boolean;
  triggeredIndex: number | null;
  triggeredEnergy: number;
  triggeredDuration: number;
  activeTriggerCount: number;
  dissipatedEnergy: number;
  avalanche: number;
}

export type HistorySample = WorldStats;

export interface WorldState {
  width: number;
  height: number;
  agents: Agent[];
  triggerInputs: TriggerInput[];
  stats: WorldStats;
  history: HistorySample[];
}

export const DEFAULT_PARAMETERS: WorldParameters = {
  width: 160,
  height: 96,
  triggerRate: 0.08,
  triggerMagnitude: 0.75,
  dissipationRate: 0.04,
  conversionRate: 0.035,
  defaultThreshold: 0.1,
  defaultActivationProbability: 0.65,
  defaultDeactivationProbability: 0.65,
  defaultResistance: 0.35,
  defaultVigor: 0.01,
  variability: 0.15,
  quiescence: 0.35,
  ticksPerSecond: 24,
  maxHistory: 240
};

export const INITIAL_FUEL_MAX = 0.5;

const MAX_SEED = 0xffff_ffff;
const EPSILON = 1e-12;

export function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= EPSILON) {
    return 0;
  }

  if (value >= 1 - EPSILON) {
    return 1;
  }

  return value;
}

export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function createRandomSeed(): number {
  return Math.floor(Math.random() * MAX_SEED);
}

export function createWorld(
  parameters: WorldParameters,
  random: RandomSource = Math.random
): WorldState {
  const width = normalizeDimension(parameters.width);
  const height = normalizeDimension(parameters.height);
  const totalAgents = width * height;
  const agents = Array.from({ length: totalAgents }, () =>
    createAgentFromDefaults(parameters, random)
  );
  const stats = summarize(agents, 0, {
    triggered: false,
    triggeredIndex: null,
    triggeredEnergy: 0,
    triggeredDuration: 0,
    activeTriggerCount: 0,
    dissipatedEnergy: 0,
    avalanche: 0
  });

  return {
    width,
    height,
    agents,
    triggerInputs: [],
    stats,
    history: [stats]
  };
}

export function stepWorld(
  world: WorldState,
  parameters: WorldParameters,
  random: RandomSource = Math.random
): WorldState {
  const width = normalizeDimension(world.width);
  const height = normalizeDimension(world.height);
  const totalAgents = width * height;
  const agents = world.agents.slice(0, totalAgents).map(cloneAgent);

  while (agents.length < totalAgents) {
    agents.push(createAgentFromDefaults(parameters, random));
  }

  const previousActive = agents.map((agent) => agent.active);
  const trigger = applyExternalTriggers(agents, world.triggerInputs ?? [], parameters, random);

  // Decide conversion and activation from the energy each cell currently holds,
  // THEN propagate energy to neighbors. Running the neighbor transfer first would
  // diffuse a fresh trigger below the activation threshold before any cell could
  // fire, so triggers appeared to do nothing.
  convertActiveFuel(agents, parameters);
  applyActivationRules(agents, random);
  transferNeighborEnergy(agents, width, height);
  const dissipatedEnergy = dissipateEnergy(agents, parameters);
  refuelInactiveAgents(agents);

  const avalanche = agents.reduce((count, agent, index) => {
    const wasActive = previousActive[index] ?? false;
    return count + (agent.active && !wasActive ? 1 : 0);
  }, 0);

  const stats = summarize(agents, world.stats.tick + 1, {
    ...trigger,
    dissipatedEnergy,
    avalanche
  });

  const maxHistory = Math.max(1, Math.round(parameters.maxHistory));
  const history = [...world.history, stats].slice(-maxHistory);

  return {
    width,
    height,
    agents,
    triggerInputs: trigger.triggerInputs,
    stats,
    history
  };
}

function createAgentFromDefaults(
  parameters: WorldParameters,
  random: RandomSource
): Agent {
  // Fuel always consumes exactly one draw first; the per-property bumps only
  // draw when variability is positive, so a zero-variability world reproduces
  // the same random stream (one fuel draw per agent) as a homogeneous grid.
  const spread = Math.max(0, parameters.variability);

  return {
    fuel: clamp01(random()) * INITIAL_FUEL_MAX,
    threshold: varyDefault(parameters.defaultThreshold, spread, random),
    activationProbability: varyDefault(
      parameters.defaultActivationProbability,
      spread,
      random
    ),
    deactivationProbability: varyDefault(
      parameters.defaultDeactivationProbability,
      spread,
      random
    ),
    resistance: varyDefault(parameters.defaultResistance, spread, random),
    vigor: varyDefault(parameters.defaultVigor, spread, random),
    energy: 0,
    active: false
  };
}

function varyDefault(base: number, spread: number, random: RandomSource): number {
  if (spread <= 0) {
    return clamp01(base);
  }

  const factor = 1 + (random() * 2 - 1) * spread;
  return clamp01(base * factor);
}

function cloneAgent(agent: Agent | undefined): Agent {
  const source = agent as
    | (Partial<Agent> & { coupling?: number; propensity?: number })
    | undefined;

  return {
    fuel: clamp01(source?.fuel ?? 0),
    threshold: clamp01(source?.threshold ?? DEFAULT_PARAMETERS.defaultThreshold),
    activationProbability: clamp01(
      source?.activationProbability ??
        inverseLegacyThreshold(source?.propensity) ??
        DEFAULT_PARAMETERS.defaultActivationProbability
    ),
    deactivationProbability: clamp01(
      source?.deactivationProbability ??
        inverseLegacyThreshold(source?.propensity) ??
        DEFAULT_PARAMETERS.defaultDeactivationProbability
    ),
    resistance: clamp01(
      source?.resistance ??
        inverseLegacyThreshold(source?.coupling) ??
        DEFAULT_PARAMETERS.defaultResistance
    ),
    vigor: clamp01(source?.vigor ?? DEFAULT_PARAMETERS.defaultVigor),
    energy: clamp01(source?.energy ?? 0),
    active: source?.active ?? false
  };
}

function inverseLegacyThreshold(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? 1 - clamp01(value ?? 0) : undefined;
}

function applyExternalTriggers(
  agents: Agent[],
  triggerInputs: TriggerInput[],
  parameters: WorldParameters,
  random: RandomSource
): Pick<
  WorldStats,
  "triggered" | "triggeredIndex" | "triggeredEnergy" | "triggeredDuration" | "activeTriggerCount"
> & { triggerInputs: TriggerInput[] } {
  if (agents.length === 0) {
    return emptyTriggerResult();
  }

  const activeInputs = triggerInputs
    .map(normalizeTriggerInput)
    .filter((input): input is TriggerInput => input !== null);
  const triggerRate = effectiveTriggerRate(agents, parameters);
  let newTriggerDuration = 0;
  let newTriggerIndex: number | null = null;

  if (triggerRate > 0 && random() < triggerRate) {
    const agentIndex = Math.min(
      agents.length - 1,
      Math.floor(clamp01(random()) * agents.length)
    );
    const energyPerStep = clamp01(random()) * clamp01(parameters.triggerMagnitude);
    const remainingSteps = randomDuration(random);
    activeInputs.push({ agentIndex, energyPerStep, remainingSteps });
    newTriggerDuration = remainingSteps;
    newTriggerIndex = agentIndex;
  }

  let triggeredEnergy = 0;
  const triggeredIndices = new Set<number>();
  const nextInputs: TriggerInput[] = [];

  for (const input of activeInputs) {
    const agent = agents[input.agentIndex];

    if (!agent || input.remainingSteps <= 0) {
      continue;
    }

    agent.energy = clamp01(agent.energy + input.energyPerStep);
    triggeredEnergy += input.energyPerStep;
    triggeredIndices.add(input.agentIndex);

    const remainingSteps = input.remainingSteps - 1;

    if (remainingSteps > 0) {
      nextInputs.push({ ...input, remainingSteps });
    }
  }

  const triggeredIndex =
    newTriggerIndex ?? (triggeredIndices.size === 1 ? [...triggeredIndices][0] ?? null : null);

  return {
    triggered: triggeredIndices.size > 0,
    triggeredIndex,
    triggeredEnergy,
    triggeredDuration: newTriggerDuration,
    activeTriggerCount: nextInputs.length,
    triggerInputs: nextInputs
  };
}

function emptyTriggerResult(): Pick<
  WorldStats,
  "triggered" | "triggeredIndex" | "triggeredEnergy" | "triggeredDuration" | "activeTriggerCount"
> & { triggerInputs: TriggerInput[] } {
  return {
    triggered: false,
    triggeredIndex: null,
    triggeredEnergy: 0,
    triggeredDuration: 0,
    activeTriggerCount: 0,
    triggerInputs: []
  };
}

function normalizeTriggerInput(input: TriggerInput): TriggerInput | null {
  const agentIndex = Math.max(0, Math.round(input.agentIndex));
  const energyPerStep = clamp01(input.energyPerStep);
  const remainingSteps = Math.max(0, Math.round(input.remainingSteps));

  if (remainingSteps <= 0) {
    return null;
  }

  return { agentIndex, energyPerStep, remainingSteps };
}

function effectiveTriggerRate(agents: readonly Agent[], parameters: WorldParameters): number {
  const averageEnergy =
    agents.reduce((sum, agent) => sum + clamp01(agent.energy), 0) / Math.max(1, agents.length);
  return clamp01(parameters.triggerRate) * (1 - clamp01(parameters.quiescence) * averageEnergy);
}

function randomDuration(random: RandomSource): number {
  return Math.min(10, 1 + Math.floor(clamp01(random()) * 10));
}

function transferNeighborEnergy(agents: Agent[], width: number, height: number): void {
  const snapshot = agents.map((agent) => ({
    active: agent.active,
    energy: clamp01(agent.energy),
    threshold: clamp01(agent.threshold)
  }));
  const deltas = Array.from({ length: agents.length }, () => 0);

  for (let sourceIndex = 0; sourceIndex < agents.length; sourceIndex += 1) {
    const source = snapshot[sourceIndex];

    if (!source?.active) {
      continue;
    }

    const excessEnergy = Math.max(0, source.energy - source.threshold);

    if (excessEnergy <= EPSILON) {
      continue;
    }

    const x = sourceIndex % width;
    const y = Math.floor(sourceIndex / width);

    for (const targetIndex of neighborIndices(x, y, width, height)) {
      const target = agents[targetIndex];

      if (!target) {
        continue;
      }

      const absorbedShare = (excessEnergy / 8) * (1 - clamp01(target.resistance));

      if (absorbedShare <= EPSILON) {
        continue;
      }

      deltas[sourceIndex] = (deltas[sourceIndex] ?? 0) - absorbedShare;
      deltas[targetIndex] = (deltas[targetIndex] ?? 0) + absorbedShare;
    }
  }

  for (let index = 0; index < agents.length; index += 1) {
    const agent = agents[index];

    if (!agent) {
      continue;
    }

    agent.energy = clamp01(agent.energy + (deltas[index] ?? 0));
  }
}

function convertActiveFuel(agents: Agent[], parameters: WorldParameters): void {
  const conversionRate = clamp01(parameters.conversionRate);

  for (const agent of agents) {
    if (!agent.active) {
      continue;
    }

    if (agent.fuel <= EPSILON) {
      agent.fuel = 0;
      agent.active = false;
      continue;
    }

    const energyCapacity = Math.max(0, 1 - agent.energy);
    const converted = Math.min(agent.fuel, conversionRate, energyCapacity);
    agent.fuel = clamp01(agent.fuel - converted);
    agent.energy = clamp01(agent.energy + converted);

    if (agent.fuel <= EPSILON) {
      agent.fuel = 0;
      agent.active = false;
    }
  }
}

function applyActivationRules(agents: Agent[], random: RandomSource): void {
  for (const agent of agents) {
    const roll = random();

    if (agent.fuel <= EPSILON) {
      agent.fuel = 0;
      agent.active = false;
      continue;
    }

    if (agent.energy > agent.threshold) {
      if (roll < agent.activationProbability) {
        agent.active = true;
      }
    } else if (agent.energy < agent.threshold && roll < agent.deactivationProbability) {
      agent.active = false;
    }
  }
}

function dissipateEnergy(agents: Agent[], parameters: WorldParameters): number {
  const dissipationRate = clamp01(parameters.dissipationRate);
  let dissipatedEnergy = 0;

  for (const agent of agents) {
    const dissipated = agent.energy * dissipationRate;
    agent.energy = clamp01(agent.energy - dissipated);
    dissipatedEnergy += dissipated;
  }

  return dissipatedEnergy;
}

function refuelInactiveAgents(agents: Agent[]): void {
  for (const agent of agents) {
    if (!agent.active) {
      agent.fuel = clamp01(agent.fuel + agent.vigor);
    }
  }
}

function summarize(
  agents: readonly Agent[],
  tick: number,
  events: Pick<
    WorldStats,
    | "triggered"
    | "triggeredIndex"
    | "triggeredEnergy"
    | "triggeredDuration"
    | "activeTriggerCount"
    | "dissipatedEnergy"
    | "avalanche"
  >
): WorldStats {
  const activeCount = agents.filter((agent) => agent.active).length;
  const totalEnergy = agents.reduce((sum, agent) => sum + agent.energy, 0);
  const totalFuel = agents.reduce((sum, agent) => sum + agent.fuel, 0);
  const count = agents.length || 1;

  return {
    tick,
    activeCount,
    activeRatio: activeCount / count,
    totalEnergy,
    averageEnergy: totalEnergy / count,
    totalFuel,
    averageFuel: totalFuel / count,
    triggered: events.triggered,
    triggeredIndex: events.triggeredIndex,
    triggeredEnergy: events.triggeredEnergy,
    triggeredDuration: events.triggeredDuration,
    activeTriggerCount: events.activeTriggerCount,
    dissipatedEnergy: events.dissipatedEnergy,
    avalanche: events.avalanche
  };
}

function* neighborIndices(
  x: number,
  y: number,
  width: number,
  height: number
): Generator<number> {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const nx = x + dx;
      const ny = y + dy;

      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }

      yield ny * width + nx;
    }
  }
}

function normalizeDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.min(512, Math.round(value)));
}
