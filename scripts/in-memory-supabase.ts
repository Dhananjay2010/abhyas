/**
 * In-memory Supabase fake for testing.
 * 
 * Implements real filtering and mutations on in-memory arrays.
 * Validates column names against allowed columns per table.
 */

type Row = Record<string, unknown>;

export type DBWrite = {
  table: string;
  operation: "insert" | "update" | "delete" | "upsert";
  filters: Record<string, unknown>;
  values: unknown;
};

type InMemoryStore = Record<string, Row[]>;

// Column validation: allowed columns per table from database.types.ts
const VALID_COLUMNS: Record<string, Set<string>> = {
  program_days: new Set([
    "id",
    "program_id",
    "user_id",
    "day_index",
    "day_type",
    "focus",
    "label",
  ]),
  programs: new Set([
    "id",
    "user_id",
    "block_number",
    "split_type",
    "days_per_week",
    "primary_track",
    "goal",
    "level",
    "started_on",
    "ends_on",
    "deload_week",
    "status",
    "created_at",
  ]),
  sessions: new Set([
    "id",
    "user_id",
    "program_id",
    "program_day_id",
    "local_date",
    "week_in_block",
    "is_deload",
    "planned_type",
    "actual_type",
    "status",
    "started_at",
    "completed_at",
    "duration_seconds",
    "warmup_completed",
    "created_at",
    // Nested joins
    "program_days",
    "session_exercises",
  ]),
  program_day_exercises: new Set([
    "id",
    "program_day_id",
    "user_id",
    "exercise_id",
    "order_index",
    "target_sets",
    "target_reps_min",
    "target_reps_max",
    "rest_seconds",
    "notes",
    "exercises",
  ]),
  session_exercises: new Set([
    "id",
    "session_id",
    "user_id",
    "exercise_id",
    "order_index",
    "planned_sets",
    "planned_reps_min",
    "planned_reps_max",
    "rest_seconds",
    "status",
    "swapped_from_exercise_id",
    "feel",
    "notes",
    "completed_at",
    "metric",
    "exercises",
    "session_sets",
  ]),
  session_sets: new Set([
    "id",
    "session_exercise_id",
    "set_number",
    "weight_kg",
    "completed_reps",
    "completed_seconds",
    "rpe",
    "notes",
    "created_at",
  ]),
  exercises: new Set([
    "id",
    "slug",
    "name",
    "cue",
    "movement_pattern",
    "mechanic",
    "metric",
    "primary_muscles",
    "equipment_ids",
    "level_min",
    "contraindicated_regions",
    "impact",
    "spinal_load",
    "tracks",
    "default_rest_seconds",
    "is_active",
  ]),
};

function validateColumns(table: string, columns: string[]) {
  const validCols = VALID_COLUMNS[table];
  if (!validCols) {
    // Unknown table - allow all columns (for flexibility in tests)
    return;
  }
  
  for (const col of columns) {
    // Strip filter suffixes
    const baseCol = col.replace(/__(:?in|is|neq|gte|lte)$/, "");
    if (!validCols.has(baseCol)) {
      throw new Error(
        `Invalid column "${col}" for table "${table}". Valid columns: ${Array.from(validCols).sort().join(", ")}`
      );
    }
  }
}

type QueryBuilder = {
  select: (columns: string) => QueryBuilder;
  eq: (column: string, value: unknown) => QueryBuilder;
  neq: (column: string, value: unknown) => QueryBuilder;
  in: (column: string, values: unknown[]) => QueryBuilder;
  is: (column: string, value: unknown) => QueryBuilder;
  gte: (column: string, value: unknown) => QueryBuilder;
  lte: (column: string, value: unknown) => QueryBuilder;
  order: (column: string, opts?: { ascending?: boolean; referencedTable?: string }) => QueryBuilder;
  limit: (count: number) => QueryBuilder;
  single: () => Promise<{ data: Row | null; error: null }>;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  then: (resolve: (value: { data: Row[]; error: null }) => void) => void;
};

type WriteBuilder = {
  eq: (column: string, value: unknown) => WriteBuilder;
  in: (column: string, values: unknown[]) => WriteBuilder;
  then: (resolve: (value: { data: null; error: null }) => void) => void;
};

type InsertBuilder = {
  select: (columns: string) => InsertBuilder;
  single: () => Promise<{ data: Row; error: null }>;
  then: (resolve: (value: { data: Row[]; error: null }) => void) => void;
};

