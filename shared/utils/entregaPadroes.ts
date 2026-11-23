import { TRANSPORTADORAS_PAGAMENTO } from "../constants/pagamentos";
import {
  MODAL_COURIER_FORMAL,
  MODAL_COURIER_SIMPLES,
  dirsDoModal,
  precisaDespachanteTransportadora,
} from "../constants/processos";
import type { TransportadoraPagamento } from "../types/Pagamento";
import type { DirProtocoloProcesso, PagamentoTransportadoraProcesso, Processo } from "../types/processo";

// Regras puras (sem Vue, sem rede) dos controles do status Entregue: Pagamento da transportadora (AJC/Doctor) e DIR e
// Protocolo (Courier). Usadas pelo servidor (padrões ao entregar, validação) e, nas próximas etapas, pelo formulário, card
// e painel. Testadas em tests/unit/entregaPadroes.spec.ts.

export type ControleDir = "simples" | "formal";

// Padrões ao virar Entregue (campo vazio).
export const PAGAMENTO_TRANSPORTADORA_PADRAO: PagamentoTransportadoraProcesso = "pendente";
export const DIR_PADRAO_SIMPLES: DirProtocoloProcesso = "pegar_dir_protocolo";
export const DIR_PADRAO_FORMAL: DirProtocoloProcesso = "pegar_dir";

// Sem acento, minúsculas, sem espaços nas pontas.
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Qual transportadora do Pagamento é esta? ("AJC" | "Doctor") ou null. O nome é texto livre no Follow-Up: normaliza (trim,
 * minúsculas, sem acento) e casa PALAVRA INTEIRA, então "AJC", "ajc ", "Ájc" e "Ajc Transportes" valem AJC e "Doctor
 * Transportes" vale Doctor; "ajcx" e "doctors" não. Nome que cita as duas (ambíguo) ou nenhuma, vazio ou ausente: null.
 */
export function transportadoraDoPagamento(nome: string | null | undefined): TransportadoraPagamento | null {
  if (typeof nome !== "string") return null;
  const palavras = normalizar(nome)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (palavras.length === 0) return null;
  const achadas = TRANSPORTADORAS_PAGAMENTO.filter((t) => palavras.includes(normalizar(t)));
  return achadas.length === 1 ? achadas[0]! : null;
}

/** Qual DIR o envio usa? Courier Simples ou Courier Formal (comparação EXATA); qualquer outro envio (inclusive o legado "Courier"): null. */
export function controleDirDoModal(modal: string | null | undefined): ControleDir | null {
  if (modal === MODAL_COURIER_SIMPLES) return "simples";
  if (modal === MODAL_COURIER_FORMAL) return "formal";
  return null;
}

/** O valor do DIR vale para o envio? (Formal rejeita pegar_dir_protocolo e dir_protocolo; Simples rejeita pegar_dir; sem Courier, nenhum vale.) */
export function dirValidoParaModal(modal: string | null | undefined, valor: unknown): boolean {
  return typeof valor === "string" && (dirsDoModal(modal) as readonly string[]).includes(valor);
}

/**
 * Valor do DIR ao TROCAR o envio entre Courier Simples e Courier Formal (para o formulário usar ao trocar o select). Mantém
 * "pendente" e "concluído": pegar_dir_protocolo <-> pegar_dir; dir_protocolo -> dir_no_drive; dir_no_drive igual nos dois. Valor que já
 * vale para o novo envio fica como está. Vazio continua vazio. Novo envio sem DIR (Air Cargo, vazio, "Courier"): o valor é
 * mantido (o dado só fica oculto, nada se apaga).
 */
export function mapearDirParaModal(
  valor: DirProtocoloProcesso | null | undefined,
  novoModal: string | null | undefined,
): DirProtocoloProcesso | null {
  if (!valor) return null;
  const controle = controleDirDoModal(novoModal);
  if (controle === null || dirValidoParaModal(novoModal, valor)) return valor;
  if (controle === "formal") return valor === "pegar_dir_protocolo" ? "pegar_dir" : "dir_no_drive";
  return valor === "pegar_dir" ? "pegar_dir_protocolo" : valor;
}

export interface ControlesAplicaveis {
  /** A transportadora do pagamento (AJC/Doctor), ou null se o controle não se aplica. */
  pagamentoTransportadora: TransportadoraPagamento | null;
  /** Qual DIR (Courier Simples/Formal), ou null se o controle não se aplica. */
  dir: ControleDir | null;
}

/**
 * Quais controles se aplicam a um processo (só olham o envio e a transportadora; o status é problema de quem chama).
 * Pagamento: o envio MOSTRA a transportadora (precisaDespachanteTransportadora: Courier Simples a esconde, mesmo com o nome
 * gravado) E o nome é AJC ou Doctor. DIR: o envio é Courier Simples ou Formal. Um processo pode ter os dois (Courier Formal com AJC).
 */
export function controlesAplicaveis(
  processo: Pick<Processo, "modalEnvio" | "transportadoraNacional">,
): ControlesAplicaveis {
  return {
    pagamentoTransportadora: precisaDespachanteTransportadora(processo.modalEnvio)
      ? transportadoraDoPagamento(processo.transportadoraNacional?.nome)
      : null,
    dir: controleDirDoModal(processo.modalEnvio),
  };
}

export interface PadroesAoEntregar {
  pagamentoTransportadora?: PagamentoTransportadoraProcesso;
  dirProtocolo?: DirProtocoloProcesso;
}

/**
 * O que o servidor preenche quando o processo vira Entregue: SÓ o que se aplica e está VAZIO (valor já gravado, mesmo de antes,
 * nunca é trocado). Pagamento = "pendente" (AJC/Doctor com transportadora visível); DIR = "pegar_dir_protocolo" no Courier
 * Simples e "pegar_dir" no Courier Formal. Devolve só as chaves a gravar ({} quando nada a fazer).
 */
export function padroesAoEntregar(
  processo: Pick<Processo, "modalEnvio" | "transportadoraNacional" | "pagamentoTransportadora" | "dirProtocolo">,
): PadroesAoEntregar {
  const aplicaveis = controlesAplicaveis(processo);
  const padroes: PadroesAoEntregar = {};
  if (aplicaveis.pagamentoTransportadora && !processo.pagamentoTransportadora) {
    padroes.pagamentoTransportadora = PAGAMENTO_TRANSPORTADORA_PADRAO;
  }
  if (aplicaveis.dir && !processo.dirProtocolo) {
    padroes.dirProtocolo = aplicaveis.dir === "simples" ? DIR_PADRAO_SIMPLES : DIR_PADRAO_FORMAL;
  }
  return padroes;
}
