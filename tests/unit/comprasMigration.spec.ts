import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda da migration de Compras (supabase/migrations/*_compras.sql, o desenho original, com ordens): o arquivo só ESPELHA o que já foi aplicado à mão em produção
// (19/11/2026) — não reaplicar. Aditiva, idempotente, sem apagar nada, RLS ligado sem policies e privilégios exatamente como o
// contrato: compras e pré-cadastro SEM delete; as filhas (ordens e itens) COM delete.

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const arquivo = readdirSync(MIGRATIONS_DIR).find((nome) => nome.endsWith("_compras.sql"));
const bruto = arquivo ? readFileSync(join(MIGRATIONS_DIR, arquivo), "utf-8") : "";
// Sem os comentários (-- até o fim da linha): o que vale é o SQL que roda.
const sql = bruto
  .split(/\r?\n/)
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase()
  .replace(/\s+/g, " ");

const TABELAS = ["compras", "compra_ordens", "compra_itens", "pre_cadastro_medicamentos"] as const;

function bloco(tabela: string): string {
  const inicio = sql.indexOf(`create table if not exists public.${tabela} (`);
  expect(inicio, `create table ${tabela}`).toBeGreaterThan(-1);
  // O bloco vai até o ");" que fecha a tabela (dentro dele as colunas terminam em vírgula, nunca em ");").
  return sql.slice(inicio, sql.indexOf(");", inicio));
}

describe("migration de Compras", () => {
  it("o arquivo existe, com o nome 20261119190000_compras.sql, depois da migration de temperaturas e medicamentos", () => {
    expect(arquivo).toBe("20261119190000_compras.sql");
    const anteriores = readdirSync(MIGRATIONS_DIR)
      .filter((n) => n !== arquivo && /^\d{14}_/.test(n))
      .map((n) => n.slice(0, 14));
    // Tudo o que existe é anterior a ela, EXCETO a função que levou o renomear de consultor a `compras` (que só faz sentido depois da tabela)
    // e a migration que transformou as compras em "uma por fornecedor" (20261121130000, testada no bloco do fim deste arquivo), e as
    // migrations que NÃO são de Compras e vieram depois (ex.: 20261123120000_follow_up_entrega, do Follow-Up): a regra vale para as de Compras.
    const posteriores = anteriores.filter((ts) => ts > "20261119190000");
    const posterioresDeCompras = readdirSync(MIGRATIONS_DIR)
      .filter((n) => /^\d{14}_/.test(n) && n.slice(0, 14) > "20261119190000" && /compra/.test(n))
      .map((n) => n.slice(0, 14));
    expect(posterioresDeCompras).toEqual(["20261120120000", "20261121130000"]);
    expect(readdirSync(MIGRATIONS_DIR).some((n) => n === "20261120120000_renomear_consultor_compras.sql")).toBe(true);
    for (const ts of anteriores.filter((t) => !posteriores.includes(t))) expect(ts < "20261119190000", ts).toBe(true);
    expect(anteriores).toContain("20261119160000");
  });

  it("o cabeçalho avisa que JÁ FOI APLICADA em produção e que NÃO se reaplica, e que a recorrente veio por ALTER separado", () => {
    const linhas = bruto.split(/\r?\n/);
    expect(linhas[0]).toBe("-- JÁ APLICADA EM PRODUÇÃO EM 19/11/2026; NÃO REAPLICAR.");
    expect(linhas[1]).toBe("-- recorrente adicionada em 19/11/2026 por ALTER separado; este arquivo mostra o estado final.");
  });

  // O espelho tem de ser IDÊNTICO à produção: contar as colunas pega uma coluna esquecida ou a mais.
  it.each([
    ["compras", 30],
    ["compra_ordens", 13],
    ["compra_itens", 15],
    ["pre_cadastro_medicamentos", 12],
  ])("%s tem exatamente %i colunas", (tabela, esperado) => {
    const corpo = bloco(tabela).slice(bloco(tabela).indexOf("(") + 1);
    const colunas = corpo
      .split(/,(?![^()]*\))/) // vírgulas fora de parênteses (numeric(14, 2), check (...))
      .map((c) => c.trim())
      .filter((c) => c !== "" && !/^(constraint|primary key|unique|check|foreign key)\b/.test(c));
    expect(colunas, colunas.join(" | ")).toHaveLength(esperado);
  });

  it("não tem drop, delete nem truncate, e não mexe em dados (sem insert nem update: nenhuma carga)", () => {
    expect(sql).not.toMatch(/\bdrop\b/);
    expect(sql).not.toMatch(/\bdelete\s+from\b/);
    expect(sql).not.toMatch(/\btruncate\b/);
    expect(sql).not.toMatch(/\binsert\s+into\b/);
    expect(sql).not.toMatch(/\bupdate\s+public\./);
  });

  it("é idempotente: create table e create unique index com if not exists, quatro tabelas", () => {
    for (const t of TABELAS) expect(sql).toContain(`create table if not exists public.${t} (`);
    expect(sql.match(/create table /g)).toHaveLength(4);
    expect(sql.match(/create unique index /g)?.length).toBe(sql.match(/create unique index if not exists/g)?.length);
  });

  it("só toca as quatro tabelas novas e referencia cadastro_medicamentos (nada de DIR, Follow-Up nem outro cadastro)", () => {
    expect(sql).not.toMatch(/follow_up|prestacao_pacientes|public\.dir\b/);
    const referencias = new Set([...sql.matchAll(/references public\.(\w+)/g)].map((m) => m[1]));
    expect([...referencias].sort()).toEqual(["cadastro_medicamentos", "compra_ordens", "compras", "pre_cadastro_medicamentos"]);
    const alters = [...sql.matchAll(/alter table ([\w.]+) ([^;]*);/g)];
    expect(alters.map((a) => a[1]).sort()).toEqual(TABELAS.map((t) => `public.${t}`).sort());
    for (const a of alters) expect(a[2]).toBe("enable row level security");
  });

  it("compras: colunas, defaults, NULL onde a pessoa ainda não decidiu, checks e unique (ano_mes, sequencia)", () => {
    const b = bloco("compras");
    for (const coluna of [
      "id text primary key",
      "ano_mes text not null",
      "sequencia integer not null",
      "cancelada boolean not null default false",
      "compra_particular boolean not null default false",
      "local_declarado boolean not null default false",
      "termo_posterior boolean not null default false",
      "courier_simples boolean not null default false",
      "isencao boolean not null default false",
      "recorrente boolean not null default false",
      "pagamento_alvara boolean,",
      "pagamento_momento text,",
      "documentos boolean,",
      "pendencias text[] default '{}'",
      "criado_por text,",
      "atualizado_por text,",
      "created_at timestamptz not null default now()",
      "updated_at timestamptz not null default now()",
    ]) {
      expect(b, coluna).toContain(coluna);
    }
    for (const texto of [
      "paciente",
      "processo_numero",
      "medico",
      "local_aplicacao",
      "entrega",
      "contatos",
      "termo_observacao",
      "despachante",
      "isencao_para",
      "observacoes",
      "vendedor",
      "responsavel",
    ]) {
      expect(b, texto).toContain(`${texto} text not null default ''`);
    }
    expect(b).toContain("constraint compras_sequencia_valida check (sequencia >= 1)");
    expect(b).toContain("check (pagamento_momento is null or pagamento_momento in ('vamos_pagar', 'apos_awb'))");
    expect(b).toContain("constraint compras_mes_sequencia_uq unique (ano_mes, sequencia)");
    expect(b).not.toContain("deferrable"); // o contador mensal usa o unique IMEDIATO: o 23505 dispara o retry
  });

  it("compra_ordens: chave para compras com cascata, posição, PO só vazio ou no formato, frete >= 0, DIR e encaminhada_em NULL", () => {
    const b = bloco("compra_ordens");
    for (const coluna of [
      "id text primary key",
      "compra_id text not null references public.compras (id) on delete cascade",
      "posicao integer not null",
      "fornecedor text not null default ''",
      "envio text not null default ''",
      "cia text not null default ''",
      "po text not null default ''",
      "frete numeric(14, 2),",
      "frete_real numeric(14, 2),",
      "dir_id text,",
      "encaminhada_em timestamptz,",
      "created_at timestamptz not null default now()",
      "updated_at timestamptz not null default now()",
    ]) {
      expect(b, coluna).toContain(coluna);
    }
    expect(b).toContain("check (posicao >= 1)");
    expect(b).toContain("check (po = '' or po ~ '^po[0-9]{2}-[0-9]{2}-[0-9]{4}$')");
    expect(b).toContain("check (frete is null or frete >= 0)");
    expect(b).toContain("check (frete_real is null or frete_real >= 0)");
    expect(b).toContain("unique (compra_id, posicao) deferrable initially deferred");
  });

  it("compra_itens: chave para a ordem com cascata, FKs opcionais, quantidade em TEXTO, valores numeric >= 0 ou NULL", () => {
    const b = bloco("compra_itens");
    for (const coluna of [
      "id text primary key",
      "ordem_id text not null references public.compra_ordens (id) on delete cascade",
      "posicao integer not null",
      "medicamento text not null",
      "medicamento_cadastro_id text references public.cadastro_medicamentos (id)",
      "pre_cadastro_id text references public.pre_cadastro_medicamentos (id)",
      "apresentacao text not null default ''",
      "referencia text not null default ''",
      "laboratorio text not null default ''",
      "quantidade text not null default ''",
      "temperatura text not null default ''",
      "valor_unitario numeric(14, 2),",
      "valor_real numeric(14, 2),",
      "created_at timestamptz not null default now()",
      "updated_at timestamptz not null default now()",
    ]) {
      expect(b, coluna).toContain(coluna);
    }
    expect(b).toContain("check (valor_unitario is null or valor_unitario >= 0)");
    expect(b).toContain("check (valor_real is null or valor_real >= 0)");
    expect(b).toContain("unique (ordem_id, posicao) deferrable initially deferred");
  });

  it("pre_cadastro_medicamentos: status pendente/aprovado/rejeitado e um único PENDENTE por nome_chave (índice parcial)", () => {
    const b = bloco("pre_cadastro_medicamentos");
    for (const coluna of [
      "id text primary key",
      "nome text not null",
      "nome_chave text not null",
      "temperatura text not null default ''",
      "status text not null default 'pendente'",
      "compra_id text references public.compras (id)",
      "cadastro_id text references public.cadastro_medicamentos (id)",
      "solicitado_por text,",
      "decidido_por text,",
      "decidido_em timestamptz",
      "created_at timestamptz not null default now()",
      "updated_at timestamptz not null default now()",
    ]) {
      expect(b, coluna).toContain(coluna);
    }
    expect(b).toContain("check (status in ('pendente', 'aprovado', 'rejeitado'))");
    expect(sql).toContain(
      "create unique index if not exists pre_cadastro_medicamentos_pendente_uq on public.pre_cadastro_medicamentos (nome_chave) where status = 'pendente';",
    );
  });

  it("RLS ligado nas quatro e SEM policies", () => {
    expect(sql).not.toMatch(/create policy/);
    for (const t of TABELAS) expect(sql).toContain(`alter table public.${t} enable row level security;`);
  });

  it("revoke all antes do grant, para as quatro (anon e authenticated não recebem nada)", () => {
    for (const t of TABELAS) {
      expect(sql).toContain(`revoke all on table public.${t} from public, anon, authenticated, service_role;`);
    }
    expect(sql).not.toMatch(/grant [^;]* to (anon|authenticated|public)/);
    expect(sql).not.toMatch(/grant all/);
    expect(sql.match(/\bgrant\b/g)).toHaveLength(4);
  });

  it("compras e pré-cadastro: service_role com select, insert e update — NUNCA delete", () => {
    for (const t of ["compras", "pre_cadastro_medicamentos"]) {
      expect(sql).toContain(`grant select, insert, update on table public.${t} to service_role;`);
      expect(sql).not.toContain(`grant select, insert, update, delete on table public.${t}`);
      expect(sql.indexOf(`revoke all on table public.${t}`)).toBeLessThan(sql.indexOf(`grant select, insert, update on table public.${t}`));
    }
  });

  it("ordens e itens: service_role com select, insert, update e delete (só as filhas apagam)", () => {
    for (const t of ["compra_ordens", "compra_itens"]) {
      expect(sql).toContain(`grant select, insert, update, delete on table public.${t} to service_role;`);
      expect(sql.indexOf(`revoke all on table public.${t}`)).toBeLessThan(sql.indexOf(`grant select, insert, update, delete on table public.${t}`));
    }
  });
});

// ── A migration "uma compra por fornecedor" (20261121130000_compras_uma_por_fornecedor.sql) ─────────────────────────────────────────────
// O espelho do que foi aplicado em produção em 21/11/2026: sem conversão de dados (as tabelas estavam vazias; uma guarda confere), vendedor
// vira consultor, a compra ganha os campos da ordem, os itens passam a apontar para a compra e compra_ordens deixa de existir. O estado
// FINAL do schema (colunas) é calculado aplicando o que este arquivo faz sobre o desenho original (20261119190000_compras.sql).

const ARQUIVO_NOVO = "20261121130000_compras_uma_por_fornecedor.sql";
const ARQUIVO_FUNCAO_ANTERIOR = "20261120120000_renomear_consultor_compras.sql";

const semComentarios = (texto: string): string =>
  texto
    .split(/\r?\n/)
    .map((linha) => linha.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase()
    .replace(/\s+/g, " ");

const brutoNovo = readFileSync(join(MIGRATIONS_DIR, ARQUIVO_NOVO), "utf-8");
const sqlNovo = semComentarios(brutoNovo);

/** Os nomes das colunas de um `create table` do desenho original. */
function colunasOriginais(tabela: string): string[] {
  const corpo = bloco(tabela).slice(bloco(tabela).indexOf("(") + 1);
  return corpo
    .split(/,(?![^()]*\))/)
    .map((c) => c.trim())
    .filter((c) => c !== "" && !/^(constraint|primary key|unique|check|foreign key)\b/.test(c))
    .map((c) => c.split(" ")[0]!);
}

