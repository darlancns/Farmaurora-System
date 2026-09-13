// Numeração estável dos lotes concorrentes de uma mesma (empresa + moeda).
//
// Isolada num módulo sem dependência de Nuxt/Supabase para ser testável direto
// (o pagamentosStore, que a consome, arrasta `#imports` e não carrega no vitest).
//
// Regra (confirmada com o usuário): recebe os `numeroLote` dos lotes AINDA
// ABERTOS daquela (empresa + moeda) no momento da criação.
//  - lista vazia            → 1  (caso comum do dia a dia; e reinício após todos pagos)
//  - algum aberto           → maior numeroLote + 1
// O valor é gravado uma vez e nunca recalculado: pagar o Lote 1 não renumera o 2.
export function calcularNumeroLote(numerosAbertos: number[]): number {
  if (numerosAbertos.length === 0) return 1;
  return Math.max(...numerosAbertos) + 1;
}
