#!/usr/bin/env python3
import re

with open('scripts/test-auto-replay-on-mount.ts', 'r') as f:
    content = f.read()

# Replace [sessionId]: [ ... ] with [sessionId]: { sets: [ ... ], timestamp: Date.now() }
pattern = r'(\[sessionId\]): \[\s*(\{[^}]+\})\s*\]'

def replace_func(match):
    obj = match.group(2)
    return f'{match.group(1)}: {{\n        sets: [\n          {obj}\n        ],\n        timestamp: Date.now(),\n      }}'

content = re.sub(pattern, replace_func, content)

with open('scripts/test-auto-replay-on-mount.ts', 'w') as f:
    f.write(content)

print("Fixed")
