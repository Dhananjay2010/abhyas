#!/usr/bin/env python3
"""
Build the exercise seed migration from free-exercise-db.

We take only STRUCTURAL data from that dataset -- name, muscles, equipment,
mechanic, force, level. Those are facts about exercises and carry no copyright
concern. We deliberately do NOT import its instruction prose or its images:
both trace back to a scrape of a commercial site, and three unanswered GitHub
issues ask whether they are safe for commercial use. See SPEC section 10.

Everything that actually matters for safety and programming -- movement
pattern, impact, spinal load, contraindicated joints, progression chains -- is
derived here by explicit rules, not taken from the source.

Usage:  python3 scripts/build_exercise_seed.py <path-to-exercises.json> <out.sql>
"""

from __future__ import annotations

import json
import re
import sys

SOURCE = "free-exercise-db"
SOURCE_LICENCE = "Unlicense (structural data only; no images or instruction text imported)"

# --------------------------------------------------------------------------
# Filtering
# --------------------------------------------------------------------------
# stretching  -> we have our own warm-up/cool-down library
# strongman   -> needs specialist kit we do not model
# olympic     -> too technical to auto-prescribe at these levels, and unsafe to
#                program without coaching
KEEP_CATEGORIES = {"strength", "powerlifting", "plyometrics", "cardio"}

CATEGORY_MAP = {
    "strength": "strength",
    "powerlifting": "strength",
    "plyometrics": "plyometric",
    "cardio": "cardio",
}

# --------------------------------------------------------------------------
# Muscles
# --------------------------------------------------------------------------
MUSCLE_MAP = {
    "abdominals": "abs",
    "abductors": "abductors",
    "adductors": "adductors",
    "biceps": "biceps",
    "calves": "calves",
    "chest": "chest",
    "forearms": "forearms",
    "glutes": "glutes",
    "hamstrings": "hamstrings",
    "lats": "lats",
    "lower back": "lower_back",
    "middle back": "upper_back",
    "neck": "neck",
    "quadriceps": "quads",
    "traps": "traps",
    "triceps": "triceps",
}


def map_shoulders(name: str) -> list[str]:
    """'shoulders' is too coarse for slot filling -- split it by movement."""
    n = name.lower()
    if any(k in n for k in ("lateral raise", "side lateral", "side raise")):
        return ["side_delts"]
    if any(k in n for k in ("rear delt", "reverse fly", "reverse machine fly",
                            "face pull", "rear lateral", "pull apart",
                            "pullapart", "reverse cable")):
        return ["rear_delts"]
    if "front raise" in n:
        return ["front_delts"]
    if "upright row" in n:
        return ["side_delts", "traps"]
    if "shrug" in n:
        return ["traps"]
    return ["front_delts", "side_delts"]


def map_muscles(names: list[str], ex_name: str) -> list[str]:
    out: list[str] = []
    for m in names or []:
        if m == "shoulders":
            out.extend(map_shoulders(ex_name))
        elif m in MUSCLE_MAP:
            out.append(MUSCLE_MAP[m])
    seen, uniq = set(), []
    for m in out:
        if m not in seen:
            seen.add(m)
            uniq.append(m)
    return uniq


# --------------------------------------------------------------------------
# Equipment
# --------------------------------------------------------------------------
EQUIPMENT_MAP = {
    "body only": [],
    "barbell": ["barbell"],
    "dumbbell": ["dumbbell"],
    "cable": ["cable_machine"],
    "kettlebells": ["kettlebell"],
    "bands": ["resistance_band"],
    "medicine ball": ["medicine_ball"],
    "exercise ball": ["stability_ball"],
    "e-z curl bar": ["ez_bar"],
    "foam roll": ["foam_roller"],
    "machine": ["machine"],  # refined by name below
}