/** O schema depois da migration nova: as colunas do desenho original com o rename, os add column, os drop column e os drop table aplicados. */
function esquemaFinal(): Record<string, string[]> {
  const esquema: Record<string, string[]> = {};
  for (const t of TABELAS) esquema[t] = colunasOriginais(t);
  for (const m of sqlNovo.matchAll(/alter table public\.(\w+) ([^;]*);/g)) {
    const colunas = esquema[m[1]!];
    if (!colunas) continue;
    for (const acao of m[2]!.split(/,(?![^()]*\))/).map((a) => a.trim())) {
      const renomear = /^rename column (\w+) to (\w+)$/.exec(acao);
      const adicionar = /^add column (\w+)/.exec(acao);
      const apagar = /^drop column (\w+)$/.exec(acao);
      if (renomear) colunas[colunas.indexOf(renomear[1]!)] = renomear[2]!;
      else if (adicionar) colunas.push(adicionar[1]!);
      else if (apagar) colunas.splice(colunas.indexOf(apagar[1]!), 1);
    }
  }
  for (const m of sqlNovo.matchAll(/drop table public\.(\w+);/g)) delete esquema[m[1]!];
  return esquema;
}

describe("migration de Compras: uma compra por fornecedor", () => {
  it("o arquivo existe, vem depois das duas migrations de Compras e o cabeçalho diz que JÁ FOI APLICADA em 21/11/2026 e que NÃO se reaplica", () => {
    const nomes = readdirSync(MIGRATIONS_DIR);
    expect(nomes).toContain(ARQUIVO_NOVO);
    expect(ARQUIVO_NOVO > "20261119190000_compras.sql").toBe(true);
    expect(ARQUIVO_NOVO > ARQUIVO_FUNCAO_ANTERIOR).toBe(true);
    expect(nomes.filter((n) => /^\d{14}_/.test(n) && n > ARQUIVO_NOVO && /compra/.test(n))).toEqual([]); // é a última DE COMPRAS (migrations de outras áreas podem vir depois)
    expect(brutoNovo.split(/\r?\n/)[0]).toBe("-- JÁ APLICADA EM PRODUÇÃO EM 21/11/2026; NÃO REAPLICAR.");
  });

  it("começa com uma guarda: erro se compras, compra_itens, compra_ordens ou pre_cadastro_medicamentos tiverem alguma linha (não há conversão de dados)", () => {
    const guarda = sqlNovo.slice(0, sqlNovo.indexOf("$guarda$;"));
    expect(guarda).toContain("do $guarda$");
    for (const t of TABELAS) expect(guarda, t).toContain(`exists (select 1 from public.${t})`);
    expect(guarda).toContain("raise exception");
    // A guarda vem ANTES de qualquer alteração.
    expect(sqlNovo.indexOf("$guarda$;")).toBeLessThan(sqlNovo.indexOf("alter table"));
    expect(sqlNovo).not.toMatch(/\binsert\s+into\b|\bdelete\s+from\b|\btruncate\b/);
  });

  it("o schema final: compras com 34 colunas, compra_itens com 14, pre_cadastro_medicamentos com 12; compra_ordens não existe", () => {
    const esquema = esquemaFinal();
    expect(esquema.compras).toHaveLength(34);
    expect(esquema.compra_itens).toHaveLength(14);
    expect(esquema.pre_cadastro_medicamentos).toHaveLength(12);
    expect(esquema.compra_ordens).toBeUndefined();
    expect(Object.keys(esquema).sort()).toEqual(["compra_itens", "compras", "pre_cadastro_medicamentos"]);
  });

  it("compras: consultor no lugar de vendedor, ganha fornecedor, envio, cia, frete, frete_real, empresa e numero_ordens; perde isencao_para, local_declarado e courier_simples", () => {
    const colunas = esquemaFinal().compras!;
    for (const c of ["consultor", "fornecedor", "envio", "cia", "frete", "frete_real", "empresa", "numero_ordens"]) expect(colunas, c).toContain(c);
    for (const c of ["vendedor", "isencao_para", "local_declarado", "courier_simples"]) expect(colunas, c).not.toContain(c);
    expect(sqlNovo).toContain("rename column vendedor to consultor");
    for (const coluna of [
      "fornecedor text not null default ''",
      "envio text not null default ''",
      "cia text not null default ''",
      "frete numeric(14, 2)",
      "frete_real numeric(14, 2)",
      "empresa text not null default 'farmaurora'",
      "numero_ordens integer not null default 1",
    ]) {
      expect(sqlNovo, coluna).toContain(`add column ${coluna}`);
    }
    expect(sqlNovo).toMatch(/drop column isencao_para, drop column local_declarado, drop column courier_simples;/);
  });

  it("compras: os quatro checks com os nomes certos", () => {
    expect(sqlNovo).toContain("add constraint compras_empresa_check check (empresa in ('farmaurora', 'mainzfarma'))");
    expect(sqlNovo).toContain("add constraint compras_numero_ordens_check check (numero_ordens >= 1)");
    expect(sqlNovo).toContain("add constraint compras_frete_check check (frete is null or frete >= 0)");
    expect(sqlNovo).toContain("add constraint compras_frete_real_check check (frete_real is null or frete_real >= 0)");
  });

  it("compra_itens: compra_id (not null) com chave para compras e cascata, unique (compra_id, posicao) deferrable, índice por compra, referencia vira brand, saem apresentacao e ordem_id", () => {
    const colunas = esquemaFinal().compra_itens!;
    for (const c of ["compra_id", "brand", "laboratorio", "quantidade", "temperatura", "medicamento"]) expect(colunas, c).toContain(c);
    for (const c of ["ordem_id", "apresentacao", "referencia"]) expect(colunas, c).not.toContain(c);
    expect(sqlNovo).toContain("alter table public.compra_itens add column compra_id text not null;");
    expect(sqlNovo).toContain("add constraint compra_itens_compra_id_fkey foreign key (compra_id) references public.compras (id) on delete cascade");
    expect(sqlNovo).toContain("add constraint compra_itens_compra_posicao_uq unique (compra_id, posicao) deferrable initially deferred");
    expect(sqlNovo).toContain("create index compra_itens_compra_idx on public.compra_itens (compra_id);");
    expect(sqlNovo).toContain("alter table public.compra_itens rename column referencia to brand;");
    expect(sqlNovo).toContain("alter table public.compra_itens drop column apresentacao, drop column ordem_id;");
  });

  it("apaga compra_ordens e não concede nem revoga nada (os privilégios das tabelas que ficam não mudam)", () => {
    expect(sqlNovo).toContain("drop table public.compra_ordens;");
    expect(sqlNovo.match(/\bdrop table\b/g)).toHaveLength(1);
    expect(sqlNovo).not.toMatch(/\bgrant\b|\brevoke\b|create policy|disable row level security/);
  });

  it("renomear_consultor: a MESMA função de 20261120120000, trocando só a linha que atualizava compras.vendedor por compras.consultor", () => {
    const funcao = (bruto: string): string => {
      const texto = semComentarios(bruto);
      return texto.slice(texto.indexOf("create or replace function public.renomear_consultor"), texto.indexOf("$fn$;", texto.indexOf("as $fn$")) + 5);
    };
    const anterior = funcao(readFileSync(join(MIGRATIONS_DIR, ARQUIVO_FUNCAO_ANTERIOR), "utf-8"));
    const nova = funcao(brutoNovo);
    const velha = "update public.compras set vendedor = p_nome_novo where vendedor = v_antigo;";
    const trocada = "update public.compras set consultor = p_nome_novo where consultor = v_antigo;";
    expect(anterior).toContain(velha);
    expect(nova).toContain(trocada);
    expect(nova).not.toContain(velha);
    expect(nova).toBe(anterior.replace(velha, trocada));
    expect(nova).toContain("update public.dir set vendedor = p_nome_novo where vendedor = v_antigo;"); // a DIR continua com vendedor
  });

  it("termina avisando o PostgREST para recarregar o schema", () => {
    expect(sqlNovo.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true);
  });
});
