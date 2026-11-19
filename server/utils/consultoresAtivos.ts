import { nomesConsultoresAtivos } from "../../shared/utils/dirVendedor";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro } from "./storeKit";

/**
 * Consultores ATIVOS do Cadastro (tabela `cadastro_consultores`, lista "consultores" em Configurações → Cadastros), em
 * ordem alfabética pt-BR. É o que o servidor da DIR usa para saber quais consultores podem ser escolhidos como valor novo
 * do campo Consultor (vendedor): ver shared/utils/dirVendedor.ts.
 *
 * Só leitura, e só as colunas `nome` e `ativo`. Fica FORA do store dos Cadastros de propósito: aquele store é o único caminho das
 * listas com chave PIX (guarda em tests/unit/cadastrosPixNenhumaOutraRota.spec.ts), e a lista de consultores não tem PIX.
 */
const TABELA_CONSULTORES = "cadastro_consultores";

export async function listarConsultoresAtivos(): Promise<string[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from(TABELA_CONSULTORES).select("nome, ativo").eq("ativo", true);
  if (error) throw erro("listar os consultores ativos do Cadastro", error);

  const itens = ((data ?? []) as Array<{ nome: string; ativo: boolean }>).map((row) => ({ nome: row.nome, ativo: row.ativo === true }));
  return nomesConsultoresAtivos(itens);
}
