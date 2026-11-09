import { ROTULOS_BRAND_MEDICAMENTO, STATUS_PROCESSO_LABELS, isBrandMedicamento } from "#shared/constants/processos";
import type { Processo } from "#shared/types/processo";
import { normalizarSemPontuacao, normalizeText } from "./search";

// Busca da tela de Processos: o que casa com o termo e o que abrir sozinho (grupos e detalhes) quando há
// busca. Funções puras, testadas em tests/unit/processoBusca.spec.ts; os componentes só aplicam o resultado.
// As regras especiais de pasta e de Nº Ordem valem SÓ aqui: as buscas de Prestação, Pagamentos e DIR continuam com normalizeText.
//
// Um processo combina com o texto digitado se a BUSCA ANTIGA (texto inteiro, só paciente/pasta/Nº Ordem) o acha OU a
// BUSCA POR PALAVRAS o acha: o texto é separado em palavras e TODAS precisam aparecer (em qualquer ordem, em campos
// diferentes) em algum dos campos de `textoPesquisavel`.

// ── O que casa ────────────────────────────────────────────────────────────────────────────────────

// Pasta sem diferença de acento/maiúscula e SEM espaços e hífens (também travessões, de quem cola de um
// documento): "2026 - 375", "2026-375" e "2026 375" viram "2026375". Pasta opcional: null/undefined (linha
// antiga) vira "" sem erro.
export function normalizarPasta(valor: string | null | undefined): string {
  return normalizeText(valor ?? "").replace(/[\s\-‐-―]+/g, "");
}

// PO sem acento/maiúscula e SÓ com letras e números: "PO26-10-0471", "po26100471" e "26 10 0471" viram
// "po26100471"/"26100471".
export function normalizarOrdem(valor: string): string {
  return normalizarSemPontuacao(valor);
}

/** O termo (digitado de qualquer jeito) está contido na pasta? "375" acha "2026 - 375". */
export function pastaCombina(pasta: string | null | undefined, termo: string): boolean {
  const procurado = normalizarPasta(termo);
  return procurado !== "" && normalizarPasta(pasta).includes(procurado);
}

// Uma palavra do termo, já preparada. Pasta e Nº Ordem também valem por palavra ("2026-430 fedex" acha a pasta
// "2026 - 430"); `digitos` só existe para palavras numéricas de 4+ dígitos (AWB).
export interface PalavraBusca {
  texto: string; // normalizeText da palavra
  pasta: string; // normalizarPasta da palavra ("" se só havia hífens)
  ordem: string; // normalizarOrdem da palavra ("" se só havia pontuação)
  digitos: string; // só os dígitos, quando a palavra é número (dígitos, hífens, pontos) com 4+ dígitos; senão ""
}

// Termo já preparado uma vez por busca (e não uma vez por processo).
export interface TermoBusca {
  texto: string; // normalizeText do que foi digitado
  pasta: string; // normalizarPasta do que foi digitado ("" se só havia espaços/hífens)
  ordem: string; // normalizarOrdem do que foi digitado ("" se só havia pontuação/espaços)
  palavras: PalavraBusca[]; // as palavras com ao menos uma letra ou número (vazio: a busca por palavras não vale)
}

// ── Busca antiga: texto inteiro, só paciente, pasta e Nº Ordem ────────────────────────────────────

// Um predicado por campo da busca antiga.
const CAMPOS_BUSCA_ANTIGA: ReadonlyArray<(processo: Processo, termo: TermoBusca) => boolean> = [
  (processo, termo) => normalizeText(processo.paciente).includes(termo.texto),
  (processo, termo) => termo.pasta !== "" && normalizarPasta(processo.pasta).includes(termo.pasta),
  (processo, termo) => termo.ordem !== "" && normalizarOrdem(processo.numeroPo ?? "").includes(termo.ordem),
];

