export type RandomSource = () => number;

export interface Agent {
  fuel: number;
  threshold: number;
  propensity: number;
  coupling: number;
  vigor: number;
  energy: number;
  active: boolean;
}

export interface WorldParameters {
  width: number;
  height: number;
  triggerRate: number;
  triggerMagnitude: number;
  dissipationRate: number;
  conversionRate: number;
  defaultThreshold: number;
  defaultPropensity: number;
  defaultCoupling: number;
  defaultVigor: number;
  variability: number;
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
  dissipatedEnergy: number;
  avalanche: number;
}

export type HistorySample = WorldStats;

export interface WorldState {
  width: number;
  height: number;
  agents: Agent[];
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
  defaultPropensity: 0.35,
  defaultCoupling: 0.65,
  defaultVigor: 0.01,
  variability: 0.15,
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
    dissipatedEnergy: 0,
    avalanche: 0
  });

  return {
    width,
    height,
    agents,
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
  const trigger = applyExternalTrigger(agents, parameters, random);

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
    threshold: bumpDefault(parameters.defaultThreshold, spread, random),
    propensity: bumpDefault(parameters.defaultPropensity, spread, random),
    coupling: bumpDefault(parameters.defaultCoupling, spread, random),
    vigor: bumpDefault(parameters.defaultVigor, spread, random),
    energy: 0,
    active: false
  };
}

function bumpDefault(base: number, spread: number, random: RandomSource): number {
  if (spread <= 0) {
    return clamp01(base);
  }

  const offset = (random() * 2 - 1) * spread;
  return clamp01(base + offset);
}

function cloneAgent(agent: Agent | undefined): Agent {
  return {
    fuel: clamp01(agent?.fuel ?? 0),
    threshold: clamp01(agent?.threshold ?? DEFAULT_PARAMETERS.defaultThreshold),
    propensity: clamp01(agent?.propensity ?? DEFAULT_PARAMETERS.defaultPropensity),
    coupling: clamp01(agent?.coupling ?? DEFAULT_PARAMETERS.defaultCoupling),
    vigor: clamp01(agent?.vigor ?? DEFAULT_PARAMETERS.defaultVigor),
    energy: clamp01(agent?.energy ?? 0),
    active: agent?.active ?? false
  };
}

function applyExternalTrigger(
  agents: Agent[],
  parameters: WorldParameters,
  random: RandomSource
): Pick<WorldStats, "triggered" | "triggeredIndex" | "triggeredEnergy"> {
  if (agents.length === 0 || random() >= clamp01(parameters.triggerRate)) {
    return {
      triggered: false,
      triggeredIndex: null,
      triggeredEnergy: 0
    };
  }

  const triggeredIndex = Math.min(
    agents.length - 1,
    Math.floor(clamp01(random()) * agents.length)
  );
  const triggered = agents[triggeredIndex];

  if (!triggered) {
    return {
      triggered: false,
      triggeredIndex: null,
      triggeredEnergy: 0
    };
  }

  const triggeredEnergy = clamp01(random()) * clamp01(parameters.triggerMagnitude);
  triggered.energy = clamp01(triggered.energy + triggeredEnergy);

  return {
    triggered: true,
    triggeredIndex,
    triggeredEnergy
  };
}

function transferNeighborEnergy(agents: Agent[], width: number, height: number): void {
  const snapshot = agents.map((agent) => clamp01(agent.energy));
  const deltas = Array.from({ length: agents.length }, () => 0);

  for (let targetIndex = 0; targetIndex < agents.length; targetIndex += 1) {
    const target = agents[targetIndex];

    if (!target) {
      continue;
    }

    const coupling = clamp01(target.coupling);

    if (coupling <= 0) {
      continue;
    }

    const x = targetIndex % width;
    const y = Math.floor(targetIndex / width);

    for (const sourceIndex of neighborIndices(x, y, width, height)) {
      const sourceEnergy = snapshot[sourceIndex] ?? 0;
      const share = (sourceEnergy / 8) * coupling;
      deltas[targetIndex] = (deltas[targetIndex] ?? 0) + share;
      deltas[sourceIndex] = (deltas[sourceIndex] ?? 0) - share;
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
      if (roll > agent.propensity) {
        agent.active = true;
      }
    } else if (agent.energy < agent.threshold && roll > agent.propensity) {
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
    "triggered" | "triggeredIndex" | "triggeredEnergy" | "dissipatedEnergy" | "avalanche"
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
