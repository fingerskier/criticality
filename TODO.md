Completed 2026-07-08:

- [x] Only active cells emit energy.
- [x] Only excess energy above the source threshold propagates.
- [x] Agent property variability is multiplicative instead of additive.
- [x] Propensity is split into activation probability and deactivation probability.
- [x] Coupling is replaced by resistance.
- [x] Added quiescence so new triggers happen less frequently at higher average energy.
- [x] Trigger inputs last a random 1-10 steps.

Implemented via red/green TDD in `src/simulation/criticality.test.ts`; docs updated in `README.md`, `PLAN.md`, `PSEUDOCODE.md`, and `APP.md`.
