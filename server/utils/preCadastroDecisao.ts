import type { MedicamentoDoCadastro, StatusPreCadastro } from "../../shared/types/compra";
import {
  CODIGO_MEDICAMENTO_INATIVO,
  CODIGO_MEDICAMENTO_JA_CADASTRADO,
  CODIGO_PRE_CADASTRO_JA_DECIDIDO,
  type ErroMedicamentoJaCadastrado,
  type ErroPreCadastroJaDecidido,
  type ListaPreCadastros,
  type PreCadastroDaLista,
  type RespostaDecisaoPreCadastro,
} from "../../shared/types/PreCadastro";
import { chaveCadastro } from "../../shared/utils/cadastroNome";
import { tituloDaCompra } from "../../shared/utils/compraMes";
import { validarAprovacaoPreCadastro } from "../../shared/utils/preCadastroAprovacao";
import { CadastroRegraError, criarCadastro } from "./cadastrosStore";
import { instanteIso } from "./compraMappers";
import { buscarMedicamentoPorNome } from "./comprasCatalogo";
import { subirVersaoDaCompra } from "./comprasStore";
import { ComprasRegraError } from "./comprasErro";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro } from "./storeKit";

/**
 * A DECISÃO dos pré-cadastros de medicamento (o administrador aprova ou rejeita o que as compras pediram; o PEDIDO está em
 * preCadastroStore.ts). Tabelas `pre_cadastro_medicamentos`, `compra_itens` e `compras`; o medicamento novo entra no Cadastro
 * pelo store dos Cadastros (`criarCadastro`), com todas as regras do cadastro normal. NUNCA apaga nada (o service_role nem tem DELETE).
 *
 * SEM TRANSAÇÃO (supabase-js): cada passo é um comando em autocommit, então a ORDEM é o que garante que REPETIR depois de uma falha no meio termina
 * consistente. O que decide o pré-cadastro — mudar o `status` de `pendente` para `aprovado`/`rejeitado`, com `.eq("status", "pendente")` — é SEMPRE o
 * ÚLTIMO passo; antes dele tudo é idempotente:
 *
 *  APROVAR     1. ler o pré-cadastro (404; já decidido: 409 `pre_cadastro_ja_decidido`)
 *              2. chegar ao medicamento do Cadastro: criar com id DETERMINÍSTICO (`med_<id do pré-cadastro>`; repetir reconhece a própria linha e não
 *                 cria outra) ou, em "vincular", usar o que já existe (ativo; nome repetido sem vincular: 409 `medicamento_ja_cadastrado`)
 *              3. ligar os itens: `medicamento_cadastro_id = X` em TODOS os itens com `pre_cadastro_id` = este pré-cadastro (um UPDATE). A coluna
 *                 `pre_cadastro_id` NÃO é limpa: é por ela que os passos 3 e 4 reencontram os itens e as compras numa repetição; a leitura da compra
 *                 (montarItem) já mostra `preCadastroId = null` para item com medicamento do Cadastro, então o aviso de pré-cadastro some
 *              4. subir a versão (updated_at) de cada compra afetada — DEPOIS de ligar, para uma aba aberta com a versão antiga levar 409 em vez de
 *                 gravar por cima do vínculo
 *              5. marcar `aprovado` (cadastro_id, decidido_por, decidido_em) só se ainda estiver `pendente`; senão 409 (outra pessoa decidiu antes)
 *  REJEITAR    1. ler (404; já decidido: 409) 2. subir a versão das compras dos itens (a rejeição não muda dado do item, só o aviso que ele mostra:
 *              subir ANTES do passo que decide é o que torna a repetição segura) 3. marcar `rejeitado` só se ainda `pendente`.
 *              Os itens seguem com o nome digitado (texto livre) e com o `pre_cadastro_id`.
 *
 * LIMITAÇÃO: duas pessoas decidindo o MESMO pendente no mesmo instante com decisões DIFERENTES (uma aprova, outra rejeita) podem deixar os efeitos
 * dos passos 2 a 4 da que perdeu (medicamento criado e itens ligados); a que perdeu recebe o 409. Duas aprovações iguais são seguras (mesmo id).
 */

const PRE = "pre_cadastro_medicamentos";
const ITENS = "compra_itens";
const COMPRAS = "compras";

