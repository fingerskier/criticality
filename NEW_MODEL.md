# New Model

Cell:
  # fixed parameters
  fuel:                # heat-energy source amount
  combustion_point:    # minimum temperature for combustion
  quench_point:        # maximum temperature at which it can burn
  resistance:          # fraction of neighbors heat resisted

  # computed parameters
  combustinon_probability:   # probability of combustion based on temperature and resistance and combustion_point
  temperature:               # heat build-up
  burning:                   # is hot enough to convert fuel -> heat;  emits excess heat

World:
  Cells don't refuel themselves, fuel gets added externally
  
