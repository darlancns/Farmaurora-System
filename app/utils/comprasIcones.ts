import { ICONES_PROCESSO } from "./processoIcones";

// Os ícones dos botões do cabeçalho da compra (Duplicar, Cancelar e Apagar). Mesmo molde dos do Follow-Up (processoIcones.ts): traço fino, viewBox 24x24,
// só <path> (os círculos viram arcos); cada chave é a lista de `d` e quem renderiza define tamanho, traço e cor. A lixeira é A MESMA do "Excluir processo".

export type ChaveIconeCompra = "duplicar" | "cancelar" | "apagar";

export const ICONES_COMPRA: Record<ChaveIconeCompra, string[]> = {
  // copiar: duas folhas (lucide copy)
  duplicar: ["M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"],
  // círculo cortado por um X (lucide circle-x)
  cancelar: ["M22 12A10 10 0 1 1 2 12a10 10 0 0 1 20 0Z", "m15 9-6 6", "m9 9 6 6"],
  // a lixeira do Follow-Up
  apagar: ICONES_PROCESSO.lixeira,
};
