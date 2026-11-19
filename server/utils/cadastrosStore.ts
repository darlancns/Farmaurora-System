import { createError } from "h3";
import { LISTAS_COM_PIX, TABELA_CADASTRO } from "../../shared/constants/cadastros";
import type {
  CadastroPorLista,
  Consultor,
  ConsultorPatchDTO,
  ListaCadastro,
  NovoPorLista,
  PatchPorLista,
} from "../../shared/types/Cadastro";
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
 * Persistência dos Cadastros (Configurações → Cadastros) — tabelas `cadastro_fornecedores`, `cadastro_despachantes`,
 * `cadastro_transportadoras`, `cadastro_cias_aereas` e `cadastro_consultores` (supabase/migrations/20261109200000_cadastros.sql,
 * 20261118200000_cadastros_transportadoras_pix.sql e 20261118210000_cadastro_consultores.sql). Mesmo molde de dirStore.ts: cliente admin do servidor, criar e
 * alterar são cada um UM comando numa única linha.
 *
 * Regras:
 *  - NÃO existe exclusão: remover é desativar (`ativo = false`, um update). O service_role nem tem permissão de exclusão.
 *  - O NOME não muda depois de criado: alterar com um nome diferente do gravado é 422. Para corrigir, cria-se um item
 *    novo e desativa-se o antigo.
 *  - Nome repetido (pela `nome_chave`, incluindo inativos) é 409.
 *  - A lista sai em ordem alfabética pt-BR, ativos primeiro e inativos depois.
 *  - CHAVE PIX (despachantes e transportadoras) é dado financeiro: só sai do banco e entra no resultado com
 *    `incluirPix: true` (o handler decide por podeVerPixCadastro). Sem isso, a coluna `chave_pix` NEM É LIDA do banco e o
 *    campo não existe no resultado. Nenhum erro destas listas repassa a mensagem do banco (poderia trazer a linha).
 */

const ID_PREFIXO: Record<ListaCadastro, string> = {
  fornecedores: "forn_",
  despachantes: "desp_",
  transportadoras: "transp_",
  "cias-aereas": "cia_",
  consultores: "cons_",
};

/** Opções de leitura/gravação. `incluirPix` (padrão false): ler e devolver a chave PIX (só quem pode: ver cadastroPix.ts). */
export interface OpcoesCadastro {
  incluirPix?: boolean;
}

// Colunas lidas SEM a chave PIX (listas que têm PIX); as demais listas leem tudo.
const COLUNAS_SEM_PIX: Partial<Record<ListaCadastro, string>> = {
  despachantes: "id, nome, nome_chave, contato_nome, telefone, email, ativo, atualizado_por, created_at, updated_at",
  transportadoras: "id, nome, nome_chave, ativo, atualizado_por, created_at, updated_at",
};

function colunasLidas(lista: ListaCadastro, incluirPix: boolean): string {
  return incluirPix ? "*" : (COLUNAS_SEM_PIX[lista] ?? "*");
}

// Falha do banco: nas listas com PIX NÃO se repassa a mensagem (só o código), para a chave nunca ir parar num erro ou log.
function erroDaLista(lista: ListaCadastro, acao: string, e: { message: string; code?: string }): Error {
  if (!LISTAS_COM_PIX.includes(lista)) return erro(acao, e);
  return erro(acao, { message: `código ${e.code ?? "desconhecido"}`, code: e.code });
}

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

export async function listarCadastro<L extends ListaCadastro>(lista: L, opcoes: OpcoesCadastro = {}): Promise<CadastroPorLista[L][]> {
  const incluirPix = opcoes.incluirPix === true;
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from(TABELA_CADASTRO[lista]).select(colunasLidas(lista, incluirPix));
  if (error) throw erroDaLista(lista, `listar ${lista}`, error);

  const itens = ((data ?? []) as unknown as CadastroRowPorLista[L][]).map((row) => montarCadastro(lista, row, incluirPix));
  return ordenarCadastro(itens);
}

