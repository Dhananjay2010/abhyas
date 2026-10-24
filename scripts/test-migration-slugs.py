#!/usr/bin/env python3
"""
Test that all slugs referenced in PR migrations exist in base catalogue.
"""

import json
import re
from pathlib import Path

def main():
    root = Path(__file__).parent.parent
    
    # Load base catalogue
    base = json.loads((root / 'scripts/fixtures/base/catalogue.json').read_text())
    base_slugs = {ex['slug'] for ex in base}
    
    # Extract slugs from migrations
    migrations = [
        '20261024110100_workout_quality_fixes.sql',
        '20261024110200_fix_contraindications_equipment.sql',
        '20261024140000_qa_pass_10_comprehensive_fixes.sql',
    ]
    
    errors = []
    for filename in migrations:
        path = root / 'supabase/migrations' / filename
        if not path.exists():
            continue
        
        sql = path.read_text()
        
        # Find all slug references in WHERE slug = or WHERE slug IN
        slug_pattern = re.compile(r"slug\s+(?:=|IN)\s+(?:\()?'([^']+)'")
        referenced_slugs = set(slug_pattern.findall(sql))
        
        for slug in referenced_slugs:
            if slug not in base_slugs:
                errors.append(f"{filename}: references non-existent slug '{slug}'")
    
    if errors:
        print('FAIL: Migrations reference slugs that don\'t exist in prod:')
        for err in errors:
            print(f'  {err}')
        return 1
    
    print('✓ All migration slugs exist in base catalogue')
    return 0

if __name__ == '__main__':
    exit(main())
