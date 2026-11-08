// Máscara "9999 - 999" pro campo Pasta, tolerando 1 a 3 dígitos na segunda
// parte (um registro migrado tem só 2 dígitos, ex. "2026 - 11"). Mesmo estilo
// progressivo de maskDateDdMm em app/utils/formatters.ts (patiente), mas esse
// campo é específico de Processo — não reaproveita o de paciente.
export function maskPastaCode(rawValue: string): string {
  const digits = rawValue.replace(/\D/g, "").slice(0, 7); // 4 (ano) + até 3 (sequência)
  if (digits.length <= 4) return digits;
  const ano = digits.slice(0, 4);
  const sequencia = digits.slice(4);
  return `${ano} - ${sequencia}`;
}

// LEGADO: monta o rótulo antigo "Ordem N". O app NÃO usa mais (o campo virou Nº Remessa, em
// shared/utils/numeroRemessa.ts, e a coluna `ordem` está congelada). Fica só porque o script histórico de carga
// (scripts/migration/followUpParser.mjs) importa esta função e não pode ser alterado.
export function formatOrdemLabel(numero: string): string | undefined {
  const trimmed = String(numero).trim();
  return trimmed ? `Ordem ${trimmed}` : undefined;
}

// Capitaliza só a primeira letra da frase, sem tocar no resto do texto —
// usado no campo de nova atualização do timeline (ProcessoDetail.vue).
export function capitalizeFirstLetter(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
