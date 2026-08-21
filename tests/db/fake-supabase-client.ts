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

    let results = state.rows.filter((row) => this.filters.every(([column, value]) => row[column] === value));
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
