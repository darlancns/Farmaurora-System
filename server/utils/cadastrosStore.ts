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
  colunasRenomearMedicamento,
  montarCadastro,
  type CadastroRowPorLista,
} from "./cadastroMappers";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro, randomId } from "./storeKit";

/**
 * Persistência dos Cadastros (Configurações → Cadastros) — tabelas `cadastro_fornecedores`, `cadastro_despachantes`,
 * `cadastro_transportadoras`, `cadastro_cias_aereas`, `cadastro_consultores`, `cadastro_temperaturas` e `cadastro_medicamentos` (supabase/migrations/
 * 20261109200000_cadastros.sql, 20261118200000_cadastros_transportadoras_pix.sql, 20261118210000_cadastro_consultores.sql e
 * 20261119160000_cadastro_temperaturas_medicamentos.sql). Mesmo molde de dirStore.ts: cliente admin do servidor, criar e
 * alterar são cada um UM comando numa única linha.
 *
 * Regras:
 *  - NÃO existe exclusão: remover é desativar (`ativo = false`, um update). O service_role nem tem permissão de exclusão.
 *  - O NOME não muda depois de criado: alterar com um nome diferente do gravado é 422. Para corrigir, cria-se um item
 *    novo e desativa-se o antigo. EXCEÇÕES (LISTAS_RENOMEAVEIS): o consultor (RPC, abaixo) e o MEDICAMENTO (um UPDATE só, ver
 *    alterarMedicamento).
 *  - MEDICAMENTO: o nome é gravado em MAIÚSCULAS e a temperatura (texto, cópia do nome) precisa ser de uma temperatura ATIVA do
 *    Cadastro de Temperaturas (422 se não existe ou está inativa).
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
  temperaturas: "temp_",
  medicamentos: "med_",
};

/** Opções de leitura/gravação. `incluirPix` (padrão false): ler e devolver a chave PIX (só quem pode: ver cadastroPix.ts). */
export interface OpcoesCadastro {
  incluirPix?: boolean;
  /**
   * Só em `criarCadastro`: o id do item novo (padrão: um id aleatório com o prefixo da lista). Quem precisa REPETIR a criação com segurança (a
   * aprovação de um pré-cadastro de medicamento) usa um id determinístico: a repetição reconhece a linha que já criou.
   */
  id?: string;
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

// O PostgREST devolve no máximo 1000 linhas por requisição (padrão do Supabase) e corta o resto em silêncio. Os medicamentos
// já passam de 400, então a listagem pagina (no molde de listDir, em dirStore.ts) em vez de truncar. A paginação precisa de uma
// ordem ESTÁVEL: sem `order("id")` uma página pode repetir ou pular linhas.
const TAMANHO_PAGINA = 1000;

export async function listarCadastro<L extends ListaCadastro>(lista: L, opcoes: OpcoesCadastro = {}): Promise<CadastroPorLista[L][]> {
  const incluirPix = opcoes.incluirPix === true;
  const db = createSupabaseAdminClient();
  const colunas = colunasLidas(lista, incluirPix);
  const todas: CadastroRowPorLista[L][] = [];

  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await db
      .from(TABELA_CADASTRO[lista])
      .select(colunas)
      .order("id", { ascending: true })
      .range(de, de + TAMANHO_PAGINA - 1);
    if (error) throw erroDaLista(lista, `listar ${lista}`, error);

    const pagina = (data ?? []) as unknown as CadastroRowPorLista[L][];
    todas.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA) break;
  }

  return ordenarCadastro(todas.map((row) => montarCadastro(lista, row, incluirPix)));
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

  // Medicamento: a temperatura precisa ser de uma temperatura ATIVA; o que se grava é o NOME dela como está no Cadastro.
  if (lista === "medicamentos") {
    const m = dto as NovoPorLista["medicamentos"];
    dto = { ...m, temperatura: await temperaturaAtivaDoCadastro(db, m.temperatura) } as NovoPorLista[L];
  }

  const { data: existentes, error: erroBusca } = await db.from(tabela).select("id, ativo").eq("nome_chave", chave);
  if (erroBusca) throw erroDaLista(lista, `verificar nome duplicado em ${lista}`, erroBusca);
  const existente = ((existentes ?? []) as Array<{ id: string; ativo: boolean }>)[0];
  if (existente) throw new CadastroRegraError(mensagemDuplicado(existente.ativo === true), 409);

  const agora = new Date().toISOString();
  const row = {
    id: opcoes.id ?? randomId(ID_PREFIXO[lista]),
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
  // Medicamento: caminho próprio (renomear, trocar a temperatura e ativar/desativar num UPDATE só).
  if (lista === "medicamentos") {
    return (await alterarMedicamento(id, patch as PatchPorLista["medicamentos"], por)) as CadastroPorLista[L] | null;
  }
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

// ── Medicamentos: temperatura validada e renomear ──────────────────────────────────────────────────────────

export const MENSAGEM_TEMPERATURA_INEXISTENTE = "Temperatura não encontrada no Cadastro de Temperaturas.";
export const MENSAGEM_TEMPERATURA_INATIVA = "Essa temperatura está inativa. Escolha uma temperatura ativa.";

/**
 * A temperatura enviada precisa existir no Cadastro de Temperaturas (comparação pela chave: sem acento nem caixa) e estar ATIVA, senão
 * 422. Devolve o NOME dela como está no Cadastro (é essa a cópia que o medicamento guarda).
 */
async function temperaturaAtivaDoCadastro(db: ReturnType<typeof createSupabaseAdminClient>, enviada: string): Promise<string> {
  const { data, error } = await db
    .from(TABELA_CADASTRO.temperaturas)
    .select("nome, ativo")
    .eq("nome_chave", chaveCadastro(enviada));
  if (error) throw erro("conferir a temperatura", error);

  const achada = ((data ?? []) as Array<{ nome: string; ativo: boolean }>)[0];
  if (!achada) throw new CadastroRegraError(MENSAGEM_TEMPERATURA_INEXISTENTE, 422);
  if (achada.ativo !== true) throw new CadastroRegraError(MENSAGEM_TEMPERATURA_INATIVA, 422);
  return achada.nome;
}

/**
 * Altera um medicamento: renomear, trocar a temperatura e/ou ativar/desativar, tudo num ÚNICO UPDATE (nome, nome_chave, temperatura,
 * ativo, updated_at e atualizado_por). Sem RPC e sem propagação (a Compra, no futuro, guarda cópia do texto). null = não existe (404).
 *  - nome igual ao gravado (em MAIÚSCULAS) é ignorado; trocar só acento/caixa (mesma chave) vale; nome que é de OUTRO medicamento é 409;
 *  - temperatura igual à gravada é ignorada (um medicamento cuja temperatura foi desativada depois continua editável); uma temperatura
 *    DIFERENTE precisa ser de uma temperatura ativa (422);
 *  - a corrida (23505 do índice único em nome_chave) também vira 409.
 */
async function alterarMedicamento(id: string, patch: PatchPorLista["medicamentos"], por: string): Promise<CadastroPorLista["medicamentos"] | null> {
  const db = createSupabaseAdminClient();
  const tabela = TABELA_CADASTRO.medicamentos;

  const { data: atuais, error: erroBusca } = await db.from(tabela).select("*").eq("id", id);
  if (erroBusca) throw erro("buscar medicamento", erroBusca);
  const atual = ((atuais ?? []) as CadastroRowPorLista["medicamentos"][])[0];
  if (!atual) return null;

  const colunas: Record<string, unknown> = colunasPatchCadastro("medicamentos", { ativo: patch.ativo });

  if (patch.temperatura !== undefined && patch.temperatura !== (atual.temperatura ?? "")) {
    colunas.temperatura = await temperaturaAtivaDoCadastro(db, patch.temperatura);
  }

  if (patch.nome !== undefined) {
    const novo = colunasRenomearMedicamento(patch.nome);
    if (novo.nome !== atual.nome) {
      const { data: mesmaChave, error: erroChave } = await db.from(tabela).select("id, ativo").eq("nome_chave", novo.nome_chave);
      if (erroChave) throw erro("verificar nome duplicado em medicamentos", erroChave);
      const outro = ((mesmaChave ?? []) as Array<{ id: string; ativo: boolean }>).find((r) => r.id !== id);
      if (outro) throw new CadastroRegraError(mensagemDuplicadoNoRenomear(outro.ativo === true), 409);
      Object.assign(colunas, novo);
    }
  }

  if (Object.keys(colunas).length === 0) return montarCadastro("medicamentos", atual);

  const { data, error } = await db
    .from(tabela)
    .update({ ...colunas, atualizado_por: por, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*");
  if (error) {
    if (error.code === CODIGO_UNICO_VIOLADO) throw new CadastroRegraError(mensagemDuplicadoNoRenomear(true), 409);
    throw erro("atualizar medicamento", error);
  }

  const row = ((data ?? []) as CadastroRowPorLista["medicamentos"][])[0];
  return row ? montarCadastro("medicamentos", row) : null;
}

function mensagemDuplicadoNoRenomear(outroAtivo: boolean): string {
  return outroAtivo ? "Já existe outro medicamento com esse nome." : "Já existe outro medicamento inativo com esse nome.";
}

// ── Consultores: renomear (a ÚNICA lista cujo nome pode mudar) ───────────────────────────────────────────────
// O nome do consultor é gravado como TEXTO em follow_up.consultor, prestacao_pacientes.consultor, dir.vendedor e compras.vendedor (e nas contas, em
// app_metadata.consultorNome). Renomear precisa mudar tudo junto: a função SQL `renomear_consultor` (supabase/migrations/
// 20261118231000_renomear_consultor.sql e 20261120120000_renomear_consultor_compras.sql) faz, NUMA transação, o cadastro e as quatro
// tabelas, e devolve as contagens. As contas de
// login são atualizadas depois, pelo handler (server/utils/consultorContas.ts), porque o Auth não entra na transação do banco.

/** Contagens devolvidas pela função SQL (linhas atualizadas por tabela). */
export interface RenomeacaoNoBanco {
  nomeAntigo: string;
  followUp: number;
  prestacao: number;
  dir: number;
  compras: number;
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
  return { nomeAntigo: String(r.nomeAntigo ?? ""), followUp: n(r.followUp), prestacao: n(r.prestacao), dir: n(r.dir), compras: n(r.compras) };
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

/** Quantos registros do banco têm o nome do consultor `id` (só leitura): follow_up, prestacao_pacientes, dir e compras. null = não existe. */
export async function contarImpactoConsultor(
  id: string,
): Promise<{ nome: string; processos: number; pacientes: number; dir: number; compras: number } | null> {
  const consultor = await buscarConsultor(id);
  if (!consultor) return null;

  const db = createSupabaseAdminClient();
  async function contar(tabela: string, coluna: string): Promise<number> {
    const { count, error } = await db.from(tabela).select("id", { count: "exact", head: true }).eq(coluna, consultor!.nome);
    if (error) throw erro(`contar registros de ${tabela}`, error);
    return count ?? 0;
  }
  const [processos, pacientes, dir, compras] = await Promise.all([
    contar("follow_up", "consultor"),
    contar("prestacao_pacientes", "consultor"),
    contar("dir", "vendedor"),
    contar("compras", "vendedor"),
  ]);
  return { nome: consultor.nome, processos, pacientes, dir, compras };
}
