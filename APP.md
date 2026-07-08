GH Pages deploy via GH Action

Vite + React + TypeScript

* Reactangle where each pixel is an Agent.
  * Pixel color indicates state.
    * active
      * yellow/orange/red based on energy level
    * inactive
      * indigo/blue/green based on fuel level
* Control panel with sliders/inputs to adjust system parameters.
  * World variables: trigger rate, trigger magnitude, quiescence, dissipation, conversion, speed, history length
  * Agent variables are the defaults applied to each agent: threshold, activation probability, deactivation probability, resistance, vigor, variability
  * World runner
    * Auto/Step button
    * Speed slider
    * Reset button
