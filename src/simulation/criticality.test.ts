import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  createInitialState,
  isPathological,
  stepSimulation,
  type RandomSource,
  type SimulationParameters
} from "./criticality";

const baseParams: SimulationParameters = {
  ...DEFAULT_PARAMETERS,
  width: 3,
  height: 3,
  initialPathologyProbability: 0,
  externalTriggerProbability: 0,
  neighborTriggerProbability: 0,
  pathologyDamage: 0.25,
  pathologyThreshold: 0.5,
  recoveryRate: 0,
  ticksPerSecond: 10
};

function sequence(values: number[]): RandomSource {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe("criticality simulation", () => {
  it("creates a healthy grid with the requested dimensions", () => {
    const state = createInitialState(baseParams, sequence([]));

    expect(state.width).toBe(3);
    expect(state.height).toBe(3);
    expect(state.health).toHaveLength(9);
    expect([...state.health]).toEqual(Array(9).fill(1));
    expect(state.stats.pathologicalCount).toBe(0);
  });

  it("marks cells at or below the pathology threshold as pathological", () => {
    expect(isPathological(0.5, baseParams)).toBe(true);
    expect(isPathological(0.5001, baseParams)).toBe(false);
  });

  it("applies external pathology events to one random item", () => {
    const params = { ...baseParams, externalTriggerProbability: 1 };
    const state = createInitialState(params, sequence([]));
    const next = stepSimulation(state, params, sequence([0.1, 0.8]));

    expect([...next.health]).toEqual([1, 1, 1, 1, 1, 1, 1, 0.75, 1]);
    expect(next.stats.tick).toBe(1);
    expect(next.stats.externalEvents).toBe(1);
  });

  it("lets pathological cells increase pathology in all adjacent neighbors", () => {
    const params = {
      ...baseParams,
      neighborTriggerProbability: 1,
      pathologyDamage: 0.1
    };
    const state = createInitialState(params, sequence([]));
    state.health[4] = 0.4;

    const next = stepSimulation(state, params, sequence([]));

    expect([...next.health]).toEqual([
      0.9, 0.9, 0.9,
      0.9, 0.4, 0.9,
      0.9, 0.9, 0.9
    ]);
    expect(next.stats.spreadEvents).toBe(8);
  });

  it("heals cells over time and clamps health to one", () => {
    const params = { ...baseParams, recoveryRate: 0.2 };
    const state = createInitialState(params, sequence([]));
    state.health[0] = 0.95;
    state.health[1] = 0.25;

    const next = stepSimulation(state, params, sequence([]));

    expect(next.health[0]).toBe(1);
    expect(next.health[1]).toBeCloseTo(0.45);
  });
});
