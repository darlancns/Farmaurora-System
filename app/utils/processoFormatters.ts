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

const ORDEM_LABEL_RE = /^Ordem\s*(\d+)$/i;

// Processo.ordem guarda o rótulo completo ("Ordem 2"), mas o form edita só o
// número via input type="number" (mesmo padrão do campo Remessas de paciente,
// spinner nativo). Estas duas funções convertem entre as duas representações.
export function parseOrdemNumero(ordem: string | undefined): string {
  if (!ordem) return "";
  const match = ordem.match(ORDEM_LABEL_RE);
  return match ? match[1]! : "";
}

export function formatOrdemLabel(numero: string): string | undefined {
  // O input é type="number" — o Vue 3.4+ converte o v-model pra number em
  // runtime mesmo o campo sendo tipado como string aqui (mesmo bug já visto
  // em PatientForm.vue pra remessas/qtd), então nunca confiamos no tipo
  // declarado e coagimos explicitamente com String() antes de usar métodos
  // de string.
  const trimmed = String(numero).trim();
  return trimmed ? `Ordem ${trimmed}` : undefined;
}

// Máscara progressiva "DD/MM" pros campos da caixinha de Datas. Só entra em
// ação enquanto o valor inteiro do campo for só dígitos (0 a 4) — ou seja,
// enquanto o usuário está digitando uma data do zero. No momento em que o
// valor passa a ter uma "/" (a própria máscara já inseriu, ou o usuário
// colou/digitou algo com barra) ou qualquer caractere não numérico, para de
// mexer e devolve o valor como veio — esses campos continuam texto livre
// (dados reais têm "07/01/2027", "05/09 (China adiantou o processo)", "ASD",
// "já tem" etc., e não podemos arriscar truncar isso ao editar).
export function maskDataDDMM(rawValue: string): string {
  if (!/^\d{0,4}$/.test(rawValue)) return rawValue;
  if (rawValue.length <= 2) return rawValue;
  return `${rawValue.slice(0, 2)}/${rawValue.slice(2)}`;
}

// Capitaliza só a primeira letra da frase, sem tocar no resto do texto —
// usado no campo de nova atualização do timeline (ProcessoDetail.vue).
export function capitalizeFirstLetter(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
