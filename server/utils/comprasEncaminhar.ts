import type {
  CodigoErroEncaminhar,
  Compra,
  CorpoEncaminhar,
  LinhaDaPrevia,
  OrdemCompra,
  OrdemEncaminhada,
  PreviaEncaminhar,
  RespostaEncaminhar,
} from "../../shared/types/compra";
import type { Dir } from "../../shared/types/dir";
import { checklistCompra, type ItemChecklist } from "../../shared/utils/compraChecklist";
import { montarLinhaDir, type LinhaDirDaOrdem } from "../../shared/utils/compraLinhaDir";
import { dataBrasiliaDe } from "../../shared/utils/dataBrasilia";
import { erroEnvioDir } from "../../shared/utils/dirEnvio";
import { normalizarNumeroPo } from "../../shared/utils/numeroPo";
import { erroContratoCambio, isValidDirPayload } from "./dirValidation";
import { colunasDeDir, montarDir, type DirRow } from "./dirMappers";
import { inserirLinhasDaCompra, listarLinhasDaDirPorPo } from "./dirStore";
import { erroDoConsultorEnviado } from "./consultoresCadastro";
import { ComprasRegraError, MENSAGEM_COMPRA_CANCELADA, conflitoDeVersao, obterCompra, subirVersaoDaCompra } from "./comprasStore";
import { createSupabaseAdminClient } from "./supabaseServerClient";
import { erro } from "./storeKit";

/**
 * O "Encaminhar para a DIR" da Compra: cada ORDEM vira UMA linha da DIR (o mapa é shared/utils/compraLinhaDir.ts; aqui só se valida, grava e
 * confere). Sem transação (o supabase-js não tem), então a sequência é a que torna cada passo seguro de repetir:
 *
 *   1. ler a compra; cancelada → 409;
 *   2. as ordens a encaminhar: as pedidas (`ordemIds`; ausente = todas) que AINDA não têm dir_id. Todas as pedidas já encaminhadas → 200 `jaEncaminhada`,
 *      sem escrever nada (e sem olhar a versão: o segundo clique, depois de a compra já ter mudado de versão, é inofensivo);
 *   3. a versão (`atualizadoEm`) tem de ser a atual → senão 409 com `data.atual`;
 *   4. validar (checklist, vendedor ativo, PO repetido na compra, PO já na DIR, temperatura mista confirmada);
 *   5. inserir as linhas da DIR em lote, `on conflict (id) do nothing` (id = `dir_` + id da ordem);
 *   6. gravar `dir_id` e `encaminhada_em` em cada ordem, só onde `dir_id is null` (quem perde a corrida não sobrescreve nem se diz dono);
 *   7. subir a versão da compra (updated_at), para uma aba aberta com a versão antiga levar 409 em vez de sobrescrever;
 *   8. reler e devolver.
 *
 * FALHA ENTRE 5 e 6: as linhas existem na DIR e a ordem ainda não aponta para elas. Repetir o Encaminhar refaz o 5 (ignorado) e o 6: nada duplica.
 * Uma linha da DIR cujo id é o desta ordem é RETOMADA, nunca conflito de PO. Limitação: a retomada aproveita a linha como está (se o PO da
 * ordem mudou entre as tentativas, a linha da DIR segue com o PO antigo; quem corrige é a DIR).
 */

export const MENSAGEM_VENDEDOR_INATIVO = "Escolha um consultor ativo para o vendedor desta compra";
export const MENSAGEM_CHECKLIST_COM_ERROS = "A compra ainda tem pendências para encaminhar.";
export const MENSAGEM_TEMPERATURA_MISTA = "Há ordem com mais de uma temperatura: confirme para encaminhar.";
export const MENSAGEM_ORDEM_DE_OUTRA_COMPRA = "Alguma ordem informada não pertence a esta compra.";

const ORDENS = "compra_ordens";
const COMPRAS = "compras";

export interface OpcoesEncaminhar {
  /** O instante do encaminhamento (só o teste escolhe). */
  agora?: Date;
}

function regra(mensagem: string, status: number, codigo: CodigoErroEncaminhar, extra: Record<string, unknown> = {}): ComprasRegraError {
  return new ComprasRegraError(mensagem, status, { code: codigo, ...extra });
}

/** As ordens pedidas (ausente = todas), na ordem de posição; pedir um id que não é desta compra é 422. */
function ordensEscolhidas(compra: Compra, ordemIds: readonly string[] | undefined): OrdemCompra[] {
  if (ordemIds === undefined) return compra.ordens;
  const dela = new Set(compra.ordens.map((o) => o.id));
  if (ordemIds.some((id) => !dela.has(id))) throw new ComprasRegraError(MENSAGEM_ORDEM_DE_OUTRA_COMPRA, 422);
  return compra.ordens.filter((o) => ordemIds.includes(o.id));
}

