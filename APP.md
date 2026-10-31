GH Pages deploy via GH Action

Vite + React + TypeScript

* Reactangle where each pixel is an Agent.
  * Pixel color indicates state.
    * active
      * yellow/orange/red based on energy level
    * inactive
      * indigo/blue/green based on fuel level
* Fits one desktop screen (best effort); stacks and scrolls on narrow screens.
* GitHub corner linking to the repository.
* Control panel with sliders/inputs to adjust system parameters.
  * Every change applies to the live world immediately; Reset is only for restarting from the seed.
  * World variables: trigger rate, trigger magnitude, quiescence, dissipation, conversion, speed, history length
  * Agent variables are the defaults applied to each agent: threshold, activation probability, deactivation probability, resistance, vigor, variability
  * World runner
    * Run/Pause, Step, Reset buttons
    * Speed slider
  * Scenario picker: built-in presets (parameters + seed) and saved setups; selecting one applies it at once
