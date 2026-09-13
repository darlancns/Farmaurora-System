import type { BancoCambio } from "#shared/types/Pagamento";

/**
 * Rascunho editável de taxa/corretagem por banco na aba Cotação (CotacaoTab.vue
 * / CotacaoBancoCard.vue) — valores como string (o que está digitado agora),
 * nunca persistido como está. Vive aqui, e não num dos dois componentes, pelo
 * mesmo motivo de app/types/appSelect.ts: é um contrato client-only entre dois
 * componentes, não um tipo de domínio/API (esses ficam em shared/types).
 */
export interface CotacaoDraft {
  banco: BancoCambio;
  taxaStr: string;
  corretagemStr: string;
}
