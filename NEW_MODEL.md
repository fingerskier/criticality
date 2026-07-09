# New Model

```
Cell:
  # fixed parameters
  fuel:                # heat-energy source amount
  combustion_point:    # minimum temperature for combustion
  quench_point:        # maximum temperature at which it can burn

  # computed parameters
  combustion_probability:  # probability of combustion based on temperature and resistance and combustion_point
  temperature:             # heat build-up
  activation:              # is hot enough to convert fuel -> heat;  emits excess heat
```
* activation
  * temperature > combustion_point -> activation rises
  * temperature < quench_point -> activatino lowers
* exhausted heat ~= temperature * activation

World:
  Cells don't refuel themselves, fuel gets added externally

