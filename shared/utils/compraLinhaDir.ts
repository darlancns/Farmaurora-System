import {
  DESPACHANTE_COURIER_NA,
  OBSERVACAO_DIR_COMPRA_PARTICULAR,
  OBSERVACAO_DIR_RECORRENTE,
  OBSERVACAO_DIR_SEPARADOR,
} from "../constants/dir";
import { MODAL_COURIER_SIMPLES } from "../constants/processos";
import type { Compra, ItemCompra, OrdemCompra } from "../types/compra";
import type { NewDirDTO } from "../types/dir";
import { chaveCadastro } from "./cadastroNome";
import { textoMedicamentoDir } from "./compraDir";
import { normalizarNumeroPo } from "./numeroPo";

// O MAPA Compra → linha da DIR do "Encaminhar para a DIR": funções PURAS (sem rede, sem Nuxt, sem fuso da máquina). CADA ORDEM da compra vira UMA
// linha da DIR. Devolve o DTO que a DIR já conhece (NewDirDTO); quem grava passa o DTO pelo mapeador da DIR (colunasDeDir), então trim e "vazio
// vira NULL" são os da DIR e não divergem. Nada aqui lê a DIR nem os Cadastros.

/** O prefixo do id da linha da DIR: `dir_` + o id da ordem. Determinístico, para a gravação poder ser repetida sem duplicar. */
export const DIR_ID_PREFIXO = "dir_";

/** O status com que uma linha encaminhada nasce na DIR. */
export const STATUS_DIR_ENCAMINHADA = "on_going" as const;

/** O que o mapa lê da compra. */
export type CompraParaLinhaDir = Pick<Compra, "paciente" | "vendedor" | "responsavel" | "despachante" | "recorrente" | "compraParticular">;

/** O que o mapa lê de um medicamento da ordem. */
export type ItemParaLinhaDir = Pick<ItemCompra, "posicao" | "medicamento" | "apresentacao" | "temperatura">;

/** O que o mapa lê de uma ordem. */
export type OrdemParaLinhaDir = Pick<OrdemCompra, "id" | "po" | "fornecedor" | "envio" | "cia"> & { itens: readonly ItemParaLinhaDir[] };

/** O id da linha da DIR que a ordem gera. */
export function dirIdDaOrdem(ordemId: string): string {
  return `${DIR_ID_PREFIXO}${ordemId}`;
}

const porPosicao = <T extends { posicao: number }>(lista: readonly T[]): T[] => [...lista].sort((a, b) => a.posicao - b.posicao);

/**
 * Os valores de temperatura INTEIROS e distintos dos medicamentos da ordem, na ordem em que aparecem. Compara pela chave do Cadastro (sem
 * acento, caixa nem espaços repetidos) e mantém o texto da PRIMEIRA aparição (sem espaços nas pontas). Medicamento sem temperatura não conta.
 * Valor inteiro: "Ambiente / 2°C a 8°C no Brasil" é UM valor (nunca se parte em " / ").
 */
export function valoresDeTemperaturaDaOrdem(ordem: Pick<OrdemParaLinhaDir, "itens">): string[] {
  const vistos = new Set<string>();
  const valores: string[] = [];
  for (const item of porPosicao(ordem.itens)) {
    const texto = (item.temperatura ?? "").trim();
    if (texto === "") continue;
    const chave = chaveCadastro(texto);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    valores.push(texto);
  }
  return valores;
}

/** A temperatura da linha da DIR: os valores distintos da ordem unidos por " / " (um valor só = ele mesmo; nenhum = ""). */
export function temperaturaDaOrdem(ordem: Pick<OrdemParaLinhaDir, "itens">): string {
  return valoresDeTemperaturaDaOrdem(ordem).join(" / ");
}

/** A ordem mistura temperaturas (mais de um valor distinto)? É o que o Encaminhar pede para o usuário confirmar. */
export function temperaturaMistaDaOrdem(ordem: Pick<OrdemParaLinhaDir, "itens">): boolean {
  return valoresDeTemperaturaDaOrdem(ordem).length > 1;
}