const TAMANHO_PAGINA = 1000;
const TAMANHO_BLOCO_IN = 100;

export const MENSAGEM_PRE_CADASTRO_INEXISTENTE = "Pré-cadastro não encontrado.";
export const MENSAGEM_PRE_CADASTRO_JA_DECIDIDO = "Este pré-cadastro já foi decidido por outra pessoa.";
export const MENSAGEM_MEDICAMENTO_JA_NO_CADASTRO = "Já existe um medicamento com esse nome no Cadastro.";
export const MENSAGEM_MEDICAMENTO_INATIVO_NO_CADASTRO = "Esse medicamento está inativo no Cadastro. Reative-o em Cadastros antes de vincular.";
export const MENSAGEM_SEM_MEDICAMENTO_PARA_VINCULAR = "Não há medicamento com esse nome no Cadastro para vincular.";

type Db = ReturnType<typeof createSupabaseAdminClient>;

interface PreRow {
  id: string;
  nome: string;
  nome_chave: string;
  temperatura: string | null;
  status: string;
  compra_id: string | null;
  cadastro_id: string | null;
  solicitado_por: string | null;
  decidido_por: string | null;
  decidido_em: string | null;
  created_at: string;
}

const COLUNAS_PRE = "id, nome, nome_chave, temperatura, status, compra_id, cadastro_id, solicitado_por, decidido_por, decidido_em, created_at";

/** O id da linha do Cadastro que a aprovação deste pré-cadastro cria: o MESMO em toda tentativa (é o que torna a repetição segura). */
export const idDoMedicamentoDoPreCadastro = (preId: string): string => `med_${preId.replace(/^pre_/, "")}`;

function emBlocos<T>(lista: readonly T[]): T[][] {
  const blocos: T[][] = [];
  for (let i = 0; i < lista.length; i += TAMANHO_BLOCO_IN) blocos.push(lista.slice(i, i + TAMANHO_BLOCO_IN));
  return blocos;
}

function montarDaLista(row: PreRow, titulos: ReadonlyMap<string, string>): PreCadastroDaLista {
  return {
    id: row.id,
    nome: row.nome,
    temperatura: row.temperatura ?? "",
    status: row.status as StatusPreCadastro,
    compra: row.compra_id === null ? null : (titulos.get(row.compra_id) ?? null),
    compraId: row.compra_id ?? null,
    solicitadoPor: row.solicitado_por ?? "",
    solicitadoEm: instanteIso(row.created_at ?? ""),
    decididoPor: row.decidido_por ?? null,
    decididoEm: row.decidido_em ? instanteIso(row.decidido_em) : null,
    cadastroId: row.cadastro_id ?? null,
  };
}

/** "Compra 07 - Novembro/2026" de cada compra pedida (só o número do mês e da sequência: nunca o paciente). */
async function titulosDasCompras(db: Db, compraIds: ReadonlyArray<string | null>): Promise<Map<string, string>> {
  const titulos = new Map<string, string>();
  const ids = [...new Set(compraIds.filter((c): c is string => c !== null && c !== ""))];
  for (const bloco of emBlocos(ids)) {
    const { data, error } = await db.from(COMPRAS).select("id, ano_mes, sequencia").in("id", bloco);
    if (error) throw erro("ler as compras dos pré-cadastros", error);
    for (const c of (data ?? []) as Array<{ id: string; ano_mes: string; sequencia: number }>) titulos.set(c.id, tituloDaCompra(c.ano_mes, c.sequencia));
  }
  return titulos;
}

/** Os pré-cadastros no estado pedido (padrão da rota: pendente), do pedido mais antigo para o mais novo. */
export async function listarPreCadastros(status: StatusPreCadastro): Promise<ListaPreCadastros> {
  const db = createSupabaseAdminClient();
  const rows: PreRow[] = [];
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await db
      .from(PRE)
      .select(COLUNAS_PRE)
      .eq("status", status)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(de, de + TAMANHO_PAGINA - 1);
    if (error) throw erro("listar os pré-cadastros", error);
    const pagina = (data ?? []) as unknown as PreRow[];
    rows.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA) break;
  }
  const titulos = await titulosDasCompras(db, rows.map((r) => r.compra_id));
  return { status, total: rows.length, itens: rows.map((r) => montarDaLista(r, titulos)) };
}

