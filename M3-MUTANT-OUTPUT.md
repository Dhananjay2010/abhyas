# M3 Mutant Test Output

## Test: History edit save path must convert lb to kg

### Mutant Applied
Removed the `displayToKg` conversion in `src/app/history/[id]/edit-sets.tsx`:

```diff
- if (field === "weight_kg" && numValue !== null) {
-   const kgValue = displayToKg(numValue, units);
-   numValue = kgValue;
- }
+ // Mutant: conversion removed
```

### Test Result: FAIL (Mutant Killed)

```
M3: History edit save path must convert lb to kg

1. Checking edit-sets.tsx for conversion logic:
   ❌ FAIL: displayToKg not found in handleSetChange for weight_kg field
```

The test correctly detects that the conversion is missing. This proves that:
1. The test reads the actual component code to verify the conversion is wired
2. When the conversion is removed (mutant), the test fails immediately
3. The save path is properly tested, not just `displayToKg` in isolation

**Mutant verdict: KILLED ✓**

The test `scripts/test-units-history-edit-save-path.tsx` successfully catches mutations that skip lb-to-kg conversion in the History edit save path.