# Specific machines we already model, matched on the exercise name.
MACHINE_BY_NAME = [
    ("leg press", "leg_press"),
    ("hack squat", "hack_squat"),
    ("leg extension", "leg_extension"),
    ("leg curl", "leg_curl"),
    ("lying leg curl", "leg_curl"),
    ("lat pulldown", "lat_pulldown"),
    ("pulldown", "lat_pulldown"),
    ("pec deck", "pec_deck"),
    ("chest press", "chest_press_machine"),
    ("seated row", "seated_row_machine"),
    ("shoulder press machine", "shoulder_press_machine"),
    ("smith", "smith_machine"),
    ("treadmill", "treadmill"),
    ("stationary bike", "stationary_bike"),
    ("elliptical", "elliptical"),
    ("rowing", "rowing_machine"),
]

# Support equipment the name implies but the dataset never records.
IMPLIED_EQUIPMENT = [
    (r"\bpull[- ]?ups?\b|\bchin[- ]?ups?\b|\bhanging\b|\bmuscle up\b", "pull_up_bar"),
    (r"\bdips?\b", "dip_bars"),
    (r"\bincline\b|\bdecline\b", "adjustable_bench"),
    (r"\bbench press\b|\blying\b|\bbench\b", "flat_bench"),
    (r"\bjump rope\b|\bskipping\b", "jump_rope"),
    (r"\bab wheel\b|\bab roller\b", "ab_wheel"),
]

# Equipment reachable without a gym -- decides which tracks an exercise serves.
HOME_EQUIPMENT = {
    "dumbbell", "kettlebell", "resistance_band", "pull_up_bar", "dip_bars",
    "stability_ball", "medicine_ball", "foam_roller", "jump_rope", "ab_wheel",
    "yoga_mat", "adjustable_bench", "flat_bench",
}


def map_equipment(raw: str | None, name: str) -> list[str]:
    n = name.lower()
    base = list(EQUIPMENT_MAP.get(raw or "", []))

    if base == ["machine"]:
        base = []
        for needle, eq in MACHINE_BY_NAME:
            if needle in n:
                base = [eq]
                break
        if not base:
            base = ["machine_generic"]

    for pattern, eq in IMPLIED_EQUIPMENT:
        if re.search(pattern, n) and eq not in base:
            # A dip belt is optional; bodyweight dips need only the bars.
            base.append(eq)

    # Barbell squats and presses realistically need a rack.
    if "barbell" in base and re.search(r"\bsquat\b|\bgood morning\b", n):
        if "squat_rack" not in base:
            base.append("squat_rack")

    return sorted(set(base))


