// Número como dinheiro em pt-BR, sempre com 2 casas ("1.234,56"). Mora em shared/ para o servidor e as telas (e o resumo da
// compra, shared/utils/compraResumo.ts) usarem a MESMA formatação; `formatCurrency` (app/utils/formatters.ts) delega para cá.
export function formatarValorMonetario(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
