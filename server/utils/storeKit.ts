// Boilerplate compartilhado pelos stores do servidor (patientsStore.ts,
// processosStore.ts, pagamentosStore.ts) — extraído mecanicamente na Round 2,
// sem mudar nenhuma linha de lógica de negócio.
//
// Investigação confirmou: `erro` e a lógica de `num` (antes `toNumber` em
// patients/processos, `num` em pagamentos) eram byte-a-byte idênticas nas 3
// cópias — só o NOME do segundo helper divergia entre stores, unificado aqui
// como `num`. `numOrNull` só existia em pagamentosStore.ts. O gerador de id só
// existia como helper nomeado em pagamentosStore.ts (`randomId`); em
// patients/processos o mesmo template estava inline no ponto de uso.

export function erro(acao: string, e: { message: string }): Error {
  return new Error(`Supabase: falha ao ${acao} — ${e.message}`);
}

export function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// `prefix` já inclui o "_" final (ex.: randomId("p_"), randomId("lote_")) —
// mesma convenção de sempre pros ids gerados (ex.: "p_1735999999999_ab12cd").
export function randomId(prefix: string): string {
  return `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
