import type { SupabaseClient } from "@supabase/supabase-js";
import { chaveCadastro } from "../../../shared/utils/cadastroNome";

// Cadastros de TESTE que os e2e de Pagamentos usam: a página agora lê fornecedores, despachantes, transportadoras e a chave
// PIX dos Cadastros (Configurações → Cadastros), então os selects só têm o que está lá. Só roda no Supabase local do harness
// (as suítes chamam assertSupabaseLocal antes de qualquer escrita). NÃO existe exclusão nos Cadastros (nem para a service
// role): os itens ficam no banco local entre as execuções, com nomes FIXOS "TESTE e2e ..." — a semeadura é idempotente
// (insere se não existir; se existir, só reativa e repõe os valores de teste). As chaves PIX são FICTÍCIAS.

export const FORN_A = { nome: "TESTE e2e Fornecedor A", pais: "Turquia" };
export const FORN_B = { nome: "TESTE e2e Fornecedor B", pais: "Bélgica" };
export const FORN_INATIVO = { nome: "TESTE e2e Fornecedor Inativo", pais: "Peru" };
export const FORN_A_TEXTO = `${FORN_A.nome} - ${FORN_A.pais}`;
export const FORN_B_TEXTO = `${FORN_B.nome} - ${FORN_B.pais}`;
export const FORN_INATIVO_TEXTO = `${FORN_INATIVO.nome} - ${FORN_INATIVO.pais}`;

export const DESP_A = "TESTE e2e Despachante A";
export const DESP_B = "TESTE e2e Despachante B";
export const DESP_C = "TESTE e2e Despachante C";
export const DESP_SEM_PIX = "TESTE e2e Despachante Sem Pix";
export const DESP_INATIVO = "TESTE e2e Despachante Inativo";
export const TRANSP_A = "TESTE e2e Transportadora A";
export const TRANSP_B = "TESTE e2e Transportadora B";
export const TRANSP_INATIVA = "TESTE e2e Transportadora Inativa";

export const PIX_DESP_A = "e2e-chave-ficticia-despachante-a";
export const PIX_DESP_B = "e2e-chave-ficticia-despachante-b";
export const PIX_DESP_C = "e2e-chave-ficticia-despachante-c";
export const PIX_TRANSP_A = "e2e-chave-ficticia-transportadora-a";
export const PIX_TRANSP_B = "e2e-chave-ficticia-transportadora-b";

const AGORA = (): string => new Date().toISOString();

async function garantir(
  client: SupabaseClient,
  tabela: string,
  prefixoId: string,
  nome: string,
  ativo: boolean,
  extra: Record<string, unknown>,
): Promise<void> {
  const chave = chaveCadastro(nome);
  const { data, error } = await client.from(tabela).select("id").eq("nome_chave", chave).maybeSingle();
  if (error) throw new Error(`semear ${tabela}: falha ao consultar (${error.code ?? "sem código"})`);
  if (data) {
    const { error: e } = await client.from(tabela).update({ ativo, ...extra, updated_at: AGORA() }).eq("id", (data as { id: string }).id);
    if (e) throw new Error(`semear ${tabela}: falha ao atualizar (${e.code ?? "sem código"})`);
    return;
  }
  const { error: e } = await client.from(tabela).insert({
    id: `${prefixoId}e2e_${chave.replace(/[^a-z0-9]+/g, "_")}`,
    nome,
    nome_chave: chave,
    ativo,
    atualizado_por: "e2e",
    created_at: AGORA(),
    updated_at: AGORA(),
    ...extra,
  });
  if (e) throw new Error(`semear ${tabela}: falha ao inserir (${e.code ?? "sem código"})`);
}

/** Garante os itens de teste nos Cadastros do banco LOCAL (idempotente). */
export async function semearCadastrosDePagamento(client: SupabaseClient): Promise<void> {
  const fornecedor = (f: { pais: string }) => ({ pais: f.pais, prazo_alerta_dias: 30, sem_alerta: false });
  await garantir(client, "cadastro_fornecedores", "forn_", FORN_A.nome, true, fornecedor(FORN_A));
  await garantir(client, "cadastro_fornecedores", "forn_", FORN_B.nome, true, fornecedor(FORN_B));
  await garantir(client, "cadastro_fornecedores", "forn_", FORN_INATIVO.nome, false, fornecedor(FORN_INATIVO));

  const desp = { contato_nome: null, telefone: null, email: null };
  await garantir(client, "cadastro_despachantes", "desp_", DESP_A, true, { ...desp, chave_pix: PIX_DESP_A });
  await garantir(client, "cadastro_despachantes", "desp_", DESP_B, true, { ...desp, chave_pix: PIX_DESP_B });
  await garantir(client, "cadastro_despachantes", "desp_", DESP_C, true, { ...desp, chave_pix: PIX_DESP_C });
  await garantir(client, "cadastro_despachantes", "desp_", DESP_SEM_PIX, true, { ...desp, chave_pix: null });
  await garantir(client, "cadastro_despachantes", "desp_", DESP_INATIVO, false, { ...desp, chave_pix: PIX_DESP_C });

  await garantir(client, "cadastro_transportadoras", "transp_", TRANSP_A, true, { chave_pix: PIX_TRANSP_A });
  await garantir(client, "cadastro_transportadoras", "transp_", TRANSP_B, true, { chave_pix: PIX_TRANSP_B });
  await garantir(client, "cadastro_transportadoras", "transp_", TRANSP_INATIVA, false, { chave_pix: PIX_TRANSP_B });
}
