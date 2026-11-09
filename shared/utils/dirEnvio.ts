import {
  CIAS_AEREAS_TODAS,
  MODAIS_ENVIO,
  MODAL_AIR_CARGO,
  MODAL_COURIER_FORMAL as MODAL_FORMAL,
  MODAL_COURIER_SIMPLES as MODAL_SIMPLES,
  ciaAereaValidaParaModal,
} from "../constants/processos.ts";

// Envio da DIR = o mesmo "Envio" (modal) do Follow-Up: as opções vêm de MODAIS_ENVIO (shared/constants/processos.ts, a
// fonte única; nenhuma lista própria da DIR). Regras PURAS, sem Nuxt nem rede: o servidor, o formulário e o parser da
// carga (shared/utils/dirParser.ts) usam as mesmas.

/** Mensagem do 400 (servidor) e do aviso do formulário quando o Envio não é uma das opções. */
export const ENVIO_DIR_ERRO = `Envio inválido: escolha ${MODAIS_ENVIO.slice(0, -1).join(", ")} ou ${MODAIS_ENVIO[MODAIS_ENVIO.length - 1]}.`;

/** Vazio ou exatamente uma das opções do Follow-Up (sensível a caixa, como a cia). */
export function envioDirValido(valor: string | null | undefined): boolean {
  const texto = (valor ?? "").trim();
  return texto === "" || (MODAIS_ENVIO as readonly string[]).includes(texto);
}

/**
 * Regra de gravação: o Envio enviado precisa ser vazio ou uma das opções. Tolerância a dado antigo: um valor IGUAL ao já
 * gravado (ex.: "FEDEX FORMAL", de antes da regra) não impede salvar os outros campos — por isso o PATCH informa o valor
 * `atual`. Corpo sem a chave `envio` não é conferido. Devolve a mensagem de erro (400) ou null.
 */
export function erroEnvioDir(corpo: { envio?: string }, atual?: { envio: string | null }): string | null {
  if (!("envio" in corpo) || corpo.envio === undefined) return null;
  if (envioDirValido(corpo.envio)) return null;
  if (atual && corpo.envio.trim() === (atual.envio ?? "").trim()) return null;
  return ENVIO_DIR_ERRO;
}

// ── Conversão do Envio da planilha antiga ──────────────────────────────────────────────────────────────────

// Chave: texto da planilha sem acento, em minúsculas e com espaços colapsados.
const ENVIO_PLANILHA: Readonly<Record<string, string>> = {
  "air cargo": MODAL_AIR_CARGO,
  "fedex formal": MODAL_FORMAL,
  "dhl formal": MODAL_FORMAL,
  "fedex courier": MODAL_SIMPLES,
  courier: MODAL_SIMPLES,
};

function chaveEnvio(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type SituacaoEnvioPlanilha = "vazio" | "convertido" | "igual" | "desconhecido";

/**
 * Converte o Envio da planilha para as opções do Follow-Up:
 *   Air Cargo → Air Cargo · "FEDEX FORMAL" e "DHL FORMAL" → Courier Formal · "FEDEX COURIER" e "Courier" → Courier Simples
 *   vazio → vazio. Valor que já é uma das opções (ex.: "Courier Formal") fica como está ("igual").
 * Qualquer outro texto é "desconhecido": volta LITERAL (nada se perde) e o parser avisa.
 * A cia NÃO é lida nem alterada aqui: ela continua vindo do AWB (separarCiaAwb).
 */
export function converterEnvioDaPlanilha(valor: string): { envio: string; situacao: SituacaoEnvioPlanilha } {
  const texto = valor.trim();
  if (texto === "") return { envio: "", situacao: "vazio" };
  const modal = ENVIO_PLANILHA[chaveEnvio(texto)];
  if (modal) return { envio: modal, situacao: modal === texto ? "igual" : "convertido" };
  const jaEhOpcao = (MODAIS_ENVIO as readonly string[]).find((m) => chaveEnvio(m) === chaveEnvio(texto));
  if (jaEhOpcao) return { envio: jaEhOpcao, situacao: jaEhOpcao === texto ? "igual" : "convertido" };
  return { envio: texto, situacao: "desconhecido" };
}

/**
 * A cia e o envio se contradizem? Só quando o envio é uma das opções e a cia é uma das companhias CONHECIDAS que não
 * pertence a esse envio (ex.: Courier Formal com Lufthansa; Air Cargo com FedEx ou DHL). Cia fora de qualquer lista
 * (ou vazia) não é contradição.
 */
export function ciaContradizEnvio(envio: string, cia: string): boolean {
  const modal = envio.trim();
  const companhia = cia.trim();
  if (modal === "" || companhia === "") return false;
  if (!(MODAIS_ENVIO as readonly string[]).includes(modal)) return false;
  if (!CIAS_AEREAS_TODAS.includes(companhia)) return false;
  return !ciaAereaValidaParaModal(modal, companhia);
}
