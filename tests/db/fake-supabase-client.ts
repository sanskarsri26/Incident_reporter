import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;

interface TableState {
  rows: Row[];
}

type Resolver = (result: { data: unknown; error: unknown }) => void;

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: "select" | "upsert" | "insert" = "select";
  private payload: unknown;
  private filters: Array<[string, unknown]> = [];
  private single = false;
  private orderCol: string | undefined;
  private orderAsc = true;
  private limitN: number | undefined;
  private orClause: string | undefined;

  constructor(
    private readonly table: string,
    private readonly store: Map<string, TableState>,
  ) {
    if (!store.has(table)) store.set(table, { rows: [] });
  }

  select(_columns: string): this {
    this.op = "select";
    return this;
  }

  upsert(payload: unknown): this {
    this.op = "upsert";
    this.payload = payload;
    return this;
  }

  insert(payload: unknown): this {
    this.op = "insert";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  or(clause: string): this {
    this.orClause = clause;
    return this;
  }

  is(column: string, value: null): this {
    this.filters.push([column, value]);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderCol = column;
    this.orderAsc = options?.ascending ?? true;
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  maybeSingle(): this {
    this.single = true;
    return this;
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onFulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const state = this.store.get(this.table)!;
    const resolve: Resolver = onFulfilled
      ? (result) => onFulfilled(result)
      : () => {
          throw new Error("no onFulfilled handler");
        };

    if (this.op === "upsert" || this.op === "insert") {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      for (const row of rows) {
        const idx = state.rows.findIndex((r) => r.id === row.id);
        if (idx >= 0) state.rows[idx] = row;
        else state.rows.push(row);
      }
      return Promise.resolve(resolve({ data: rows, error: null }) as TResult1);
    }

    let results = state.rows.filter((row) => {
      if (!this.filters.every(([column, value]) => row[column] === value)) return false;
      if (!this.orClause) return true;
      // Only ever used for "owner_id.is.null,owner_id.eq.<id>" in this
      // project -- a real .or() parser is out of scope for a test double.
      return this.orClause.split(",").some((part) => {
        const [, op, value] = part.split(".");
        if (op === "is") return row.owner_id === null;
        if (op === "eq") return row.owner_id === value;
        return false;
      });
    });
    // Real PostgREST serializes a pgvector column as a JSON *string*, not a
    // native array -- round-trip it the same way here so a test using this
    // fake actually exercises the string-parsing path in
    // supabase-repository.ts's documentFromRow, instead of the fake
    // silently returning whatever array shape was written.
    if (this.table === "documents") {
      results = results.map((row) =>
        Array.isArray(row.embedding) ? { ...row, embedding: JSON.stringify(row.embedding) } : row,
      );
    }
    if (this.orderCol) {
      const col = this.orderCol;
      results = [...results].sort((a, b) => {
        const av = String(a[col]);
        const bv = String(b[col]);
        if (av === bv) return 0;
        const cmp = av < bv ? -1 : 1;
        return this.orderAsc ? cmp : -cmp;
      });
    }
    if (this.limitN !== undefined) results = results.slice(0, this.limitN);

    const data = this.single ? (results[0] ?? null) : results;
    return Promise.resolve(resolve({ data, error: null }) as TResult1);
  }
}

export function createFakeSupabaseClient(): SupabaseClient {
  const store = new Map<string, TableState>();
  return {
    from(table: string) {
      return new FakeQueryBuilder(table, store);
    },
  } as unknown as SupabaseClient;
}
