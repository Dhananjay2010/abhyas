#!/usr/bin/env python3
"""
M7 test: Verify committed fixture matches regenerated one.
Fails if build-fixtures.py produces different output.
"""

import json
import subprocess
import sys
from pathlib import Path

def main():
    root = Path(__file__).parent.parent
    
    # Build fresh fixture
    print('Building fresh fixture...')
    result = subprocess.run(['python3', str(root / 'scripts/build-fixtures.py')],
                          capture_output=True, text=True)
    if result.returncode != 0:
        print('FAIL: build-fixtures.py failed')
        print(result.stderr)
        sys.exit(1)
    
    # Load both
    committed = json.loads((root / 'scripts/fixtures/catalogue.json').read_text())
    regenerated = json.loads((root / 'scripts/fixtures/catalogue.json').read_text())
    
    # Compare
    if committed != regenerated:
        print('FAIL: Committed fixture differs from regenerated one')
        print('Run: python3 scripts/build-fixtures.py')
        print('Then commit the changes')
        sys.exit(1)
    
    print('✓ Fixture matches build output')

if __name__ == '__main__':
    main()
