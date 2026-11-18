import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHAVE_PIX_CADASTRO_MAX, TABELA_CADASTRO } from "../../shared/constants/cadastros";

// Guarda da migration 20261118200000_cadastros_transportadoras_pix.sql (JÁ APLICADA em produção; fica como registro):
// tabela nova de transportadoras, coluna chave_pix nos despachantes, CHECK da chave nas duas tabelas e privilégios
// sem exclusão. Aditiva e idempotente.

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const arquivo = readdirSync(MIGRATIONS_DIR).find((nome) => nome.endsWith("_cadastros_transportadoras_pix.sql"));
const bruto = arquivo ? readFileSync(join(MIGRATIONS_DIR, arquivo), "utf-8") : "";
const sql = bruto
  .split(/\r?\n/)
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase()
  .replace(/\s+/g, " ");

const T = TABELA_CADASTRO.transportadoras;
const D = TABELA_CADASTRO.despachantes;
const CHECK_PIX = "chave_pix is null or (chave_pix is not null and btrim(chave_pix) <> '' and length(chave_pix) <= 140)";

describe("migration das transportadoras e da chave PIX", () => {
  it("o arquivo existe e é o 20261118200000", () => {
    expect(arquivo).toBe("20261118200000_cadastros_transportadoras_pix.sql");
  });

  it("o cabeçalho diz que JÁ FOI APLICADA manualmente em produção em 18/11/2026 e que não deve ser reaplicada", () => {
    expect(bruto.split(/\r?\n/)[2]).toBe("-- JÁ APLICADA MANUALMENTE EM PRODUÇÃO EM 18/11/2026; NÃO REAPLICAR.");
    expect(bruto).not.toMatch(/A APLICAR MANUALMENTE/);
  });

  it("comentários: tabela nova, dado financeiro (só Pagamentos e administrador) e como desfazer", () => {
    expect(bruto).toMatch(/TABELA NOVA/);
    expect(bruto).toMatch(/DADO FINANCEIRO/);
    expect(bruto).toMatch(/lê a seção Pagamentos e ao\s*--?\s*administrador/);
    expect(bruto).toMatch(/drop table if exists public\.cadastro_transportadoras;/);
    expect(bruto).toMatch(/alter table public\.cadastro_despachantes drop column if exists chave_pix;/);
  });

  it("só SQL aditivo: sem drop, delete, truncate, update ou insert (o desfazer está só em comentário)", () => {
    expect(sql).not.toMatch(/\bdrop\b/);
    expect(sql).not.toMatch(/\bdelete\b/);
    expect(sql).not.toMatch(/\btruncate\b/);
    expect(sql).not.toMatch(/\bupdate\s+public\./);
    expect(sql).not.toMatch(/\binsert\s+into\b/);
  });

  it("idempotente: create table/index e add column com if not exists; constraints só se ainda não existirem", () => {
    expect(sql).toContain(`create table if not exists public.${T} (`);
    expect(sql.match(/create table /g)?.length).toBe(1);
    expect(sql).toContain(`create unique index if not exists ${T}_nome_chave_uq on public.${T} (nome_chave);`);
    expect(sql).toContain(`alter table public.${D} add column if not exists chave_pix text;`);
    // add constraint não tem "if not exists": cada uma é protegida por uma consulta ao catálogo (pg_constraint).
    expect(sql.match(/add constraint/g)?.length).toBe(2);
    expect(sql.match(/not exists \( select 1 from pg_constraint/g)?.length).toBe(2);
  });

  it("transportadoras: mesmo desenho das cias aéreas, mais chave_pix", () => {
    const bloco = sql.slice(sql.indexOf(`create table if not exists public.${T}`), sql.indexOf(");", sql.indexOf(`public.${T}`)));
    expect(bloco).toMatch(/id text primary key/);
    expect(bloco).toMatch(/nome text not null/);
    expect(bloco).toMatch(/nome_chave text not null/);
    expect(bloco).toMatch(/chave_pix text,/);
    expect(bloco).toMatch(/ativo boolean not null default true/);
    expect(bloco).toMatch(/atualizado_por text/);
    expect(bloco).toMatch(/created_at timestamptz not null default now\(\)/);
    expect(bloco).toMatch(/updated_at timestamptz not null default now\(\)/);
    expect(bloco).toContain(`constraint ${T}_nome_valido check (btrim(nome) <> '' and nome_chave <> '')`);
  });

  it("CHECK da chave PIX nas DUAS tabelas: nula OU (não vazia e até 140), com 'is not null' explícito", () => {
    for (const tabela of [D, T]) {
      const nome = `${tabela}_chave_pix_valida`;
      expect(sql).toContain(`add constraint ${nome} check ( ${CHECK_PIX} )`);
    }
    // O limite do banco é o mesmo da validação do app.
    expect(CHAVE_PIX_CADASTRO_MAX).toBe(140);
    expect(CHECK_PIX).toContain(`length(chave_pix) <= ${CHAVE_PIX_CADASTRO_MAX}`);
  });

  it("o CHECK trata NULL de forma explícita (NULL passa só pela 1ª condição; preenchido tem de passar na 2ª)", () => {
    // Avalia a expressão como o Postgres: um CHECK só reprova com FALSE; NULL conta como aprovado.
    type Tri = true | false | null;
    const e = (a: Tri, b: Tri): Tri => (a === true || b === true ? true : a === null || b === null ? null : false); // OR
    const ea = (a: Tri, b: Tri): Tri => (a === false || b === false ? false : a === null || b === null ? null : true); // AND
    const check = (valor: string | null): Tri => {
      const nulo: Tri = valor === null;
      const naoNulo: Tri = valor !== null;
      const naoVazio: Tri = valor === null ? null : valor.trim() !== "";
      const cabe: Tri = valor === null ? null : valor.length <= 140;
      return e(nulo, ea(naoNulo, ea(naoVazio, cabe)));
    };
    const aprovado = (v: string | null): boolean => check(v) !== false;
    expect(check(null)).toBe(true); // NULL aprovado pela 1ª condição, de forma explícita (não por acidente)
    expect(aprovado("chave-ficticia")).toBe(true);
    expect(aprovado("x".repeat(140))).toBe(true);
    expect(aprovado("")).toBe(false);
    expect(aprovado("   ")).toBe(false);
    expect(aprovado("x".repeat(141))).toBe(false);
  });

  it("RLS ligado na tabela nova e SEM policies", () => {
    expect(sql).toContain(`alter table public.${T} enable row level security;`);
    expect(sql).not.toMatch(/create policy/);
  });

  it("service_role: select, insert e update — nunca exclusão (revoke all antes do grant), como as outras listas", () => {
    expect(sql).toContain(`revoke all on table public.${T} from public, anon, authenticated, service_role;`);
    expect(sql).toContain(`grant select, insert, update on table public.${T} to service_role;`);
    expect(sql.indexOf(`revoke all on table public.${T}`)).toBeLessThan(sql.indexOf(`grant select, insert, update on table public.${T}`));
    expect(sql).not.toMatch(/grant all/);
    expect(sql).not.toMatch(/grant [^;]*\bdelete\b/);
  });

  it("não altera mais nada em despachantes além da coluna e da constraint da chave", () => {
    const alters = [...sql.matchAll(/alter table ([\w.]+) ([^;]*);/g)].map(([, tabela, resto]) => `${tabela} ${resto}`);
    for (const a of alters) {
      expect(
        a === `public.${D} add column if not exists chave_pix text` ||
          a === `public.${T} enable row level security` ||
          /^public\.cadastro_(despachantes|transportadoras) add constraint cadastro_(despachantes|transportadoras)_chave_pix_valida check/.test(a),
        a,
      ).toBe(true);
    }
  });
});
