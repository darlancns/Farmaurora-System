import type { Processo } from "#shared/types/processo";
import { normalizeText } from "./search";

// Busca da tela de Processos: o que casa com o termo e o que abrir sozinho (grupos e detalhes) quando há
// busca. Funções puras, testadas em tests/unit/processoBusca.spec.ts; os componentes só aplicam o resultado.
// As regras especiais de pasta e de Nº Ordem valem SÓ aqui: as buscas de Prestação, Pagamentos e DIR continuam com normalizeText.

// ── O que casa ────────────────────────────────────────────────────────────────────────────────────

// Pasta sem diferença de acento/maiúscula e SEM espaços e hífens (também travessões, de quem cola de um
// documento): "2026 - 375", "2026-375" e "2026 375" viram "2026375".
export function normalizarPasta(valor: string): string {
  return normalizeText(valor).replace(/[\s\-‐-―]+/g, "");
}

// PO sem acento/maiúscula e SÓ com letras e números: "PO26-10-0471", "po26100471" e "26 10 0471" viram
// "po26100471"/"26100471".
export function normalizarOrdem(valor: string): string {
  return normalizeText(valor).replace(/[^a-z0-9]+/g, "");
}

/** O termo (digitado de qualquer jeito) está contido na pasta? "375" acha "2026 - 375". */
export function pastaCombina(pasta: string, termo: string): boolean {
  const procurado = normalizarPasta(termo);
  return procurado !== "" && normalizarPasta(pasta).includes(procurado);
}

// Termo já preparado uma vez por busca (e não uma vez por processo).
export interface TermoBusca {
  texto: string; // normalizeText do que foi digitado
  pasta: string; // normalizarPasta do que foi digitado ("" se só havia espaços/hífens)
  ordem: string; // normalizarOrdem do que foi digitado ("" se só havia pontuação/espaços)
}

// Um predicado por campo pesquisado. Para somar um campo basta acrescentar uma linha aqui — o resto (filtro, abertura automática) já usa esta lista.
const CAMPOS_DE_BUSCA: ReadonlyArray<(processo: Processo, termo: TermoBusca) => boolean> = [
  (processo, termo) => normalizeText(processo.paciente).includes(termo.texto),
  (processo, termo) => termo.pasta !== "" && normalizarPasta(processo.pasta).includes(termo.pasta),
  (processo, termo) => termo.ordem !== "" && normalizarOrdem(processo.numeroPo ?? "").includes(termo.ordem),
];

/** null quando não há busca (vazio ou só espaços). */
export function criarTermoBusca(termo: string): TermoBusca | null {
  const texto = normalizeText(termo);
  if (!texto) return null;
  return { texto, pasta: normalizarPasta(termo), ordem: normalizarOrdem(termo) };
}

export function processoCombinaBusca(processo: Processo, termo: TermoBusca): boolean {
  return CAMPOS_DE_BUSCA.some((campo) => campo(processo, termo));
}

/** Processos que casam com o termo (paciente, pasta OU Nº Ordem). Sem termo, a lista inteira. */
export function filtrarPorBusca(processos: Processo[], termo: string): Processo[] {
  const preparado = criarTermoBusca(termo);
  if (!preparado) return processos;
  return processos.filter((processo) => processoCombinaBusca(processo, preparado));
}

// ── O que abrir sozinho ───────────────────────────────────────────────────────────────────────────

// Até este total de processos encontrados, o detalhe de cada um também abre.
export const LIMITE_DETALHES_AUTOMATICOS = 5;

export interface EstadoAbertura {
  grupos: ReadonlySet<string>; // consultores com o grupo aberto
  detalhes: ReadonlySet<string>; // ids dos processos com o detalhe aberto
}

export interface AberturaAutomatica {
  grupos: string[];
  detalhes: string[];
}

/**
 * Regra automática da busca, para os processos ENCONTRADOS (já com todos os filtros) da aba em tela:
 * - com grupos por consultor: abre todos os grupos que têm ao menos um resultado;
 * - até LIMITE_DETALHES_AUTOMATICOS (5) resultados: abre o detalhe de cada um; com mais, só os grupos.
 * Lista plana (cargo consultor): `agrupado` falso — só a regra dos 5.
 */
export function calcularAberturaAutomatica(encontrados: readonly Processo[], agrupado: boolean): AberturaAutomatica {
  return {
    grupos: agrupado ? [...new Set(encontrados.map((processo) => processo.consultor))] : [],
    detalhes: encontrados.length <= LIMITE_DETALHES_AUTOMATICOS ? encontrados.map((processo) => processo.id) : [],
  };
}

// Identifica o CONJUNTO de resultados (não o texto digitado): digitar mais uma letra que não muda os
// resultados mantém a assinatura — e, com ela, as escolhas manuais da pessoa.
export function assinaturaDeResultados(encontrados: readonly Processo[], agrupado: boolean): string {
  return `${agrupado ? "g" : "p"}:${encontrados.map((processo) => processo.id).join(",")}`;
}

export interface EntradaBusca {
  termo: string;
  encontrados: readonly Processo[];
  agrupado: boolean;
  atual: EstadoAbertura; // o que está aberto agora (inclui escolhas manuais)
  snapshot: EstadoAbertura | null; // como estava ANTES de a pessoa começar a digitar
  assinatura: string | null; // assinatura dos resultados já tratados (null = sem busca)
}

export interface PassoBusca {
  estado: EstadoAbertura;
  snapshot: EstadoAbertura | null;
  assinatura: string | null;
}

const copiar = (estado: EstadoAbertura): EstadoAbertura => ({
  grupos: new Set(estado.grupos),
  detalhes: new Set(estado.detalhes),
});

/**
 * Próximo estado de abertura quando o termo ou os resultados mudam.
 * - Sem busca: se havia instantâneo, RESTAURA o estado de antes de digitar e o descarta.
 * - Primeira digitação: guarda o instantâneo do estado atual.
 * - Resultados mudaram (assinatura nova): reaplica a regra automática — os grupos com resultado abrem
 *   (os demais ficam como estão) e os detalhes passam a ser exatamente os da regra dos 5, descartando
 *   escolhas manuais anteriores.
 * - Resultados iguais: nada muda, então o que a pessoa abriu/fechou à mão continua valendo.
 */
export function avancarAberturaPorBusca(entrada: EntradaBusca): PassoBusca {
  const { atual, snapshot, assinatura } = entrada;

  if (!criarTermoBusca(entrada.termo)) {
    if (snapshot) return { estado: copiar(snapshot), snapshot: null, assinatura: null };
    return { estado: atual, snapshot: null, assinatura: null };
  }

  const nova = assinaturaDeResultados(entrada.encontrados, entrada.agrupado);
  if (nova === assinatura) return { estado: atual, snapshot, assinatura };

  const auto = calcularAberturaAutomatica(entrada.encontrados, entrada.agrupado);
  return {
    estado: { grupos: new Set([...atual.grupos, ...auto.grupos]), detalhes: new Set(auto.detalhes) },
    snapshot: snapshot ?? copiar(atual),
    assinatura: nova,
  };
}
