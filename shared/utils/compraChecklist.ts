import { DIR_MEDICAMENTO_MAX, REGRAS_CHECKLIST as R, TEXTOS_CHECKLIST as T, type NivelChecklist } from "../constants/compraChecklist";
import { TEXTOS_RESUMO } from "../constants/compraResumo";
import { MODAL_COURIER_SIMPLES } from "../constants/processos";
import type { StatusDaCompra } from "../constants/compra";
import type { ItemCompra, OrdemCompra } from "../types/compra";
import { textoMedicamentoDir } from "./compraDir";
import { dataBrasiliaDe, formatarDiaMes } from "./dataBrasilia";
import { NUMERO_PO_REGEX, normalizarNumeroPo } from "./numeroPo";

// A CHECAGEM ÚNICA da compra: uma função pura que diz o que falta para a compra poder ser encaminhada (o "N pendências" da lista, o
// painel de checagem do formulário e o botão Encaminhar leem a MESMA função). Não consulta nada: tudo o que ela precisa vem em
// `compra` e em `opcoes`. Os textos e os ids das regras ficam em shared/constants/compraChecklist.ts.
//
// Cada regra bloqueante vira UM item: "ok" quando atendida, "erro" quando não. Os "avisos" não bloqueiam e só aparecem quando valem.
// `pronta` = nenhum item "erro". NÃO se repete aqui o que o servidor já garante ao salvar (vendedor, despachante, fornecedor e cia
// são itens ATIVOS do Cadastro).

export interface ItemChecklist {
  /** A regra: "paciente", "ordem-2-po", "ordem-2-med-1-quantidade"... (ver REGRAS_CHECKLIST). */
  id: string;
  nivel: NivelChecklist;
  texto: string;
  /** A posição (1..N) da ordem, quando a regra é de uma ordem ou de um medicamento dela. */
  ordemPosicao?: number;
}

export interface ResultadoChecklist {
  itens: ItemChecklist[];
  pronta: boolean;
}

export interface OpcoesChecklist {
  /** POs que já existem na DIR (quem chama consulta; a função não consulta nada). Sem isto, a regra "PO na DIR" não é avaliada. */
  poJaNaDir?: readonly string[];
}

/** O que a checagem lê de um medicamento. */
export type ItemParaChecklist = Pick<ItemCompra, "posicao" | "medicamento" | "medicamentoCadastroId" | "preCadastroId" | "apresentacao" | "quantidade" | "temperatura">;

/** O que a checagem lê de uma ordem. */
export type OrdemParaChecklist = Pick<OrdemCompra, "posicao" | "fornecedor" | "envio" | "po" | "dirId" | "encaminhadaEm"> & { itens: readonly ItemParaChecklist[] };

/** O que a checagem lê de uma compra (a `Compra` inteira serve, e a lista do mês monta só isto, sem contatos nem valores). */
export interface CompraParaChecklist {
  cancelada: boolean;
  paciente: string;
  processoNumero: string;
  compraParticular: boolean;
  medico: string;
  vendedor: string;
  responsavel: string;
  despachante: string;
  pagamentoMomento: string | null;
  localAplicacao: string;
  entrega: string;
  documentos: boolean | null;
  ordens: readonly OrdemParaChecklist[];
}

const preenchido = (v: string | null | undefined): boolean => (v ?? "").trim() !== "";
const porPosicao = <T extends { posicao: number }>(lista: readonly T[]): T[] => [...lista].sort((a, b) => a.posicao - b.posicao);
const foiParaDir = (o: Pick<OrdemCompra, "dirId">): boolean => preenchido(o.dirId);

/** "dd/mm" do dia (de BRASÍLIA) em que a ordem foi encaminhada; "" se não há data válida. */
export function diaDoEncaminhamento(encaminhadaEm: string | null): string {
  if (!preenchido(encaminhadaEm)) return "";
  const t = new Date(encaminhadaEm as string).getTime();
  return Number.isNaN(t) ? "" : formatarDiaMes(dataBrasiliaDe(t));
}

