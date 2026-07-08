# Pseudocode — Self-Organizing Critical System Simulator

All floats in `[0, 1]` unless noted.

----

## Object: Agent

```
Agent:
    # --- Schema (persistent parameters) ---
    fuel:       float   # stored energy source; inactive agents refuel this
    threshold:  float   # energy level at/above which activation is possible
    propensity: float   # P(active/state flip) once energy is on the right side of threshold
    coupling:   float   # fraction of neighbors' released energy absorbed
    vigor:      float   # refuel (heal) rate; applies only while inactive

    # --- Computed / dynamic state ---
    energy:     float   # current energy; from neighbors + own conversion when active
    active:     bool    # true => converts fuel->energy and sheds energy to neighbors
```

### Rules
```
CONVERT(agent):                 # only when active
    if agent.fuel == 0:         # caveat: no fuel => cannot stay active / activate
        agent.active = false
        return
    delta = min(agent.fuel, CONVERSION_RATE, 1 - agent.energy)  # keep energy <= 1
    agent.fuel   -= delta
    agent.energy += delta

REFUEL(agent):                  # only when inactive
    agent.fuel = clamp01(agent.fuel + agent.vigor)

MAYBE_FLIP(agent):
    r = rand()                  # uniform [0,1)
    if agent.energy > agent.threshold:
        if agent.fuel > 0 and r > agent.propensity:
            agent.active = true
    else:  # energy < threshold
        if r > agent.propensity:
            agent.active = false
```

----

## Object: World

```
World:
    grid:            Agent[W][H]      # each cell is one Agent (one pixel)
    trigger_rate:      float          # P(a random spike event this iteration)
    trigger_magnitude: fn -> float    # energy added on trigger (rand / sigmoid / ...)
    dissipation_rate:  float          # fraction of energy lost to environment / loop
    history:         TimeSeries       # per-iteration metrics for visualization
```

### Neighborhood
```
NEIGHBORS(x, y):                      # Moore neighborhood, 8-connected
    for dx in {-1,0,1}, dy in {-1,0,1}:
        if (dx,dy) != (0,0) and in-bounds(x+dx, y+dy):
            yield grid[x+dx][y+dy]
    # edge/corner cells simply have fewer neighbors
```

----

## Algorithm: World.step()  (one loop iteration)

```
STEP(world):

    # 1. TRIGGERS — random external excitation
    if rand() < world.trigger_rate:
        a = random agent in grid
        a.energy = clamp01(a.energy + world.trigger_magnitude())

    # 2. CONVERT — active agents turn fuel into energy
    for each agent in grid:
        if agent.active:
            CONVERT(agent)

    # 3. ACTIVATION — decide active/inactive from the energy each agent
    #    CURRENTLY holds (including a fresh trigger), BEFORE any energy is
    #    shed to neighbors.
    #
    #    Order matters: if the neighbor transfer (step 4) runs first, coupling
    #    diffuses a trigger's spike across its 8 neighbors and drops it back
    #    below the threshold, so no agent ever activates. Deciding activation
    #    before the transfer is what makes triggers able to fire a cell.
    for each agent in grid:
        MAYBE_FLIP(agent)

    # 4. TRANSFER — neighbor coupling, computed from a start-of-phase snapshot
    #    so the result is independent of grid scan order.
    snapshot = copy(grid.energy)          # energies at start of this phase
    for each agent (x,y) in grid:
        for n in NEIGHBORS(x,y):
            share = (snapshot[n] / 8) * agent.coupling
            agent.energy += share
            n.energy     -= share         # zero-sum: neighbor loses the same
    for each agent in grid:
        agent.energy = clamp01(agent.energy)

    # 5. DISSIPATION — leftover energy bled to the environment
    for each agent in grid:
        agent.energy -= agent.energy * world.dissipation_rate

    # 6. FUEL UPDATE — inactive agents heal
    for each agent in grid:
        if not agent.active:
            REFUEL(agent)

    # 7. DATA — record metrics for the time series
    world.history.append({
        active_count:  count(agent.active),
        total_energy:  sum(agent.energy),
        total_fuel:    sum(agent.fuel),
        avalanche:     count of agents that switched inactive -> active this step,
    })
```

Notes
- Ordering (trigger -> convert -> activate -> transfer -> dissipate -> refuel):
  activation is evaluated on the energy a cell holds BEFORE the neighbor
  transfer. Running the transfer first diffuses a trigger below threshold and
  nothing ever activates. See the note on step 3.
- "Order-independent" transfer = each agent's share is read from a snapshot of
  neighbor energy taken at the start of the phase, so a cell's new energy does
  not depend on grid scan order.
- Energy conservation: neighbor transfer is zero-sum; only `dissipation_rate`
  and `trigger_magnitude` change total system energy.

----

## Object: App (visualization + controls)

```
render(world):
    for each agent (x,y):
        if agent.active:
            pixel = heat_ramp(agent.energy)     # yellow -> orange -> red
        else:
            pixel = cool_ramp(agent.fuel)       # indigo -> blue -> green
    blit pixels to canvas
    draw world.history charts

controls:
    # World variables
    slider trigger_rate
    slider trigger_magnitude params
    slider dissipation_rate
    # Agent defaults (applied to every agent on reset)
    slider default_threshold, propensity, coupling, vigor

runner:
    button  Auto / Step        # continuous loop vs single STEP(world)
    slider  Speed              # iterations per second when Auto
    button  Reset              # rebuild grid with current agent defaults
```

### Main loop (Auto mode)
```
loop every (1 / speed) seconds while running:
    STEP(world)
    render(world)
```

Deploy: static webapp -> GitHub Pages via GitHub Action.
```
