import type { SupabaseClient } from "@supabase/supabase-js";

// Cliente Supabase falso, em memória, só com o que bancoStore usa: select / insert /
// update / upsert / delete encadeados com eq, is, in, ilike, order, limit, range e maybeSingle. Cada tabela é
// um array de linhas; `falhar` injeta um erro numa operação (tabela + op) para
// simular falha no meio de uma gravação.
//
// Como o PostgREST do Supabase, um select devolve NO MÁXIMO `TETO_LINHAS_POR_CONSULTA` (1000) linhas, com ou sem
// `.limit()`/`.range()`, e sem erro nem aviso: quem não pagina perde o resto em silêncio.

/** Teto de linhas por consulta (o `max-rows` padrão do Supabase). */
export const TETO_LINHAS_POR_CONSULTA = 1000;

type Row = Record<string, unknown>;
type Op = "select" | "insert" | "update" | "upsert" | "delete";
type Gatilho = (op: "insert" | "update", antiga: Record<string, unknown> | null, nova: Record<string, unknown>) => void;
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
  private falhas: Array<{ tabela: string; op: Op; mensagem: string; code?: string }> = [];
  // Gatilhos BEFORE INSERT/UPDATE por tabela (opt-in): recebem (op, linha antiga | null, linha nova) e podem alterar a nova.
  private gatilhos: Record<string, Gatilho> = {};
  readonly chamadas: Array<{ tabela: string; op: Op }> = [];
  // Colunas pedidas em cada select puro (o argumento de `.select(colunas)`); o fake NÃO projeta as linhas por elas.
  readonly selects: Array<{ tabela: string; colunas: string | undefined }> = [];

  // Unicidade opt-in por tabela: conferida no FIM de cada comando de escrita (insert, upsert ou update), como uma constraint
  // DEFERRABLE em autocommit (ou uma imediata sem trocas no meio do comando). Violou: o comando inteiro é desfeito e o erro é 23505.
  private unicos: Array<{ tabela: string; colunas: string[]; nome: string }> = [];

  // Chaves estrangeiras opt-in, conferidas no DELETE do pai: "restrict" (NO ACTION: 23503), "cascade" (apaga as filhas) ou "set null" (zera a coluna delas).
  private fks: Array<{ filha: string; coluna: string; pai: string; colunaPai: string; acao: "restrict" | "cascade" | "set null"; nome: string }> = [];
  // Operações SEM privilégio na tabela (42501), como um GRANT que falta: vale para sempre (ao contrário de `falhar`, que vale uma vez).
  private negadas: Array<{ tabela: string; op: Op }> = [];

  // Ganchos de teste: `antes(tabela, op, fn)` roda `fn` UMA vez, logo antes da próxima operação dessa tabela (simula outra requisição que chegou no meio).
  private ganchos: Array<{ tabela: string; op: Op; fn: () => void }> = [];

  // Funções SQL simuladas por nome (db.rpc); o teste registra a que precisa.
  readonly rpcs: Record<string, FuncaoRpc> = {};
  readonly chamadasRpc: Array<{ nome: string; args: Record<string, unknown> }> = [];

  semear(tabela: string, linhas: Row[]): void {
    this.tabelas[tabela] = [...(this.tabelas[tabela] ?? []), ...linhas.map((l) => ({ ...l }))];
  }

  linhas(tabela: string): Row[] {
    return this.tabelas[tabela] ?? [];
  }

  antes(tabela: string, op: Op, fn: () => void): void {
    this.ganchos.push({ tabela, op, fn });
  }

  tirarGancho(tabela: string, op: Op): (() => void) | null {
    const i = this.ganchos.findIndex((g) => g.tabela === tabela && g.op === op);
    return i < 0 ? null : this.ganchos.splice(i, 1)[0]!.fn;
  }

  /** Injeta um erro na próxima operação da tabela; `code` (ex.: "23505") vai junto no erro devolvido, como o PostgREST. */
  falhar(tabela: string, op: Op, mensagem = "falha injetada", code?: string): void {
    this.falhas.push({ tabela, op, mensagem, ...(code ? { code } : {}) });
  }

  /** Liga uma chave estrangeira (`filha.coluna` -> `pai.colunaPai`) com a ação do DELETE do pai. Religar a mesma não duplica. */
  chaveEstrangeira(filha: string, coluna: string, pai: string, colunaPai: string, acao: "restrict" | "cascade" | "set null", nome = `${filha}_${coluna}_fkey`): void {
    this.fks = this.fks.filter((f) => f.nome !== nome);
    this.fks.push({ filha, coluna, pai, colunaPai, acao, nome });
  }

  /** Tira todas as chaves estrangeiras e permissões negadas (para o `beforeEach` dos testes que as usam). */
  limparRestricoes(): void {
    this.fks = [];
    this.negadas = [];
  }

  /** `op` na `tabela` passa a dar 42501 (permission denied), até `liberar`. */
  negarPermissao(tabela: string, op: Op): void {
    if (!this.negadas.some((n) => n.tabela === tabela && n.op === op)) this.negadas.push({ tabela, op });
  }

  liberar(tabela: string, op: Op): void {
    this.negadas = this.negadas.filter((n) => !(n.tabela === tabela && n.op === op));
  }

  permissaoNegada(tabela: string, op: Op): boolean {
    return this.negadas.some((n) => n.tabela === tabela && n.op === op);
  }

  /** As FKs que apontam para `pai` (usado pelo DELETE). */
  fksDoPai(pai: string): Array<{ filha: string; coluna: string; pai: string; colunaPai: string; acao: "restrict" | "cascade" | "set null"; nome: string }> {
    return this.fks.filter((f) => f.pai === pai);
  }

  // Liga um gatilho BEFORE INSERT OR UPDATE na `tabela` (ex.: gatilhoStatusDesde, helpers/gatilhoStatusDesde.ts).
  gatilho(tabela: string, fn: Gatilho | null): void {
    if (fn) this.gatilhos[tabela] = fn;
    else delete this.gatilhos[tabela];
  }

  aplicarGatilho(tabela: string, op: "insert" | "update", antiga: Row | null, nova: Row): void {
    this.gatilhos[tabela]?.(op, antiga, nova);
  }

  /** Unicidade de uma coluna só, como a chave primária do banco: o erro é o 23505 de `<tabela>_pkey`. Atalho de `unico`. */
  chaveUnica(tabela: string, coluna: string): void {
    const nome = `${tabela}_pkey`;
    this.unicos = this.unicos.filter((u) => !(u.tabela === tabela && u.nome === nome)); // religar não duplica (beforeEach)
    this.unico(tabela, [coluna], nome);
  }

  /** Liga a unicidade de `colunas` na `tabela` (linhas com alguma coluna nula não contam, como no Postgres). */
  unico(tabela: string, colunas: string[], nome: string): void {
    this.unicos.push({ tabela, colunas, nome });
  }

  /** O nome da primeira unicidade violada na tabela, ou null. */
  unicoViolado(tabela: string): string | null {
    for (const u of this.unicos.filter((x) => x.tabela === tabela)) {
      const vistos = new Set<string>();
      for (const r of this.tabelas[tabela] ?? []) {
        if (u.colunas.some((c) => r[c] === null || r[c] === undefined)) continue;
        const chave = JSON.stringify(u.colunas.map((c) => r[c]));
        if (vistos.has(chave)) return u.nome;
        vistos.add(chave);
      }
    }
    return null;
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

  tirarFalha(tabela: string, op: Op): { mensagem: string; code?: string } | null {
    const i = this.falhas.findIndex((f) => f.tabela === tabela && f.op === op);
    if (i < 0) return null;
    const { mensagem, code } = this.falhas.splice(i, 1)[0]!;
    return { mensagem, ...(code ? { code } : {}) };
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }
}

