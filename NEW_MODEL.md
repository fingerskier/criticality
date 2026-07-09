# New Model

```
Cell:
  # fixed parameters
  fuel:                # heat-energy source amount
  combustion_point:    # minimum temperature for combustion
  conductivity:        # fraction of heat transferred to neighbors

  # computed parameters
  activation:              # fuel -> heat  conversion
  temperature:             # heat build-up;  dTemp = activation * temperature
```
* activation
  * temperature > combustion_point
    * activation rises
  * temperature < combustion_point
    * activation lowers
  * effects
    * temperature += activation * temperature 
    * fuel -= activation * temparture
* exhausted heat
  * each neighbor gets  dTemp = 1/8 * temperature * conductivity

World:
  * Fuel
    * fuel gets added externally
    * like an initialization state;  similar to context but throughout the model
  * Temperature
    * communication between cells via heat
  * Training
    * Input
      * Cell fuel levels
      * External heating of cells
    * Outputs
      * Primarily reading cell temperatures
      * Secondarily reading cell fuel-levels
    * Process
      1. Load fuel
      2. Inject heat at specific "input" cells
      3. Read heat at specific "output" cells
      4. Update intermediate cells (those on the direct paths between in/out cells) to push the output temperature toward expected values
      5. Iterate to 3 until close enough
      6. Iterate to 2 to train variants
      7. Iterate to 1 to train diff corpii
    * Example
      * Say each number from 0-1 represents an English word
      * We could pre-load the entire network with fuel corresponding to some corpus of information
      * Inject a "prompt" phrase into a subset of input cells
      * The values of the output cells can be decoded into a phrase
