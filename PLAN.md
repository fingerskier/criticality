Self-Organizing Critical System Simulator
----

General Algorithm
* Agent 
  * Schema
    * fuel
      * an inactive agent refuels
    * threshold
      * energy-level at which agent may activate (i.e. converts to energy)
    * propensity
      * probability of activating when energy > threshold
      * also, probability of deactivating when energy < threshold
    * coupling
      * proportion of neighbors' released energy that gets absorbed
    * vigor
      * refuel rate (healing)
      * inactive agents will automatically refuel
      * active agent do not refuel
  * Computed properties
    * energy
      * absorbed from neighbors
      * an _active_ agent will convert fuel to energy
      * an _inactive_ agent will not convert fuel to energy
    * active
      * if active then it converts fuel to energy
      * if active some energy is transferred to neighbors
  * Caveats
    * fuel == 0 then agent cannot activate
* World
  * Loop
    1. Triggers ~ a random event can increase an Agent's energy by a random amount
    2. Async update of Agents' computed properties
      * conversion
        * an _active_ Agent converts some fuel to energy
      * activation
        * evaluated on the energy each Agent currently holds (including a fresh
          trigger) _before_ any energy is transferred to neighbors
        * if an agent's energy > threshold then rand() > propensity triggers activation
        * if an agent's energy < threshold then rand() > propensity triggers deactivation
        * ordering matters: if the transfer ran first, coupling would diffuse a
          trigger below the threshold and no Agent would ever activate
      * transferred energy
        * an Agent gets 1/8 of each neighbor's energy multiplied by its coupling
        * the neighbor's energy is reduced by the same amount
      * dissipation
        * dissipated_energy = leftover_energy * dissipation_rate
    3. Update Agents' fuel levels
  * Variables
    * trigger_rate
      * probability of a random event occurring
    * trigger_magnitude
      * calculation used to determine how much energy is added to a random Agent when a trigger occurs (rand, sigmoid, etc.)
    * dissipation_rate
      * proportion of energy lost to the environment each loop iteration
  * Caveats
    * Each Agent has 8 neighbors (except for the edges of the world)
  * Data
    * data is collected each loop iteration and stored in a time-series for visualization

All variables are 0-1 float.

----

App
* Visualize a reactangle where each pixel is an Agent.
* Pixel color indicates state.
  * active
    * yellow/orange/red based on energy level
  * inactive
    * indigo/blue/green based on fuel level
* Give a panel with sliders/inputs to adjust system parameters.
  * World variables
  * Agent variables are the defaults applied to each agent
* World runner
  * Auto/Step button
  * Speed slider
  * Reset button
* Deploy as a webapp to GH Pages via GH Action