/** A busca ANTIGA (o texto inteiro como um bloco, só paciente, pasta ou Nº Ordem) acha o processo? */
export function processoCombinaBuscaAntiga(processo: Processo, termo: TermoBusca): boolean {
  return CAMPOS_BUSCA_ANTIGA.some((campo) => campo(processo, termo));
}

// ── Busca por palavras: todos os campos ───────────────────────────────────────────────────────────

// Texto normalizado de um campo que pode faltar (undefined) ou, por defesa, não ser texto.
const norm = (valor: unknown): string => (typeof valor === "string" ? normalizeText(valor) : "");

// Pesquisável de um processo, calculado UMA vez por objeto e reaproveitado a cada tecla.
interface IndiceProcesso {
  versao: string; // updatedAt de quando foi calculado: se o processo foi substituído/atualizado, recalcula
  texto: string; // campos normalizados separados por "\n" (uma palavra, sem espaço, nunca atravessa dois campos)
  pasta: string; // normalizarPasta(pasta)
  ordem: string; // normalizarOrdem(numeroPo)
  awb: string; // só os dígitos do AWB
}

/**
 * Os campos da busca por palavras, já normalizados (sem acento, minúsculas). Para somar um campo basta acrescentar uma
 * linha aqui. NÃO entram: atualizações, pendências, datas. "Pago"/"Pendente" só quando há statusPagamento (como o card
 * do Kanban); o status e o brand entram pelo RÓTULO da tela ("Em trânsito", "Referência"), não pelo valor interno.
 */
export function camposPesquisaveis(processo: Processo): string[] {
  const campos = [
    norm(processo.paciente),
    norm(processo.pasta),
    norm(processo.numeroPo),
    norm(processo.empresa),
    norm(processo.responsavelOperacional),
    norm(processo.consultor),
    norm(processo.fornecedor),
    norm(processo.despachante),
    norm(processo.companhiaAerea),
    norm(processo.numeroAwb),
    norm(processo.transportadoraNacional?.nome),
    norm(processo.modalEnvio),
    norm(processo.numeroProcesso),
    norm(processo.localEntrega),
    norm(STATUS_PROCESSO_LABELS[processo.status]),
  ];
  for (const medicamento of processo.medicamentos ?? []) {
    campos.push(norm(medicamento?.nome), norm(medicamento?.laboratorio));
    campos.push(isBrandMedicamento(medicamento?.brand) ? norm(ROTULOS_BRAND_MEDICAMENTO[medicamento.brand]) : "");
  }
  if (processo.statusPagamento === "pago") campos.push("pago");
  else if (processo.statusPagamento === "pendente") campos.push("pendente");
  return campos.filter(Boolean);
}

const INDICES = new WeakMap<Processo, IndiceProcesso>();

function indiceDe(processo: Processo): IndiceProcesso {
  const guardado = INDICES.get(processo);
  if (guardado && guardado.versao === processo.updatedAt) return guardado;
  const indice: IndiceProcesso = {
    versao: processo.updatedAt,
    texto: camposPesquisaveis(processo).join("\n"),
    pasta: normalizarPasta(processo.pasta),
    ordem: normalizarOrdem(processo.numeroPo ?? ""),
    awb: (processo.numeroAwb ?? "").replace(/\D+/g, ""),
  };
  INDICES.set(processo, indice);
  return indice;
}

function palavraAchada(indice: IndiceProcesso, palavra: PalavraBusca): boolean {
  return (
    indice.texto.includes(palavra.texto) ||
    (palavra.pasta !== "" && indice.pasta.includes(palavra.pasta)) ||
    (palavra.ordem !== "" && indice.ordem.includes(palavra.ordem)) ||
    (palavra.digitos !== "" && indice.awb.includes(palavra.digitos))
  );
}

/** A busca por PALAVRAS acha o processo? Todas as palavras (E), em qualquer ordem, em qualquer campo. Sem palavras, não acha. */
export function processoCombinaPorPalavras(processo: Processo, termo: TermoBusca): boolean {
  if (termo.palavras.length === 0) return false;
  const indice = indiceDe(processo);
  return termo.palavras.every((palavra) => palavraAchada(indice, palavra));
}

