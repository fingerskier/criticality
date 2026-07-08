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
    delta = min(agent.fuel, CONVERSION_RATE)
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

    # 2. ASYNC UPDATE of computed properties
    #    Read from a snapshot so transfers are order-independent.
    snapshot = copy(grid.energy)      # energies at start of this phase

    for each agent (x,y) in grid:

        # 2a. energy transfer from neighbors
        for n in NEIGHBORS(x,y):
            share    = (snapshot[n] / 8) * agent.coupling
            absorbed = min(share, n.energy)   # can't take more than neighbor holds
            agent.energy += absorbed
            n.energy     -= absorbed          # neighbor loses the same amount

        # 2b. active agents convert fuel -> energy
        if agent.active:
            CONVERT(agent)

        # 2c. activation / deactivation
        MAYBE_FLIP(agent)

    # 2d. dissipation — leftover energy bled to environment
    for each agent in grid:
        dissipated    = agent.energy * world.dissipation_rate
        agent.energy -= dissipated

    # 3. FUEL UPDATE — inactive agents heal
    for each agent in grid:
        if not agent.active:
            REFUEL(agent)

    # 4. DATA — record metrics for the time series
    world.history.append({
        active_count:  count(agent.active),
        total_energy:  sum(agent.energy),
        total_fuel:    sum(agent.fuel),
        avalanche:     size of this iteration's activation cascade,
    })
```

Notes
- "Async" = each agent updated against a snapshot of neighbor energy, so a
  cell's fate does not depend on grid scan order.
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
