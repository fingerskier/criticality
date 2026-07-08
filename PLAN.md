Self-Organizing Critical System Simulator
----

General Algorithm
* Agent
  * Schema
    * fuel
      * an inactive agent refuels
    * threshold
      * energy level at which activation may occur
      * active agents retain energy up to this level before neighbor transfer
    * activation_probability
      * probability of activating when energy > threshold
    * deactivation_probability
      * probability of deactivating when energy < threshold
    * resistance
      * fraction of neighboring excess energy resisted instead of absorbed
    * vigor
      * refuel rate (healing)
      * inactive agents automatically refuel
      * active agents do not refuel
  * Computed properties
    * energy
      * absorbed from neighbors
      * added by active trigger inputs
      * an _active_ agent converts fuel to energy
      * an _inactive_ agent does not convert fuel to energy
    * active
      * if active then it converts fuel to energy
      * if active then only its excess energy above threshold can transfer to neighbors
  * Caveats
    * fuel == 0 means an agent cannot activate
    * inactive agents do not emit energy to neighbors
* World
  * Loop
    1. Triggers
      * existing trigger inputs add their energy to their target agents
      * a new random trigger input may start on a random agent
      * a trigger input lasts a random duration from 1 to 10 steps
      * effective trigger rate = trigger_rate * (1 - quiescence * average_energy)
    2. Async update of Agents' computed properties
      * conversion
        * an _active_ Agent converts some fuel to energy
      * activation
        * evaluated on the energy each Agent currently holds (including trigger inputs) _before_ any energy is transferred to neighbors
        * if an agent's energy > threshold then rand() < activation_probability triggers activation
        * if an agent's energy < threshold then rand() < deactivation_probability triggers deactivation
        * ordering matters: if the transfer ran first, low resistance would diffuse a trigger below the threshold and no Agent would ever activate
      * transferred energy
        * only active Agents emit energy
        * only energy above the source Agent's threshold is eligible to transfer
        * a neighbor absorbs 1/8 of that excess multiplied by (1 - neighbor.resistance)
        * the source Agent loses exactly the amount absorbed by neighbors
      * dissipation
        * dissipated_energy = leftover_energy * dissipation_rate
    3. Update Agents' fuel levels
  * Variables
    * trigger_rate
      * base probability of a new random trigger input starting
    * trigger_magnitude
      * maximum energy added by a trigger input each step
    * quiescence
      * suppresses new trigger inputs as average world energy rises
    * dissipation_rate
      * proportion of energy lost to the environment each loop iteration
  * Caveats
    * Each Agent has 8 neighbors except for the edges of the world
  * Data
    * data is collected each loop iteration and stored in a time-series for visualization

All variables are 0-1 floats unless otherwise noted.

----

App
* Visualize a rectangle where each pixel is an Agent.
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
