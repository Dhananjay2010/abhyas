/**
 * Minimal in-memory fake Supabase client for testing
 */

type Row = Record<string, unknown>;

type QueryCall = {
  table: string;
  method: string;
  filters: Array<{ column: string; value: unknown }>;
  data?: Row | Row[];
};

export class FakeSupabaseClient {
  private data: Map<string, Row[]> = new Map();
  private calls: QueryCall[] = [];

  seed(table: string, rows: Row[]) {
    this.data.set(table, rows);
  }

  getCalls() {
    return this.calls;
  }

  from(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const currentTable = table;
    let currentMethod = "";
    const currentFilters: Array<{ column: string; value: unknown }> = [];

    return {
      select(_columns?: string) {
        currentMethod = "select";
        return this;
      },

      eq(column: string, value: unknown) {
        currentFilters.push({ column, value });
        return this;
      },

      in(column: string, values: unknown[]) {
        currentFilters.push({ column, value: values });
        return this;
      },

      single() {
        self.calls.push({
          table: currentTable,
          method: currentMethod,
          filters: currentFilters,
        });

        const rows = self.data.get(currentTable) || [];
        const filtered = rows.filter((row) =>
          currentFilters.every((f) => row[f.column] === f.value)
        );
        const result = filtered[0] || null;

        return Promise.resolve({
          data: result,
          error: null,
        });
      },

      maybeSingle() {
        return this.single();
      },

      update(data: Row) {
        currentMethod = "update";
        self.calls.push({
          table: currentTable,
          method: currentMethod,
          filters: currentFilters,
          data,
        });

        return {
          eq: (column: string, value: unknown) => {
            currentFilters.push({ column, value });
            return {
              then: (resolve: (value: { data: Row | null; error: null }) => void) => {
                resolve({ data: null, error: null });
              },
            };
          },
        };
      },

      insert(data: Row | Row[]) {
        currentMethod = "insert";
        self.calls.push({
          table: currentTable,
          method: currentMethod,
          filters: currentFilters,
          data,
        });

        return Promise.resolve({
          data: null,
          error: null,
        });
      },

      upsert(data: Row | Row[]) {
        currentMethod = "upsert";
        self.calls.push({
          table: currentTable,
          method: currentMethod,
          filters: currentFilters,
          data,
        });

        return Promise.resolve({
          data: null,
          error: null,
        });
      },
    };
  }
}