/**
 * A observação da linha: "RECORRENTE" se a compra é recorrente, "COMPRA PARTICULAR" se é particular, as duas juntas ("RECORRENTE / COMPRA
 * PARTICULAR") e "" quando nenhuma. (O texto composto não é um item da lista da DIR: o formulário o abre como "Outro".)
 */
export function observacaoDaCompra(compra: Pick<CompraParaLinhaDir, "recorrente" | "compraParticular">): string {
  const partes: string[] = [];
  if (compra.recorrente) partes.push(OBSERVACAO_DIR_RECORRENTE);
  if (compra.compraParticular) partes.push(OBSERVACAO_DIR_COMPRA_PARTICULAR);
  return partes.join(OBSERVACAO_DIR_SEPARADOR);
}

/** O despachante DA ORDEM: Courier Simples não tem despachante (vai DESPACHANTE_COURIER_NA); as outras levam o da compra. */
export function despachanteDaOrdem(compra: Pick<CompraParaLinhaDir, "despachante">, ordem: Pick<OrdemParaLinhaDir, "envio">): string {
  return ordem.envio === MODAL_COURIER_SIMPLES ? DESPACHANTE_COURIER_NA : compra.despachante;
}

/** O nome do paciente na DIR: espaços repetidos colapsados e tudo em MAIÚSCULAS (pt-BR). */
export function pacienteParaDir(paciente: string): string {
  return paciente.replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-BR");
}

export interface LinhaDirDaOrdem {
  /** O id da linha da DIR (`dir_` + id da ordem). */
  id: string;
  /** O DTO da DIR (todas as chaves); passa por `colunasDeDir` para virar a linha do banco. */
  dto: NewDirDTO;
  /** A ordem tem mais de um valor de temperatura: a gravação exige a confirmação do usuário. */
  temperaturaMista: boolean;
}

/**
 * A linha da DIR de UMA ordem. `hoje` é o dia de BRASÍLIA ("AAAA-MM-DD") do encaminhamento (quem chama calcula com dataBrasilia; aqui nada lê
 * o relógio nem o fuso). Todo o resto, no padrão de uma linha nova da DIR (false / vazio): receita, AWB, contrato de câmbio, banco, as outras
 * três datas, a conferência, a exigência, a operação encerrada, o fechamento restante e os 8 itens do checklist.
 */
export function montarLinhaDir(compra: CompraParaLinhaDir, ordem: OrdemParaLinhaDir, opcoes: { hoje: string }): LinhaDirDaOrdem {
  const dto: NewDirDTO = {
    po: normalizarNumeroPo(ordem.po) ?? "",
    paciente: pacienteParaDir(compra.paciente),
    vendedor: compra.vendedor,
    responsavel: compra.responsavel,
    medicamento: textoMedicamentoDir({ itens: porPosicao(ordem.itens) }),
    fornecedor: ordem.fornecedor,
    envio: ordem.envio,
    companhiaAerea: ordem.cia,
    awb: "",
    despachante: despachanteDaOrdem(compra, ordem),
    temperatura: temperaturaDaOrdem(ordem),
    observacao: observacaoDaCompra(compra),
    receita: "",
    contratoCambio: "",
    banco: "",
    status: STATUS_DIR_ENCAMINHADA,
    dataEmissao: opcoes.hoje,
    dataCobrancaFornecedores: "",
    dataEntrega: "",
    dataPagamento: "",
    conferido: false,
    exigencia: false,
    operacaoEncerrada: false,
    fechamentoRestante: false,
    dactes: false,
    dsiDirDuimp: false,
    logger: false,
    fechamento: false,
    numerario: false,
    protocoloAssinado: false,
    swift: false,
    termometro: false,
  };
  return { id: dirIdDaOrdem(ordem.id), dto, temperaturaMista: temperaturaMistaDaOrdem(ordem) };
}
