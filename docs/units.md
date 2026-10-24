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

For gyms with a per-brand default (configured in branding), pass it as the fallback:

```typescript
import { getBranding } from "@/lib/branding";

const branding = getBranding();
const units = getUnitsPreference(profile.units, branding.defaultUnits);
// Returns profile.units if valid ('metric' or 'imperial')
// Otherwise returns branding.defaultUnits
// Falls back to 'metric' if branding.defaultUnits is also invalid
```

This allows each gym to set their own default units (e.g., US gyms default to imperial, European gyms default to metric), while still respecting each user's personal preference once set.

### Displaying Values

```typescript
// Weight: automatically converts and formats based on units preference
const displayWeight = formatWeight(profile.weight_kg, units);
// Metric:   "70 kg"
// Imperial: "154.5 lb" (rounded to nearest 0.5 lb)
// Missing:  "—" (em dash)

// Height: automatically converts and formats
const displayHeight = formatHeight(profile.height_cm, units);
// Metric:   "175 cm"
// Imperial: "5'9"" (feet and inches)
// Missing:  "—" (em dash)

// Without unit labels (for form inputs):
const weightValue = formatWeight(profile.weight_kg, units, false);
// Metric:   "70"
// Imperial: "154.5"

// Custom empty value for missing data:
const weightDisplay = formatWeight(profile.weight_kg, units, true, "");
// Missing:  "" (empty string)
const weightNA = formatWeight(profile.weight_kg, units, true, "N/A");
// Missing:  "N/A"
```

### Parsing User Input

```typescript
// Weight input (form submission)
const weight_kg = parseWeight(inputValue, units);
// Returns null for invalid input, otherwise canonical kg

// Height input (metric: single field)
const height_cm = parseHeight(inputValue, units);

// Height input (imperial: PREFERRED - separate feet/inches fields)
const height_cm = parseHeight(feetInput, "imperial", inchesInput);
// This is the recommended UI pattern for imperial height
// Separate inputs are clearer and less error-prone for users
// Inches must be < 12 (enforced: 5'12" is rejected, use 6'0")

// Height input (imperial: ALTERNATIVE - single string field)
// String parsing is supported but NOT the primary path
// Use separate fields for better UX; use this only for:
// - Backwards compatibility
// - Import/CSV parsing
// - Advanced users who prefer typing "5'9"
parseHeight("5'9\"", "imperial");      // ✓
parseHeight("5' 9\"", "imperial");     // ✓
parseHeight("5-9", "imperial");        // ✓
parseHeight("69 inches", "imperial");  // ✓ (total inches)

// Optional unit suffixes are accepted:
parseWeight("70kg", "metric");         // ✓
parseWeight("154.5 lb", "imperial");   // ✓
parseHeight("175cm", "metric");        // ✓
parseHeight("69 in", "imperial");      // ✓

// Strict parsing - these are REJECTED:
parseWeight("70abc", "metric");        // ✗ (trailing garbage)
parseHeight("5'12\"", "imperial");     // ✗ (inches >= 12)
parseWeight("0", "metric");            // ✗ (absurd: too small)
parseWeight("19", "metric");           // ✗ (absurd: <20 kg)
parseWeight("501", "metric");          // ✗ (absurd: >500 kg)
parseHeight("99", "metric");           // ✗ (absurd: <100 cm)
parseHeight("251", "metric");          // ✗ (absurd: >250 cm)

// Bounds aligned with server-side validation:
// Weight: 20-500 kg (~44-1100 lb)
// Height: 100-250 cm (~3'3"-8'2")
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

In split-input form (separate feet/inches fields), inches >= 12 are rejected to enforce proper input (use 6'0" not 5'12").

### Invalid Input Handling

All parsing functions return `null` for invalid input:
- Empty strings
- Zero or negative numbers
- `null` or `undefined`
- Non-numeric strings or trailing garbage
- Absurd values (weight outside 20–500 kg, height outside 100–250 cm)
- Bounds are aligned with server-side validation (PR #14)
- Imperial inches >= 12 in split-input form

All conversion functions return `0` for invalid input.

All formatting functions return an em dash `"—"` (or a custom empty value) for missing/invalid input:
- `null` or `undefined`
- Zero or negative numbers
- `NaN`

## Server-Side Usage

The helpers work in both client and server components:

```typescript
// Server component or API route
import { formatWeight, getUnitsPreference } from "@/lib/units";

const units = getUnitsPreference(profile.units);
const displayWeight = formatWeight(bodyMetric.weight_kg, units);
```

## Client-Side Usage

### Weight Input (Single Field)

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

### Height Input (Imperial: Split Fields - RECOMMENDED)

```typescript
"use client";
import { useState } from "react";
import { parseHeight, inchesToFeetAndInches, cmToIn } from "@/lib/units";

function HeightInputImperial({ initialCm }: Props) {
  const initial = inchesToFeetAndInches(cmToIn(initialCm));
  const [feet, setFeet] = useState(initial.feet.toString());
  const [inches, setInches] = useState(initial.inches.toString());

  const handleSubmit = () => {
    const feetNum = parseInt(feet, 10);
    const inchesNum = parseInt(inches, 10);
    
    const cm = parseHeight(feetNum, "imperial", inchesNum);
    if (cm == null) {
      // Handle invalid input (e.g. inches >= 12)
      return;
    }
    // Save cm to database
  };

  return (
    <div>
      <input 
        type="number" 
        value={feet} 
        onChange={(e) => setFeet(e.target.value)}
        placeholder="Feet"
      />
      <span>'</span>
      <input 
        type="number" 
        value={inches} 
        onChange={(e) => setInches(e.target.value)}
        placeholder="In"
        max="11"
      />
      <span>"</span>
    </div>
  );
}
```

### Height Input (Metric: Single Field)

```typescript
"use client";
import { useState } from "react";
import { parseHeight, formatHeight } from "@/lib/units";

function HeightInputMetric({ initialCm }: Props) {
  const [value, setValue] = useState(formatHeight(initialCm, "metric", false));

  const handleSubmit = () => {
    const cm = parseHeight(value, "metric");
    if (cm == null) {
      // Handle invalid input
      return;
    }
    // Save cm to database
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
- Invalid input handling (null, negative, absurd values)
- Display formatting (including em dash for missing values)
- Input parsing (all supported formats, strict parsing, unit suffixes)
- Rejection of trailing garbage ("70abc")
- Rejection of inches >= 12 in split form
- Rejection of absurd values (weight outside 20–500 kg, height outside 100–250 cm)
- Bounds aligned with server-side validation (PR #14)

## Future Work (Out of Scope for This PR)

- **Settings UI:** Toggle between metric and imperial in the Settings screen
- **Onboarding:** Ask for units preference during onboarding
- **Session Logger:** Display weights in the user's preferred units during workouts
- **Progress Charts:** Format chart axes and tooltips with the user's units
- **History:** Display past session weights in the user's preferred units
- **Body Metrics Log:** Accept and display weight in the user's preferred units

This foundation PR provides the conversion layer. Follow-up PRs will wire it into the UI.
