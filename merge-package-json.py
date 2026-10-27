#!/usr/bin/env python3
import json
import subprocess

# Get main's package.json at 10b61f53
main_pkg_json = subprocess.check_output(
    ['git', 'show', '10b61f53:package.json'],
    cwd='/workspace'
).decode('utf-8')
main_pkg = json.loads(main_pkg_json)

# Get HEAD's package.json (PR version before merge)
head_pkg_json = subprocess.check_output(
    ['git', 'show', 'HEAD:package.json'],
    cwd='/workspace'
).decode('utf-8')
head_pkg = json.loads(head_pkg_json)

# Start with HEAD's package.json structure
merged = head_pkg.copy()

# 1. Fix the test chain: main's chain + " && " + PR's 53 entries
main_test_chain = main_pkg['scripts']['test']
head_test_chain = head_pkg['scripts']['test']

# Find where PR's entries start in HEAD's chain
# HEAD's chain is based on fd674603 + PR's 53 entries
# Main's chain is fd674603 + main's 6 entries
# We need: main's chain + " && " + PR's 53 entries

# PR's entries start with "test:allsetsdone-pending"
pr_start = "npm run test:allsetsdone-pending"
if pr_start in head_test_chain:
    idx = head_test_chain.index(pr_start)
    pr_test_entries = head_test_chain[idx:]
    merged['scripts']['test'] = main_test_chain + " && " + pr_test_entries
else:
    print("ERROR: Could not find PR test entries start")
    exit(1)

# 2. Fix the scripts: keep everything up to warmup-exclusion, add main's 6 new keys, add PR's 53 keys
# Get all keys in order from HEAD
keys_list = list(head_pkg['scripts'].keys())

# Find index of test:warmup-exclusion
warmup_idx = keys_list.index('test:warmup-exclusion')

# Main's 6 new keys (in order they appear in main)
main_new_keys = [
    'test:plan-day-dedupe-keeps-lowest-id',
    'test:actions-adapter-wiring',
    'test:adapter-23505-handling',
    'test:constraint-error-mapping',
    'test:log-weight-render',
    'test:unique-planned-session-migration-real-db'
]

# PR's 53 keys (from test:allsetsdone-pending to test:today-signout-clears)
pr_keys_start_idx = keys_list.index('test:allsetsdone-pending')
pr_keys_end_idx = keys_list.index('test:today-signout-clears')
pr_new_keys = keys_list[pr_keys_start_idx:pr_keys_end_idx+1]

# Rebuild scripts in correct order
new_scripts = {}

# 1. Add everything up to and including warmup-exclusion
for i in range(warmup_idx + 1):
    key = keys_list[i]
    new_scripts[key] = head_pkg['scripts'][key]

# 2. Add main's 6 new keys
for key in main_new_keys:
    new_scripts[key] = main_pkg['scripts'][key]

# 3. Add PR's 53 keys
for key in pr_new_keys:
    new_scripts[key] = head_pkg['scripts'][key]

merged['scripts'] = new_scripts

# Write the merged package.json
with open('/workspace/package.json', 'w') as f:
    json.dump(merged, f, indent=2)
    f.write('\n')

print("package.json merged successfully")
print(f"Script keys: {len(new_scripts)}")
print(f"Main keys: {len(main_pkg['scripts'])}")
print(f"Head keys: {len(head_pkg['scripts'])}")
