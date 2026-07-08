import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  clamp01,
  createSeededRandom,
  createWorld,
  stepWorld,
  type Agent,
  type RandomSource,
  type WorldParameters
} from "./criticality";

function sequence(values: number[], fallback = 0): RandomSource {
  let index = 0;
  return () => values[index++] ?? fallback;
}

const baseParameters: WorldParameters = {
  ...DEFAULT_PARAMETERS,
  width: 3,
  height: 3,
  triggerRate: 0,
  triggerMagnitude: 0,
  dissipationRate: 0,
  conversionRate: 0,
  defaultThreshold: 0.5,
  defaultPropensity: 1,
  defaultCoupling: 1,
  defaultVigor: 0,
  variability: 0,
  ticksPerSecond: 10,
  maxHistory: 32
};

function agentAt(world: ReturnType<typeof createWorld>, index: number): Agent {
  const agent = world.agents[index];

  if (!agent) {
    throw new Error(`Missing agent at index ${index}`);
  }

  return agent;
}

function replaceAgent(world: ReturnType<typeof createWorld>, index: number, patch: Partial<Agent>) {
  world.agents[index] = { ...agentAt(world, index), ...patch };
}

describe("criticality simulation", () => {
  it("clamps normalized values to the 0..1 range", () => {
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(1.2)).toBe(1);
  });

  it("creates a rectangular world with random initial fuel levels from 0 to 0.5", () => {
    const world = createWorld(
      baseParameters,
      sequence([0, 0.25, 0.5, 0.75, 1], 0.2)
    );

    expect(world.width).toBe(3);
    expect(world.height).toBe(3);
    expect(world.agents).toHaveLength(9);
    expect(world.agents.slice(0, 5).map((agent) => agent.fuel)).toEqual([
      0, 0.125, 0.25, 0.375, 0.5
    ]);
    expect(world.agents.every((agent) => agent.fuel >= 0 && agent.fuel <= 0.5)).toBe(true);
    expect(world.agents.every((agent) => agent.energy === 0)).toBe(true);
    expect(world.agents.every((agent) => agent.active === false)).toBe(true);
    expect(world.history[0]).toMatchObject({ tick: 0, activeCount: 0 });
  });

  it("bumps each agent default by a symmetric random offset scaled by variability", () => {
    const params = {
      ...baseParameters,
      width: 1,
      height: 1,
      defaultThreshold: 0.5,
      defaultPropensity: 0.5,
      defaultCoupling: 0.5,
      defaultVigor: 0.05,
      variability: 0.2
    };

    // Draw order per agent: fuel, threshold, propensity, coupling, vigor.
    const agent = agentAt(createWorld(params, sequence([0.5, 0.75, 0.25, 1, 0])), 0);

    expect(agent.fuel).toBeCloseTo(0.25); // clamp01(0.5) * INITIAL_FUEL_MAX
    expect(agent.threshold).toBeCloseTo(0.6); // 0.5 + (0.75*2-1)*0.2
    expect(agent.propensity).toBeCloseTo(0.4); // 0.5 + (0.25*2-1)*0.2
    expect(agent.coupling).toBeCloseTo(0.7); // 0.5 + (1*2-1)*0.2
    expect(agent.vigor).toBe(0); // 0.05 + (0*2-1)*0.2 = -0.15 -> clamped
  });

  it("keeps agent defaults homogeneous and draws only fuel when variability is zero", () => {
    const params = { ...baseParameters, width: 2, height: 1 };
    const world = createWorld(params, sequence([0.4, 0.8], 0));

    // Only fuel consumes a draw per agent, so both fuels track the sequence.
    expect(world.agents.map((agent) => agent.fuel)).toEqual([0.2, 0.4]);
    expect(world.agents.every((agent) => agent.threshold === baseParameters.defaultThreshold)).toBe(true);
    expect(world.agents.every((agent) => agent.propensity === baseParameters.defaultPropensity)).toBe(true);
    expect(world.agents.every((agent) => agent.coupling === baseParameters.defaultCoupling)).toBe(true);
  });

  it("applies a random external trigger to one agent using trigger magnitude as a maximum", () => {
    const params = {
      ...baseParameters,
      triggerRate: 1,
      triggerMagnitude: 0.5,
      defaultCoupling: 0
    };
    const world = createWorld(params);

    const next = stepWorld(world, params, sequence([0, 0.8, 0.6], 0));

    expect(next.agents.map((agent) => agent.energy)).toEqual([
      0, 0, 0,
      0, 0, 0,
      0, 0.3, 0
    ]);
    expect(next.stats.triggered).toBe(true);
    expect(next.stats.triggeredIndex).toBe(7);
    expect(next.stats.triggeredEnergy).toBeCloseTo(0.3);
  });

  it("moves neighbor energy with an order-independent Moore-neighborhood snapshot", () => {
    const world = createWorld(baseParameters);
    replaceAgent(world, 4, { energy: 0.8, coupling: 0 });

    const next = stepWorld(world, baseParameters, sequence([], 0));

    expect(next.agents.map((agent) => agent.energy)).toEqual([
      0.1, 0.1, 0.1,
      0.1, 0, 0.1,
      0.1, 0.1, 0.1
    ]);
    expect(next.stats.totalEnergy).toBeCloseTo(0.8);
  });

  it("lets active agents convert fuel into energy, then dissipates energy", () => {
    const params = {
      ...baseParameters,
      width: 1,
      height: 1,
      defaultCoupling: 0,
      conversionRate: 0.25,
      dissipationRate: 0.5
    };
    const world = createWorld(params);
    replaceAgent(world, 0, { active: true, energy: 0.2, fuel: 0.4, threshold: 0.1 });

    const next = stepWorld(world, params, sequence([], 0));

    expect(agentAt(next, 0).fuel).toBeCloseTo(0.15);
    expect(agentAt(next, 0).energy).toBeCloseTo(0.225);
    expect(agentAt(next, 0).active).toBe(true);
    expect(next.stats.dissipatedEnergy).toBeCloseTo(0.225);
  });

  it("activates above threshold, deactivates below threshold, and refuses activation without fuel", () => {
    const params = {
      ...baseParameters,
      width: 1,
      height: 1,
      defaultCoupling: 0,
      defaultPropensity: 0
    };

    const energised = createWorld(params);
    replaceAgent(energised, 0, { energy: 0.8, fuel: 0.2, threshold: 0.5, propensity: 0 });
    expect(agentAt(stepWorld(energised, params, sequence([], 0.5)), 0).active).toBe(true);

    const depleted = createWorld(params);
    replaceAgent(depleted, 0, { energy: 0.8, fuel: 0, threshold: 0.5, propensity: 0 });
    expect(agentAt(stepWorld(depleted, params, sequence([], 0.5)), 0).active).toBe(false);

    const cooling = createWorld(params);
    replaceAgent(cooling, 0, { active: true, energy: 0.1, fuel: 0.2, threshold: 0.5, propensity: 0 });
    expect(agentAt(stepWorld(cooling, params, sequence([], 0.5)), 0).active).toBe(false);
  });

  it("activates a trigger's target before neighbor coupling drains its energy", () => {
    // Root-cause regression: a cell holding enough energy to cross its threshold
    // must be allowed to activate before that energy is shed to neighbors. With
    // strong coupling the old ordering diffused the spike away first, so the cell
    // could never fire even though it briefly held plenty of energy.
    const params = {
      ...baseParameters,
      triggerRate: 0,
      triggerMagnitude: 0,
      dissipationRate: 0,
      conversionRate: 0,
      defaultCoupling: 1,
      defaultThreshold: 0.1,
      defaultPropensity: 0
    };
    const world = createWorld(params);
    replaceAgent(world, 4, { energy: 0.5, fuel: 0.2, threshold: 0.1, propensity: 0, coupling: 1 });

    const next = stepWorld(world, params, sequence([], 0.5));

    expect(agentAt(next, 4).active).toBe(true);
    expect(next.stats.activeCount).toBeGreaterThan(0);
  });

  it("produces visible activation from random triggers under the shipped defaults", () => {
    // End-to-end guard for the report "triggers occur but nothing activates":
    // an auto run with DEFAULT_PARAMETERS must actually light up agents.
    const params = { ...DEFAULT_PARAMETERS, width: 48, height: 32, maxHistory: 16 };
    const random = createSeededRandom(12345);
    let world = createWorld(params, random);
    let peakActive = 0;

    for (let tick = 0; tick < 400; tick += 1) {
      world = stepWorld(world, params, random);
      peakActive = Math.max(peakActive, world.stats.activeCount);
    }

    expect(peakActive).toBeGreaterThan(0);
  });

  it("refuels inactive agents and keeps bounded history", () => {
    const params = { ...baseParameters, defaultVigor: 0.2, maxHistory: 2 };
    let world = createWorld(params);
    replaceAgent(world, 0, { fuel: 0.9, vigor: 0.2 });

    world = stepWorld(world, params, sequence([], 0));
    world = stepWorld(world, params, sequence([], 0));

    expect(agentAt(world, 0).fuel).toBe(1);
    expect(world.history).toHaveLength(2);
    expect(world.history.map((entry) => entry.tick)).toEqual([1, 2]);
  });

  it("creates deterministic random streams for reproducible simulations", () => {
    const a = createSeededRandom(1234);
    const b = createSeededRandom(1234);

    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
