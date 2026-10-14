import { BANCOS_CAMBIO, TAXA_CORRETAGEM_PADRAO } from "#shared/constants/pagamentos";
import type {
  BancoCambio,
  CotacaoOpcaoView,
  LancamentoBanco,
  LoteBanco,
  OpcaoCotacao,
} from "#shared/types/Pagamento";

/**
 * Regras de negócio da aba Cotação Câmbio — confirmadas com o usuário, NÃO
 * reinterpretar por conta própria. Qualquer mudança precisa ser confirmada antes
 * de aplicada (mesma disciplina de app/utils/calculations.ts).
 *
 * Por lote (dia + empresa + moeda), para cada banco candidato (XP, Rendimento, Intex):
 *   quantidadeOrdens = contagem dos lançamentos pendentes do lote (não soma)
 *   totalMoeda       = soma de valorMoeda desses mesmos lançamentos pendentes
 *   totalReais       = totalMoeda * taxa + taxaCorretagem   (null enquanto taxa for null)
 *   diferenca        = totalReais deste banco - totalReais do banco mais barato do lote
 *                      (só entre bancos com taxa preenchida; o mais barato dá 0)
 *
 * "Pendente" = lançamento com valorReais === null. Depois que um banco é escolhido
 * (regra 3), os lançamentos recebem valorReais = valorMoeda * taxaEscolhida e saem
 * da agregação.
 */

// Um lançamento entra na cotação enquanto não tiver valor em reais.
export function isLancamentoPendente(lancamento: LancamentoBanco): boolean {
  return lancamento.valorReais === null;
}

export function lancamentosPendentes(lancamentos: LancamentoBanco[]): LancamentoBanco[] {
  return lancamentos.filter(isLancamentoPendente);
}

// quantidadeOrdens — contagem, não soma.
export function contarOrdensPendentes(lancamentos: LancamentoBanco[]): number {
  return lancamentosPendentes(lancamentos).length;
}

// totalMoeda — soma automática de valorMoeda dos lançamentos pendentes.
export function somarPendentesMoeda(lancamentos: LancamentoBanco[]): number {
  return lancamentosPendentes(lancamentos).reduce((soma, l) => soma + l.valorMoeda, 0);
}

// totalReais = totalMoeda * taxa + taxaCorretagem. null enquanto a taxa não foi cotada.
export function calcularTotalReais(
  totalMoeda: number,
  taxa: number | null,
  taxaCorretagem: number
): number | null {
  if (taxa === null) return null;
  return totalMoeda * taxa + taxaCorretagem;
}

// valorReais de um lançamento quando o banco é escolhido — SEM corretagem POR
// LANÇAMENTO: a corretagem do banco escolhido entra uma única vez, no total do
// lote (calcularTotalReaisLote), nunca rateada nem somada em cada linha. Regra 3.
export function calcularValorReaisLancamento(valorMoeda: number, taxa: number): number {
  return valorMoeda * taxa;
}

// Fechamento por ordem (Rendimento): as `taxas` cobrem TODOS os lançamentos
// pendentes, cada uma > 0? Fechamento parcial não é permitido. Usado tanto pra
// habilitar o botão do modal quanto na validação do servidor.
export function taxasRendimentoCompletas(
  pendenteIds: string[],
  taxas: Array<{ lancamentoId: string; taxa: number }>
): boolean {
  if (pendenteIds.length === 0) return false;
  const porId = new Map(taxas.map((t) => [t.lancamentoId, t.taxa]));
  return pendenteIds.every((id) => {
    const t = porId.get(id);
    return typeof t === "number" && Number.isFinite(t) && t > 0;
  });
}

// Soma dos valorReais já convertidos (lançamentos sem conversão contam 0).
export function somarValorReais(lancamentos: LancamentoBanco[]): number {
  return lancamentos.reduce((soma, l) => soma + (l.valorReais ?? 0), 0);
}

// Faixa (min–max) das taxas efetivas por lançamento — só faz sentido no
// Rendimento, onde `taxa` é preenchida por ordem. null se nenhum lançamento
// tem taxa.
export function faixaTaxasLancamentos(
  lancamentos: LancamentoBanco[]
): { min: number; max: number } | null {
  const taxas = lancamentos
    .map((l) => l.taxa)
    .filter((t): t is number => t !== null && Number.isFinite(t));
  if (!taxas.length) return null;
  return { min: Math.min(...taxas), max: Math.max(...taxas) };
}

// Taxa de câmbio SEMPRE com vírgula e 4 casas ("5,4231") em toda a tela — nunca
// com ponto, para não induzir a digitar "5.4231". Só exibição: o valor gravado
// mantém todas as casas.
export function formatTaxa(taxa: number): string {
  return taxa.toFixed(4).replace(".", ",");
}

// "5,4000 – 5,4700" (ou "5,4231" quando min === max). null se não há taxas.
export function formatFaixaTaxas(lancamentos: LancamentoBanco[]): string | null {
  const faixa = faixaTaxasLancamentos(lancamentos);
  if (!faixa) return null;
  return faixa.min === faixa.max
    ? formatTaxa(faixa.min)
    : `${formatTaxa(faixa.min)} – ${formatTaxa(faixa.max)}`;
}

// Menor totalReais entre as opções que já têm taxa preenchida.
function menorTotalReais(totais: Array<number | null>): number | null {
  const preenchidos = totais.filter((t): t is number => t !== null);
  if (!preenchidos.length) return null;
  return Math.min(...preenchidos);
}