const jaFoiParaDir = (o: OrdemCompra): boolean => (o.dirId ?? "").trim() !== "";

interface Avaliacao {
  linhas: LinhaDaPrevia[];
  /** As linhas de TODAS as ordens (mapa), por id da ordem: o que a gravação usa. */
  mapa: Map<string, LinhaDirDaOrdem>;
  pendentes: OrdemCompra[];
  erros: ItemChecklist[];
  vendedorInativo: boolean;
  conflitosPo: string[];
  posRepetidosNaCompra: string[];
  mistas: OrdemCompra[];
}

/** A linha da DIR que o banco aceitaria? (as mesmas validações do POST /api/dir, menos as que dependem do banco). */
function linhaCabeNaDir(linha: LinhaDirDaOrdem): boolean {
  return isValidDirPayload(linha.dto) && erroEnvioDir(linha.dto) === null && erroContratoCambio(linha.dto) === null;
}

/** Tudo o que a prévia e o POST precisam saber (só LÊ: o banco da DIR só diz quais POs existem). */
async function avaliar(compra: Compra, pendentes: OrdemCompra[], agora: Date): Promise<Avaliacao> {
  const hoje = dataBrasiliaDe(agora);
  const instante = agora.toISOString();
  const mapa = new Map<string, LinhaDirDaOrdem>();
  const linhas: LinhaDaPrevia[] = compra.ordens.map((ordem) => {
    const linha = montarLinhaDir(compra, ordem, { hoje });
    mapa.set(ordem.id, linha);
    const row = { id: linha.id, ...colunasDeDir(linha.dto), created_at: instante, updated_at: instante } as unknown as DirRow;
    const dir: Dir = montarDir(row);
    return { ordemPosicao: ordem.posicao, ordemId: ordem.id, dir, temperaturaMista: linha.temperaturaMista, jaEncaminhada: jaFoiParaDir(ordem) };
  });

  // Os erros da checagem que valem para o que vai ser encaminhado: os da compra e os das ordens pendentes escolhidas.
  const posicoes = new Set(pendentes.map((o) => o.posicao));
  const erros: ItemChecklist[] = checklistCompra(compra).itens.filter((i) => i.nivel === "erro" && (i.ordemPosicao === undefined || posicoes.has(i.ordemPosicao)));
  for (const ordem of pendentes) {
    const linha = mapa.get(ordem.id)!;
    // Só vale a pena avisar que a linha não cabe quando a checagem da compra não acusou nada naquela ordem (um PO vazio, por exemplo, já é erro dela).
    if (!erros.some((e) => e.ordemPosicao === ordem.posicao) && !linhaCabeNaDir(linha)) {
      erros.push({ id: `ordem-${ordem.posicao}-linha-dir`, nivel: "erro", texto: `Os dados da ordem ${ordem.posicao} não cabem na DIR (texto grande demais ou valor inválido)`, ordemPosicao: ordem.posicao });
    }
  }

  const vendedor = compra.vendedor.trim();
  const vendedorInativo = vendedor !== "" && (await erroDoConsultorEnviado(vendedor, async () => null)) !== null;

  // PO repetido entre as ordens a encaminhar.
  const contagem = new Map<string, number>();
  for (const ordem of pendentes) {
    const po = normalizarNumeroPo(ordem.po);
    if (po !== null) contagem.set(po, (contagem.get(po) ?? 0) + 1);
  }
  const posRepetidosNaCompra = [...contagem].filter(([, n]) => n > 1).map(([po]) => po);

  // PO que já existe na DIR em OUTRA linha. A linha da própria ordem (id determinístico) é retomada, não conflito.
  const pos = [...new Set(pendentes.map((o) => normalizarNumeroPo(o.po)).filter((p): p is string => p !== null))];
  const naDir = await listarLinhasDaDirPorPo(pos);
  const conflitosPo = pos.filter((po) =>
    naDir.some((l) => l.po === po && !pendentes.some((o) => normalizarNumeroPo(o.po) === po && l.id === mapa.get(o.id)!.id)),
  );

  return { linhas, mapa, pendentes, erros, vendedorInativo, conflitosPo, posRepetidosNaCompra, mistas: pendentes.filter((o) => mapa.get(o.id)!.temperaturaMista) };
}

