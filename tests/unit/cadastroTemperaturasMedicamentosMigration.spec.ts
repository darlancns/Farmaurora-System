import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda da migration de temperaturas e medicamentos (supabase/migrations/*_cadastro_temperaturas_medicamentos.sql): o arquivo só
// ESPELHA o que já foi aplicado à mão em produção (19/11/2026) — não reaplicar, sem a carga dos dados. Mesmo padrão de
// cadastro_cias_aereas e cadastro_consultores: aditiva, idempotente, sem apagar nada, índice único em nome_chave, RLS ligado sem
// policies e privilégios sem exclusão.

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const arquivo = readdirSync(MIGRATIONS_DIR).find((nome) => nome.endsWith("_cadastro_temperaturas_medicamentos.sql"));
const bruto = arquivo ? readFileSync(join(MIGRATIONS_DIR, arquivo), "utf-8") : "";
const sql = bruto
  .split(/\r?\n/)
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase()
  .replace(/\s+/g, " ");

const TEMP = "cadastro_temperaturas";
const MED = "cadastro_medicamentos";
const TABELAS = [TEMP, MED];

const COLUNAS_BASE = [
  "id text primary key",
  "nome text not null",
  "nome_chave text not null",
  "ativo boolean not null default true",
  "atualizado_por text",
  "created_at timestamptz not null default now()",
  "updated_at timestamptz not null default now()",
];

function bloco(tabela: string): string {
  const inicio = sql.indexOf(`create table if not exists public.${tabela} (`);
  return sql.slice(inicio, sql.indexOf(");", inicio));
}

describe("migration de temperaturas e medicamentos", () => {
  it("o arquivo existe, com o nome 20261119160000_cadastro_temperaturas_medicamentos.sql", () => {
    expect(arquivo).toBe("20261119160000_cadastro_temperaturas_medicamentos.sql");
  });

  it("o timestamp é maior que o das migrations anteriores (a última era 20261118231000)", () => {
    // As migrations que JÁ existiam quando esta foi escrita (as posteriores, como a de Compras, podem ter timestamp maior).
    const anteriores = readdirSync(MIGRATIONS_DIR)
      .filter((n) => n !== arquivo && /^\d{14}_/.test(n) && n.slice(0, 14) <= "20261118231000")
      .map((n) => n.slice(0, 14));
    expect(anteriores.length).toBeGreaterThan(0);
    for (const ts of anteriores) expect(ts < "20261119160000", ts).toBe(true);
    expect(anteriores).toContain("20261118231000");
  });

  it("o cabeçalho avisa que JÁ FOI APLICADA em produção e que NÃO se reaplica", () => {
    expect(bruto.split(/\r?\n/)[0]).toBe("-- JÁ APLICADA EM PRODUÇÃO EM 19/11/2026; NÃO REAPLICAR.");
  });

  it("não tem drop, delete nem truncate, e não mexe em dados (sem insert nem update: a carga NÃO está aqui)", () => {
    expect(sql).not.toMatch(/\bdrop\b/);
    expect(sql).not.toMatch(/\bdelete\b/);
    expect(sql).not.toMatch(/\btruncate\b/);
    expect(sql).not.toMatch(/\binsert\s+into\b/);
    expect(sql).not.toMatch(/\bupdate\s+public\./);
  });

  it("só toca as duas tabelas novas (nada de DIR, Follow-Up nem outro cadastro)", () => {
    expect(sql).not.toMatch(/follow_up|prestacao_pacientes|public\.dir\b|cadastro_(fornecedores|despachantes|transportadoras|cias_aereas|consultores)/);
    const alters = [...sql.matchAll(/alter table ([\w.]+) ([^;]*);/g)];
    expect(alters.map((a) => a[1]).sort()).toEqual([`public.${MED}`, `public.${TEMP}`]);
    for (const a of alters) expect(a[2]).toBe("enable row level security");
  });

  it("é idempotente: create table e create unique index com if not exists, duas tabelas", () => {
    for (const t of TABELAS) expect(sql).toContain(`create table if not exists public.${t} (`);
    expect(sql.match(/create table /g)).toHaveLength(2);
    expect(sql.match(/create unique index /g)?.length).toBe(sql.match(/create unique index if not exists/g)?.length);
  });

  it("temperaturas: as colunas do padrão e nada além delas", () => {
    for (const coluna of COLUNAS_BASE) expect(bloco(TEMP), coluna).toContain(coluna);
    expect(bloco(TEMP)).not.toContain("temperatura text");
    expect(sql).toContain(`constraint ${TEMP}_nome_valido check (btrim(nome) <> '' and nome_chave <> '')`);
  });

  it("medicamentos: as colunas do padrão mais temperatura text not null, que não pode ser vazia", () => {
    for (const coluna of COLUNAS_BASE) expect(bloco(MED), coluna).toContain(coluna);
    expect(bloco(MED)).toContain("temperatura text not null");
    expect(sql).toContain(
      `constraint ${MED}_nome_valido check (btrim(nome) <> '' and nome_chave <> '' and btrim(temperatura) <> '')`,
    );
    expect(bloco(MED)).not.toContain("references");
  });

  it("unicidade por nome_chave nas duas (o índice não é parcial: vale para ativos E inativos)", () => {
    for (const t of TABELAS) {
      expect(sql).toContain(`create unique index if not exists ${t}_nome_chave_uq on public.${t} (nome_chave);`);
    }
  });

  it("RLS ligado e sem policies; privilégios: revoke all e grant só select, insert, update ao service_role (sem delete)", () => {
    expect(sql).not.toMatch(/create policy/);
    for (const t of TABELAS) {
      expect(sql).toContain(`alter table public.${t} enable row level security;`);
      expect(sql).toContain(`revoke all on table public.${t} from public, anon, authenticated, service_role;`);
      expect(sql).toContain(`grant select, insert, update on table public.${t} to service_role;`);
      expect(sql.indexOf(`revoke all on table public.${t}`)).toBeLessThan(
        sql.indexOf(`grant select, insert, update on table public.${t}`),
      );
    }
    expect(sql.match(/\bgrant\b/g)).toHaveLength(2);
    expect(sql).not.toMatch(/grant all/);
  });
});