# --------------------------------------------------------------------------
# Movement pattern -- what the generator actually selects on
# --------------------------------------------------------------------------
# Order matters: the first match wins. Plurals are everywhere in this dataset
# ("Dumbbell Lunges", "Barbell Squats"), so every noun here tolerates a
# trailing s -- without it the safety filters below silently miss them.
# Separators are written [- ]? throughout, never -?, because this dataset mixes
# "Step-up", "Stepup" and "Step Ups" freely. A rule that only tolerates the
# hyphen silently fails on the spaced form -- which is how step-ups reached a
# user who had flagged a current knee injury.
PATTERN_RULES: list[tuple[str, str]] = [
    (r"\bcalf\b|\bcalves\b", "calf"),
    (r"\bshrugs?\b", "other"),
    # Specific fixes for mis-tagged exercises - must come before general rules.
    (r"\bflutter kicks?\b", "core"),
    (r"\bbutt ?kicks?\b|\bleg butt ?kicks?\b", "cardio"),
    (r"\boverhead slams?\b|\bball slams?\b|\bmedicine ball throws?\b|"
     r"\bbackward.*throws?\b", "other"),
    (r"\bback fl(y|ies)\b.*bands?\b", "rear_delt"),
    # Hinge must precede biceps so "leg curl" is not read as an arm curl.
    (r"\bleg curls?\b|\bnordic\b|\bgood mornings?\b|\bromanian\b|"
     r"\bdeadlifts?\b|\bhip thrusts?\b|\bglute bridges?\b|"
     r"\bback extensions?\b|\bhyperextensions?\b|\bswings?\b|"
     r"\bpull ?throughs?\b|\bgood[- ]?mornings?\b", "hinge"),
    (r"\bcurls?\b", "biceps"),
    (r"\blunges?\b|\bstep[- ]?ups?\b|\bsplit squats?\b|\bbulgarian\b|"
     r"\bpistols?\b", "lunge"),
    (r"\bsquats?\b|\bleg press(es)?\b|\bleg extensions?\b|\bwall sits?\b",
     "squat"),
    (r"\bpull[- ]?ups?\b|\bchin[- ]?ups?\b|\bpulldowns?\b|\blat pulls?\b|"
     r"\bmuscle ups?\b", "vertical_pull"),
    (r"\brows?\b|\bface pulls?\b", "horizontal_pull"),
    (r"\brear delts?\b|\breverse fly(es)?\b|\breverse machine fly(es)?\b|"
     r"\brear laterals?\b", "rear_delt"),
    (r"\blateral raises?\b|\bside laterals?\b|\bupright rows?\b|"
     r"\bfront raises?\b", "lateral_delt"),
    (r"\boverhead press(es)?\b|\bshoulder press(es)?\b|\bmilitary press(es)?\b|"
     r"\bpush press(es)?\b|\barnold\b|\bhandstand\b", "vertical_press"),
    (r"\bbench press(es)?\b|\bpush[- ]?ups?\b|\bchest press(es)?\b|\bfly(es)?\b|"
     r"\bflyes?\b|\bpec decks?\b|\bdips?\b|\bcrossovers?\b", "horizontal_press"),
    (r"\btriceps?\b|\bskull ?crushers?\b|\bpushdowns?\b|\bkickbacks?\b|"
     r"\bclose[- ]?grip\b|\bextensions?\b", "triceps"),
    (r"\bcrunch(es)?\b|\bsit[- ]?ups?\b|\bplanks?\b|\bab \b|\bab-\b|"
     r"\bwoodchops?\b|\brussian twists?\b|\bhollow\b|\bdead bugs?\b|"
     r"\bbird dogs?\b|\bmountain climbers?\b|\bv[- ]?ups?\b|\btoes to bar\b|"
     r"\bleg raises?\b|\bknee raises?\b", "core"),
    (r"\bcarr(y|ies)\b|\bfarmers?\b", "carry"),
    (r"\bnecks?\b", "neck"),
    (r"\bwrists?\b|\bforearms?\b", "forearm"),
    (r"\bruns?\b|\bsprints?\b|\bjogs?\b|\bbikes?\b|\bcycl\w*\b|"
     r"\bellipt\w*\b|\browing\b|\bjump ropes?\b|\bskipping\b|"
     r"\btreadmills?\b", "cardio"),
]

MUSCLE_PATTERN_FALLBACK = {
    "biceps": "biceps", "triceps": "triceps", "calves": "calf",
    "abs": "core", "obliques": "core", "quads": "squat",
    "hamstrings": "hinge", "glutes": "hinge", "lats": "vertical_pull",
    "upper_back": "horizontal_pull", "chest": "horizontal_press",
    "front_delts": "vertical_press", "side_delts": "lateral_delt",
    "rear_delts": "rear_delt", "traps": "other", "forearms": "forearm",
    "neck": "neck", "lower_back": "hinge",
}


# For small, single-joint patterns the dataset's muscle labels are reliable, so
# they can be used to catch a bad name match. We deliberately do NOT reconcile
# the big compound patterns: the dataset labels several deadlift variants as
# "quadriceps", and a deadlift is still a hinge.
PATTERN_EXPECTED_MUSCLES = {
    "biceps": {"biceps"},
    "triceps": {"triceps"},
    "forearm": {"forearms"},
    "calf": {"calves"},
    "rear_delt": {"rear_delts"},
    "lateral_delt": {"side_delts", "front_delts", "traps"},
    "core": {"abs", "obliques"},
    "neck": {"neck"},
}


def reconcile(pattern: str, primary: list[str]) -> str:
    """Correct a name match that disagrees with the muscles worked.

    "Seated Dumbbell Wrist Curl" matches the biceps rule on the word "curl" but
    works the forearms; "Glute Kickback" matches the triceps rule on "kickback"
    but works the glutes. Both become the pattern their muscles imply.
    """
    expected = PATTERN_EXPECTED_MUSCLES.get(pattern)
    if expected and not (set(primary) & expected):
        for m in primary:
            if m in MUSCLE_PATTERN_FALLBACK:
                return MUSCLE_PATTERN_FALLBACK[m]
    return pattern