export function checklistCompra(compra: CompraParaChecklist, opcoes: OpcoesChecklist = {}): ResultadoChecklist {
  const itens: ItemChecklist[] = [];
  const exigido = (id: string, atendida: boolean, falta: string, ok: string, ordemPosicao?: number): void => {
    itens.push({ id, nivel: atendida ? "ok" : "erro", texto: atendida ? ok : falta, ...(ordemPosicao === undefined ? {} : { ordemPosicao }) });
  };
  const aviso = (id: string, texto: string, ordemPosicao?: number): void => {
    itens.push({ id, nivel: "aviso", texto, ...(ordemPosicao === undefined ? {} : { ordemPosicao }) });
  };

  // ── a compra ──
  exigido(R.paciente, preenchido(compra.paciente), T.paciente.falta, T.paciente.ok);
  exigido(
    R.processo,
    compra.compraParticular || preenchido(compra.processoNumero),
    T.processo.falta,
    compra.compraParticular ? T.processo.okParticular : T.processo.ok,
  );
  exigido(R.medico, preenchido(compra.medico), T.medico.falta, T.medico.ok);
  exigido(R.vendedor, preenchido(compra.vendedor), T.vendedor.falta, T.vendedor.ok);
  exigido(R.responsavel, preenchido(compra.responsavel), T.responsavel.falta, T.responsavel.ok);

  const ordens = porPosicao(compra.ordens);
  exigido(R.ordens, ordens.length >= 1, T.ordens.falta, T.ordens.ok(ordens.length));

  const poNaDir = opcoes.poJaNaDir === undefined ? null : new Set(opcoes.poJaNaDir.map((p) => normalizarNumeroPo(p) ?? "").filter((p) => p !== ""));

  // ── cada ordem ──
  for (const ordem of ordens) {
    const n = ordem.posicao;
    exigido(`ordem-${n}-${R.fornecedor}`, preenchido(ordem.fornecedor), T.fornecedor.falta(n), T.fornecedor.ok(n), n);
    exigido(`ordem-${n}-${R.envio}`, preenchido(ordem.envio), T.envio.falta(n), T.envio.ok(n), n);

    const po = normalizarNumeroPo(ordem.po);
    if (po === null) exigido(`ordem-${n}-${R.po}`, false, T.po.falta(n), T.po.ok(n), n);
    else exigido(`ordem-${n}-${R.po}`, NUMERO_PO_REGEX.test(po), T.po.invalido(n), T.po.ok(n), n);

    if (foiParaDir(ordem)) {
      // Ordem que ESTA compra já encaminhou: o PO estar na DIR é o esperado, nunca erro.
      itens.push({ id: `ordem-${n}-${R.encaminhada}`, nivel: "ok", texto: T.encaminhada.ok(n, diaDoEncaminhamento(ordem.encaminhadaEm)), ordemPosicao: n });
    } else if (poNaDir !== null && po !== null && NUMERO_PO_REGEX.test(po)) {
      const jaExiste = poNaDir.has(po);
      itens.push({ id: `ordem-${n}-${R.poNaDir}`, nivel: jaExiste ? "erro" : "ok", texto: jaExiste ? T.poNaDir.erro(po) : T.poNaDir.ok(po), ordemPosicao: n });
    }

    const meds = porPosicao(ordem.itens);
    exigido(`ordem-${n}-${R.medicamentos}`, meds.length >= 1, T.medicamentos.falta(n), T.medicamentos.ok(n), n);

    for (const med of meds) {
      const m = med.posicao;
      exigido(`ordem-${n}-med-${m}-${R.medNome}`, preenchido(med.medicamento), T.medNome.falta(n, m), T.medNome.ok(n, m), n);
      exigido(`ordem-${n}-med-${m}-${R.medTemperatura}`, preenchido(med.temperatura), T.medTemperatura.falta(n, m), T.medTemperatura.ok(n, m), n);
      exigido(`ordem-${n}-med-${m}-${R.medQuantidade}`, preenchido(med.quantidade), T.medQuantidade.falta(n, m), T.medQuantidade.ok(n, m), n);
    }

    const tamanho = textoMedicamentoDir({ itens: meds }).length;
    exigido(`ordem-${n}-${R.textoDir}`, tamanho <= DIR_MEDICAMENTO_MAX, T.textoDir.erro(n, tamanho, DIR_MEDICAMENTO_MAX), T.textoDir.ok(n, tamanho, DIR_MEDICAMENTO_MAX), n);
  }

  // ── despachante: exigido, EXCETO quando TODAS as ordens são Courier Simples ──
  const todasCourierSimples = ordens.length > 0 && ordens.every((o) => o.envio === MODAL_COURIER_SIMPLES);
  if (todasCourierSimples) {
    itens.push({ id: R.despachante, nivel: "ok", texto: T.despachante.dispensado });
  } else {
    exigido(R.despachante, preenchido(compra.despachante), T.despachante.falta, T.despachante.ok);
  }

  // ── pagamento: o momento precisa estar escolhido (o termo posterior não tem regra: "n/a" é válido) ──
  exigido(R.pagamentoMomento, compra.pagamentoMomento !== null, T.pagamentoMomento.falta, T.pagamentoMomento.ok);

  // ── avisos (não bloqueiam) ──
  for (const ordem of ordens) {
    for (const med of porPosicao(ordem.itens)) {
      const noPreCadastro = preenchido(med.preCadastroId) || !preenchido(med.medicamentoCadastroId);
      if (noPreCadastro && preenchido(med.medicamento)) {
        aviso(`ordem-${ordem.posicao}-med-${med.posicao}-${R.preCadastro}`, T.preCadastro(med.medicamento.trim()), ordem.posicao);
      }
    }
  }
  if (!preenchido(compra.localAplicacao)) aviso(R.localAplicacao, T.localAplicacao(TEXTOS_RESUMO.pendenteMarca));
  if (!preenchido(compra.entrega)) aviso(R.entrega, T.entrega(TEXTOS_RESUMO.pendenteMarca));
  if (compra.documentos !== true) aviso(R.documentos, T.documentos);

  return { itens, pronta: !itens.some((i) => i.nivel === "erro") };
}

/** Quantas pendências (itens "erro") a compra tem: o "N pendências" da lista. */
export function contarPendencias(compra: CompraParaChecklist, opcoes: OpcoesChecklist = {}): number {
  return checklistCompra(compra, opcoes).itens.filter((i) => i.nivel === "erro").length;
}

/**
 * O estado da compra: cancelada; encaminhada (TODAS as ordens têm dir_id; uma compra sem ordens nunca é encaminhada); parcial (só
 * algumas); senão pronta (a checagem não tem erro) ou rascunho.
 */
export function statusDaCompra(compra: CompraParaChecklist, opcoes: OpcoesChecklist = {}): StatusDaCompra {
  if (compra.cancelada) return "cancelada";
  const total = compra.ordens.length;
  const encaminhadas = compra.ordens.filter(foiParaDir).length;
  if (total > 0 && encaminhadas === total) return "encaminhada";
  if (encaminhadas > 0) return "parcial";
  return checklistCompra(compra, opcoes).pronta ? "pronta" : "rascunho";
}
