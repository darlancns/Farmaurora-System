import type { Processo } from "../types/processo";
import {
  diferencaEmDias,
  formatarDataCurta,
  formatarDiaMes,
  horaBrasilia,
  hojeBrasilia,
  parseDataBR,
} from "./dataBrasilia";
import { primeiroNomeNormalizado } from "./mandadoPermissao";
import type { Role } from "./rbac";

// Aviso "chegou?" do sino (Follow-Up, item 9): ALERTA DERIVADO do estado do processo — não há linha de
// notificação guardada. Some sozinho quando o status ou a data prevista mudam. Regra única para a tela (sino)
// e para o servidor (POST /api/processos/:id/chegada), para nunca divergirem.
//
// Quando é devido: status "em_transito" E data_chegada_brasil de hoje ou já passada E, se for HOJE, o horário de
// Brasília (America/Sao_Paulo — nunca o fuso do navegador) já é 13:00 ou mais. Data vencida aparece na hora.

/** A partir desta hora (Brasília) o aviso de uma chegada prevista para HOJE passa a valer. */
export const HORA_CORTE_AVISO_CHEGADA = 13;

// Primeira data NO INÍCIO do texto livre (DD/MM ou DD/MM/AAAA); o resto é ignorado ("10/11 (previsto)" -> 10/11). O
// lookahead recusa continuações como "04/11/26" ou "04/112": melhor não avisar do que assumir uma data errada.
const PRIMEIRA_DATA_RE = /^\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?![\d/])/;

/**
 * Data prevista de chegada ("YYYY-MM-DD") a partir do texto de datas.dataChegadaBrasil, ou null (vazio, texto sem
 * data no início, data inexistente como 31/02).
 * - DD/MM/AAAA: o ano dado.
 * - DD/MM (sem ano): a ocorrência MAIS PRÓXIMA de hoje (Brasília) entre ano-1, ano e ano+1 — evita disparar errado
 *   na virada do ano (hoje 30/12 e "02/01" é 02/01 do ano que vem, ainda futura; hoje 02/01 e "30/12" é a de
 *   dezembro passado, já vencida). Empate de distância fica com a mais antiga.
 */
export function interpretarDataChegadaPrevista(texto: string | undefined | null, agora: Date = new Date()): string | null {
  if (!texto) return null;
  const m = PRIMEIRA_DATA_RE.exec(texto);
  if (!m) return null;
  const [, dia, mes, ano] = m;
  if (ano) return parseDataBR(`${dia}/${mes}/${ano}`, agora);

  const hojeISO = hojeBrasilia(agora);
  const anoAtual = Number(hojeISO.slice(0, 4));
  let melhor: string | null = null;
  let menorDistancia = Number.POSITIVE_INFINITY;
  for (const candidatoAno of [anoAtual - 1, anoAtual, anoAtual + 1]) {
    const iso = parseDataBR(`${dia}/${mes}/${candidatoAno}`, agora);
    if (!iso) continue; // 29/02 em ano não bissexto
    const distancia = Math.abs(diferencaEmDias(iso, hojeISO));
    if (distancia < menorDistancia) {
      melhor = iso;
      menorDistancia = distancia;
    }
  }
  return melhor;
}

export interface AvisoChegadaDevido {
  devido: boolean;
  /** Data prevista interpretada ("YYYY-MM-DD"); null se o texto não tem data. Preenchida mesmo quando não é devido. */
  dataPrevista: string | null;
  /** "hoje", "DD/MM" ou "DD/MM/AAAA" (ano diferente do de hoje). Vazio quando não é devido. */
  rotuloData: string;
  /** Dias corridos (Brasília) de atraso; 0 quando é hoje ou não é devido. */
  diasAtraso: number;
}

/** Só o necessário do processo para decidir. */
export type ProcessoParaAvisoChegada = Pick<Processo, "status"> & { datas: Pick<Processo["datas"], "dataChegadaBrasil"> };

/**
 * O processo deve mostrar o aviso "chegou?" agora? `agora` é injetável (testes). Toda a conta é em datas civis e
 * horário de Brasília: o resultado é o mesmo em qualquer fuso da máquina.
 */
export function avisoChegadaDevido(processo: ProcessoParaAvisoChegada, agora: Date = new Date()): AvisoChegadaDevido {
  const dataPrevista = interpretarDataChegadaPrevista(processo.datas.dataChegadaBrasil, agora);
  const naoDevido: AvisoChegadaDevido = { devido: false, dataPrevista, rotuloData: "", diasAtraso: 0 };

  if (processo.status !== "em_transito" || !dataPrevista) return naoDevido;

  const hojeISO = hojeBrasilia(agora);
  if (dataPrevista > hojeISO) return naoDevido;

  if (dataPrevista === hojeISO) {
    if (!(horaBrasilia(agora) >= HORA_CORTE_AVISO_CHEGADA)) return naoDevido;
    return { devido: true, dataPrevista, rotuloData: "hoje", diasAtraso: 0 };
  }

  return {
    devido: true,
    dataPrevista,
    rotuloData: formatarDataCurta(dataPrevista, hojeISO),
    diasAtraso: diferencaEmDias(hojeISO, dataPrevista),
  };
}