def movement_pattern(name: str, primary: list[str], category: str) -> str:
    n = name.lower()
    if category == "cardio":
        return "cardio"
    for pattern, value in PATTERN_RULES:
        if re.search(pattern, n):
            return reconcile(value, primary)
    for m in primary:
        if m in MUSCLE_PATTERN_FALLBACK:
            return MUSCLE_PATTERN_FALLBACK[m]
    return "other"


# --------------------------------------------------------------------------
# Safety metadata -- the part that decides what we keep OUT of a plan
# --------------------------------------------------------------------------
HIGH_IMPACT = re.compile(
    r"\bjumps?\b|\bjumping\b|\bhops?\b|\bbounds?\b|\bburpees?\b|\bplyo\w*\b|"
    r"\bdepth jumps?\b|\bsprints?\b|\bskaters?\b|\btuck jumps?\b|\bclap\w*\b")
MEDIUM_IMPACT = re.compile(r"\bruns?\b|\brunning\b|\bjogs?\b|\bjump ropes?\b|"
                           r"\bskipping\b|\bmountain climbers?\b")

HIGH_SPINAL = re.compile(
    r"\bback squats?\b|\bfront squats?\b|\bdeadlifts?\b|\bgood mornings?\b|\bbent[- ]?over rows?\b|"
    r"\bbarbell rows?\b|\bmilitary press(es)?\b|\bstanding.*press(es)?\b|\brack pulls?\b|\bcleans?\b|"
    r"\bsnatch(es)?\b|\bjerks?\b|\bzercher\b|\boverhead squats?\b")
LOW_SPINAL = re.compile(
    r"\bsquats?\b|\bhinges?\b|\bromanian\b|\blunges?\b|\bstep[- ]?ups?\b|\bhip thrusts?\b|"
    r"\bswings?\b|\bcarr(y|ies)\b|\bfarmers?\b|\boverhead press(es)?\b|\bshoulder press(es)?\b")

CONTRA_RULES: list[tuple[str, list[str]]] = [
    (r"\bsquats?\b|\blunges?\b|\bstep[- ]?ups?\b|\bleg extensions?\b|\bpistols?\b|"
     r"\bjumps?\b|\bleg press(es)?\b|\bhack squats?\b|\bbulgarian\b|\bwall sits?\b",
     ["knee"]),
    (r"\bdeadlifts?\b|\bgood mornings?\b|\bbent[- ]?over\b|\bback extensions?\b|"
     r"\bhyperextensions?\b|\bsit[- ]?ups?\b|\bback squats?\b|\bbarbell rows?\b|"
     r"\brack pulls?\b|\bromanian\b|\bcleans?\b|\bsnatch(es)?\b", ["lower_back"]),
    (r"\boverhead press(es)?\b|\bshoulder press(es)?\b|\bmilitary press(es)?\b|"
     r"\bbehind.*neck\b|\bupright rows?\b|\bdips?\b|\bbench press(es)?\b|"
     r"\bpull[- ]?ups?\b|\bchin[- ]?ups?\b|\blateral raises?\b|\bhandstand\b|"
     r"\bsnatch(es)?\b|\bfly(es)?\b", ["shoulder"]),
    (r"\bskull ?crushers?\b|\bdips?\b|\bclose[- ]?grip\b|\bpushdowns?\b|"
     r"\bkickbacks?\b|\btriceps? extensions?\b|\bcurls?\b", ["elbow"]),
    (r"\bfront squats?\b|\bcleans?\b|\bpush[- ]?ups?\b|\bplanks?\b|\bhandstand\b|"
     r"\bsnatch(es)?\b|\bwrists?\b|\bab wheels?\b|\bab rollers?\b", ["wrist"]),
    (r"\bjumps?\b|\bhops?\b|\bbounds?\b|\bcalf raises?\b|\bsprints?\b|"
     r"\bskipping\b|\bjump ropes?\b", ["ankle"]),
    (r"\blunges?\b|\bsplit squats?\b|\bhip thrusts?\b|\bdeep squats?\b|"
     r"\babductions?\b|\badductions?\b|\bbulgarian\b", ["hip"]),
    (r"\bnecks?\b|\bshrugs?\b|\bbehind.*neck\b", ["neck"]),
]


