// Regras de exibição da chave PIX no cartão de exportação de Pagamentos
// (GrupoPagamentoExportCard). Funções puras: a chave fica SEMPRE em uma linha;
// quando não cabe na largura disponível, a fonte encolhe até o mínimo legível.

/** Tamanho de hoje (CPF/CNPJ e telefone ficam nele). */
export const FONTE_PIX_PADRAO_PX = 13;

/** Menor fonte aceita antes de desistir de encolher. */
export const FONTE_PIX_MINIMA_PX = 10;

/** Largura de um caractere da JetBrains Mono, em múltiplos do tamanho da fonte. */
export const LARGURA_CARACTERE_MONO_EM = 0.6;

/**
 * Até este comprimento a chave fica ao lado do TOTAL (CPF 11, CNPJ 14/18, telefone,
 * chave aleatória 36). Acima disso ela ganha a linha inteira, acima do TOTAL, porque
 * a coluna ao lado do TOTAL não comportaria nem a fonte mínima.
 */
export const LIMITE_PIX_AO_LADO_DO_TOTAL = 36;

/** Maior chave que cabe em uma linha na largura útil do cartão (420px) com a fonte mínima. */
export const LIMITE_PIX_EM_UMA_LINHA = 70;

export function pixEmLinhaPropria(tamanhoChave: number): boolean {
  return tamanhoChave > LIMITE_PIX_AO_LADO_DO_TOTAL;
}

/** Mesmo cálculo do CSS (`fontePixCss`), para uma largura conhecida: teto 13px, piso 10px. */
export function fontePixPx(tamanhoChave: number, larguraDisponivelPx: number): number {
  if (tamanhoChave <= 0) return FONTE_PIX_PADRAO_PX;
  const cabe = larguraDisponivelPx / (tamanhoChave * LARGURA_CARACTERE_MONO_EM);
  return Math.min(FONTE_PIX_PADRAO_PX, Math.max(FONTE_PIX_MINIMA_PX, cabe));
}

/**
 * `font-size` em CSS puro: 100cqw é a largura da coluna do PIX (container query),
 * então a fonte reage à largura real sem medir nada em JavaScript — vale também
 * quando o cartão é reaproveitado com outra chave.
 */
export function fontePixCss(tamanhoChave: number): string {
  if (tamanhoChave <= 0) return `${FONTE_PIX_PADRAO_PX}px`;
  const larguraEmFontes = Number((tamanhoChave * LARGURA_CARACTERE_MONO_EM).toFixed(2));
  return `clamp(${FONTE_PIX_MINIMA_PX}px, calc(100cqw / ${larguraEmFontes}), ${FONTE_PIX_PADRAO_PX}px)`;
}
