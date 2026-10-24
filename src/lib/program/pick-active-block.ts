type ProgramRow = {
  block_number: number;
  status: "active" | "superseded" | "retired" | null;
};

export function pickActiveBlock(rows: ProgramRow[]): number {
  const filtered = rows.filter(
    (row) => row.status !== "superseded" && row.status !== "retired"
  );
  
  if (filtered.length === 0) return 1;
  
  const sorted = filtered.sort((a, b) => b.block_number - a.block_number);
  return sorted[0].block_number;
}
