import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda da migration de Compras (supabase/migrations/*_compras.sql): o arquivo só ESPELHA o que já foi aplicado à mão em produção
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
    for (const ts of anteriores) expect(ts < "20261119190000", ts).toBe(true);
    expect(anteriores).toContain("20261119160000");
  });

  it("o cabeçalho avisa que JÁ FOI APLICADA em produção e que NÃO se reaplica", () => {
    expect(bruto.split(/\r?\n/)[0]).toBe("-- JÁ APLICADA EM PRODUÇÃO EM 19/11/2026; NÃO REAPLICAR.");
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
