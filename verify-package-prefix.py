#!/usr/bin/env python3
import json
import subprocess

# Get main's package.json at 10b61f53
main_pkg_json = subprocess.check_output(
    ['git', 'show', '10b61f53:package.json'],
    cwd='/workspace'
).decode('utf-8')
main_pkg = json.loads(main_pkg_json)

# Get merged package.json
merged_pkg = json.load(open('/workspace/package.json'))

# Check 1: Main's keys are a prefix of merged keys
main_keys = list(main_pkg['scripts'].keys())
merged_keys = list(merged_pkg['scripts'].keys())

main_key_count = len(main_keys)
if merged_keys[:main_key_count] == main_keys:
    print(f"✓ Main's {main_key_count} keys are an exact prefix of merged keys")
else:
    print(f"✗ Main's keys are NOT a prefix")
    # Find first mismatch
    for i, (mk, mgk) in enumerate(zip(main_keys, merged_keys)):
        if mk != mgk:
            print(f"  First mismatch at index {i}: main={mk}, merged={mgk}")
            break
    exit(1)

# Check 2: Main's values for those keys are unchanged (except "test" which should be extended)
for key in main_keys:
    if key == 'test':
        # Special case: test chain should be main + ' && ' + PR entries
        continue
    if main_pkg['scripts'][key] != merged_pkg['scripts'][key]:
        print(f"✗ Value mismatch for key {key}")
        print(f"  Main: {main_pkg['scripts'][key][:100]}")
        print(f"  Merged: {merged_pkg['scripts'][key][:100]}")
        exit(1)

print(f"✓ Main's {main_key_count-1} non-test values are unchanged")

# Check 3: Test chain is an exact prefix + extension
main_test = main_pkg['scripts']['test']
merged_test = merged_pkg['scripts']['test']

if not merged_test.startswith(main_test + ' && '):
    print(f"✗ Test chain is not main + ' && ' + extension")
    print(f"  Main ends with: {main_test[-100:]}")
    print(f"  Merged continues with: {merged_test[len(main_test):len(main_test)+100]}")
    exit(1)

print(f"✓ Test chain is main + ' && ' + PR entries")
print(f"  Main chain length: {len(main_test)}")
print(f"  Merged chain length: {len(merged_test)}")
print(f"  Extension length: {len(merged_test) - len(main_test) - 4}")

print("\n✓✓✓ All package.json prefix checks passed ✓✓✓")