def safety(name: str, category: str, pattern: str = "other",
           equipment: list[str] | None = None) -> tuple[str, str, list[str]]:
    """Impact, spinal load and contraindicated joints.

    Pattern and equipment are used as well as the name, because name regexes
    alone get this wrong in ways that matter: "Barbell Squat" is a back squat
    and carries high spinal load, and "leg curl" is not an elbow movement.
    """
    n = name.lower()
    equipment = equipment or []

    if category == "plyometric" or HIGH_IMPACT.search(n):
        impact = "high"
    elif MEDIUM_IMPACT.search(n):
        impact = "medium"
    else:
        impact = "low"

    loaded_bar = "barbell" in equipment or "trap_bar" in equipment
    if HIGH_SPINAL.search(n) or (loaded_bar and pattern in ("squat", "hinge")):
        # A loaded bar on the back or in the hands compresses the spine, whether
        # or not the name happens to say "back squat".
        spinal = "high"
    elif LOW_SPINAL.search(n) or loaded_bar:
        spinal = "low"
    else:
        spinal = "none"

    regions: list[str] = []
    for rule, rs in CONTRA_RULES:
        if re.search(rule, n):
            regions.extend(rs)

    # "Leg curl" is not an arm curl: elbow only applies to arm-driven work.
    if pattern in ("hinge", "squat", "lunge", "calf", "core"):
        regions = [r for r in regions if r != "elbow"]

    return impact, spinal, sorted(set(regions))


# --------------------------------------------------------------------------
# Bodyweight progression chains, hand-authored.
# Matched on normalised name; missing links are simply skipped.
# --------------------------------------------------------------------------
PROGRESSION_CHAINS: dict[str, list[str]] = {
    "push": ["push-ups-with-feet-elevated", "pushups", "push-ups-close-triceps-position",
             "decline-push-up", "handstand-push-ups"],
    "pull": ["inverted-row", "chin-ups", "pullups", "muscle-up"],
    "squat": ["bodyweight-squat", "split-squats", "bulgarian-split-squat", "pistol-squat"],
    "dip": ["bench-dips", "dips-triceps-version", "dips-chest-version"],
    "core": ["plank", "side-bridge", "hanging-leg-raise", "ab-roller"],
    "hinge": ["glute-bridge", "single-leg-glute-bridge", "romanian-deadlift", "natural-glute-ham-raise"],
}


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s[:120]


def sql_text(v) -> str:
    if v is None:
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def sql_array(values: list[str], cast: str) -> str:
    if not values:
        return f"'{{}}'::{cast}"
    inner = ",".join('"' + v.replace('"', '\\"') + '"' for v in values)
    return f"'{{{inner}}}'::{cast}"


MUSCLE_LABEL = {
    "abs": "abs", "obliques": "obliques", "chest": "chest", "lats": "lats",
    "upper_back": "upper back", "lower_back": "lower back", "traps": "traps",
    "front_delts": "front delts", "side_delts": "side delts",
    "rear_delts": "rear delts", "biceps": "biceps", "triceps": "triceps",
    "forearms": "forearms", "glutes": "glutes", "quads": "quads",
    "hamstrings": "hamstrings", "calves": "calves", "hip_flexors": "hip flexors",
    "adductors": "adductors", "abductors": "abductors", "neck": "neck",
}

