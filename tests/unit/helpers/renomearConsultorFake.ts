import type { FakeSupabase, FuncaoRpc } from "./fakeSupabase";

// Emulação em JS da função SQL `public.renomear_consultor` (supabase/migrations/20261118231000_renomear_consultor.sql) sobre as
// tabelas do FakeSupabase: mesmas regras (nome inválido, consultor inexistente → P0002, chave de OUTRO consultor → 23505, nome
// igual → zeros) e mesma propagação (cadastro_consultores, follow_up.consultor, prestacao_pacientes.consultor, dir.vendedor, só
// onde o valor é IGUAL ao nome antigo). tests/unit/renomearConsultorMigration.spec.ts confere que o SQL de verdade tem as mesmas peças.

export const renomearConsultorSql: FuncaoRpc = (args, db) => {
  const id = String(args.p_id);
  const novo = String(args.p_nome_novo ?? "");
  const chave = String(args.p_nome_chave ?? "");
  if (novo.trim() === "" || chave === "") return { error: { message: "nome_invalido", code: "22023" } };

  const cadastro = db.tabelas["cadastro_consultores"] ?? [];
  const atual = cadastro.find((r) => r.id === id);
  if (!atual) return { error: { message: "consultor_nao_encontrado", code: "P0002" } };
  if (cadastro.some((r) => r.nome_chave === chave && r.id !== id)) return { error: { message: "nome_repetido", code: "23505" } };

  const antigo = String(atual.nome);
  if (antigo === novo) return { data: { nomeAntigo: antigo, followUp: 0, prestacao: 0, dir: 0 } };

  Object.assign(atual, { nome: novo, nome_chave: chave, updated_at: new Date().toISOString(), atualizado_por: args.p_por });
  const trocar = (tabela: string, coluna: string): number => {
    let n = 0;
    for (const linha of db.tabelas[tabela] ?? []) {
      if (linha[coluna] === antigo) {
        linha[coluna] = novo;
        n += 1;
      }
    }
    return n;
  };
  return {
    data: {
      nomeAntigo: antigo,
      followUp: trocar("follow_up", "consultor"),
      prestacao: trocar("prestacao_pacientes", "consultor"),
      dir: trocar("dir", "vendedor"),
    },
  };
};

/** Registra a função no fake (como se a migration tivesse sido aplicada). */
export function aplicarRenomearConsultor(fake: FakeSupabase): void {
  fake.rpcs["renomear_consultor"] = renomearConsultorSql;
}