async function lerPre(db: Db, id: string): Promise<PreRow | null> {
  const { data, error } = await db.from(PRE).select(COLUNAS_PRE).eq("id", id);
  if (error) throw erro("buscar o pré-cadastro", error);
  return ((data ?? []) as unknown as PreRow[])[0] ?? null;
}

async function paraLista(db: Db, row: PreRow): Promise<PreCadastroDaLista> {
  return montarDaLista(row, await titulosDasCompras(db, [row.compra_id]));
}

/** O 409 de quem chegou depois: o estado atual do pré-cadastro (relido do banco) vai em `data`. */
async function erroJaDecidido(db: Db, id: string): Promise<ComprasRegraError> {
  const atual = await lerPre(db, id);
  if (!atual) return new ComprasRegraError(MENSAGEM_PRE_CADASTRO_INEXISTENTE, 404);
  const data: ErroPreCadastroJaDecidido = { code: CODIGO_PRE_CADASTRO_JA_DECIDIDO, status: atual.status as StatusPreCadastro, preCadastro: await paraLista(db, atual) };
  return new ComprasRegraError(MENSAGEM_PRE_CADASTRO_JA_DECIDIDO, 409, data);
}

async function lerPendente(db: Db, id: string): Promise<PreRow> {
  const pre = await lerPre(db, id);
  if (!pre) throw new ComprasRegraError(MENSAGEM_PRE_CADASTRO_INEXISTENTE, 404);
  if (pre.status !== "pendente") throw await erroJaDecidido(db, id);
  return pre;
}

// ── Itens e compras afetados ─────────────────────────────────────────────────────────────────────────────────

/** Os itens de compra que apontam para o pré-cadastro (já ligados ou ainda não: a coluna não é limpa ao ligar). */
async function itensDoPreCadastro(db: Db, preId: string): Promise<Array<{ id: string; compra_id: string }>> {
  const itens: Array<{ id: string; compra_id: string }> = [];
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await db
      .from(ITENS)
      .select("id, compra_id")
      .eq("pre_cadastro_id", preId)
      .order("id", { ascending: true })
      .range(de, de + TAMANHO_PAGINA - 1);
    if (error) throw erro("ler os itens do pré-cadastro", error);
    const pagina = (data ?? []) as Array<{ id: string; compra_id: string }>;
    itens.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA) break;
  }
  return itens;
}

/** As compras dos itens (sem repetir): cada item aponta direto para a sua compra. */
const comprasDosItens = (itens: ReadonlyArray<{ compra_id: string }>): string[] => [...new Set(itens.map((i) => i.compra_id))];

async function subirVersaoDasCompras(compraIds: readonly string[]): Promise<void> {
  for (const id of compraIds) await subirVersaoDaCompra(id);
}

// ── Decidir ───────────────────────────────────────────────────────────────────────────────────────────────────

/** O passo que DECIDE (sempre o último): só vale se o pré-cadastro ainda está pendente; senão quem chegou depois leva o 409. */
async function decidir(db: Db, pre: PreRow, status: "aprovado" | "rejeitado", por: string, cadastroId: string | null): Promise<PreRow> {
  const agora = new Date().toISOString();
  const { data, error } = await db
    .from(PRE)
    .update({ status, cadastro_id: cadastroId, decidido_por: por, decidido_em: agora, updated_at: agora })
    .eq("id", pre.id)
    .eq("status", "pendente")
    .select(COLUNAS_PRE);
  if (error) throw erro(status === "aprovado" ? "aprovar o pré-cadastro" : "rejeitar o pré-cadastro", error);
  const row = ((data ?? []) as unknown as PreRow[])[0];
  if (!row) throw await erroJaDecidido(db, pre.id);
  return row;
}

function jaCadastrado(existente: MedicamentoDoCadastro, inativoParaVincular = false): ComprasRegraError {
  const data: ErroMedicamentoJaCadastrado = { code: inativoParaVincular ? CODIGO_MEDICAMENTO_INATIVO : CODIGO_MEDICAMENTO_JA_CADASTRADO, existente };
  return new ComprasRegraError(inativoParaVincular ? MENSAGEM_MEDICAMENTO_INATIVO_NO_CADASTRO : MENSAGEM_MEDICAMENTO_JA_NO_CADASTRO, 409, data);
}