function prepararPalavra(texto: string): PalavraBusca {
  // Palavra numérica (só dígitos e separadores): o AWB também é comparado só pelos dígitos, com 4+ dígitos.
  const digitos = /^[\d.\-‐-―/]+$/.test(texto) ? texto.replace(/\D+/g, "") : "";
  return {
    texto,
    pasta: normalizarPasta(texto),
    ordem: normalizarOrdem(texto),
    digitos: digitos.length >= 4 ? digitos : "",
  };
}

/** null quando não há busca (vazio ou só espaços). */
export function criarTermoBusca(termo: string): TermoBusca | null {
  const texto = normalizeText(termo);
  if (!texto) return null;
  const palavras = texto
    .split(/\s+/)
    .filter((palavra) => /[\p{L}\p{N}]/u.test(palavra))
    .map(prepararPalavra);
  return { texto, pasta: normalizarPasta(termo), ordem: normalizarOrdem(termo), palavras };
}

/** A busca antiga com o texto inteiro OU a busca por palavras acha o processo? */
export function processoCombinaBusca(processo: Processo, termo: TermoBusca): boolean {
  return processoCombinaBuscaAntiga(processo, termo) || processoCombinaPorPalavras(processo, termo);
}

/** Processos que casam com o termo (busca antiga OU todas as palavras em qualquer campo). Sem termo, a lista inteira. */
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
 * Com `termo`: o detalhe só abre sozinho para quem a busca ANTIGA (texto inteiro: paciente, pasta, Nº Ordem) também
 * acharia. O que só a busca por palavras acha ("fedex", "rebeca", "pago") aparece na lista, sem abrir o detalhe.
 */
export function calcularAberturaAutomatica(
  encontrados: readonly Processo[],
  agrupado: boolean,
  termo?: TermoBusca | null,
): AberturaAutomatica {
  const abreDetalhes = encontrados.length <= LIMITE_DETALHES_AUTOMATICOS;
  return {
    grupos: agrupado ? [...new Set(encontrados.map((processo) => processo.consultor))] : [],
    detalhes: abreDetalhes
      ? encontrados
          .filter((processo) => !termo || processoCombinaBuscaAntiga(processo, termo))
          .map((processo) => processo.id)
      : [],
  };
}

// Identifica o CONJUNTO de resultados (não o texto digitado): digitar mais uma letra que não muda os
// resultados mantém a assinatura — e, com ela, as escolhas manuais da pessoa. Com `termo`, cada id leva "*" quando a
// busca antiga também o acha (é isso que decide se o detalhe abre sozinho), então mudar isso muda a assinatura.
export function assinaturaDeResultados(encontrados: readonly Processo[], agrupado: boolean, termo?: TermoBusca | null): string {
  const ids = encontrados.map((processo) => (termo && processoCombinaBuscaAntiga(processo, termo) ? `${processo.id}*` : processo.id));
  return `${agrupado ? "g" : "p"}:${ids.join(",")}`;
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

  const termo = criarTermoBusca(entrada.termo);
  if (!termo) {
    if (snapshot) return { estado: copiar(snapshot), snapshot: null, assinatura: null };
    return { estado: atual, snapshot: null, assinatura: null };
  }

  const nova = assinaturaDeResultados(entrada.encontrados, entrada.agrupado, termo);
  if (nova === assinatura) return { estado: atual, snapshot, assinatura };

  const auto = calcularAberturaAutomatica(entrada.encontrados, entrada.agrupado, termo);
  return {
    estado: { grupos: new Set([...atual.grupos, ...auto.grupos]), detalhes: new Set(auto.detalhes) },
    snapshot: snapshot ?? copiar(atual),
    assinatura: nova,
  };
}