function cancelada(compra: Compra): ComprasRegraError {
  return regra(MENSAGEM_COMPRA_CANCELADA, 409, "compra_cancelada", { atual: compra });
}

/** A prévia (só leitura): o mapa das linhas e tudo o que impediria o Encaminhar. null = a compra não existe. */
export async function previaEncaminhar(id: string, opcoes: OpcoesEncaminhar = {}): Promise<PreviaEncaminhar | null> {
  const compra = await obterCompra(id);
  if (!compra) return null;
  if (compra.cancelada) throw cancelada(compra);
  const a = await avaliar(compra, compra.ordens.filter((o) => !jaFoiParaDir(o)), opcoes.agora ?? new Date());
  return { linhas: a.linhas, conflitosPo: a.conflitosPo, erros: a.erros, vendedorInativo: a.vendedorInativo, posRepetidosNaCompra: a.posRepetidosNaCompra };
}

/**
 * Encaminha as ordens para a DIR (ver o cabeçalho). `usuario` não é gravado na DIR (a linha nasce como a de "Novo PO"); fica na assinatura
 * para a rota e para uma futura auditoria. null = a compra não existe.
 */
export async function encaminharCompra(id: string, corpo: CorpoEncaminhar, _usuario: string, opcoes: OpcoesEncaminhar = {}): Promise<RespostaEncaminhar | null> {
  const agora = opcoes.agora ?? new Date();
  const compra = await obterCompra(id);
  if (!compra) return null;
  if (compra.cancelada) throw cancelada(compra);

  const escolhidas = ordensEscolhidas(compra, corpo.ordemIds);
  // Compra SEM ordens não está "encaminhada": cai na validação (a checagem acusa "nenhuma ordem").
  if (escolhidas.length > 0 && escolhidas.every(jaFoiParaDir)) return { compra, criadas: [], jaEncaminhada: true };
  const pendentes = escolhidas.filter((o) => !jaFoiParaDir(o));

  if (corpo.atualizadoEm !== compra.updatedAt) throw conflitoDeVersao(compra);

  const a = await avaliar(compra, pendentes, agora);
  if (a.erros.length > 0) throw regra(mensagemDoChecklist(a.erros), 422, "checklist_com_erros", { erros: a.erros });
  if (a.vendedorInativo) throw regra(MENSAGEM_VENDEDOR_INATIVO, 422, "vendedor_inativo");
  if (a.posRepetidosNaCompra.length > 0) {
    throw regra(`PO repetido nas ordens desta compra: ${a.posRepetidosNaCompra.join(", ")}`, 422, "po_repetido_na_compra", { pos: a.posRepetidosNaCompra });
  }
  if (a.conflitosPo.length > 0) throw regra(`PO já existe na DIR: ${a.conflitosPo.join(", ")}`, 409, "po_ja_na_dir", { pos: a.conflitosPo });
  if (a.mistas.length > 0 && corpo.confirmarTemperaturaMista !== true) {
    throw regra(MENSAGEM_TEMPERATURA_MISTA, 422, "temperatura_mista_nao_confirmada", { ordens: a.mistas.map((o) => o.posicao) });
  }

  const instante = agora.toISOString();
  await inserirLinhasDaCompra(
    pendentes.map((o) => ({ id: a.mapa.get(o.id)!.id, dto: a.mapa.get(o.id)!.dto })),
    instante,
  );

  // Cada ordem é gravada só onde dir_id ainda é nulo: quem perde a corrida não sobrescreve nada e não conta como quem encaminhou.
  const db = createSupabaseAdminClient();
  const criadas: OrdemEncaminhada[] = [];
  for (const ordem of pendentes) {
    const dirId = a.mapa.get(ordem.id)!.id;
    const { data, error } = await db.from(ORDENS).update({ dir_id: dirId, encaminhada_em: instante }).eq("id", ordem.id).is("dir_id", null).select("id");
    if (error) throw erro("gravar o encaminhamento da ordem", error);
    if (((data ?? []) as unknown[]).length > 0) criadas.push({ ordemId: ordem.id, dirId, po: normalizarNumeroPo(ordem.po) ?? "" });
  }

  if (criadas.length > 0) await subirVersaoDaCompra(id);

  const atualizada = await obterCompra(id);
  if (!atualizada) return null;
  return { compra: atualizada, criadas, jaEncaminhada: criadas.length === 0 };
}

function mensagemDoChecklist(erros: readonly ItemChecklist[]): string {
  return `${MENSAGEM_CHECKLIST_COM_ERROS} ${erros.map((e) => e.texto).join("; ")}`;
}
