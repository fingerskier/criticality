export type RandomSource = () => number;

export interface SimulationParameters {
  width: number;
  height: number;
  initialPathologyProbability: number;
  externalTriggerProbability: number;
  neighborTriggerProbability: number;
  pathologyDamage: number;
  pathologyThreshold: number;
  recoveryRate: number;
  ticksPerSecond: number;
}

export interface SimulationStats {
  tick: number;
  averageHealth: number;
  pathologicalCount: number;
  pathologicalRatio: number;
  externalEvents: number;
  spreadEvents: number;
}

export interface SimulationState {
  width: number;
  height: number;
  health: number[];
  stats: SimulationStats;
}

export const DEFAULT_PARAMETERS: SimulationParameters = {
  width: 140,
  height: 90,
  initialPathologyProbability: 0.015,
  externalTriggerProbability: 0.08,
  neighborTriggerProbability: 0.18,
  pathologyDamage: 0.28,
  pathologyThreshold: 0.64,
  recoveryRate: 0.012,
  ticksPerSecond: 24
};

const NEIGHBOR_OFFSETS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
] as const;

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
  return Math.floor(Math.random() * 0xffff_ffff);
}

export function isPathological(
  health: number,
  parameters: Pick<SimulationParameters, "pathologyThreshold">
): boolean {
  return health <= parameters.pathologyThreshold;
}

export function healingProbabilityForCell(
  state: SimulationState,
  index: number,
  parameters: Pick<SimulationParameters, "pathologyThreshold">
): number {
  const health = state.health[index] ?? 1;

  if (!isPathological(health, parameters)) {
    return 1;
  }

  const neighbors = neighborIndicesFor(state, index);

  if (neighbors.length === 0) {
    return 0.5;
  }

  const healthyNeighbors = neighbors.filter(
    (neighborIndex) => !isPathological(state.health[neighborIndex] ?? 1, parameters)
  ).length;

  return clamp01((healthyNeighbors + 1) / (neighbors.length + 2));
}

export function createInitialState(
  parameters: SimulationParameters,
  random: RandomSource = Math.random
): SimulationState {
  const width = Math.max(1, Math.round(parameters.width));
  const height = Math.max(1, Math.round(parameters.height));
  const totalCells = width * height;
  const initialPathologyHealth = clamp01(
    Math.min(parameters.pathologyThreshold, 1 - parameters.pathologyDamage)
  );
  const health = Array.from({ length: totalCells }, () =>
    random() < parameters.initialPathologyProbability ? initialPathologyHealth : 1
  );

  return {
    width,
    height,
    health,
    stats: summarize(health, parameters, 0, 0, 0)
  };
}

export function measureSimulation(
  state: SimulationState,
  parameters: SimulationParameters
): SimulationStats {
  return summarize(
    state.health,
    parameters,
    state.stats.tick,
    state.stats.externalEvents,
    state.stats.spreadEvents
  );
}

export function stepSimulation(
  state: SimulationState,
  parameters: SimulationParameters,
  random: RandomSource = Math.random
): SimulationState {
  const totalCells = state.width * state.height;
  const damage = Array(totalCells).fill(0) as number[];
  let spreadEvents = 0;

  for (let index = 0; index < totalCells; index += 1) {
    if (!isPathological(state.health[index] ?? 1, parameters)) {
      continue;
    }

    for (const neighborIndex of neighborIndicesFor(state, index)) {
      if (
        parameters.neighborTriggerProbability > 0 &&
        random() < parameters.neighborTriggerProbability
      ) {
        damage[neighborIndex] += parameters.pathologyDamage;
        spreadEvents += 1;
      }
    }
  }

  const externalEvents =
    parameters.externalTriggerProbability > 0 &&
    random() < parameters.externalTriggerProbability
      ? 1
      : 0;
  if (externalEvents === 1) {
    const target = Math.min(totalCells - 1, Math.floor(random() * totalCells));
    damage[target] += parameters.pathologyDamage;
  }

  const nextHealth = state.health.map((health, index) => {
    const recovery = recoveryForCell(state, index, parameters, random);
    return clamp01(health + recovery - damage[index]);
  });

  return {
    width: state.width,
    height: state.height,
    health: nextHealth,
    stats: summarize(
      nextHealth,
      parameters,
      state.stats.tick + 1,
      externalEvents,
      spreadEvents
    )
  };
}

function recoveryForCell(
  state: SimulationState,
  index: number,
  parameters: SimulationParameters,
  random: RandomSource
): number {
  const health = state.health[index] ?? 1;

  if (parameters.recoveryRate <= 0 || health >= 1) {
    return 0;
  }

  if (!isPathological(health, parameters)) {
    return parameters.recoveryRate;
  }

  return random() < healingProbabilityForCell(state, index, parameters)
    ? parameters.recoveryRate
    : 0;
}

function neighborIndicesFor(state: SimulationState, index: number): number[] {
  const x = index % state.width;
  const y = Math.floor(index / state.width);
  const neighbors: number[] = [];

  for (const [dx, dy] of NEIGHBOR_OFFSETS) {
    const neighborX = x + dx;
    const neighborY = y + dy;

    if (
      neighborX < 0 ||
      neighborY < 0 ||
      neighborX >= state.width ||
      neighborY >= state.height
    ) {
      continue;
    }

    neighbors.push(neighborY * state.width + neighborX);
  }

  return neighbors;
}

function summarize(
  health: readonly number[],
  parameters: SimulationParameters,
  tick: number,
  externalEvents: number,
  spreadEvents: number
): SimulationStats {
  const totalHealth = health.reduce((sum, value) => sum + value, 0);
  const pathologicalCount = health.filter((value) =>
    isPathological(value, parameters)
  ).length;

  return {
    tick,
    averageHealth: health.length === 0 ? 1 : totalHealth / health.length,
    pathologicalCount,
    pathologicalRatio: health.length === 0 ? 0 : pathologicalCount / health.length,
    externalEvents,
    spreadEvents
  };
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}