export async function criarCadastro<L extends ListaCadastro>(
  lista: L,
  dto: NovoPorLista[L],
  por: string,
  opcoes: OpcoesCadastro = {},
): Promise<CadastroPorLista[L]> {
  const incluirPix = opcoes.incluirPix === true;
  const db = createSupabaseAdminClient();
  const tabela = TABELA_CADASTRO[lista];
  const chave = chaveCadastro(dto.nome);

  const { data: existentes, error: erroBusca } = await db.from(tabela).select("id, ativo").eq("nome_chave", chave);
  if (erroBusca) throw erroDaLista(lista, `verificar nome duplicado em ${lista}`, erroBusca);
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
    throw erroDaLista(lista, `criar item em ${lista}`, error);
  }

  return montarCadastro(lista, row as unknown as CadastroRowPorLista[L], incluirPix);
}

/** null quando o item não existe (o handler responde 404). */
export async function alterarCadastro<L extends ListaCadastro>(
  lista: L,
  id: string,
  patch: PatchPorLista[L],
  por: string,
  opcoes: OpcoesCadastro = {},
): Promise<CadastroPorLista[L] | null> {
  const incluirPix = opcoes.incluirPix === true;
  const colunasDeLeitura = colunasLidas(lista, incluirPix);
  const db = createSupabaseAdminClient();
  const tabela = TABELA_CADASTRO[lista];

  const { data: atuais, error: erroBusca } = await db.from(tabela).select(colunasDeLeitura).eq("id", id);
  if (erroBusca) throw erroDaLista(lista, `buscar item de ${lista}`, erroBusca);
  const atual = ((atuais ?? []) as unknown as CadastroRowPorLista[L][])[0];
  if (!atual) return null;

  // O nome não muda: igual ao gravado é ignorado (idempotente); qualquer outro valor é recusado.
  const nomeEnviado = (patch as { nome?: string }).nome;
  if (nomeEnviado !== undefined && nomeEnviado !== atual.nome) {
    throw new CadastroRegraError(MENSAGEM_NOME_NAO_MUDA, 422);
  }

  const colunas = colunasPatchCadastro(lista, patch);
  if (Object.keys(colunas).length === 0) return montarCadastro(lista, atual, incluirPix);

  const { data, error } = await db
    .from(tabela)
    .update({ ...colunas, atualizado_por: por, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(colunasDeLeitura);
  if (error) throw erroDaLista(lista, `atualizar item de ${lista}`, error);

  const row = ((data ?? []) as unknown as CadastroRowPorLista[L][])[0];
  return row ? montarCadastro(lista, row, incluirPix) : null;
}

// ── Consultores: renomear (a ÚNICA lista cujo nome pode mudar) ───────────────────────────────────────────────
// O nome do consultor é gravado como TEXTO em follow_up.consultor, prestacao_pacientes.consultor e dir.vendedor (e nas contas, em
// app_metadata.consultorNome). Renomear precisa mudar tudo junto: a função SQL `renomear_consultor` (supabase/migrations/
// 20261118231000_renomear_consultor.sql) faz, NUMA transação, o cadastro e as três tabelas, e devolve as contagens. As contas de
// login são atualizadas depois, pelo handler (server/utils/consultorContas.ts), porque o Auth não entra na transação do banco.

/** Contagens devolvidas pela função SQL (linhas atualizadas por tabela). */
export interface RenomeacaoNoBanco {
  nomeAntigo: string;
  followUp: number;
  prestacao: number;
  dir: number;
}

// Códigos do PostgREST/Postgres quando a função ainda não existe no banco (migration pendente).
const CODIGOS_FUNCAO_AUSENTE = ["42883", "PGRST202"];

/**
 * Renomeia o consultor `id` (e propaga o texto) numa transação do banco. null quando o consultor não existe. 409 se o nome (pela
 * chave) é de OUTRO consultor; 503 se a função ainda não foi aplicada. Corrigir só acento/caixa (mesma chave) é permitido.
 */
export async function renomearConsultor(id: string, nomeNovo: string, por: string): Promise<RenomeacaoNoBanco | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.rpc("renomear_consultor", {
    p_id: id,
    p_nome_novo: nomeNovo,
    p_nome_chave: chaveCadastro(nomeNovo),
    p_por: por,
  });
  if (error) {
    if (error.code === CODIGO_UNICO_VIOLADO) throw new CadastroRegraError("Já existe outro consultor com esse nome.", 409);
    if (error.code === "P0002") return null;
    if (error.code && CODIGOS_FUNCAO_AUSENTE.includes(error.code)) {
      throw new CadastroRegraError("Renomear ainda não está disponível: a função renomear_consultor não foi aplicada no banco.", 503);
    }
    throw erro("renomear o consultor", error);
  }

  const r = (data ?? {}) as Record<string, unknown>;
  const n = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
  return { nomeAntigo: String(r.nomeAntigo ?? ""), followUp: n(r.followUp), prestacao: n(r.prestacao), dir: n(r.dir) };
}

/**
 * Altera um consultor: `ativo` como nas outras listas e, SÓ aqui, o `nome` (renomear). Nome igual ao gravado é ignorado. O item
 * volta sempre lido do banco depois de tudo. `renomeacao` vem preenchida só quando o nome mudou. consultor null = 404.
 */
export async function alterarConsultor(
  id: string,
  patch: ConsultorPatchDTO,
  por: string,
): Promise<{ consultor: Consultor | null; renomeacao: RenomeacaoNoBanco | null }> {
  const db = createSupabaseAdminClient();
  const tabela = TABELA_CADASTRO.consultores;

  const { data: atuais, error: erroBusca } = await db.from(tabela).select("*").eq("id", id);
  if (erroBusca) throw erro("buscar consultor", erroBusca);
  const atual = ((atuais ?? []) as CadastroRowPorLista["consultores"][])[0];
  if (!atual) return { consultor: null, renomeacao: null };

  const { nome, ...resto } = patch;
  let renomeacao: RenomeacaoNoBanco | null = null;
  if (nome !== undefined && nome !== atual.nome) {
    renomeacao = await renomearConsultor(id, nome, por);
    if (!renomeacao) return { consultor: null, renomeacao: null };
  }

  if (Object.keys(resto).length > 0) {
    return { consultor: await alterarCadastro("consultores", id, resto, por), renomeacao };
  }

  const { data: depois, error: erroLeitura } = await db.from(tabela).select("*").eq("id", id);
  if (erroLeitura) throw erro("buscar consultor", erroLeitura);
  const row = ((depois ?? []) as CadastroRowPorLista["consultores"][])[0];
  return { consultor: row ? montarCadastro("consultores", row) : null, renomeacao };
}

/** Item do Cadastro de consultores pelo id (só leitura); null se não existe. */
export async function buscarConsultor(id: string): Promise<Consultor | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from(TABELA_CADASTRO.consultores).select("*").eq("id", id);
  if (error) throw erro("buscar consultor", error);
  const row = ((data ?? []) as CadastroRowPorLista["consultores"][])[0];
  return row ? montarCadastro("consultores", row) : null;
}

