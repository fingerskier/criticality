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

    const x = index % state.width;
    const y = Math.floor(index / state.width);

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

      if (random() < parameters.neighborTriggerProbability) {
        damage[neighborY * state.width + neighborX] += parameters.pathologyDamage;
        spreadEvents += 1;
      }
    }
  }

  const externalEvents = random() < parameters.externalTriggerProbability ? 1 : 0;
  if (externalEvents === 1) {
    const target = Math.min(totalCells - 1, Math.floor(random() * totalCells));
    damage[target] += parameters.pathologyDamage;
  }

  const nextHealth = state.health.map((health, index) =>
    clamp01(health + parameters.recoveryRate - damage[index])
  );

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
