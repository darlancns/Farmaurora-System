import type { Processo } from "../types/processo";
import { formatarDataBR, hojeBrasilia, parseDataISO } from "./dataBrasilia";
import { primeiroDiaUtilApos } from "./diaUtil";
import { podeVerAlertaMandado } from "./mandadoPermissao";
import { pastaLimpa } from "./rotuloPasta";
import type { Role } from "./rbac";

// Aviso "Prazo limite pra Manifestação da ANVISA" do sino: ALERTA DERIVADO do estado do processo (como "Chegou?" e o
// alerta de Mandado) — nada é gravado além da ciência. Regra única para a tela (sino) e o servidor (ciência).
//
// Quando é devido: há prazo_anvisa (AAAA-MM-DD), o status NÃO é Entregue (Liberado continua avisando) e o dia de hoje
// em Brasília (nunca o fuso do navegador) é IGUAL OU POSTERIOR ao primeiro dia útil ESTRITAMENTE depois do prazo
// (diaUtil.ts), a partir das 00h. Se ninguém abrir o sistema nesse dia, aparece na primeira abertura depois.
// Some quando: a ciência registrada (alerta_anvisa_ciente_prazo) é IGUAL ao prazo atual, o prazo é apagado ou o status
// vira Entregue. Prazo ALTERADO depois da ciência: a ciência guardada deixa de bater e o aviso volta para o prazo novo.
//
// Quem vê e quem dá ciência: a MESMA regra do alerta de Mandado (mandadoPermissao.ts) — administrador vê todos;
// operacional só os seus (primeiro nome = responsavel_operacional); consultor, sócio e sem login, nunca.

export const TITULO_AVISO_PRAZO_ANVISA = "Prazo limite pra Manifestação da ANVISA";

/** Só o necessário do processo para decidir. */
export type ProcessoParaAvisoAnvisa = Pick<Processo, "status" | "alertaAnvisaCientePrazo"> & {
  datas: Pick<Processo["datas"], "prazoAnvisa">;
};

export interface AvisoPrazoAnvisaDevido {
  devido: boolean;
  /** Prazo atual ("AAAA-MM-DD") ou null (sem prazo ou valor que não é data). */
  prazo: string | null;
  /** Dia a partir do qual o aviso vale (primeiro dia útil depois do prazo) ou null. */
  diaAviso: string | null;
}

/** O processo deve mostrar o aviso agora? `agora` é injetável (testes). Conta em datas civis de Brasília. */
export function avisoPrazoAnvisaDevido(processo: ProcessoParaAvisoAnvisa, agora: Date = new Date()): AvisoPrazoAnvisaDevido {
  // `datas?.`: tolera um processo incompleto vindo da rede (os outros alertas derivados também não quebram com ele).
  const texto = processo.datas?.prazoAnvisa?.trim() ?? "";
  const prazo = parseDataISO(texto) ? texto : null;
  const diaAviso = prazo ? primeiroDiaUtilApos(prazo) : null;
  const naoDevido: AvisoPrazoAnvisaDevido = { devido: false, prazo, diaAviso };

  if (!prazo || !diaAviso) return naoDevido;
  if (processo.status === "entregue") return naoDevido;
  if (processo.alertaAnvisaCientePrazo === prazo) return naoDevido; // ciência dada PARA ESTE prazo
  if (hojeBrasilia(agora) < diaAviso) return naoDevido;
  return { devido: true, prazo, diaAviso };
}

export interface UsuarioAvisoAnvisa {
  role: Role | null | undefined;
  nome?: string | null;
}

/** Quem enxerga o aviso deste processo (mesma regra do alerta de Mandado). */
export function podeVerAvisoPrazoAnvisa(usuario: UsuarioAvisoAnvisa, responsavelOperacional: string | undefined | null): boolean {
  return podeVerAlertaMandado(usuario, responsavelOperacional);
}

/** Dar ciência exige exatamente a permissão de ver (tela e servidor usam esta função). */
export const podeDarCienciaPrazoAnvisa = podeVerAvisoPrazoAnvisa;

export interface TextoAvisoPrazoAnvisa {
  titulo: string;
  /** "{paciente} · {pasta}"; sem pasta, só "{paciente}" (nada de "·" sobrando). */
  linhaProcesso: string;
  /** "Prazo: DD/MM/AAAA". */
  linhaPrazo: string;
}

export function montarTextoAvisoPrazoAnvisa(entrada: { paciente: string; pasta: string; prazo: string }): TextoAvisoPrazoAnvisa {
  const pasta = pastaLimpa(entrada.pasta);
  return {
    titulo: TITULO_AVISO_PRAZO_ANVISA,
    linhaProcesso: pasta ? `${entrada.paciente} · ${pasta}` : entrada.paciente,
    linhaPrazo: `Prazo: ${formatarDataBR(entrada.prazo)}`,
  };
}