// Garante as 3 opções (XP, Rendimento, Intex) na ordem canônica, criando as que
// faltarem com corretagem padrão e taxa não preenchida.
export function normalizarOpcoes(opcoes: OpcaoCotacao[]): OpcaoCotacao[] {
  return BANCOS_CAMBIO.map((banco) => {
    const existente = opcoes.find((o) => o.banco === banco);
    return (
      existente ?? {
        banco,
        taxaCorretagem: TAXA_CORRETAGEM_PADRAO,
        taxa: null,
      }
    );
  });
}

// Monta a visão calculada da cotação de um lote a partir dos seus lançamentos.
export function montarCotacao(
  opcoes: OpcaoCotacao[],
  lancamentos: LancamentoBanco[]
): CotacaoOpcaoView[] {
  const quantidadeOrdens = contarOrdensPendentes(lancamentos);
  const totalMoeda = somarPendentesMoeda(lancamentos);
  const normalizadas = normalizarOpcoes(opcoes);

  const totais = normalizadas.map((opcao) =>
    calcularTotalReais(totalMoeda, opcao.taxa, opcao.taxaCorretagem)
  );
  const minimo = menorTotalReais(totais);

  return normalizadas.map((opcao, i) => {
    const totalReais = totais[i] ?? null;
    const diferenca =
      totalReais === null || minimo === null ? null : totalReais - minimo;
    return {
      ...opcao,
      quantidadeOrdens,
      totalMoeda,
      totalReais,
      diferenca,
      maisBarato: totalReais !== null && minimo !== null && totalReais === minimo,
    };
  });
}

// Banco de menor totalReais entre os que têm taxa preenchida (destaque na UI).
export function bancoMaisBarato(cotacao: CotacaoOpcaoView[]): BancoCambio | null {
  const comTotal = cotacao.filter((o) => o.totalReais !== null);
  if (!comTotal.length) return null;
  return comTotal.reduce((maisBarato, atual) =>
    (atual.totalReais as number) < (maisBarato.totalReais as number) ? atual : maisBarato
  ).banco;
}

// Corretagem (R$) do banco escolhido do lote; 0 se ainda não há banco escolhido.
function corretagemDoBancoEscolhido(lote: LoteBanco): number {
  if (lote.bancoEscolhido === null) return 0;
  return lote.opcoes.find((o) => o.banco === lote.bancoEscolhido)?.taxaCorretagem ?? 0;
}

// Total do lote em reais: só definido depois que um banco foi escolhido, e
// SEMPRE inclui a corretagem do banco escolhido, UMA vez (nunca por lançamento).
// Rendimento fecha por ordem (sem taxa única no lote) — a base é a soma dos
// valorReais já convertidos individualmente. XP/Intex seguem a taxa única.
// É o mesmo número que o card da Cotação mostra para o banco em uso.
export function calcularTotalReaisLote(lote: LoteBanco, lancamentos: LancamentoBanco[]): number | null {
  if (lote.bancoEscolhido === null) return null;
  const corretagem = corretagemDoBancoEscolhido(lote);
  if (lote.bancoEscolhido === "RENDIMENTO") return somarValorReais(lancamentos) + corretagem;
  if (lote.taxaEscolhida === null) return null;
  const base = lancamentos.reduce((soma, l) => soma + l.valorMoeda * (lote.taxaEscolhida as number), 0);
  return base + corretagem;
}

// Visão da Cotação de um lote. Antes da escolha (e para XP/Intex e Rendimento de
// 1 ordem) é exatamente `montarCotacao` sobre o rascunho. Só quando o Rendimento
// foi fechado POR ORDEM (bancoEscolhido RENDIMENTO e taxaEscolhida null) o card do
// Rendimento passa a mostrar o total REAL (Σ valorReais + corretagem) em vez do
// cálculo pela taxa de referência, e a "Diferença"/"mais barato" dos cards são
// recalculados contra ele. Só exibição — não muda nenhum cálculo pré-escolha.
export function montarCotacaoDoLote(
  lote: LoteBanco,
  opcoes: OpcaoCotacao[],
  lancamentos: LancamentoBanco[]
): CotacaoOpcaoView[] {
  // Depois da escolha os lançamentos deixam de ser "pendentes"; para a tela não
  // zerar, a cotação é exibida sobre todos os lançamentos do lote.
  const base =
    lote.bancoEscolhido !== null ? lancamentos.map((l) => ({ ...l, valorReais: null })) : lancamentos;
  const views = montarCotacao(opcoes, base);

  const porOrdem = lote.bancoEscolhido === "RENDIMENTO" && lote.taxaEscolhida === null;
  if (!porOrdem) return views;
  const real = calcularTotalReaisLote(lote, lancamentos);
  if (real === null) return views;

  const totais = views.map((v) => (v.banco === "RENDIMENTO" ? real : v.totalReais));
  const minimo = menorTotalReais(totais);
  return views.map((v, i) => {
    const totalReais = totais[i] ?? null;
    return {
      ...v,
      totalReais,
      diferenca: totalReais === null || minimo === null ? null : totalReais - minimo,
      maisBarato: totalReais !== null && minimo !== null && totalReais === minimo,
      totalReaisReal: v.banco === "RENDIMENTO",
    };
  });
}
