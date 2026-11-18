import type { Processo } from "#shared/types/processo";
import type { ChaveIconePainel } from "./processoIcones";
import { nomeFornecedorCurto } from "./nomeFornecedorCurto";
import { linhaTransportadora, mostraDespachanteTransportadora } from "./processoPainel";

// Seções da barra lateral do processo no Kanban (ProcessoPainel.vue): decide o que aparece e já devolve os valores
// formatados; o componente só renderiza. Regra de todas: campo vazio (ausente ou só espaços) NÃO existe; linha sem
// células não existe; seção sem campos não existe. Despachante e Transportadora seguem a regra do formulário
// (Courier Simples esconde os dois). Testes: tests/unit/processoPainelSecoes.spec.ts.

export interface CelulaPainel {
  /** Id do elemento do VALOR (mantém os `painel-*` de sempre). */
  id: string;
  /** Qual ícone (ver processoIcones.ts). */
  chave: ChaveIconePainel;
  rotulo: string;
  valor: string;
  /** Texto completo para o atributo title (o visível pode cortar com "…"). */
  titulo: string;
  /** Fonte de código (AWB, nº do processo). */
  mono?: boolean;
}

export interface SecaoPainel {
  /** Título pequeno em maiúsculas (a tela aplica o uppercase). */
  titulo: string;
  /** Cada linha tem 1 ou 2 células; a célula sozinha ocupa a linha inteira. */
  linhas: CelulaPainel[][];
}

function limpo(valor: string | null | undefined): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function celula(
  id: string,
  chave: ChaveIconePainel,
  rotulo: string,
  valor: string,
  extra: { mono?: boolean } = {},
): CelulaPainel | null {
  if (!valor) return null;
  return { id: `painel-${id}`, chave, rotulo, valor, titulo: valor, ...extra };
}

function presentes(celulas: Array<CelulaPainel | null>): CelulaPainel[] {
  return celulas.filter((c): c is CelulaPainel => c !== null);
}

/** Responsável / Consultor / Fornecedor (só o nome do fornecedor, sem " - País"). Sem nenhum, lista vazia. */
export function celulasPessoas(
  processo: Pick<Processo, "responsavelOperacional" | "consultor" | "fornecedor">,
): CelulaPainel[] {
  return presentes([
    celula("responsavel", "responsavel", "Responsável", limpo(processo.responsavelOperacional)),
    celula("consultor", "consultor", "Consultor", limpo(processo.consultor)),
    celula("fornecedor", "fornecedor", "Fornecedor", nomeFornecedorCurto(processo.fornecedor)),
  ]);
}

/** "Envio e desembaraço": Envio | Cia. aérea; Nº AWB | Despachante. Sem nenhum campo, null (o título some junto). */
export function secaoEnvio(
  processo: Pick<Processo, "modalEnvio" | "companhiaAerea" | "numeroAwb" | "despachante">,
): SecaoPainel | null {
  const mostraDespachante = mostraDespachanteTransportadora(processo);
  const linhas = [
    presentes([
      celula("envio", "envio", "Envio", limpo(processo.modalEnvio)),
      celula("cia", "aereo", "Cia. aérea", limpo(processo.companhiaAerea)),
    ]),
    presentes([
      celula("awb", "awb", "Nº AWB", limpo(processo.numeroAwb), { mono: true }),
      mostraDespachante ? celula("despachante", "despachante", "Despachante", limpo(processo.despachante)) : null,
    ]),
  ].filter((l) => l.length > 0);
  return linhas.length ? { titulo: "Envio e desembaraço", linhas } : null;
}

/** "Entrega": Transportadora (nome · cotação · valor; some no Courier Simples) e Local de entrega, cada um numa linha. */
export function secaoEntrega(processo: Pick<Processo, "modalEnvio" | "transportadoraNacional" | "localEntrega">): SecaoPainel | null {
  const transportadora = mostraDespachanteTransportadora(processo) ? linhaTransportadora(processo) : "";
  const linhas = [
    presentes([celula("transportadora", "transportadora", "Transportadora", transportadora)]),
    presentes([celula("local-entrega", "local", "Local de entrega", limpo(processo.localEntrega))]),
  ].filter((l) => l.length > 0);
  return linhas.length ? { titulo: "Entrega", linhas } : null;
}

/** Nº do processo: bloquinho de linha inteira, sem título, em fonte de código; vazio = null. */
export function celulaNumeroProcesso(processo: Pick<Processo, "numeroProcesso">): CelulaPainel | null {
  return celula("numero-processo", "numeroProcesso", "Nº do processo", limpo(processo.numeroProcesso), { mono: true });
}

/** A linha de cima do cabeçalho existe? Só com pasta, PO, "Ordem N" ou etiqueta de pagamento. */
export function haLinhaDeCima(entradas: { pastaPo: string; ordem: string; pagamento: string | null }): boolean {
  return Boolean(entradas.pastaPo || entradas.ordem || entradas.pagamento);
}


// Valor de data curto ("DD/MM" ou "DD/MM/AAAA"): cabe no bloquinho de 1 coluna. Qualquer outro texto (anotação antiga,
// "09/10 - agd. análise") ocupa a linha inteira e quebra de linha.
export function dataCabeNaCelula(valor: string): boolean {
  return /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(valor.trim());
}