export function createInMemorySupabase(initialData: InMemoryStore = {}) {
  const store: InMemoryStore = JSON.parse(JSON.stringify(initialData));
  const writes: DBWrite[] = [];

  function applyFilters(rows: Row[], filters: Record<string, unknown>): Row[] {
    let result = [...rows];

    for (const [key, value] of Object.entries(filters)) {
      if (key.endsWith("__in")) {
        const column = key.slice(0, -4);
        const values = value as unknown[];
        result = result.filter((row) => values.includes(row[column]));
      } else if (key.endsWith("__is")) {
        const column = key.slice(0, -4);
        result = result.filter((row) => row[column] === value);
      } else if (key.endsWith("__neq")) {
        const column = key.slice(0, -5);
        result = result.filter((row) => row[column] !== value);
      } else if (key.endsWith("__gte")) {
        const column = key.slice(0, -5);
        result = result.filter((row) => {
          const rowVal = row[column];
          return typeof rowVal === "string" || typeof rowVal === "number"
            ? rowVal >= (value as string | number)
            : false;
        });
      } else if (key.endsWith("__lte")) {
        const column = key.slice(0, -5);
        result = result.filter((row) => {
          const rowVal = row[column];
          return typeof rowVal === "string" || typeof rowVal === "number"
            ? rowVal <= (value as string | number)
            : false;
        });
      } else {
        // Simple equality
        result = result.filter((row) => row[key] === value);
      }
    }

    return result;
  }

  function createQueryBuilder(
    table: string,
    filters: Record<string, unknown> = {},
    orderBy?: { column: string; ascending: boolean },
    limitCount?: number,
  ): QueryBuilder {
    // Validate filter columns
    validateColumns(table, Object.keys(filters));
    // Only validate order column if it's for this table (not a referenced table)
    // The order(..., { referencedTable }) case skips validation
    if (orderBy && !orderBy.column.includes("__referenced__")) {
      validateColumns(table, [orderBy.column]);
    }

    const execute = () => {
      const rows = store[table] || [];
      let result = applyFilters(rows, filters);

      if (orderBy) {
        // Strip the __referenced__ marker if present
        const col = orderBy.column.replace("__referenced__", "");
        result.sort((a, b) => {
          const aVal = a[col];
          const bVal = b[col];
          if (aVal === bVal) return 0;
          const cmp = aVal < bVal ? -1 : 1;
          return orderBy.ascending ? cmp : -cmp;
        });
      }

      if (limitCount !== undefined) {
        result = result.slice(0, limitCount);
      }

      return { data: result, error: null };
    };

    const builder: QueryBuilder = {
      select: () => builder,
      eq: (column, value) =>
        createQueryBuilder(table, { ...filters, [column]: value }, orderBy, limitCount),
      neq: (column, value) =>
        createQueryBuilder(table, { ...filters, [`${column}__neq`]: value }, orderBy, limitCount),
      in: (column, values) =>
        createQueryBuilder(table, { ...filters, [`${column}__in`]: values }, orderBy, limitCount),
      is: (column, value) =>
        createQueryBuilder(table, { ...filters, [`${column}__is`]: value }, orderBy, limitCount),
      gte: (column, value) =>
        createQueryBuilder(table, { ...filters, [`${column}__gte`]: value }, orderBy, limitCount),
      lte: (column, value) =>
        createQueryBuilder(table, { ...filters, [`${column}__lte`]: value }, orderBy, limitCount),
      order: (column, opts = { ascending: true }) => {
        // Mark referenced table orders to skip column validation
        const col = opts.referencedTable ? `${column}__referenced__` : column;
        return createQueryBuilder(table, filters, { column: col, ascending: opts.ascending ?? true }, limitCount);
      },
      limit: (count) => createQueryBuilder(table, filters, orderBy, count),
      single: async () => {
        const result = execute();
        return { data: result.data[0] || null, error: null };
      },
      maybeSingle: async () => {
        const result = execute();
        return { data: result.data[0] || null, error: null };
      },
      then: (resolve) => {
        resolve(execute());
      },
    };

    return builder;
  }

  function createWriteBuilder(
    table: string,
    operation: "update" | "delete",
    values: unknown,
    filters: Record<string, unknown> = {},
  ): WriteBuilder {
    // Validate filter columns
    validateColumns(table, Object.keys(filters));
    
    // Validate update columns
    if (operation === "update" && values && typeof values === "object") {
      validateColumns(table, Object.keys(values as Record<string, unknown>));
    }

    const execute = () => {
      const rows = store[table] || [];
      const matchedRows = applyFilters(rows, filters);

      if (operation === "update") {
        matchedRows.forEach((row) => {
          Object.assign(row, values);
        });
      } else if (operation === "delete") {
        const matchedIds = new Set(matchedRows);
        store[table] = rows.filter((row) => !matchedIds.has(row));
      }

      writes.push({ table, operation, filters, values });
      return { data: null, error: null };
    };

    const builder: WriteBuilder = {
      eq: (column, value) =>
        createWriteBuilder(table, operation, values, { ...filters, [column]: value }),
      in: (column, inValues) =>
        createWriteBuilder(table, operation, values, { ...filters, [`${column}__in`]: inValues }),
      then: (resolve) => {
        resolve(execute());
      },
    };

    return builder;
  }

  function createInsertBuilder(table: string, values: unknown): InsertBuilder {
    const execute = () => {
      if (!store[table]) {
        store[table] = [];
      }

      const rows = Array.isArray(values) ? values : [values];
      
      // Validate columns on first row
      if (rows.length > 0 && typeof rows[0] === "object" && rows[0] !== null) {
        validateColumns(table, Object.keys(rows[0] as Record<string, unknown>));
      }

      const insertedRows = rows.map((v, i) => {
        const row = { ...v, id: v.id || `${table}-${Date.now()}-${i}` };
        store[table].push(row);
        return row;
      });

      writes.push({ table, operation: "insert", filters: {}, values });
      return { data: Array.isArray(values) ? insertedRows : insertedRows[0], error: null };
    };

    const builder: InsertBuilder = {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      select: (_columns: string) => builder,
      single: async () => {
        const result = execute();
        return { data: Array.isArray(result.data) ? result.data[0] : result.data, error: null };
      },
      then: (resolve) => {
        const result = execute();
        resolve({ data: Array.isArray(result.data) ? result.data : [result.data], error: null });
      },
    };

    return builder;
  }

  return {
    writes,
    store,
    from: (table: string) => ({
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      select: (_columns: string) => createQueryBuilder(table),
      insert: (values: unknown) => createInsertBuilder(table, values),
      update: (values: unknown) => createWriteBuilder(table, "update", values),
      delete: () => createWriteBuilder(table, "delete", null),
      upsert: (values: unknown) => createInsertBuilder(table, values),
    }),
  };
}