// ── Quem recebe / quem responde ────────────────────────────────────────────────────────────────────────
//
// - Responsável operacional do processo (cargo "operacional" cujo primeiro nome = responsavel_operacional, sem
//   acento/caixa, mesmo vínculo do Mandado): vê o aviso e é o ÚNICO que pode responder (Sim, chegou / Ainda não).
// - Administrador: vê TODOS, só visualiza (olhinho "Marcar como visto"); nunca atualiza o processo por aqui.
//   TODO(Follow-Up): a regra "administrador só visualiza (olhinho)" será estendida depois às outras notificações
//   do Follow-Up (Fornecedor, Mandado...); hoje só o aviso de chegada a segue.
// - Sócio, consultor e sem login: nada.

export type PapelAvisoChegada = "operacional" | "administrador";

export interface UsuarioAvisoChegada {
  role: Role | null | undefined;
  nome?: string | null;
}

function ehResponsavel(usuario: UsuarioAvisoChegada, responsavelOperacional: string | undefined | null): boolean {
  if (usuario.role !== "operacional") return false;
  const dele = primeiroNomeNormalizado(usuario.nome);
  return dele !== "" && dele === primeiroNomeNormalizado(responsavelOperacional);
}

/** Papel com que o usuário enxerga o aviso deste processo, ou null (não recebe). */
export function papelNoAvisoChegada(
  usuario: UsuarioAvisoChegada,
  responsavelOperacional: string | undefined | null,
): PapelAvisoChegada | null {
  if (usuario.role === "administrador") return "administrador";
  return ehResponsavel(usuario, responsavelOperacional) ? "operacional" : null;
}

/** Só o operacional responsável responde ao aviso (administrador NÃO). Usada pela tela e pelo servidor. */
export function podeResponderAvisoChegada(
  usuario: UsuarioAvisoChegada,
  responsavelOperacional: string | undefined | null,
): boolean {
  return ehResponsavel(usuario, responsavelOperacional);
}

// ── Texto do aviso ─────────────────────────────────────────────────────────────────────────────────────

export interface EntradaTextoAvisoChegada {
  papel: PapelAvisoChegada;
  paciente: string;
  pasta: string;
  numeroRemessa: number;
  /** Resultado de remessaVisivelNaLinha para este processo: com true o texto traz "Remessa {N}". */
  remessaVisivel: boolean;
  companhiaAerea?: string | null;
  numeroAwb?: string | null;
  rotuloData: string;
  diasAtraso: number;
}

export interface TextoAvisoChegada {
  /** "Chegou?" só para o operacional; o administrador não tem título (nem pergunta). */
  titulo: string | null;
  /** "Remessa de {paciente} · {pasta}" (ou "Remessa {N} de ..."). */
  linhaProcesso: string;
  /** "Prevista para hoje" / "Prevista para DD/MM (n dia(s) de atraso)", + " · cia · AWB x" se existirem. */
  linhaData: string;
}

export function montarTextoAvisoChegada(entrada: EntradaTextoAvisoChegada): TextoAvisoChegada {
  const remessa = entrada.remessaVisivel ? `Remessa ${entrada.numeroRemessa}` : "Remessa";
  const linhaProcesso = `${remessa} de ${entrada.paciente} · ${entrada.pasta}`;

  const previsao =
    entrada.diasAtraso <= 0
      ? "Prevista para hoje"
      : `Prevista para ${entrada.rotuloData} (${entrada.diasAtraso} ${entrada.diasAtraso === 1 ? "dia" : "dias"} de atraso)`;
  const cia = entrada.companhiaAerea?.trim();
  const awb = entrada.numeroAwb?.trim();
  const linhaData = [previsao, cia, awb ? `AWB ${awb}` : ""].filter(Boolean).join(" · ");

  return { titulo: entrada.papel === "operacional" ? "Chegou?" : null, linhaProcesso, linhaData };
}

// ── Texto das atualizações gravadas no processo (SEM nome de ninguém) ──────────────────────────────────

/** "Chegada confirmada em DD/MM." — DD/MM de hoje em Brasília. */
export function textoChegadaConfirmada(agora: Date = new Date()): string {
  return `Chegada confirmada em ${formatarDiaMes(hojeBrasilia(agora))}.`;
}

/** "Chegada adiada de {data antiga} para {nova data}." As datas já vêm no formato curto (DD/MM ou DD/MM/AAAA). */
export function textoChegadaAdiada(dataAntiga: string | null, novaData: string): string {
  return dataAntiga ? `Chegada adiada de ${dataAntiga} para ${novaData}.` : `Chegada adiada para ${novaData}.`;
}

/** Campo `data` da atualização gravada: DD/MM de hoje em Brasília (mesmo estilo curto que as pessoas digitam). */
export function dataDaAtualizacaoChegada(agora: Date = new Date()): string {
  return formatarDiaMes(hojeBrasilia(agora));
}

// ── Chave da dispensa do administrador (processo + data prevista) ──────────────────────────────────────

export function chaveAvisoChegadaVisto(processoId: string, dataPrevista: string): string {
  return `${processoId}|${dataPrevista}`;
}
