export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      body_metrics: {
        Row: {
          body_fat_pct: number | null
          created_at: string
          id: string
          notes: string | null
          recorded_on: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          body_fat_pct?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          recorded_on: string
          user_id: string
          weight_kg: number
        }
        Update: {
          body_fat_pct?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          recorded_on?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
      breathing_journeys: {
        Row: {
          about: string | null
          created_at: string
          days: Json
          description: string
          id: string
          name: string
          slug: string
          sort_order: number
          subtitle: string | null
        }
        Insert: {
          about?: string | null
          created_at?: string
          days: Json
          description: string
          id?: string
          name: string
          slug: string
          sort_order?: number
          subtitle?: string | null
        }
        Update: {
          about?: string | null
          created_at?: string
          days?: Json
          description?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          subtitle?: string | null
        }
        Relationships: []
      }
      breathing_logs: {
        Row: {
          breaths: number
          created_at: string
          cycles_completed: number
          ended_early: boolean
          guidance: string
          id: string
          mood_after: number | null
          mood_before: number | null
          pattern_id: string | null
          pattern_name: string
          planned_cycles: number
          routine_id: string | null
          routine_name: string | null
          routine_step: number | null
          seconds: number
          session_id: string
          user_id: string
          user_pattern_id: string | null
        }
        Insert: {
          breaths: number
          created_at?: string
          cycles_completed: number
          ended_early?: boolean
          guidance?: string
          id?: string
          mood_after?: number | null
          mood_before?: number | null
          pattern_id?: string | null
          pattern_name: string
          planned_cycles: number
          routine_id?: string | null
          routine_name?: string | null
          routine_step?: number | null
          seconds: number
          session_id: string
          user_id: string
          user_pattern_id?: string | null
        }
        Update: {
          breaths?: number
          created_at?: string
          cycles_completed?: number
          ended_early?: boolean
          guidance?: string
          id?: string
          mood_after?: number | null
          mood_before?: number | null
          pattern_id?: string | null
          pattern_name?: string
          planned_cycles?: number
          routine_id?: string | null
          routine_name?: string | null
          routine_step?: number | null
          seconds?: number
          session_id?: string
          user_id?: string
          user_pattern_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "breathing_logs_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "breathing_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breathing_logs_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "breathing_routines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breathing_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_volume"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "breathing_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "breathing_logs_user_pattern_id_fkey"
            columns: ["user_pattern_id"]
            isOneToOne: false
            referencedRelation: "user_breathing_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      breathing_patterns: {
        Row: {
          benefit: string | null
          contraindications: string | null
          default_cycles: number
          description: string | null
          evidence_label: string | null
          evidence_url: string | null
          exhale_seconds: number
          hold_in_seconds: number
          hold_out_seconds: number
          how_to: string[]
          id: string
          inhale_seconds: number
          intents: string[]
          level: Database["public"]["Enums"]["fitness_level"]
          max_cycles: number | null
          name: string
          phases: Json
          shape: string
          slug: string
          sort_order: number
          subtitle: string | null
          why: string | null
        }
        Insert: {
          benefit?: string | null
          contraindications?: string | null
          default_cycles?: number
          description?: string | null
          evidence_label?: string | null
          evidence_url?: string | null
          exhale_seconds: number
          hold_in_seconds?: number
          hold_out_seconds?: number
          how_to?: string[]
          id?: string
          inhale_seconds: number
          intents?: string[]
          level?: Database["public"]["Enums"]["fitness_level"]
          max_cycles?: number | null
          name: string
          phases: Json
          shape?: string
          slug: string
          sort_order?: number
          subtitle?: string | null
          why?: string | null
        }
        Update: {
          benefit?: string | null
          contraindications?: string | null
          default_cycles?: number
          description?: string | null
          evidence_label?: string | null
          evidence_url?: string | null
          exhale_seconds?: number
          hold_in_seconds?: number
          hold_out_seconds?: number
          how_to?: string[]
          id?: string
          inhale_seconds?: number
          intents?: string[]
          level?: Database["public"]["Enums"]["fitness_level"]
          max_cycles?: number | null
          name?: string
          phases?: Json
          shape?: string
          slug?: string
          sort_order?: number
          subtitle?: string | null
          why?: string | null
        }
        Relationships: []
      }
      breathing_routines: {
        Row: {
          about: string | null
          created_at: string
          description: string
          id: string
          intents: string[]
          name: string
          slug: string
          sort_order: number
          steps: Json
          subtitle: string | null
        }
        Insert: {
          about?: string | null
          created_at?: string
          description: string
          id?: string
          intents?: string[]
          name: string
          slug: string
          sort_order?: number
          steps: Json
          subtitle?: string | null
        }
        Update: {
          about?: string | null
          created_at?: string
          description?: string
          id?: string
          intents?: string[]
          name?: string
          slug?: string
          sort_order?: number
          steps?: Json
          subtitle?: string | null
        }
        Relationships: []
      }
      equipment: {
        Row: {
          category: Database["public"]["Enums"]["equipment_category"]
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          category: Database["public"]["Enums"]["equipment_category"]
          id: string
          name: string
          sort_order?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["equipment_category"]
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      exercise_media: {
        Row: {
          attribution: string | null
          created_at: string
          exercise_id: string
          id: string
          licence: string | null
          position: number
          type: Database["public"]["Enums"]["media_type"]
          url: string | null
          youtube_id: string | null
        }
        Insert: {
          attribution?: string | null
          created_at?: string
          exercise_id: string
          id?: string
          licence?: string | null
          position?: number
          type: Database["public"]["Enums"]["media_type"]
          url?: string | null
          youtube_id?: string | null
        }
        Update: {
          attribution?: string | null
          created_at?: string
          exercise_id?: string
          id?: string
          licence?: string | null
          position?: number
          type?: Database["public"]["Enums"]["media_type"]
          url?: string | null
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercise_media_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_progress: {
        Row: {
          best_e1rm: number | null
          best_reps: number | null
          best_weight_kg: number | null
          consecutive_failures: number
          current_target_reps: number | null
          current_working_weight_kg: number | null
          exercise_id: string
          last_performed_on: string | null
          total_sessions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          best_e1rm?: number | null
          best_reps?: number | null
          best_weight_kg?: number | null
          consecutive_failures?: number
          current_target_reps?: number | null
          current_working_weight_kg?: number | null
          exercise_id: string
          last_performed_on?: string | null
          total_sessions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          best_e1rm?: number | null
          best_reps?: number | null
          best_weight_kg?: number | null
          consecutive_failures?: number
          current_target_reps?: number | null
          current_working_weight_kg?: number | null
          exercise_id?: string
          last_performed_on?: string | null
          total_sessions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_progress_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_substitutions: {
        Row: {
          exercise_id: string
          rank: number
          substitute_exercise_id: string
        }
        Insert: {
          exercise_id: string
          rank?: number
          substitute_exercise_id: string
        }
        Update: {
          exercise_id?: string
          rank?: number
          substitute_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_substitutions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_substitutions_substitute_exercise_id_fkey"
            columns: ["substitute_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          aliases: string[]
          category: Database["public"]["Enums"]["exercise_category"]
          contraindicated_regions: Database["public"]["Enums"]["body_region"][]
          created_at: string
          cue: string | null
          default_rest_seconds: number
          equipment_ids: string[]
          force: Database["public"]["Enums"]["force_type"] | null
          id: string
          impact: Database["public"]["Enums"]["impact_level"]
          instructions: string[]
          is_active: boolean
          is_unilateral: boolean
          level_min: Database["public"]["Enums"]["fitness_level"]
          mechanic: Database["public"]["Enums"]["mechanic_type"] | null
          metric: Database["public"]["Enums"]["exercise_metric"]
          movement_pattern: Database["public"]["Enums"]["movement_pattern"]
          name: string
          primary_muscles: Database["public"]["Enums"]["muscle"][]
          progression_chain: string | null
          progression_rank: number | null
          secondary_muscles: Database["public"]["Enums"]["muscle"][]
          slug: string
          source: string | null
          source_attribution: string | null
          source_licence: string | null
          spinal_load: Database["public"]["Enums"]["spinal_load_level"]
          tracks: Database["public"]["Enums"]["track_type"][]
        }
        Insert: {
          aliases?: string[]
          category: Database["public"]["Enums"]["exercise_category"]
          contraindicated_regions?: Database["public"]["Enums"]["body_region"][]
          created_at?: string
          cue?: string | null
          default_rest_seconds?: number
          equipment_ids?: string[]
          force?: Database["public"]["Enums"]["force_type"] | null
          id?: string
          impact?: Database["public"]["Enums"]["impact_level"]
          instructions?: string[]
          is_active?: boolean
          is_unilateral?: boolean
          level_min?: Database["public"]["Enums"]["fitness_level"]
          mechanic?: Database["public"]["Enums"]["mechanic_type"] | null
          metric?: Database["public"]["Enums"]["exercise_metric"]
          movement_pattern?: Database["public"]["Enums"]["movement_pattern"]
          name: string
          primary_muscles: Database["public"]["Enums"]["muscle"][]
          progression_chain?: string | null
          progression_rank?: number | null
          secondary_muscles?: Database["public"]["Enums"]["muscle"][]
          slug: string
          source?: string | null
          source_attribution?: string | null
          source_licence?: string | null
          spinal_load?: Database["public"]["Enums"]["spinal_load_level"]
          tracks: Database["public"]["Enums"]["track_type"][]
        }
        Update: {
          aliases?: string[]
          category?: Database["public"]["Enums"]["exercise_category"]
          contraindicated_regions?: Database["public"]["Enums"]["body_region"][]
          created_at?: string
          cue?: string | null
          default_rest_seconds?: number
          equipment_ids?: string[]
          force?: Database["public"]["Enums"]["force_type"] | null
          id?: string
          impact?: Database["public"]["Enums"]["impact_level"]
          instructions?: string[]
          is_active?: boolean
          is_unilateral?: boolean
          level_min?: Database["public"]["Enums"]["fitness_level"]
          mechanic?: Database["public"]["Enums"]["mechanic_type"] | null
          metric?: Database["public"]["Enums"]["exercise_metric"]
          movement_pattern?: Database["public"]["Enums"]["movement_pattern"]
          name?: string
          primary_muscles?: Database["public"]["Enums"]["muscle"][]
          progression_chain?: string | null
          progression_rank?: number | null
          secondary_muscles?: Database["public"]["Enums"]["muscle"][]
          slug?: string
          source?: string | null
          source_attribution?: string | null
          source_licence?: string | null
          spinal_load?: Database["public"]["Enums"]["spinal_load_level"]
          tracks?: Database["public"]["Enums"]["track_type"][]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          days_per_week: number | null
          disclaimer_accepted_at: string | null
          display_name: string | null
          goal: Database["public"]["Enums"]["fitness_goal"] | null
          has_all_equipment: boolean
          height_cm: number | null
          id: string
          level: Database["public"]["Enums"]["fitness_level"] | null
          onboarding_completed_at: string | null
          preferred_session_minutes: number
          primary_track: Database["public"]["Enums"]["track_type"] | null
          sex: Database["public"]["Enums"]["sex_type"] | null
          timezone: string | null
          units: string
          updated_at: string
          yoga_days_per_week: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          days_per_week?: number | null
          disclaimer_accepted_at?: string | null
          display_name?: string | null
          goal?: Database["public"]["Enums"]["fitness_goal"] | null
          has_all_equipment?: boolean
          height_cm?: number | null
          id: string
          level?: Database["public"]["Enums"]["fitness_level"] | null
          onboarding_completed_at?: string | null
          preferred_session_minutes?: number
          primary_track?: Database["public"]["Enums"]["track_type"] | null
          sex?: Database["public"]["Enums"]["sex_type"] | null
          timezone?: string | null
          units?: string
          updated_at?: string
          yoga_days_per_week?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          days_per_week?: number | null
          disclaimer_accepted_at?: string | null
          display_name?: string | null
          goal?: Database["public"]["Enums"]["fitness_goal"] | null
          has_all_equipment?: boolean
          height_cm?: number | null
          id?: string
          level?: Database["public"]["Enums"]["fitness_level"] | null
          onboarding_completed_at?: string | null
          preferred_session_minutes?: number
          primary_track?: Database["public"]["Enums"]["track_type"] | null
          sex?: Database["public"]["Enums"]["sex_type"] | null
          timezone?: string | null
          units?: string
          updated_at?: string
          yoga_days_per_week?: number
        }
        Relationships: []
      }
      program_day_exercises: {
        Row: {
          exercise_id: string
          id: string
          notes: string | null
          order_index: number
          program_day_id: string
          rest_seconds: number
          target_reps_max: number
          target_reps_min: number
          target_sets: number
          user_id: string
        }
        Insert: {
          exercise_id: string
          id?: string
          notes?: string | null
          order_index: number
          program_day_id: string
          rest_seconds?: number
          target_reps_max?: number
          target_reps_min?: number
          target_sets?: number
          user_id: string
        }
        Update: {
          exercise_id?: string
          id?: string
          notes?: string | null
          order_index?: number
          program_day_id?: string
          rest_seconds?: number
          target_reps_max?: number
          target_reps_min?: number
          target_sets?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_day_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_day_exercises_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
        ]
      }
      program_days: {
        Row: {
          day_index: number
          day_type: Database["public"]["Enums"]["day_type"]
          focus: string | null
          id: string
          label: string | null
          program_id: string
          user_id: string
        }
        Insert: {
          day_index: number
          day_type: Database["public"]["Enums"]["day_type"]
          focus?: string | null
          id?: string
          label?: string | null
          program_id: string
          user_id: string
        }
        Update: {
          day_index?: number
          day_type?: Database["public"]["Enums"]["day_type"]
          focus?: string | null
          id?: string
          label?: string | null
          program_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_days_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          block_number: number
          created_at: string
          days_per_week: number
          deload_week: number
          ends_on: string
          goal: Database["public"]["Enums"]["fitness_goal"]
          id: string
          level: Database["public"]["Enums"]["fitness_level"]
          primary_track: Database["public"]["Enums"]["track_type"]
          split_type: Database["public"]["Enums"]["split_type"]
          started_on: string
          status: Database["public"]["Enums"]["program_status"]
          user_id: string
        }
        Insert: {
          block_number?: number
          created_at?: string
          days_per_week: number
          deload_week?: number
          ends_on: string
          goal: Database["public"]["Enums"]["fitness_goal"]
          id?: string
          level: Database["public"]["Enums"]["fitness_level"]
          primary_track: Database["public"]["Enums"]["track_type"]
          split_type: Database["public"]["Enums"]["split_type"]
          started_on: string
          status?: Database["public"]["Enums"]["program_status"]
          user_id: string
        }
        Update: {
          block_number?: number
          created_at?: string
          days_per_week?: number
          deload_week?: number
          ends_on?: string
          goal?: Database["public"]["Enums"]["fitness_goal"]
          id?: string
          level?: Database["public"]["Enums"]["fitness_level"]
          primary_track?: Database["public"]["Enums"]["track_type"]
          split_type?: Database["public"]["Enums"]["split_type"]
          started_on?: string
          status?: Database["public"]["Enums"]["program_status"]
          user_id?: string
        }
        Relationships: []
      }
      session_exercises: {
        Row: {
          completed_at: string | null
          exercise_id: string
          feel: Database["public"]["Enums"]["set_feel"] | null
          id: string
          metric: Database["public"]["Enums"]["exercise_metric"]
          notes: string | null
          order_index: number
          planned_reps_max: number | null
          planned_reps_min: number | null
          planned_sets: number | null
          rest_seconds: number | null
          session_id: string
          status: Database["public"]["Enums"]["exercise_status"]
          swapped_from_exercise_id: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          exercise_id: string
          feel?: Database["public"]["Enums"]["set_feel"] | null
          id?: string
          metric?: Database["public"]["Enums"]["exercise_metric"]
          notes?: string | null
          order_index: number
          planned_reps_max?: number | null
          planned_reps_min?: number | null
          planned_sets?: number | null
          rest_seconds?: number | null
          session_id: string
          status?: Database["public"]["Enums"]["exercise_status"]
          swapped_from_exercise_id?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          exercise_id?: string
          feel?: Database["public"]["Enums"]["set_feel"] | null
          id?: string
          metric?: Database["public"]["Enums"]["exercise_metric"]
          notes?: string | null
          order_index?: number
          planned_reps_max?: number | null
          planned_reps_min?: number | null
          planned_sets?: number | null
          rest_seconds?: number | null
          session_id?: string
          status?: Database["public"]["Enums"]["exercise_status"]
          swapped_from_exercise_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "session_volume"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "session_exercises_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_exercises_swapped_from_exercise_id_fkey"
            columns: ["swapped_from_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      session_sets: {
        Row: {
          completed_at: string
          duration_seconds: number | null
          id: string
          is_warmup_set: boolean
          reps: number | null
          session_exercise_id: string
          set_number: number
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          completed_at?: string
          duration_seconds?: number | null
          id?: string
          is_warmup_set?: boolean
          reps?: number | null
          session_exercise_id: string
          set_number: number
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          completed_at?: string
          duration_seconds?: number | null
          id?: string
          is_warmup_set?: boolean
          reps?: number | null
          session_exercise_id?: string
          set_number?: number
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "session_sets_session_exercise_id_fkey"
            columns: ["session_exercise_id"]
            isOneToOne: false
            referencedRelation: "session_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          actual_type: Database["public"]["Enums"]["day_type"] | null
          breathing_pattern_id: string | null
          completed_at: string | null
          cooldown_completed: boolean
          created_at: string
          duration_seconds: number | null
          energy_rating: number | null
          id: string
          is_deload: boolean
          local_date: string
          notes: string | null
          planned_type: Database["public"]["Enums"]["day_type"] | null
          program_day_id: string | null
          program_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["session_status"]
          updated_at: string
          user_id: string
          warmup_completed: boolean
          week_in_block: number | null
          yoga_video_id: string | null
        }
        Insert: {
          actual_type?: Database["public"]["Enums"]["day_type"] | null
          breathing_pattern_id?: string | null
          completed_at?: string | null
          cooldown_completed?: boolean
          created_at?: string
          duration_seconds?: number | null
          energy_rating?: number | null
          id?: string
          is_deload?: boolean
          local_date: string
          notes?: string | null
          planned_type?: Database["public"]["Enums"]["day_type"] | null
          program_day_id?: string | null
          program_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
          user_id: string
          warmup_completed?: boolean
          week_in_block?: number | null
          yoga_video_id?: string | null
        }
        Update: {
          actual_type?: Database["public"]["Enums"]["day_type"] | null
          breathing_pattern_id?: string | null
          completed_at?: string | null
          cooldown_completed?: boolean
          created_at?: string
          duration_seconds?: number | null
          energy_rating?: number | null
          id?: string
          is_deload?: boolean
          local_date?: string
          notes?: string | null
          planned_type?: Database["public"]["Enums"]["day_type"] | null
          program_day_id?: string | null
          program_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          updated_at?: string
          user_id?: string
          warmup_completed?: boolean
          week_in_block?: number | null
          yoga_video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_breathing_pattern_id_fkey"
            columns: ["breathing_pattern_id"]
            isOneToOne: false
            referencedRelation: "breathing_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_program_day_id_fkey"
            columns: ["program_day_id"]
            isOneToOne: false
            referencedRelation: "program_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_yoga_video_id_fkey"
            columns: ["yoga_video_id"]
            isOneToOne: false
            referencedRelation: "yoga_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_breathing_patterns: {
        Row: {
          base_pattern_id: string | null
          created_at: string
          id: string
          name: string
          phases: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          base_pattern_id?: string | null
          created_at?: string
          id?: string
          name: string
          phases: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          base_pattern_id?: string | null
          created_at?: string
          id?: string
          name?: string
          phases?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_breathing_patterns_base_pattern_id_fkey"
            columns: ["base_pattern_id"]
            isOneToOne: false
            referencedRelation: "breathing_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      user_equipment: {
        Row: {
          equipment_id: string
          user_id: string
        }
        Insert: {
          equipment_id: string
          user_id: string
        }
        Update: {
          equipment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
        ]
      }
      user_injuries: {
        Row: {
          body_region: Database["public"]["Enums"]["body_region"]
          created_at: string
          id: string
          note: string | null
          severity: Database["public"]["Enums"]["injury_severity"]
          user_id: string
        }
        Insert: {
          body_region: Database["public"]["Enums"]["body_region"]
          created_at?: string
          id?: string
          note?: string | null
          severity?: Database["public"]["Enums"]["injury_severity"]
          user_id: string
        }
        Update: {
          body_region?: Database["public"]["Enums"]["body_region"]
          created_at?: string
          id?: string
          note?: string | null
          severity?: Database["public"]["Enums"]["injury_severity"]
          user_id?: string
        }
        Relationships: []
      }
      user_journey_progress: {
        Row: {
          completed_at: string | null
          days_completed: number
          journey_id: string
          last_day_on: string | null
          started_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          days_completed?: number
          journey_id: string
          last_day_on?: string | null
          started_on: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          days_completed?: number
          journey_id?: string
          last_day_on?: string | null
          started_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_journey_progress_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "breathing_journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          bodyweight_prompt: Database["public"]["Enums"]["bodyweight_prompt"]
          breathing_ambience: string
          breathing_ambience_volume: number
          breathing_check_in: string
          breathing_guidance: string
          breathing_kapalabhati_ack: boolean
          breathing_settle_in: boolean
          breathing_show_count: boolean
          breathing_vibrate: boolean
          breathing_voice_lang: string
          cooldown_enabled: boolean
          created_at: string
          meditation_default_minutes: number
          per_set_logging: boolean
          planning_mode: Database["public"]["Enums"]["planning_mode"]
          rest_seconds_override: number | null
          rest_timer_autostart: boolean
          rest_timer_sound: boolean
          rest_timer_vibrate: boolean
          resume_session: boolean
          safety_overrides: Json
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bodyweight_prompt?: Database["public"]["Enums"]["bodyweight_prompt"]
          breathing_ambience?: string
          breathing_ambience_volume?: number
          breathing_check_in?: string
          breathing_guidance?: string
          breathing_kapalabhati_ack?: boolean
          breathing_settle_in?: boolean
          breathing_show_count?: boolean
          breathing_vibrate?: boolean
          breathing_voice_lang?: string
          cooldown_enabled?: boolean
          created_at?: string
          meditation_default_minutes?: number
          per_set_logging?: boolean
          planning_mode?: Database["public"]["Enums"]["planning_mode"]
          rest_seconds_override?: number | null
          rest_timer_autostart?: boolean
          rest_timer_sound?: boolean
          rest_timer_vibrate?: boolean
          resume_session?: boolean
          safety_overrides?: Json
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bodyweight_prompt?: Database["public"]["Enums"]["bodyweight_prompt"]
          breathing_ambience?: string
          breathing_ambience_volume?: number
          breathing_check_in?: string
          breathing_guidance?: string
          breathing_kapalabhati_ack?: boolean
          breathing_settle_in?: boolean
          breathing_show_count?: boolean
          breathing_vibrate?: boolean
          breathing_voice_lang?: string
          cooldown_enabled?: boolean
          created_at?: string
          meditation_default_minutes?: number
          per_set_logging?: boolean
          planning_mode?: Database["public"]["Enums"]["planning_mode"]
          rest_seconds_override?: number | null
          rest_timer_autostart?: boolean
          rest_timer_sound?: boolean
          rest_timer_vibrate?: boolean
          resume_session?: boolean
          safety_overrides?: Json
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_yoga_progress: {
        Row: {
          completed_video_ids: string[]
          last_completed_at: string | null
          playlist_id: string
          user_id: string
        }
        Insert: {
          completed_video_ids?: string[]
          last_completed_at?: string | null
          playlist_id: string
          user_id: string
        }
        Update: {
          completed_video_ids?: string[]
          last_completed_at?: string | null
          playlist_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_yoga_progress_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "yoga_playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_exercises: {
        Row: {
          duration_seconds: number
          equipment_ids: string[]
          id: string
          instructions: string[]
          is_active: boolean
          name: string
          slug: string
          target_muscles: Database["public"]["Enums"]["muscle"][]
          target_regions: Database["public"]["Enums"]["body_region"][]
          type: Database["public"]["Enums"]["warmup_type"]
        }
        Insert: {
          duration_seconds?: number
          equipment_ids?: string[]
          id?: string
          instructions?: string[]
          is_active?: boolean
          name: string
          slug: string
          target_muscles?: Database["public"]["Enums"]["muscle"][]
          target_regions?: Database["public"]["Enums"]["body_region"][]
          type: Database["public"]["Enums"]["warmup_type"]
        }
        Update: {
          duration_seconds?: number
          equipment_ids?: string[]
          id?: string
          instructions?: string[]
          is_active?: boolean
          name?: string
          slug?: string
          target_muscles?: Database["public"]["Enums"]["muscle"][]
          target_regions?: Database["public"]["Enums"]["body_region"][]
          type?: Database["public"]["Enums"]["warmup_type"]
        }
        Relationships: []
      }
      yoga_playlists: {
        Row: {
          channel_url: string | null
          creator: string
          description: string | null
          id: string
          is_series: boolean
          level: Database["public"]["Enums"]["fitness_level"]
          slug: string
          sort_order: number
          title: string
          youtube_playlist_id: string | null
        }
        Insert: {
          channel_url?: string | null
          creator?: string
          description?: string | null
          id?: string
          is_series?: boolean
          level?: Database["public"]["Enums"]["fitness_level"]
          slug: string
          sort_order?: number
          title: string
          youtube_playlist_id?: string | null
        }
        Update: {
          channel_url?: string | null
          creator?: string
          description?: string | null
          id?: string
          is_series?: boolean
          level?: Database["public"]["Enums"]["fitness_level"]
          slug?: string
          sort_order?: number
          title?: string
          youtube_playlist_id?: string | null
        }
        Relationships: []
      }
      yoga_videos: {
        Row: {
          day_index: number | null
          duration_minutes: number | null
          focus_areas: string[]
          id: string
          playlist_id: string
          sort_order: number
          title: string
          youtube_video_id: string
        }
        Insert: {
          day_index?: number | null
          duration_minutes?: number | null
          focus_areas?: string[]
          id?: string
          playlist_id: string
          sort_order?: number
          title: string
          youtube_video_id: string
        }
        Update: {
          day_index?: number | null
          duration_minutes?: number | null
          focus_areas?: string[]
          id?: string
          playlist_id?: string
          sort_order?: number
          title?: string
          youtube_video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yoga_videos_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "yoga_playlists"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      exercise_strength_history: {
        Row: {
          best_e1rm: number | null
          exercise_id: string | null
          exercise_name: string | null
          local_date: string | null
          movement_pattern:
            | Database["public"]["Enums"]["movement_pattern"]
            | null
          top_weight_kg: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      session_volume: {
        Row: {
          duration_seconds: number | null
          is_deload: boolean | null
          local_date: string | null
          session_id: string | null
          set_count: number | null
          user_id: string | null
          volume_kg: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      advance_journey_day: {
        Args: {
          p_day: number
          p_journey_id: string
          p_local_date: string
          p_log_id: string
        }
        Returns: {
          advanced: boolean
          day_count: number
          days_completed: number
        }[]
      }
      record_breathing_practice: {
        Args: {
          p_breaths: number
          p_cycles: number
          p_ended_early: boolean
          p_guidance: string
          p_local_date: string
          p_log_id: string
          p_mood_before: number
          p_pattern_id: string
          p_planned_cycles: number
          p_routine_id?: string
          p_routine_step?: number
          p_seconds: number
          p_session_id?: string
          p_user_pattern_id: string
        }
        Returns: string
      }
    }
    Enums: {
      body_region:
        | "neck"
        | "shoulder"
        | "elbow"
        | "wrist"
        | "upper_back"
        | "lower_back"
        | "hip"
        | "knee"
        | "ankle"
        | "core"
      bodyweight_prompt: "daily" | "weekly" | "never"
      day_type:
        | "weights"
        | "bodyweight"
        | "yoga"
        | "meditation"
        | "rest"
        | "active_recovery"
      equipment_category:
        | "bodyweight"
        | "free_weight"
        | "machine"
        | "cable"
        | "accessory"
      exercise_category:
        | "strength"
        | "cardio"
        | "mobility"
        | "stretch"
        | "plyometric"
      exercise_metric: "reps" | "seconds"
      exercise_status: "pending" | "completed" | "skipped" | "swapped_out"
      fitness_goal:
        | "fat_loss"
        | "muscle_gain"
        | "strength"
        | "general_fitness"
        | "flexibility_stress"
      fitness_level: "beginner" | "intermediate" | "expert"
      force_type: "push" | "pull" | "static"
      impact_level: "low" | "medium" | "high"
      injury_severity: "current" | "past"
      mechanic_type: "compound" | "isolation"
      media_type: "photo" | "gif" | "video_youtube"
      movement_pattern:
        | "horizontal_press"
        | "vertical_press"
        | "horizontal_pull"
        | "vertical_pull"
        | "squat"
        | "hinge"
        | "lunge"
        | "calf"
        | "core"
        | "biceps"
        | "triceps"
        | "lateral_delt"
        | "rear_delt"
        | "forearm"
        | "neck"
        | "carry"
        | "cardio"
        | "other"
      muscle:
        | "chest"
        | "lats"
        | "upper_back"
        | "traps"
        | "lower_back"
        | "front_delts"
        | "side_delts"
        | "rear_delts"
        | "biceps"
        | "triceps"
        | "forearms"
        | "abs"
        | "obliques"
        | "glutes"
        | "quads"
        | "hamstrings"
        | "calves"
        | "hip_flexors"
        | "adductors"
        | "abductors"
        | "neck"
        | "full_body"
        | "cardio"
      planning_mode: "progression" | "daily_menu"
      program_status: "active" | "completed" | "abandoned"
      session_status:
        | "planned"
        | "in_progress"
        | "completed"
        | "skipped"
        | "rest"
      set_feel: "easy" | "right" | "hard"
      sex_type: "male" | "female" | "other" | "prefer_not_to_say"
      spinal_load_level: "none" | "low" | "high"
      split_type: "full_body" | "upper_lower" | "ppl" | "custom"
      track_type: "weights" | "bodyweight" | "yoga" | "meditation"
      warmup_type: "cardio" | "mobility" | "prehab" | "stretch"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      body_region: [
        "neck",
        "shoulder",
        "elbow",
        "wrist",
        "upper_back",
        "lower_back",
        "hip",
        "knee",
        "ankle",
        "core",
      ],
      bodyweight_prompt: ["daily", "weekly", "never"],
      day_type: [
        "weights",
        "bodyweight",
        "yoga",
        "meditation",
        "rest",
        "active_recovery",
      ],
      equipment_category: [
        "bodyweight",
        "free_weight",
        "machine",
        "cable",
        "accessory",
      ],
      exercise_category: [
        "strength",
        "cardio",
        "mobility",
        "stretch",
        "plyometric",
      ],
      exercise_metric: ["reps", "seconds"],
      exercise_status: ["pending", "completed", "skipped", "swapped_out"],
      fitness_goal: [
        "fat_loss",
        "muscle_gain",
        "strength",
        "general_fitness",
        "flexibility_stress",
      ],
      fitness_level: ["beginner", "intermediate", "expert"],
      force_type: ["push", "pull", "static"],
      impact_level: ["low", "medium", "high"],
      injury_severity: ["current", "past"],
      mechanic_type: ["compound", "isolation"],
      media_type: ["photo", "gif", "video_youtube"],
      movement_pattern: [
        "horizontal_press",
        "vertical_press",
        "horizontal_pull",
        "vertical_pull",
        "squat",
        "hinge",
        "lunge",
        "calf",
        "core",
        "biceps",
        "triceps",
        "lateral_delt",
        "rear_delt",
        "forearm",
        "neck",
        "carry",
        "cardio",
        "other",
      ],
      muscle: [
        "chest",
        "lats",
        "upper_back",
        "traps",
        "lower_back",
        "front_delts",
        "side_delts",
        "rear_delts",
        "biceps",
        "triceps",
        "forearms",
        "abs",
        "obliques",
        "glutes",
        "quads",
        "hamstrings",
        "calves",
        "hip_flexors",
        "adductors",
        "abductors",
        "neck",
        "full_body",
        "cardio",
      ],
      planning_mode: ["progression", "daily_menu"],
      program_status: ["active", "completed", "abandoned"],
      session_status: [
        "planned",
        "in_progress",
        "completed",
        "skipped",
        "rest",
      ],
      set_feel: ["easy", "right", "hard"],
      sex_type: ["male", "female", "other", "prefer_not_to_say"],
      spinal_load_level: ["none", "low", "high"],
      split_type: ["full_body", "upper_lower", "ppl", "custom"],
      track_type: ["weights", "bodyweight", "yoga", "meditation"],
      warmup_type: ["cardio", "mobility", "prehab", "stretch"],
    },
  },
} as const
