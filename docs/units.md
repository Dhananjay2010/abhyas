# Imperial Units Support

Foundation layer for displaying and parsing weight and height in imperial units (pounds and feet/inches).

## Database Schema

The database stores all measurements in **metric units** (kg and cm). This is the canonical format and never changes.

The user's preference is stored in `profiles.units` as either `'metric'` (default) or `'imperial'`.

## Using the Conversion Helpers

Import from `src/lib/units.ts`:

```typescript
import {
  formatWeight,
  formatHeight,
  parseWeight,
  parseHeight,
  getUnitsPreference,
  weightLabel,
  heightLabel,
} from "@/lib/units";
```

### Reading the User's Preference

Always use the safe accessor, which defaults to metric if the preference is missing:

```typescript
const units = getUnitsPreference(profile.units);
```

### Displaying Values

```typescript
// Weight: automatically converts and formats based on units preference
const displayWeight = formatWeight(profile.weight_kg, units);
// Metric:   "70 kg"
// Imperial: "154.5 lb" (rounded to nearest 0.5 lb)

// Height: automatically converts and formats
const displayHeight = formatHeight(profile.height_cm, units);
// Metric:   "175 cm"
// Imperial: "5'9"" (feet and inches)

// Without unit labels (for form inputs):
const weightValue = formatWeight(profile.weight_kg, units, false);
// Metric:   "70"
// Imperial: "154.5"
```

### Parsing User Input

```typescript
// Weight input (form submission)
const weight_kg = parseWeight(inputValue, units);
// Returns null for invalid input, otherwise canonical kg

// Height input (metric: single field)
const height_cm = parseHeight(inputValue, units);

// Height input (imperial: separate feet/inches fields)
const height_cm = parseHeight(feetInput, units, inchesInput);

// Imperial height also accepts string formats:
parseHeight("5'9\"", "imperial");   // ✓
parseHeight("5' 9\"", "imperial");  // ✓
parseHeight("5-9", "imperial");     // ✓
parseHeight("69", "imperial");      // ✓ (total inches)
```

### Unit Labels

For form labels and placeholders:

```typescript
const weightLabelText = weightLabel(units); // "kg" or "lb"
const heightLabelText = heightLabel(units); // "cm" or "ft'in""
```

## Round-Trip Stability

The conversion is designed so that a stored value displayed and then re-entered **without change** produces the same stored value:

```typescript
const originalKg = 70;
const displayed = formatWeight(originalKg, "imperial", false); // "154.5"
const parsedKg = parseWeight(displayed, "imperial");           // 70.0 kg
```

This is achieved by:
- **Weight:** Rounding pounds to the nearest 0.5 lb in both display and parsing
- **Height:** Rounding to whole inches before display and during parsing

## Implementation Notes

### Imperial Weight Rounding

Pounds are rounded to the nearest **0.5 lb** for display:
- 154.2 lb → 154.0 lb
- 154.3 lb → 154.5 lb
- 154.7 lb → 154.5 lb
- 154.8 lb → 155.0 lb

### Imperial Height Rounding

Inches are rounded to **whole inches**, with proper carry at 12:
- 71.4 inches → 5'11"
- 71.6 inches → 6'0" (carry)
- 72.0 inches → 6'0"

### Invalid Input Handling

All parsing functions return `null` for invalid input:
- Empty strings
- Negative numbers
- `null` or `undefined`
- Non-numeric strings

All conversion functions return `0` for invalid input.

## Server-Side Usage

The helpers work in both client and server components:

```typescript
// Server component or API route
import { formatWeight, getUnitsPreference } from "@/lib/units";

const units = getUnitsPreference(profile.units);
const displayWeight = formatWeight(bodyMetric.weight_kg, units);
```

## Client-Side Usage

```typescript
"use client";
import { useState } from "react";
import { parseWeight, formatWeight } from "@/lib/units";

function WeightInput({ initialKg, units }: Props) {
  const [value, setValue] = useState(formatWeight(initialKg, units, false));

  const handleSubmit = () => {
    const kg = parseWeight(value, units);
    if (kg == null) {
      // Handle invalid input
      return;
    }
    // Save kg to database
  };

  return <input type="text" value={value} onChange={(e) => setValue(e.target.value)} />;
}
```

## Testing

Run the unit tests:

```bash
npm run test:units
```

The test suite covers:
- Weight and height conversion in both directions
- Rounding edge cases (0.5 lb increments, 12-inch carry)
- Round-trip stability
- Invalid input handling
- Display formatting
- Input parsing (all supported formats)

## Future Work (Out of Scope for This PR)

- **Settings UI:** Toggle between metric and imperial in the Settings screen
- **Onboarding:** Ask for units preference during onboarding
- **Session Logger:** Display weights in the user's preferred units during workouts
- **Progress Charts:** Format chart axes and tooltips with the user's units
- **History:** Display past session weights in the user's preferred units
- **Body Metrics Log:** Accept and display weight in the user's preferred units

This foundation PR provides the conversion layer. Follow-up PRs will wire it into the UI.
