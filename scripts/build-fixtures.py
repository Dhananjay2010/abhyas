#!/usr/bin/env python3
"""
QA Pass 10 M7: Build test fixtures by applying PR migrations to prod base data.
"""

import json
from pathlib import Path

def load_json(path):
    with open(path) as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
        f.write('\n')

def apply_migrations(exercises):
    slug_map = {ex['slug']: ex for ex in exercises}
    
    # 110100: Flutter Kicks
    if 'flutter-kicks' in slug_map:
        ex = slug_map['flutter-kicks']
        ex['movement_pattern'] = 'core'
        ex['primary_muscles'] = ['abs']
        ex['mechanic'] = 'isolation'
    
    # 110100: Butt kicks
    for slug in ['double-leg-butt-kick', 'single-leg-butt-kick']:
        if slug in slug_map:
            ex = slug_map[slug]
            ex['movement_pattern'] = 'cardio'
            ex['primary_muscles'] = ['hamstrings']
            ex['mechanic'] = 'compound'
    
    # 110200: Table row
    if 'table-row' in slug_map:
        slug_map['table-row']['equipment_ids'] = []
    
    # 140000: Shoulder contraindications
    shoulder_slugs = [
        'bradford-rocky-presses', 'standing-bradford-press',
        'standing-barbell-press-behind-neck', 'wide-grip-pulldown-behind-the-neck'
    ]
    for slug in shoulder_slugs:
        if slug in slug_map:
            ex = slug_map[slug]
            if 'shoulder' not in ex['contraindicated_regions']:
                ex['contraindicated_regions'].append('shoulder')
    
    # 140000: Crunches lower back
    crunch_slugs = [
        'crunches', 'cross-body-crunch', 'rope-crunch', 'cable-crunch',
        'standing-rope-crunch', 'tuck-crunch', 'reverse-crunch',
        'oblique-crunches', 'ab-crunch-machine',
        'bosu-ball-cable-crunch-with-side-bends', 'cable-reverse-crunch',
        'cable-seated-crunch', 'crunch-legs-on-exercise-ball',
        'decline-oblique-crunch', 'decline-reverse-crunch',
        'exercise-ball-crunch', 'gorilla-chin-crunch',
        'kneeling-cable-crunch-with-alternating-oblique-twists',
        'oblique-crunches-on-the-floor', 'weighted-crunches', 'side-jackknife',
        'crunch-hands-overhead'
    ]
    for slug in crunch_slugs:
        if slug in slug_map:
            ex = slug_map[slug]
            if 'lower_back' not in ex['contraindicated_regions']:
                ex['contraindicated_regions'].append('lower_back')
    
    # 140000: Goblet squat
    if 'goblet-squat' in slug_map:
        ex = slug_map['goblet-squat']
        if 'dumbbell' not in ex['equipment_ids']:
            ex['equipment_ids'].append('dumbbell')
    
    # 140000: Upright rows
    upright_row_slugs = [
        'smith-machine-upright-row', 'dumbbell-one-arm-upright-row',
        'smith-machine-one-arm-upright-row', 'standing-dumbbell-upright-row',
        'upright-cable-row', 'upright-barbell-row', 'upright-row-with-bands'
    ]
    for slug in upright_row_slugs:
        if slug in slug_map:
            ex = slug_map[slug]
            ex['movement_pattern'] = 'lateral_delt'
            ex['primary_muscles'] = ['side_delts']

def main():
    root = Path('/workspace')
    exercises = load_json(root / 'scripts/fixtures/base/catalogue.json')
    print(f'Loaded {len(exercises)} exercises')
    apply_migrations(exercises)
    save_json(root / 'scripts/fixtures/catalogue.json', exercises)
    print(f'✓ Wrote to scripts/fixtures/catalogue.json')

if __name__ == '__main__':
    main()
