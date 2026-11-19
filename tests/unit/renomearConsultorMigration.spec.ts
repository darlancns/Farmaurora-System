import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { chaveCadastro } from "../../shared/utils/cadastroNome";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { linhaConsultor } from "./helpers/consultoresFixtures";
import { renomearConsultorSql } from "./helpers/renomearConsultorFake";

// Guarda da migration da função public.renomear_consultor (supabase/migrations/*_renomear_consultor.sql). NÃO está aplicada: o
// arquivo avisa que a Cris/Claude aplica pelo protocolo. Aqui se confere o texto do SQL: a função existe, faz tudo numa transação,
// atualiza as quatro tabelas só onde o valor é IGUAL ao antigo, e o acesso é só do service_role. Nenhum SQL é executado.

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");
const arquivo = readdirSync(MIGRATIONS_DIR).find((nome) => nome.endsWith("_renomear_consultor.sql"));
const bruto = arquivo ? readFileSync(join(MIGRATIONS_DIR, arquivo), "utf-8") : "";
const sql = bruto
  .split(/\r?\n/)
  .map((linha) => linha.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase()
  .replace(/\s+/g, " ");

describe("migration renomear_consultor", () => {
  it("o arquivo existe, depois da migration da tabela, e o cabeçalho diz que NÃO se aplica sozinho", () => {
    expect(arquivo).toMatch(/^20261118\d{6}_renomear_consultor\.sql$/);
    expect(arquivo! > "20261118210000_cadastro_consultores.sql").toBe(true);
    expect(bruto.split(/\r?\n/)[0]).toBe("-- A APLICAR: a Cris/Claude aplica pelo protocolo; NÃO aplicar sozinho.");
  });

  it("define public.renomear_consultor(p_id, p_nome_novo, p_nome_chave, p_por) e devolve jsonb com as contagens", () => {
    expect(sql).toContain("create or replace function public.renomear_consultor( p_id text, p_nome_novo text, p_nome_chave text, p_por text ) returns jsonb");
    expect(sql).toContain("language plpgsql");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("jsonb_build_object('nomeantigo', v_antigo, 'followup', v_follow_up, 'prestacao', v_prestacao, 'dir', v_dir)".toLowerCase());
  });

  it("é UMA função (uma transação): atualiza o cadastro e as três tabelas, cada uma só onde o valor é IGUAL ao nome antigo exato", () => {
    expect(sql.match(/create (or replace )?function/g)).toHaveLength(1);
    expect(sql).toContain("update public.cadastro_consultores set nome = p_nome_novo, nome_chave = p_nome_chave, updated_at = now(), atualizado_por = p_por where id = p_id;");
    expect(sql).toContain("update public.follow_up set consultor = p_nome_novo where consultor = v_antigo;");
    expect(sql).toContain("update public.prestacao_pacientes set consultor = p_nome_novo where consultor = v_antigo;");
    expect(sql).toContain("update public.dir set vendedor = p_nome_novo where vendedor = v_antigo;");
    // Nenhum update sem filtro pelo nome antigo (fora o do próprio cadastro, filtrado pelo id).
    const updates = [...sql.matchAll(/update public\.(\w+) set [^;]*;/g)].map((m) => m[0]);
    expect(updates).toHaveLength(4);
    for (const u of updates.filter((u) => !u.startsWith("update public.cadastro_consultores"))) expect(u).toContain("= v_antigo;");
  });

  it("trava a linha do consultor (for update) e recusa: nome inválido, consultor inexistente (P0002), chave de OUTRO consultor (23505)", () => {
    expect(sql).toContain("where id = p_id for update;");
    expect(sql).toContain("errcode = '22023'");
    expect(sql).toContain("errcode = 'p0002'");
    expect(sql).toContain("where nome_chave = p_nome_chave and id <> p_id");
    expect(sql).toContain("errcode = '23505'");
  });

  it("não mexe em updated_at das tabelas de processo/DIR/prestação, não toca o enum consultor_nome e não apaga nada", () => {
    for (const tabela of ["follow_up", "prestacao_pacientes", "dir"]) {
      const trecho = new RegExp(`update public\\.${tabela} set [^;]*;`).exec(sql)?.[0] ?? "";
      expect(trecho, tabela).not.toContain("updated_at");
    }
    expect(sql).not.toMatch(/consultor_nome/);
    expect(sql).not.toMatch(/\balter (type|table)\b/);
    expect(sql).not.toMatch(/\bdrop\b|\bdelete\b|\btruncate\b/);
  });

  it("acesso: revoke all de public/anon/authenticated e grant execute SÓ ao service_role", () => {
    expect(sql).toContain("revoke all on function public.renomear_consultor(text, text, text, text) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.renomear_consultor(text, text, text, text) to service_role;");
    expect(sql.match(/\bgrant\b/g)).toHaveLength(1);
  });

  it("o app chama a função com os MESMOS nomes de parâmetro do SQL", () => {
    const store = readFileSync(join(process.cwd(), "server", "utils", "cadastrosStore.ts"), "utf-8");
    expect(store).toContain('db.rpc("renomear_consultor", {');
    for (const parametro of ["p_id", "p_nome_novo", "p_nome_chave", "p_por"]) {
      expect(sql, parametro).toContain(parametro);
      expect(store, parametro).toContain(parametro);
    }
  });
});

describe("a emulação usada nos testes segue as regras do SQL", () => {
  const novoFake = () => {
    const fake = new FakeSupabase();
    fake.tabelas["cadastro_consultores"] = [linhaConsultor("Antigo Teste", true, { id: "a" }), linhaConsultor("Outro Teste", true, { id: "b" })];
    fake.tabelas["follow_up"] = [{ id: "1", consultor: "Antigo Teste" }, { id: "2", consultor: "Outro Teste" }];
    fake.tabelas["prestacao_pacientes"] = [{ id: "1", consultor: "Antigo Teste" }, { id: "2", consultor: null }];
    fake.tabelas["dir"] = [{ id: "1", vendedor: "Antigo Teste" }];
    return fake;
  };
  const args = (id: string, nome: string) => ({ p_id: id, p_nome_novo: nome, p_nome_chave: chaveCadastro(nome), p_por: "Teste" });

  it("propaga só onde o valor era igual; nome igual devolve zeros; chave de outro → 23505; inexistente → P0002", () => {
    const fake = novoFake();
    expect(renomearConsultorSql(args("a", "Novo Teste"), fake).data).toEqual({ nomeAntigo: "Antigo Teste", followUp: 1, prestacao: 1, dir: 1 });
    expect(fake.tabelas["follow_up"]!.map((r) => r.consultor)).toEqual(["Novo Teste", "Outro Teste"]);
    expect(fake.tabelas["prestacao_pacientes"]!.map((r) => r.consultor)).toEqual(["Novo Teste", null]);
    expect(renomearConsultorSql(args("a", "Novo Teste"), fake).data).toEqual({ nomeAntigo: "Novo Teste", followUp: 0, prestacao: 0, dir: 0 });
    expect(renomearConsultorSql(args("a", "outro teste"), fake).error?.code).toBe("23505");
    expect(renomearConsultorSql(args("x", "Qualquer Teste"), fake).error?.code).toBe("P0002");
    expect(renomearConsultorSql(args("a", "   "), fake).error?.code).toBe("22023");
  });
});
