import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TABELA_CADASTRO } from "../../shared/constants/cadastros";

// Guarda da migration dos Cadastros (supabase/migrations/*_cadastros.sql): aditiva, idempotente, sem apagar nada,
// com o CHECK do prazo, a unicidade por nome_chave e os privilégios sem exclusão.

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const arquivo = readdirSync(MIGRATIONS_DIR).find((nome) => nome.endsWith("_cadastros.sql"));
const bruto = arquivo ? readFileSync(join(MIGRATIONS_DIR, arquivo), "utf-8") : "";
// Sem os comentários (-- até o fim da linha): o que vale é o SQL que roda.
const sql = bruto
  .split(/\r?\n/)
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase()
  .replace(/\s+/g, " ");

const TABELAS = Object.values(TABELA_CADASTRO);

describe("migration dos Cadastros", () => {
  it("o arquivo existe, com o nome 20261109xxxxxx_cadastros.sql", () => {
    expect(arquivo).toMatch(/^20261109\d{6}_cadastros\.sql$/);
  });

  it("não tem drop nem delete (nem truncate): é só aditiva", () => {
    expect(sql).not.toMatch(/\bdrop\b/);
    expect(sql).not.toMatch(/\bdelete\b/);
    expect(sql).not.toMatch(/\btruncate\b/);
  });

  it("não altera tabelas existentes além de ligar o RLS nas novas, e não mexe em dados", () => {
    expect(sql).not.toMatch(/\bupdate\s+public\./);
    expect(sql).not.toMatch(/\binsert\s+into\b/);
    const alters = [...sql.matchAll(/alter table ([\w.]+) ([^;]*);/g)];
    for (const [, tabela, resto] of alters) {
      expect(TABELAS.map((t) => `public.${t}`), String(tabela)).toContain(tabela);
      expect(resto).toBe("enable row level security");
    }
  });

  it("é idempotente: create table/index com if not exists", () => {
    for (const t of TABELAS) expect(sql).toContain(`create table if not exists public.${t} (`);
    expect(sql.match(/create table /g)?.length).toBe(TABELAS.length);
    expect(sql.match(/create table if not exists/g)?.length).toBe(TABELAS.length);
    expect(sql.match(/create unique index /g)?.length).toBe(sql.match(/create unique index if not exists/g)?.length);
  });

  it("unicidade por nome_chave em cada tabela (vale para ativos e inativos: o índice não é parcial)", () => {
    for (const t of TABELAS) {
      expect(sql).toContain(`create unique index if not exists ${t}_nome_chave_uq on public.${t} (nome_chave);`);
    }
  });

  it("CHECK do prazo: sem alerta e sem prazo, OU com alerta e prazo de 1 a 365", () => {
    expect(sql).toContain(
      "check ( (sem_alerta and prazo_alerta_dias is null) or (not sem_alerta and prazo_alerta_dias between 1 and 365) )",
    );
  });

  it("colunas do fornecedor, do despachante e da temperatura", () => {
    const bloco = (t: string) => sql.slice(sql.indexOf(`create table if not exists public.${t}`), sql.indexOf(");", sql.indexOf(`public.${t}`)));
    expect(bloco("cadastro_fornecedores")).toMatch(/pais text,.*prazo_alerta_dias integer,.*sem_alerta boolean not null default false/);
    expect(bloco("cadastro_despachantes")).toMatch(/contato_nome text,.*telefone text,.*email text/);
    for (const t of TABELAS) expect(bloco(t)).toMatch(/ativo boolean not null default true/);
    expect(bloco("cadastro_temperaturas")).not.toMatch(/pais|telefone|prazo/);
  });

  it("RLS ligado em todas e SEM policies", () => {
    for (const t of TABELAS) expect(sql).toContain(`alter table public.${t} enable row level security;`);
    expect(sql).not.toMatch(/create policy/);
  });

  it("service_role: select, insert e update — nunca exclusão (revoke all antes do grant)", () => {
    for (const t of TABELAS) {
      expect(sql).toContain(`revoke all on table public.${t} from public, anon, authenticated, service_role;`);
      expect(sql).toContain(`grant select, insert, update on table public.${t} to service_role;`);
      expect(sql.indexOf(`revoke all on table public.${t}`)).toBeLessThan(sql.indexOf(`grant select, insert, update on table public.${t}`));
    }
    expect(sql).not.toMatch(/grant all/);
    expect(sql).not.toMatch(/grant [^;]*\bdelete\b/);
  });
});
