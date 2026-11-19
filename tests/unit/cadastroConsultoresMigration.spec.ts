import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TABELA_CADASTRO } from "../../shared/constants/cadastros";

// Guarda da migration de consultores (supabase/migrations/*_cadastro_consultores.sql): o arquivo só ESPELHA o que a Cris já
// aplicou à mão em produção (18/11/2026) — não reaplicar, sem a carga dos nomes. Mesmo padrão de cadastro_cias_aereas:
// aditiva, idempotente, sem apagar nada, índice único em nome_chave, RLS ligado sem policies e privilégios sem exclusão.

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const arquivo = readdirSync(MIGRATIONS_DIR).find((nome) => nome.endsWith("_cadastro_consultores.sql"));
const bruto = arquivo ? readFileSync(join(MIGRATIONS_DIR, arquivo), "utf-8") : "";
const sql = bruto
  .split(/\r?\n/)
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase()
  .replace(/\s+/g, " ");

const T = "cadastro_consultores";

describe("migration dos consultores", () => {
  it("o arquivo existe, com o nome 20261118xxxxxx_cadastro_consultores.sql, e a tabela é a da constante", () => {
    expect(arquivo).toMatch(/^20261118\d{6}_cadastro_consultores\.sql$/);
    expect(TABELA_CADASTRO.consultores).toBe(T);
  });

  it('o cabeçalho avisa que JÁ FOI APLICADA em produção e que NÃO se reaplica', () => {
    expect(bruto.split(/\r?\n/)[0]).toBe("-- JÁ APLICADA MANUALMENTE EM PRODUÇÃO EM 18/11/2026; NÃO REAPLICAR.");
  });

  it("não tem drop, delete nem truncate, e não mexe em dados (sem insert nem update: a carga dos nomes NÃO está aqui)", () => {
    expect(sql).not.toMatch(/\bdrop\b/);
    expect(sql).not.toMatch(/\bdelete\b/);
    expect(sql).not.toMatch(/\btruncate\b/);
    expect(sql).not.toMatch(/\binsert\s+into\b/);
    expect(sql).not.toMatch(/\bupdate\s+public\./);
  });

  it("não toca o enum consultor_nome nem outra tabela (Follow-Up, Prestação e contas não mudam)", () => {
    expect(sql).not.toMatch(/consultor_nome/);
    expect(sql).not.toMatch(/\balter type\b/);
    expect(sql).not.toMatch(/follow_up|prestacao_pacientes/);
    const alters = [...sql.matchAll(/alter table ([\w.]+) ([^;]*);/g)];
    expect(alters).toHaveLength(1);
    expect(alters[0]![1]).toBe(`public.${T}`);
    expect(alters[0]![2]).toBe("enable row level security");
  });

  it("é idempotente: create table e create unique index com if not exists, uma tabela só", () => {
    expect(sql).toContain(`create table if not exists public.${T} (`);
    expect(sql.match(/create table /g)).toHaveLength(1);
    expect(sql.match(/create unique index /g)?.length).toBe(sql.match(/create unique index if not exists/g)?.length);
  });

  it("colunas do padrão de cadastro_cias_aereas, sem coluna extra (nem chave_pix)", () => {
    for (const coluna of [
      "id text primary key",
      "nome text not null",
      "nome_chave text not null",
      "ativo boolean not null default true",
      "atualizado_por text",
      "created_at timestamptz not null default now()",
      "updated_at timestamptz not null default now()",
    ]) {
      expect(sql, coluna).toContain(coluna);
    }
    expect(sql).not.toContain("chave_pix");
    expect(sql).toContain(`constraint ${T}_nome_valido check (btrim(nome) <> '' and nome_chave <> '')`);
  });

  it("unicidade por nome_chave (o índice não é parcial: vale para ativos E inativos)", () => {
    expect(sql).toContain(`create unique index if not exists ${T}_nome_chave_uq on public.${T} (nome_chave);`);
  });

  it("RLS ligado e sem policies; privilégios: revoke all e grant só select, insert, update ao service_role (sem delete)", () => {
    expect(sql).not.toMatch(/create policy/);
    expect(sql).toContain(`revoke all on table public.${T} from public, anon, authenticated, service_role;`);
    expect(sql).toContain(`grant select, insert, update on table public.${T} to service_role;`);
    expect(sql.match(/\bgrant\b/g)).toHaveLength(1);
  });
});