/** Criar (sem vincular): reconhece a linha que uma tentativa anterior já criou; nome de OUTRO medicamento é 409. Devolve o id do Cadastro. */
async function medicamentoParaAprovar(pre: PreRow, nome: string, temperatura: string, por: string): Promise<string> {
  const chave = chaveCadastro(nome);
  const meuId = idDoMedicamentoDoPreCadastro(pre.id);
  const aposConflito = async (): Promise<string> => {
    const existente = await buscarMedicamentoPorNome(chave);
    if (existente?.id === meuId) return meuId;
    if (existente) throw jaCadastrado(existente);
    throw new ComprasRegraError(MENSAGEM_MEDICAMENTO_JA_NO_CADASTRO, 409);
  };

  const existente = await buscarMedicamentoPorNome(chave);
  if (existente) {
    if (existente.id === meuId) return meuId; // repetição: a linha que a tentativa anterior já criou
    throw jaCadastrado(existente);
  }

  try {
    await criarCadastro("medicamentos", { nome, temperatura }, por, { id: meuId });
  } catch (e) {
    if (!(e instanceof CadastroRegraError)) throw e;
    // 409: outra pessoa (ou outra tentativa da mesma aprovação) gravou o mesmo nome entre a leitura e a escrita; 422: temperatura inexistente ou inativa.
    if (e.statusCode === 409) return aposConflito();
    throw new ComprasRegraError(e.message, e.statusCode);
  }
  return meuId;
}

/** Vincular: o medicamento que já existe no Cadastro com esse nome, e só se estiver ATIVO. Não cria nada. */
async function medicamentoParaVincular(nome: string): Promise<string> {
  const existente = await buscarMedicamentoPorNome(chaveCadastro(nome));
  if (!existente) throw new ComprasRegraError(MENSAGEM_SEM_MEDICAMENTO_PARA_VINCULAR, 422);
  if (!existente.ativo) throw jaCadastrado(existente, true);
  return existente.id;
}

/**
 * Aprova o pré-cadastro `id` (ver a ordem dos passos no cabeçalho). `corpo`: `{ nome?, temperatura?, vincularExistente? }` já como veio da rota
 * (validado aqui, junto com o pedido). Lança ComprasRegraError: 404, 409 (`pre_cadastro_ja_decidido`, `medicamento_ja_cadastrado`,
 * `medicamento_inativo`) e 422.
 */
export async function aprovarPreCadastro(id: string, corpo: unknown, por: string): Promise<RespostaDecisaoPreCadastro> {
  const db = createSupabaseAdminClient();
  const pre = await lerPendente(db, id);

  const v = validarAprovacaoPreCadastro(corpo, { nome: pre.nome, temperatura: pre.temperatura ?? "" });
  if (!v.ok) throw new ComprasRegraError(v.erro, 422);
  const { nome, temperatura, vincular } = v.valor;

  const cadastroId = vincular ? await medicamentoParaVincular(nome) : await medicamentoParaAprovar(pre, nome, temperatura, por);

  const itens = await itensDoPreCadastro(db, pre.id);
  if (itens.length > 0) {
    const { error } = await db.from(ITENS).update({ medicamento_cadastro_id: cadastroId, updated_at: new Date().toISOString() }).eq("pre_cadastro_id", pre.id).select("id");
    if (error) throw erro("ligar os itens das compras ao medicamento", error);
  }
  const compras = comprasDosItens(itens);
  await subirVersaoDasCompras(compras);

  const decidido = await decidir(db, pre, "aprovado", por, cadastroId);
  return { preCadastro: await paraLista(db, decidido), itens: itens.length, compras: compras.length, medicamentoCriado: !vincular };
}

/** Rejeita o pré-cadastro `id` (ver a ordem dos passos no cabeçalho). Não apaga nada: os itens seguem com o texto digitado. */
export async function rejeitarPreCadastro(id: string, por: string): Promise<RespostaDecisaoPreCadastro> {
  const db = createSupabaseAdminClient();
  const pre = await lerPendente(db, id);

  const itens = await itensDoPreCadastro(db, pre.id);
  const compras = comprasDosItens(itens);
  await subirVersaoDasCompras(compras);

  const decidido = await decidir(db, pre, "rejeitado", por, null);
  return { preCadastro: await paraLista(db, decidido), itens: itens.length, compras: compras.length, medicamentoCriado: false };
}