/** Existe OUTRO consultor (id diferente) com exatamente este nome? Usado ao religar contas de um nome antigo. */
export async function existeOutroConsultorComNome(nome: string, idIgnorado: string): Promise<boolean> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from(TABELA_CADASTRO.consultores).select("id").eq("nome", nome);
  if (error) throw erro("conferir o nome do consultor", error);
  return ((data ?? []) as Array<{ id: string }>).some((r) => r.id !== idIgnorado);
}

/** Quantos registros do banco têm o nome do consultor `id` (só leitura): follow_up, prestacao_pacientes e dir. null = não existe. */
export async function contarImpactoConsultor(
  id: string,
): Promise<{ nome: string; processos: number; pacientes: number; dir: number } | null> {
  const consultor = await buscarConsultor(id);
  if (!consultor) return null;

  const db = createSupabaseAdminClient();
  async function contar(tabela: string, coluna: string): Promise<number> {
    const { count, error } = await db.from(tabela).select("id", { count: "exact", head: true }).eq(coluna, consultor!.nome);
    if (error) throw erro(`contar registros de ${tabela}`, error);
    return count ?? 0;
  }
  const [processos, pacientes, dir] = await Promise.all([
    contar("follow_up", "consultor"),
    contar("prestacao_pacientes", "consultor"),
    contar("dir", "vendedor"),
  ]);
  return { nome: consultor.nome, processos, pacientes, dir };
}