EQUIPMENT_LABEL = {
    "barbell": "Barbell", "dumbbell": "Dumbbells", "cable_machine": "Cable machine",
    "kettlebell": "Kettlebell", "resistance_band": "Bands", "ez_bar": "EZ bar",
    "machine_generic": "Machine", "leg_press": "Leg press", "hack_squat": "Hack squat",
    "leg_curl": "Leg curl", "leg_extension": "Leg extension",
    "lat_pulldown": "Lat pulldown", "pec_deck": "Pec deck",
    "chest_press_machine": "Chest press", "seated_row_machine": "Seated row",
    "smith_machine": "Smith machine", "pull_up_bar": "Pull-up bar",
    "dip_bars": "Dip bars", "flat_bench": "Bench", "adjustable_bench": "Bench",
    "squat_rack": "Rack", "medicine_ball": "Medicine ball",
    "stability_ball": "Stability ball", "foam_roller": "Foam roller",
    "jump_rope": "Jump rope", "ab_wheel": "Ab wheel",
}


def build_cue(mechanic, pattern, primary, equipment) -> str:
    """Our own one-line summary, derived from attributes. Not imported prose."""
    mechanic_label = mechanic or ''
    pattern_label = pattern.replace('_', ' ') if pattern else ''
    
    skip_pattern = (
        not pattern_label or
        pattern_label == 'other' or
        pattern_label == 'static' or
        (len(primary) == 1 and primary[0] and pattern_label == MUSCLE_LABEL.get(primary[0], ''))
    )
    
    if skip_pattern:
        movement_prefix = (
            mechanic_label if mechanic_label
            else pattern_label if pattern_label not in ('other', 'static')
            else ''
        )
    else:
        movement_prefix = (
            f"{mechanic_label} {pattern_label}" if mechanic_label
            else pattern_label
        )
    
    muscle_labels = [MUSCLE_LABEL.get(m, m) for m in primary[:3]]
    equipment_suffix = f" with {EQUIPMENT_LABEL.get(equipment[0], equipment[0])}." if equipment and EQUIPMENT_LABEL.get(equipment[0]) else "."
    
    base = (
        f"{movement_prefix} movement targeting {', '.join(muscle_labels)}" if movement_prefix
        else f"Targets {', '.join(muscle_labels)}"
    )
    
    if not mechanic and base:
        base = base[0].upper() + base[1:]
    
    return base + equipment_suffix


