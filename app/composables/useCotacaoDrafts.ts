import { reactive, watch } from "vue";
import type { AtualizarCotacaoDTO, BancoCambio, LoteBanco } from "#shared/types/Pagamento";
import { parseBrCurrency } from "../utils/formatters";
import type { CotacaoDraft } from "../types/cotacao";

// Extraído de CotacaoTab.vue (Round 9) — merge de 3 vias entre rascunho local,
// último snapshot conhecido do servidor e o dado novo que acabou de chegar.
// Comportamento preservado exatamente como estava; nada foi corrigido aqui,
// mesmo onde algo pareça estranho (ver achados no relatório da extração).

function taxaParaStr(taxa: number | null): string {
  return taxa === null ? "" : String(taxa).replace(".", ",");
}
function corretagemParaStr(v: number): string {
  return v ? String(v).replace(".", ",") : "";
}

export interface UseCotacaoDraftsOptions {
  // Getter (não Ref direto) pra preservar a reatividade através da fronteira
  // de props, no mesmo padrão de usePatientForm.ts.
  lotes: () => LoteBanco[];
}

export interface UseCotacaoDraftsReturn {
  drafts: Record<string, CotacaoDraft[]>;
  // Exposto pro template/CotacaoTab.vue poder ler o rascunho de um banco
  // específico e pra caracterização em teste — a sincronização automática já
  // roda sozinha via watch interno, não é preciso chamar isso manualmente em
  // uso normal.
  reconciliarDrafts: () => void;
  draftDo: (loteId: string, banco: BancoCambio) => CotacaoDraft;
  // Exposto pra uso futuro por useEscolherBanco, sem duplicar a lógica aqui.
  draftToOpcoes: (loteId: string) => NonNullable<AtualizarCotacaoDTO["opcoes"]>;
  parseTaxa: (str: string) => number | null;
}

export function useCotacaoDrafts(options: UseCotacaoDraftsOptions): UseCotacaoDraftsReturn {
  // Rascunho editável por lote. É salvo automaticamente (debounce ao digitar +
  // imediato ao sair do campo) — não há botão "Salvar taxas".
  const drafts = reactive<Record<string, CotacaoDraft[]>>({});

  // Snapshot do que estava persistido na última sincronização, por lote/banco.
  // Serve pro merge 3-vias: se o rascunho ainda bate com o snapshot anterior,
  // adota o novo valor do servidor; se o usuário mexeu (edição pendente), preserva.
  let persistidoSnapshot: Record<string, Record<string, { taxa: number | null; corretagem: number }>> = {};

  function snapshotDoLote(lote: LoteBanco): Record<string, { taxa: number | null; corretagem: number }> {
    const m: Record<string, { taxa: number | null; corretagem: number }> = {};
    for (const o of lote.opcoes) m[o.banco] = { taxa: o.taxa, corretagem: o.taxaCorretagem };
    return m;
  }

  function parseTaxa(str: string): number | null {
    if (!str.trim()) return null;
    const v = parseBrCurrency(str);
    return v > 0 ? v : null;
  }

  function reconciliarDrafts(): void {
    const novoSnapshot: typeof persistidoSnapshot = {};
    for (const lote of options.lotes()) {
      novoSnapshot[lote.id] = snapshotDoLote(lote);
      const existente = drafts[lote.id];
      if (!existente) {
        drafts[lote.id] = lote.opcoes.map((o) => ({
          banco: o.banco,
          taxaStr: taxaParaStr(o.taxa),
          corretagemStr: corretagemParaStr(o.taxaCorretagem),
        }));
        continue;
      }
      const anterior = persistidoSnapshot[lote.id];
      for (const o of lote.opcoes) {
        const d = existente.find((x) => x.banco === o.banco);
        if (!d) continue;
        const ant = anterior?.[o.banco];
        if (!ant || parseTaxa(d.taxaStr) === ant.taxa) d.taxaStr = taxaParaStr(o.taxa);
        const corretagemDraft = d.corretagemStr.trim() ? parseBrCurrency(d.corretagemStr) : 0;
        if (!ant || corretagemDraft === ant.corretagem) d.corretagemStr = corretagemParaStr(o.taxaCorretagem);
      }
    }
    persistidoSnapshot = novoSnapshot;
  }

  watch(options.lotes, reconciliarDrafts, { immediate: true, deep: true });

  function draftDo(loteId: string, banco: BancoCambio): CotacaoDraft {
    const lista = drafts[loteId] ?? [];
    return lista.find((d) => d.banco === banco) ?? { banco, taxaStr: "", corretagemStr: "" };
  }

  function draftToOpcoes(loteId: string): NonNullable<AtualizarCotacaoDTO["opcoes"]> {
    return (drafts[loteId] ?? []).map((d) => ({
      banco: d.banco,
      taxaCorretagem: d.corretagemStr.trim() ? parseBrCurrency(d.corretagemStr) : 0,
      taxa: parseTaxa(d.taxaStr),
    }));
  }

  return { drafts, reconciliarDrafts, draftDo, draftToOpcoes, parseTaxa };
}
