#!/bin/bash

# Fix all remaining unit references
for f in *.ts qa/*.ts; do
  [ -f "$f" ] || continue
  # Remove .unit property access
  sed -i 's/\(equipments\?\|eq\|e\)\.unit/"kg"/g' "$f"
  # Remove , unit from object destructuring
  sed -i 's/{ ids, unit }/{ ids }/g' "$f"
  # Remove unit: from objects in function calls
  sed -i '/^\s*unit: /d' "$f"
  # Fix suggestedWeight calls with 5 args (assuming last two are equipmentIds and unit)
  sed -i 's/suggestedWeight(\([^,]*\), \([^,]*\), \([^,]*\), \([^)]*\), "[^"]*")/suggestedWeight(\1, \2, \3, \4)/g' "$f"
done

echo "Fixed remaining unit references"