def main() -> None:
    src, out_path = sys.argv[1], sys.argv[2]
    data = json.load(open(src))

    rows, seen_slugs = [], set()
    skipped = {"category": 0, "no_equipment_info": 0, "no_muscles": 0, "duplicate": 0}

    for ex in data:
        category = ex.get("category")
        if category not in KEEP_CATEGORIES:
            skipped["category"] += 1
            continue

        raw_equipment = ex.get("equipment")
        # "other" and null give us no basis to filter on, so we cannot promise a
        # user can actually perform it. Body-only is a legitimate empty list.
        if raw_equipment in (None, "other"):
            skipped["no_equipment_info"] += 1
            continue

        name = (ex.get("name") or "").strip()
        primary = map_muscles(ex.get("primaryMuscles"), name)
        if not primary:
            skipped["no_muscles"] += 1
            continue

        slug = slugify(name)
        if not slug or slug in seen_slugs:
            skipped["duplicate"] += 1
            continue
        seen_slugs.add(slug)

        secondary = [m for m in map_muscles(ex.get("secondaryMuscles"), name)
                     if m not in primary]
        equipment = map_equipment(raw_equipment, name)
        our_category = CATEGORY_MAP[category]
        pattern = movement_pattern(name, primary, our_category)
        impact, spinal, contra = safety(name, our_category, pattern, equipment)

        mechanic = ex.get("mechanic")
        force = ex.get("force")
        level = ex.get("level") or "beginner"

        gym_only = any(e not in HOME_EQUIPMENT for e in equipment)
        tracks = ["weights"] if gym_only else ["weights", "bodyweight"]

        rows.append({
            "slug": slug,
            "name": name,
            "tracks": tracks,
            "category": our_category,
            "mechanic": mechanic,
            "force": force,
            "movement_pattern": pattern,
            "primary_muscles": primary,
            "secondary_muscles": secondary,
            "equipment_ids": equipment,
            "level_min": level,
            "contraindicated_regions": contra,
            "impact": impact,
            "spinal_load": spinal,
            "default_rest_seconds": 120 if mechanic == "compound" else 75,
            "cue": build_cue(mechanic, pattern, primary, equipment),
        })

    # Progression chains
    by_slug = {r["slug"]: r for r in rows}
    chained = 0
    for chain, slugs in PROGRESSION_CHAINS.items():
        rank = 0
        for s in slugs:
            if s in by_slug:
                by_slug[s]["progression_chain"] = chain
                by_slug[s]["progression_rank"] = rank
                rank += 1
                chained += 1

    with open(out_path, "w") as f:
        f.write("-- Exercise catalogue.\n")
        f.write("-- GENERATED by scripts/build_exercise_seed.py -- edit the script, not this file.\n")
        f.write("-- Structural data only from free-exercise-db; no images or instruction\n")
        f.write("-- prose imported. Safety metadata and movement patterns are derived by\n")
        f.write("-- explicit rules in that script.\n\n")

        f.write("insert into equipment (id, name, category, sort_order) values\n")
        f.write("  ('machine_generic', 'Gym machine (general)', 'machine', 33)\n")
        f.write("on conflict (id) do nothing;\n\n")

        f.write("insert into exercises (slug, name, tracks, category, mechanic, force,\n")
        f.write("  movement_pattern, primary_muscles, secondary_muscles, equipment_ids,\n")
        f.write("  level_min, contraindicated_regions, impact, spinal_load,\n")
        f.write("  default_rest_seconds, cue, progression_chain, progression_rank,\n")
        f.write("  source, source_licence) values\n")

        parts = []
        for r in rows:
            parts.append(
                "  (" + ", ".join([
                    sql_text(r["slug"]),
                    sql_text(r["name"]),
                    sql_array(r["tracks"], "track_type[]"),
                    sql_text(r["category"]) + "::exercise_category",
                    (sql_text(r["mechanic"]) + "::mechanic_type") if r["mechanic"] else "null",
                    (sql_text(r["force"]) + "::force_type") if r["force"] else "null",
                    sql_text(r["movement_pattern"]) + "::movement_pattern",
                    sql_array(r["primary_muscles"], "muscle[]"),
                    sql_array(r["secondary_muscles"], "muscle[]"),
                    sql_array(r["equipment_ids"], "text[]"),
                    sql_text(r["level_min"]) + "::fitness_level",
                    sql_array(r["contraindicated_regions"], "body_region[]"),
                    sql_text(r["impact"]) + "::impact_level",
                    sql_text(r["spinal_load"]) + "::spinal_load_level",
                    str(r["default_rest_seconds"]),
                    sql_text(r["cue"]),
                    sql_text(r.get("progression_chain")),
                    str(r["progression_rank"]) if r.get("progression_rank") is not None else "null",
                    sql_text(SOURCE),
                    sql_text(SOURCE_LICENCE),
                ]) + ")")
        f.write(",\n".join(parts))
        f.write("""
on conflict (slug) do update set
  name = excluded.name,
  tracks = excluded.tracks,
  category = excluded.category,
  mechanic = excluded.mechanic,
  force = excluded.force,
  movement_pattern = excluded.movement_pattern,
  primary_muscles = excluded.primary_muscles,
  secondary_muscles = excluded.secondary_muscles,
  equipment_ids = excluded.equipment_ids,
  level_min = excluded.level_min,
  contraindicated_regions = excluded.contraindicated_regions,
  impact = excluded.impact,
  spinal_load = excluded.spinal_load,
  default_rest_seconds = excluded.default_rest_seconds,
  cue = excluded.cue,
  progression_chain = excluded.progression_chain,
  progression_rank = excluded.progression_rank;
""")

    print(f"wrote {len(rows)} exercises -> {out_path}")
    print("skipped:", skipped)
    print("progression links:", chained)
    from collections import Counter
    print("patterns:", dict(Counter(r["movement_pattern"] for r in rows)))
    print("impact:", dict(Counter(r["impact"] for r in rows)))
    print("spinal_load:", dict(Counter(r["spinal_load"] for r in rows)))


if __name__ == "__main__":
    main()
