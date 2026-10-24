/**
 * Recording fake Supabase client for testing DB operations.
 *
 * Records all write operations (insert, update, delete) and returns seeded data.
 */

export type DBWrite = {
  table: string;
  operation: "insert" | "update" | "delete" | "upsert";
  filters: Record<string, unknown>;
  values: unknown;
};

export type SeedData = Record<string, unknown[]>;

type QueryChain = {
  select: (columns: string) => QueryChain;
  eq: (column: string, value: unknown) => QueryChain;
  in: (column: string, values: unknown[]) => QueryChain;
  is: (column: string, value: unknown) => QueryChain;
  gte: (column: string, value: unknown) => QueryChain;
  order: (column: string, opts?: { ascending?: boolean }) => QueryChain;
  limit: (count: number) => QueryChain;
  single: () => Promise<{ data: unknown; error: null }>;
  maybeSingle: () => Promise<{ data: unknown | null; error: null }>;
  then: (resolve: (value: { data: unknown; error: null }) => void) => void;
};

type WriteChain = {
  eq: (column: string, value: unknown) => WriteChain;
  in: (column: string, values: unknown[]) => WriteChain;
  then: (resolve: (value: { data: unknown; error: null }) => void) => void;
};

type InsertChain = {
  select: (columns: string) => InsertChain;
  single: () => Promise<{ data: unknown; error: null }>;
  then: (resolve: (value: { data: unknown; error: null }) => void) => void;
};

export function createRecordingFakeClient(seedData: SeedData) {
  const writes: DBWrite[] = [];

  function createQueryChain(
    table: string,
    filters: Record<string, unknown> = {},
  ): QueryChain {
    const execute = () => {
      const rows = seedData[table] || [];
      return { data: rows, error: null };
    };

    const chain: QueryChain = {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      select: (_columns: string) => createQueryChain(table, filters),
      eq: (column: string, value: unknown) =>
        createQueryChain(table, { ...filters, [column]: value }),
      in: (column: string, values: unknown[]) =>
        createQueryChain(table, { ...filters, [`${column}__in`]: values }),
      is: (column: string, value: unknown) =>
        createQueryChain(table, { ...filters, [`${column}__is`]: value }),
      gte: (column: string, value: unknown) =>
        createQueryChain(table, { ...filters, [`${column}__gte`]: value }),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      order: (_column: string, _opts?: { ascending?: boolean }) =>
        createQueryChain(table, filters),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      limit: (_count: number) => createQueryChain(table, filters),
      single: async () => {
        const rows = seedData[table] || [];
        return { data: rows[0] || null, error: null };
      },
      maybeSingle: async () => {
        const rows = seedData[table] || [];
        return { data: rows[0] || null, error: null };
      },
      then: (resolve: (value: { data: unknown; error: null }) => void) => {
        resolve(execute());
      },
    };

    return chain;
  }

  function createWriteChain(
    table: string,
    operation: "update" | "delete",
    values: unknown,
    filters: Record<string, unknown> = {},
  ): WriteChain {
    const execute = () => {
      writes.push({ table, operation, filters, values });
      return { data: null, error: null };
    };

    const chain: WriteChain = {
      eq: (column: string, value: unknown) =>
        createWriteChain(table, operation, values, { ...filters, [column]: value }),
      in: (column: string, inValues: unknown[]) =>
        createWriteChain(table, operation, values, { ...filters, [`${column}__in`]: inValues }),
      then: (resolve: (value: { data: unknown; error: null }) => void) => {
        resolve(execute());
      },
    };

    return chain;
  }

  function createInsertChain(table: string, values: unknown): InsertChain {
    const execute = () => {
      writes.push({ table, operation: "insert", filters: {}, values });
      if (Array.isArray(values)) {
        return {
          data: values.map((v, i) => {
            if (typeof v === "object" && v !== null) {
              return { ...v, id: `${table}-new-${i}` };
            }
            return { id: `${table}-new-${i}` };
          }),
          error: null,
        };
      }
      if (typeof values === "object" && values !== null) {
        return { data: { ...values, id: `${table}-new` }, error: null };
      }
      return { data: { id: `${table}-new` }, error: null };
    };

    const chain: InsertChain = {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      select: (_columns: string) => chain,
      single: async () => {
        const result = execute();
        return {
          data: Array.isArray(result.data) ? result.data[0] : result.data,
          error: null,
        };
      },
      then: (resolve: (value: { data: unknown; error: null }) => void) => {
        resolve(execute());
      },
    };

    return chain;
  }

  return {
    writes,
    from: (table: string) => ({
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      select: (_columns: string) => createQueryChain(table),
      insert: (values: unknown) => createInsertChain(table, values),
      update: (values: unknown) => createWriteChain(table, "update", values),
      delete: () => createWriteChain(table, "delete", null),
      upsert: (values: unknown) => createInsertChain(table, values),
    }),
  };
}
