import type { StatusDaCompra } from "#shared/constants/compra";

// Rótulos e classes da página Compras. Os tokens são os do app (main.css, @theme); as classes de campo e de fieldset vêm de
// processoFormClasses.ts (INPUT_CLASS, LABEL_CLASS, FIELDSET_CLASS, LEGEND_CLASS) e não se repetem aqui.

/** Botão primário (px-4 py-2.5, 13px, semibold). */
export const BOTAO_PRIMARIO_CLASS =
  "rounded-lg bg-accent-dark px-4 py-2.5 max-lg:min-h-11 text-[13px] font-semibold text-white transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-dark disabled:cursor-not-allowed disabled:opacity-50";

/** Botão secundário (fundo paper + borda hairline). */
export const BOTAO_SECUNDARIO_CLASS =
  "rounded-lg border border-hairline bg-paper px-4 py-2.5 max-lg:min-h-11 text-[13px] font-semibold text-ink transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-dark disabled:cursor-not-allowed disabled:opacity-50";

export const ROTULO_STATUS_COMPRA: Record<StatusDaCompra, string> = {
  rascunho: "Rascunho",
  pronta: "Pronta",
  cancelada: "Cancelada",
};

/** O selo de cada estado: Rascunho cinza, Pronta verde, Cancelada cinza riscada. */
export const CLASSE_STATUS_COMPRA: Record<StatusDaCompra, string> = {
  rascunho: "bg-hairline/50 text-ink-soft",
  pronta: "bg-green-100 text-green-800",
  cancelada: "bg-hairline/50 text-ink-soft line-through",
};

/** "1 pendência" / "N pendências"; vazio quando não há. */
export function textoPendencias(n: number): string {
  if (n <= 0) return "";
  return n === 1 ? "1 pendência" : `${n} pendências`;
}
