/**
 * Convert Supabase exercise query results to CandidateExercise array.
 * Used to safely transform query results without type assertions.
 */
import type { CandidateExercise } from "@/lib/program/generate";

type CatalogueSelectResult = {
  id: string;
  slug: string;
  name: string;
  movement_pattern: CandidateExercise["movement_pattern"];
  mechanic: CandidateExercise["mechanic"];
  metric: CandidateExercise["metric"];
  primary_muscles: CandidateExercise["primary_muscles"];
  equipment_ids: string[];
  level_min: CandidateExercise["level_min"];
  contraindicated_regions: CandidateExercise["contraindicated_regions"];
  impact: CandidateExercise["impact"];
  spinal_load: CandidateExercise["spinal_load"];
  tracks: CandidateExercise["tracks"];
  default_rest_seconds: number;
  category: CandidateExercise["category"];
};

export function toCandidateExercises(rows: CatalogueSelectResult[] | null): CandidateExercise[] {
  if (!rows) return [];
  
  return rows.map((row): CandidateExercise => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    movement_pattern: row.movement_pattern,
    mechanic: row.mechanic,
    metric: row.metric,
    primary_muscles: row.primary_muscles,
    equipment_ids: row.equipment_ids,
    level_min: row.level_min,
    contraindicated_regions: row.contraindicated_regions,
    impact: row.impact,
    spinal_load: row.spinal_load,
    tracks: row.tracks,
    default_rest_seconds: row.default_rest_seconds,
    category: row.category,
  }));
}

