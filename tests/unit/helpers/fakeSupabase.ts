import type { SupabaseClient } from "@supabase/supabase-js";

// Cliente Supabase falso, em memória, só com o que bancoStore usa: select / insert /
// update / delete encadeados com eq, is, order, limit e maybeSingle. Cada tabela é
// um array de linhas; `falhar` injeta um erro numa operação (tabela + op) para
// simular falha no meio de uma gravação.

type Row = Record<string, unknown>;
type Op = "select" | "insert" | "update" | "delete";
interface Resultado {
  data: Row[] | Row | null;
  error: { message: string } | null;
}

export class FakeSupabase {
  readonly tabelas: Record<string, Row[]> = {};
  private falhas: Array<{ tabela: string; op: Op; mensagem: string }> = [];
  readonly chamadas: Array<{ tabela: string; op: Op }> = [];

  semear(tabela: string, linhas: Row[]): void {
    this.tabelas[tabela] = [...(this.tabelas[tabela] ?? []), ...linhas.map((l) => ({ ...l }))];
  }

  linhas(tabela: string): Row[] {
    return this.tabelas[tabela] ?? [];
  }

  falhar(tabela: string, op: Op, mensagem = "falha injetada"): void {
    this.falhas.push({ tabela, op, mensagem });
  }

  from(tabela: string): Consulta {
    return new Consulta(this, tabela);
  }

  tirarFalha(tabela: string, op: Op): string | null {
    const i = this.falhas.findIndex((f) => f.tabela === tabela && f.op === op);
    if (i < 0) return null;
    return this.falhas.splice(i, 1)[0]!.mensagem;
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

class Consulta implements PromiseLike<Resultado> {
  private op: Op = "select";
  private payload: Row = {};
  private filtros: Array<(r: Row) => boolean> = [];
  private ordens: Array<{ col: string; asc: boolean }> = [];
  private max: number | null = null;
  private unica = false;
  private retorna = false;

  constructor(
    private readonly db: FakeSupabase,
    private readonly tabela: string,
  ) {}

  // Depois de insert/update/delete, `.select()` pede as linhas afetadas de volta (PostgREST
  // `Prefer: return=representation`); num select puro não muda nada.
  select(): this {
    if (this.op !== "select") this.retorna = true;
    return this;
  }
  insert(row: Row): this {
    this.op = "insert";
    this.payload = row;
    return this;
  }
  update(patch: Row): this {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete(): this {
    this.op = "delete";
    return this;
  }
  eq(col: string, valor: unknown): this {
    this.filtros.push((r) => r[col] === valor);
    return this;
  }
  is(col: string, valor: null): this {
    this.filtros.push((r) => (r[col] ?? null) === valor);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.ordens.push({ col, asc: opts?.ascending ?? true });
    return this;
  }
  limit(n: number): this {
    this.max = n;
    return this;
  }
  maybeSingle(): this {
    this.unica = true;
    return this;
  }

  then<R1 = Resultado, R2 = never>(
    ok?: ((v: Resultado) => R1 | PromiseLike<R1>) | null,
    ko?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.executar()).then(ok, ko);
  }

  private executar(): Resultado {
    this.db.chamadas.push({ tabela: this.tabela, op: this.op });
    const falha = this.db.tirarFalha(this.tabela, this.op);
    if (falha) return { data: null, error: { message: falha } };

    const todas = (this.db.tabelas[this.tabela] ??= []);
    const casa = (r: Row) => this.filtros.every((f) => f(r));

    if (this.op === "insert") {
      const nova = { ...this.payload };
      todas.push(nova);
      return { data: this.retorna ? [{ ...nova }] : null, error: null };
    }
    if (this.op === "update") {
      const afetadas: Row[] = [];
      for (const r of todas) {
        if (!casa(r)) continue;
        Object.assign(r, this.payload);
        afetadas.push({ ...r });
      }
      return { data: this.retorna ? afetadas : null, error: null };
    }
    if (this.op === "delete") {
      this.db.tabelas[this.tabela] = todas.filter((r) => !casa(r));
      return { data: null, error: null };
    }

    let achadas = todas.filter(casa).map((r) => ({ ...r }));
    achadas.sort((a, b) => {
      for (const { col, asc } of this.ordens) {
        const c = String(a[col]).localeCompare(String(b[col]));
        if (c !== 0) return c * (asc ? 1 : -1);
      }
      return 0;
    });
    if (this.max !== null) achadas = achadas.slice(0, this.max);
    return { data: this.unica ? (achadas[0] ?? null) : achadas, error: null };
  }
}