// Padrão do LIKE/ILIKE do Postgres como expressão regular: % = qualquer trecho, _ = um caractere, o resto é literal.
function likeParaRegExp(padrao: string): RegExp {
  let re = "";
  for (const ch of padrao) re += ch === "%" ? ".*" : ch === "_" ? "." : ch.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
  return new RegExp(`^${re}$`, "is");
}

class Consulta implements PromiseLike<Resultado> {
  private op: Op = "select";
  private payload: Row = {};
  private payloads: Row[] = [];
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
  // insert e upsert aceitam UMA linha ou uma LISTA (um comando só, como o PostgREST).
  insert(row: Row | Row[]): this {
    this.op = "insert";
    this.payloads = Array.isArray(row) ? row : [row];
    return this;
  }
  update(patch: Row): this {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  // upsert por `onConflict` (colunas separadas por vírgula = a chave): `ignoreDuplicates` não mexe na linha que já existe.
  upsert(row: Row | Row[], opcoes: { onConflict?: string; ignoreDuplicates?: boolean } = {}): this {
    this.op = "upsert";
    this.payloads = Array.isArray(row) ? row : [row];
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
  in(col: string, valores: readonly unknown[]): this {
    this.filtros.push((r) => valores.includes(r[col]));
    return this;
  }
  // ilike("coluna", "%texto%"): sem diferença de caixa.
  ilike(col: string, padrao: string): this {
    const re = likeParaRegExp(padrao);
    this.filtros.push((r) => typeof r[col] === "string" && re.test(r[col] as string));
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
    this.db.tirarGancho(this.tabela, this.op)?.();
    if (this.db.permissaoNegada(this.tabela, this.op)) return { data: null, error: { message: `permission denied for table ${this.tabela}`, code: "42501" } };
    const falha = this.db.tirarFalha(this.tabela, this.op);
    if (falha) return { data: null, error: { message: falha.mensagem, ...(falha.code ? { code: falha.code } : {}) } };

    const todas = (this.db.tabelas[this.tabela] ??= []);
    const casa = (r: Row) => this.filtros.every((f) => f(r));

    // Escrita: o comando é UM só. Se uma unicidade ligada (`unico`) fica violada no fim dele, tudo é desfeito (23505).
    const comUnicidade = (escrever: () => Resultado): Resultado => {
      const antes = todas.map((r) => ({ ...r }));
      const resultado = escrever();
      const violada = this.db.unicoViolado(this.tabela);
      if (violada === null) return resultado;
      this.db.tabelas[this.tabela] = antes;
      return { data: null, error: { message: `duplicate key value violates unique constraint "${violada}"`, code: "23505" } };
    };

    if (this.op === "insert") {
      return comUnicidade(() => {
        const novas = this.payloads.map((p) => ({ ...p }));
        for (const nova of novas) this.db.aplicarGatilho(this.tabela, "insert", null, nova);
        todas.push(...novas);
        return { data: this.retorna ? novas.map((n) => ({ ...n })) : null, error: null };
      });
    }
    if (this.op === "upsert") {
      return comUnicidade(() => {
        const chave = (this.opcoesUpsert.onConflict ?? "id").split(",").map((c) => c.trim());
        const devolvidas: Row[] = [];
        for (const payload of this.payloads) {
          const existente = todas.find((r) => chave.every((c) => r[c] === payload[c]));
          if (!existente) todas.push({ ...payload });
          else if (!this.opcoesUpsert.ignoreDuplicates) Object.assign(existente, payload);
          devolvidas.push({ ...(existente ?? payload) });
        }
        return { data: this.retorna ? devolvidas : null, error: null };
      });
    }
    if (this.op === "update") {
      return comUnicidade(() => {
        const afetadas: Row[] = [];
        for (const r of todas) {
          if (!casa(r)) continue;
          const nova = { ...r, ...this.payload };
          this.db.aplicarGatilho(this.tabela, "update", r, nova);
          Object.assign(r, nova);
          afetadas.push({ ...r });
        }
        return { data: this.retorna ? afetadas : null, error: null };
      });
    }
    if (this.op === "delete") {
      const apagadas = todas.filter(casa);
      // Chaves estrangeiras opt-in: "restrict" barra o comando todo (23503); "cascade" e "set null" mexem nas filhas.
      for (const fk of this.db.fksDoPai(this.tabela)) {
        const filhas = (this.db.tabelas[fk.filha] ?? []).filter((f) => apagadas.some((a) => a[fk.colunaPai] === f[fk.coluna]));
        if (fk.acao === "restrict" && filhas.length > 0) {
          return {
            data: null,
            error: { message: `update or delete on table "${this.tabela}" violates foreign key constraint "${fk.nome}" on table "${fk.filha}"`, code: "23503" },
          };
        }
      }
      for (const fk of this.db.fksDoPai(this.tabela)) {
        const pertence = (f: Row) => apagadas.some((a) => a[fk.colunaPai] === f[fk.coluna]);
        if (fk.acao === "cascade") this.db.tabelas[fk.filha] = (this.db.tabelas[fk.filha] ?? []).filter((f) => !pertence(f));
        if (fk.acao === "set null") for (const f of this.db.tabelas[fk.filha] ?? []) if (pertence(f)) f[fk.coluna] = null;
      }
      this.db.tabelas[this.tabela] = todas.filter((r) => !casa(r));
      return { data: this.retorna ? apagadas.map((r) => ({ ...r })) : null, error: null };
    }

    let achadas = todas.filter(casa).map((r) => ({ ...r }));
    achadas.sort((a, b) => {
      for (const { col, asc } of this.ordens) {
        const c =
          typeof a[col] === "number" && typeof b[col] === "number"
            ? (a[col] as number) - (b[col] as number)
            : String(a[col]).localeCompare(String(b[col]));
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
