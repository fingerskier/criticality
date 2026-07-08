# Pseudocode - Self-Organizing Critical System Simulator

All floats are in `[0, 1]` unless noted.

----

## Object: Agent

```
Agent:
    # --- Schema (persistent parameters) ---
    fuel:                     float   # stored energy source; inactive agents refuel this
    threshold:                float   # energy above this level can activate or transfer
    activation_probability:   float   # P(activate) when energy > threshold
    deactivation_probability: float   # P(deactivate) when energy < threshold
    resistance:               float   # fraction of neighboring excess energy resisted
    vigor:                    float   # refuel (heal) rate; applies only while inactive

    # --- Computed / dynamic state ---
    energy:                   float   # current energy; from triggers + neighbors + own conversion
    active:                   bool    # true => converts fuel->energy and emits excess energy
```

### Rules
```
CONVERT(agent):                         # only when active
    if agent.fuel == 0:                 # caveat: no fuel => cannot stay active / activate
        agent.active = false
        return
    delta = min(agent.fuel, CONVERSION_RATE, 1 - agent.energy)
    agent.fuel   -= delta
    agent.energy += delta

REFUEL(agent):                          # only when inactive
    agent.fuel = clamp01(agent.fuel + agent.vigor)

MAYBE_FLIP(agent):
    r = rand()
    if agent.fuel == 0:
        agent.active = false
    else if agent.energy > agent.threshold:
        if r < agent.activation_probability:
            agent.active = true
    else if agent.energy < agent.threshold:
        if r < agent.deactivation_probability:
            agent.active = false
```

----

## Object: TriggerInput

```
TriggerInput:
    agent_index:      int       # target agent
    energy_per_step:  float     # energy added to the target each active step
    remaining_steps:  int       # 1..10 when created
```

----

## Object: World

```
World:
    grid:              Agent[W][H]
    trigger_inputs:    TriggerInput[]
    trigger_rate:      float          # base P(a new random input starts this iteration)
    trigger_magnitude: float          # maximum energy_per_step for a new input
    quiescence:        float          # suppresses new triggers as average energy rises
    dissipation_rate:  float          # fraction of energy lost to environment / loop
    history:           TimeSeries     # per-iteration metrics for visualization
```

### Neighborhood
```
NEIGHBORS(x, y):                      # Moore neighborhood, 8-connected
    for dx in {-1,0,1}, dy in {-1,0,1}:
        if (dx,dy) != (0,0) and in-bounds(x+dx, y+dy):
            yield grid[x+dx][y+dy]
```

----

## Algorithm: World.step()  (one loop iteration)

```
STEP(world):

    # 1. TRIGGERS - existing inputs plus possible new random input
    average_energy = mean(agent.energy for agent in grid)
    effective_trigger_rate = trigger_rate * (1 - quiescence * average_energy)

    if rand() < effective_trigger_rate:
        world.trigger_inputs.append({
            agent_index: random agent index,
            energy_per_step: rand() * trigger_magnitude,
            remaining_steps: 1 + floor(rand() * 10)    # clamped to 1..10
        })

    next_trigger_inputs = []
    for input in world.trigger_inputs:
        grid[input.agent_index].energy += input.energy_per_step
        input.remaining_steps -= 1
        if input.remaining_steps > 0:
            next_trigger_inputs.append(input)
    world.trigger_inputs = next_trigger_inputs

    # 2. CONVERT - active agents turn fuel into energy
    for each agent in grid:
        if agent.active:
            CONVERT(agent)

    # 3. ACTIVATION - decide active/inactive from the energy each agent
    #    currently holds, including trigger input energy, before neighbor transfer.
    #
    #    Order matters: if transfer runs first, low resistance can diffuse a
    #    trigger spike below threshold before it can activate the target.
    for each agent in grid:
        MAYBE_FLIP(agent)

    # 4. TRANSFER - active-only excess energy, computed from a start-of-phase snapshot.
    snapshot = copy(grid.energy, grid.threshold, grid.active)
    for each active source agent (x,y) in grid:
        excess = max(0, snapshot[source].energy - snapshot[source].threshold)
        if excess == 0:
            continue
        for target in NEIGHBORS(x,y):
            absorbed = (excess / 8) * (1 - target.resistance)
            target.energy += absorbed
            source.energy -= absorbed

    for each agent in grid:
        agent.energy = clamp01(agent.energy)

    # 5. DISSIPATION - leftover energy bled to the environment
    for each agent in grid:
        agent.energy -= agent.energy * world.dissipation_rate

    # 6. FUEL UPDATE - inactive agents heal
    for each agent in grid:
        if not agent.active:
            REFUEL(agent)

    # 7. DATA - record metrics for the time series
    world.history.append({
        active_count:          count(agent.active),
        total_energy:          sum(agent.energy),
        total_fuel:            sum(agent.fuel),
        active_trigger_count:  len(world.trigger_inputs),
        avalanche:             count of agents that switched inactive -> active this step,
    })
```

Notes
- Ordering is `trigger -> convert -> activate -> transfer -> dissipate -> refuel`.
- Transfer is order-independent because every source reads from the snapshot taken at the start of the transfer phase.
- Neighbor transfer is zero-sum for absorbed energy. New trigger inputs add energy; dissipation removes energy.
- Only active cells emit energy, and only excess energy above threshold can be emitted.

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
    slider trigger_magnitude
    slider quiescence
    slider dissipation_rate
    # Agent defaults (applied to every agent on reset)
    slider default_threshold
    slider activation_probability
    slider deactivation_probability
    slider resistance
    slider vigor

runner:
    button Auto / Step
    slider Speed
    button Reset
```

### Main loop (Auto mode)
```
loop every (1 / speed) seconds while running:
    STEP(world)
    render(world)
```

Deploy: static webapp -> GitHub Pages via GitHub Action.
