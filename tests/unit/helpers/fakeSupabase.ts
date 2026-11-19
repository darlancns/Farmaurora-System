import type { SupabaseClient } from "@supabase/supabase-js";

// Cliente Supabase falso, em memória, só com o que bancoStore usa: select / insert /
// update / upsert / delete encadeados com eq, is, order, limit, range e maybeSingle. Cada tabela é
// um array de linhas; `falhar` injeta um erro numa operação (tabela + op) para
// simular falha no meio de uma gravação.
//
// Como o PostgREST do Supabase, um select devolve NO MÁXIMO `TETO_LINHAS_POR_CONSULTA` (1000) linhas, com ou sem
// `.limit()`/`.range()`, e sem erro nem aviso: quem não pagina perde o resto em silêncio.

/** Teto de linhas por consulta (o `max-rows` padrão do Supabase). */
export const TETO_LINHAS_POR_CONSULTA = 1000;

type Row = Record<string, unknown>;
type Op = "select" | "insert" | "update" | "upsert" | "delete";
interface Resultado {
  data: Row[] | Row | null;
  error: { message: string; code?: string } | null;
  /** Só num select com `{ count: "exact" }`: quantas linhas casaram. */
  count?: number;
}

/** Função (RPC) simulada: recebe os argumentos e devolve `data` ou `error` (com `code`, como o PostgREST). */
export type FuncaoRpc = (args: Record<string, unknown>, db: FakeSupabase) => { data?: unknown; error?: { message: string; code?: string } };

export class FakeSupabase {
  readonly tabelas: Record<string, Row[]> = {};
  private falhas: Array<{ tabela: string; op: Op; mensagem: string }> = [];
  readonly chamadas: Array<{ tabela: string; op: Op }> = [];
  // Colunas pedidas em cada select puro (o argumento de `.select(colunas)`); o fake NÃO projeta as linhas por elas.
  readonly selects: Array<{ tabela: string; colunas: string | undefined }> = [];

  // Funções SQL simuladas por nome (db.rpc); o teste registra a que precisa.
  readonly rpcs: Record<string, FuncaoRpc> = {};
  readonly chamadasRpc: Array<{ nome: string; args: Record<string, unknown> }> = [];

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

  // db.rpc(nome, args): roda a função registrada em `rpcs`. Sem registro, devolve o erro de função inexistente (PGRST202).
  async rpc(nome: string, args: Record<string, unknown> = {}): Promise<{ data: unknown; error: { message: string; code?: string } | null }> {
    this.chamadasRpc.push({ nome, args });
    const funcao = this.rpcs[nome];
    if (!funcao) return { data: null, error: { message: `função ${nome} inexistente`, code: "PGRST202" } };
    const r = funcao(args, this);
    return { data: r.data ?? null, error: r.error ?? null };
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
  private faixa: { de: number; ate: number } | null = null;
  private unica = false;
  private retorna = false;
  private opcoesUpsert: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private contagem: { head: boolean } | null = null;

  constructor(
    private readonly db: FakeSupabase,
    private readonly tabela: string,
  ) {}

  // Depois de insert/update/delete, `.select()` pede as linhas afetadas de volta (PostgREST
  // `Prefer: return=representation`); num select puro não muda nada.
  select(colunas?: string, opcoes?: { count?: "exact"; head?: boolean }): this {
    if (this.op !== "select") this.retorna = true;
    else {
      this.db.selects.push({ tabela: this.tabela, colunas });
      if (opcoes?.count) this.contagem = { head: opcoes.head === true };
    }
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
  // range(de, ate): linhas de `de` a `ate`, INCLUSIVE nas duas pontas (como o PostgREST), sobre a lista já ordenada.
  range(de: number, ate: number): this {
    this.faixa = { de, ate };
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
    if (this.faixa !== null) achadas = achadas.slice(this.faixa.de, this.faixa.ate + 1);
    if (this.max !== null) achadas = achadas.slice(0, this.max);
    // Teto do servidor (não vale para a contagem exata, que o PostgREST calcula à parte).
    const total = achadas.length;
    achadas = achadas.slice(0, TETO_LINHAS_POR_CONSULTA);
    if (this.contagem) return { data: this.contagem.head ? null : achadas, error: null, count: total };
    return { data: this.unica ? (achadas[0] ?? null) : achadas, error: null };
  }
}
