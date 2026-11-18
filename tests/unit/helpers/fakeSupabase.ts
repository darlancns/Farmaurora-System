import type { SupabaseClient } from "@supabase/supabase-js";

// Cliente Supabase falso, em memória, só com o que bancoStore usa: select / insert /
// update / upsert / delete encadeados com eq, is, order, limit e maybeSingle. Cada tabela é
// um array de linhas; `falhar` injeta um erro numa operação (tabela + op) para
// simular falha no meio de uma gravação.

type Row = Record<string, unknown>;
type Op = "select" | "insert" | "update" | "upsert" | "delete";
type Gatilho = (op: "insert" | "update", antiga: Record<string, unknown> | null, nova: Record<string, unknown>) => void;
interface Resultado {
  data: Row[] | Row | null;
  error: { message: string; code?: string } | null;
}

export class FakeSupabase {
  readonly tabelas: Record<string, Row[]> = {};
  private falhas: Array<{ tabela: string; op: Op; mensagem: string; code?: string }> = [];
  // Colunas de chave única por tabela (opt-in, só para insert): inserir valor repetido devolve o erro 23505 do Postgres.
  private chavesUnicas: Record<string, string> = {};
  // Gatilhos BEFORE INSERT/UPDATE por tabela (opt-in): recebem (op, linha antiga | null, linha nova) e podem alterar a nova.
  private gatilhos: Record<string, Gatilho> = {};
  readonly chamadas: Array<{ tabela: string; op: Op }> = [];

  semear(tabela: string, linhas: Row[]): void {
    this.tabelas[tabela] = [...(this.tabelas[tabela] ?? []), ...linhas.map((l) => ({ ...l }))];
  }

  linhas(tabela: string): Row[] {
    return this.tabelas[tabela] ?? [];
  }

  falhar(tabela: string, op: Op, mensagem = "falha injetada", code?: string): void {
    this.falhas.push({ tabela, op, mensagem, ...(code ? { code } : {}) });
  }

  // Liga um gatilho BEFORE INSERT OR UPDATE na `tabela` (ex.: gatilhoStatusDesde, helpers/gatilhoStatusDesde.ts).
  gatilho(tabela: string, fn: Gatilho | null): void {
    if (fn) this.gatilhos[tabela] = fn;
    else delete this.gatilhos[tabela];
  }

  aplicarGatilho(tabela: string, op: "insert" | "update", antiga: Row | null, nova: Row): void {
    this.gatilhos[tabela]?.(op, antiga, nova);
  }

  // Liga a unicidade de `coluna` na `tabela` (como a chave primária do banco) para os insert.
  chaveUnica(tabela: string, coluna: string): void {
    this.chavesUnicas[tabela] = coluna;
  }

  from(tabela: string): Consulta {
    return new Consulta(this, tabela);
  }

  tirarFalha(tabela: string, op: Op): { mensagem: string; code?: string } | null {
    const i = this.falhas.findIndex((f) => f.tabela === tabela && f.op === op);
    if (i < 0) return null;
    const { mensagem, code } = this.falhas.splice(i, 1)[0]!;
    return { mensagem, ...(code ? { code } : {}) };
  }

  coluna(tabela: string): string | undefined {
    return this.chavesUnicas[tabela];
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
  private opcoesUpsert: { onConflict?: string; ignoreDuplicates?: boolean } = {};

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
  // upsert por `onConflict` (colunas separadas por vírgula = a chave): `ignoreDuplicates` não mexe na linha que já existe.
  upsert(row: Row, opcoes: { onConflict?: string; ignoreDuplicates?: boolean } = {}): this {
    this.op = "upsert";
    this.payload = row;
    this.opcoesUpsert = opcoes;
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
    if (falha) return { data: null, error: { message: falha.mensagem, ...(falha.code ? { code: falha.code } : {}) } };

    const todas = (this.db.tabelas[this.tabela] ??= []);
    const casa = (r: Row) => this.filtros.every((f) => f(r));

    if (this.op === "insert") {
      const unica = this.db.coluna(this.tabela);
      if (unica && todas.some((r) => r[unica] === this.payload[unica])) {
        return {
          data: null,
          error: {
            message: `duplicate key value violates unique constraint "${this.tabela}_pkey"`,
            code: "23505",
          },
        };
      }
      const nova = { ...this.payload };
      this.db.aplicarGatilho(this.tabela, "insert", null, nova);
      todas.push(nova);
      return { data: this.retorna ? [{ ...nova }] : null, error: null };
    }
    if (this.op === "upsert") {
      const chave = (this.opcoesUpsert.onConflict ?? "id").split(",").map((c) => c.trim());
      const existente = todas.find((r) => chave.every((c) => r[c] === this.payload[c]));
      if (!existente) todas.push({ ...this.payload });
      else if (!this.opcoesUpsert.ignoreDuplicates) Object.assign(existente, this.payload);
      return { data: this.retorna ? [{ ...(existente ?? this.payload) }] : null, error: null };
    }
    if (this.op === "update") {
      const afetadas: Row[] = [];
      for (const r of todas) {
        if (!casa(r)) continue;
        const nova = { ...r, ...this.payload };
        this.db.aplicarGatilho(this.tabela, "update", r, nova);
        Object.assign(r, nova);
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
