import { createError } from "h3";
import { TABELA_CADASTRO } from "../../shared/constants/cadastros";
import type { CadastroPorLista, ListaCadastro, NovoPorLista, PatchPorLista } from "../../shared/types/Cadastro";
import { chaveCadastro, ordenarCadastro } from "../../shared/utils/cadastroNome";
import {
  colunasNovoCadastro,
  colunasPatchCadastro,
  montarCadastro,
  type CadastroRowPorLista,
} from "./cadastroMappers";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro, randomId } from "./storeKit";

/**
 * Persistência dos Cadastros (Configurações → Cadastros) — tabelas `cadastro_fornecedores`, `cadastro_despachantes` e
 * `cadastro_cias_aereas` (supabase/migrations/20261109200000_cadastros.sql). Mesmo molde de dirStore.ts: cliente admin
 * do servidor, criar e alterar são cada um UM comando numa única linha.
 *
 * Regras:
 *  - NÃO existe exclusão: remover é desativar (`ativo = false`, um update). O service_role nem tem permissão de exclusão.
 *  - O NOME não muda depois de criado: alterar com um nome diferente do gravado é 422. Para corrigir, cria-se um item
 *    novo e desativa-se o antigo.
 *  - Nome repetido (pela `nome_chave`, incluindo inativos) é 409.
 *  - A lista sai em ordem alfabética pt-BR, ativos primeiro e inativos depois.
 */

const ID_PREFIXO: Record<ListaCadastro, string> = {
  fornecedores: "forn_",
  despachantes: "desp_",
  "cias-aereas": "cia_",
};

const CODIGO_UNICO_VIOLADO = "23505";

/** Erro de regra de negócio dos Cadastros (409 duplicado, 422 nome alterado). */
export class CadastroRegraError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "CadastroRegraError";
  }
}

export const MENSAGEM_NOME_NAO_MUDA =
  "O nome não pode ser alterado depois de criado. Para corrigir, crie um item novo e desative este.";

function mensagemDuplicado(ativo: boolean): string {
  return ativo
    ? "Já existe um item com esse nome."
    : "Já existe um item inativo com esse nome. Reative-o em vez de criar outro.";
}

export function responderErroDeRegra(e: unknown): never {
  if (e instanceof CadastroRegraError) throw createError({ statusCode: e.statusCode, statusMessage: e.message });
  throw e;
}

export async function listarCadastro<L extends ListaCadastro>(lista: L): Promise<CadastroPorLista[L][]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from(TABELA_CADASTRO[lista]).select("*");
  if (error) throw erro(`listar ${lista}`, error);

  const itens = ((data ?? []) as CadastroRowPorLista[L][]).map((row) => montarCadastro(lista, row));
  return ordenarCadastro(itens);
}

export async function criarCadastro<L extends ListaCadastro>(
  lista: L,
  dto: NovoPorLista[L],
  por: string,
): Promise<CadastroPorLista[L]> {
  const db = createSupabaseAdminClient();
  const tabela = TABELA_CADASTRO[lista];
  const chave = chaveCadastro(dto.nome);

  const { data: existentes, error: erroBusca } = await db.from(tabela).select("id, ativo").eq("nome_chave", chave);
  if (erroBusca) throw erro(`verificar nome duplicado em ${lista}`, erroBusca);
  const existente = ((existentes ?? []) as Array<{ id: string; ativo: boolean }>)[0];
  if (existente) throw new CadastroRegraError(mensagemDuplicado(existente.ativo === true), 409);

  const agora = new Date().toISOString();
  const row = {
    id: randomId(ID_PREFIXO[lista]),
    ...colunasNovoCadastro(lista, dto),
    atualizado_por: por,
    created_at: agora,
    updated_at: agora,
  };

  const { error } = await db.from(tabela).insert(row);
  if (error) {
    // Corrida: outra gravação com o mesmo nome entrou entre a verificação e o insert (índice único em nome_chave).
    if (error.code === CODIGO_UNICO_VIOLADO) throw new CadastroRegraError(mensagemDuplicado(true), 409);
    throw erro(`criar item em ${lista}`, error);
  }

  return montarCadastro(lista, row as unknown as CadastroRowPorLista[L]);
}

/** null quando o item não existe (o handler responde 404). */
export async function alterarCadastro<L extends ListaCadastro>(
  lista: L,
  id: string,
  patch: PatchPorLista[L],
  por: string,
): Promise<CadastroPorLista[L] | null> {
  const db = createSupabaseAdminClient();
  const tabela = TABELA_CADASTRO[lista];

  const { data: atuais, error: erroBusca } = await db.from(tabela).select("*").eq("id", id);
  if (erroBusca) throw erro(`buscar item de ${lista}`, erroBusca);
  const atual = ((atuais ?? []) as CadastroRowPorLista[L][])[0];
  if (!atual) return null;

  // O nome não muda: igual ao gravado é ignorado (idempotente); qualquer outro valor é recusado.
  const nomeEnviado = (patch as { nome?: string }).nome;
  if (nomeEnviado !== undefined && nomeEnviado !== atual.nome) {
    throw new CadastroRegraError(MENSAGEM_NOME_NAO_MUDA, 422);
  }

  const colunas = colunasPatchCadastro(lista, patch);
  if (Object.keys(colunas).length === 0) return montarCadastro(lista, atual);

  const { data, error } = await db
    .from(tabela)
    .update({ ...colunas, atualizado_por: por, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*");
  if (error) throw erro(`atualizar item de ${lista}`, error);

  const row = ((data ?? []) as CadastroRowPorLista[L][])[0];
  return row ? montarCadastro(lista, row) : null;
}
