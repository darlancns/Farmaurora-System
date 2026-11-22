import { createError } from "h3";

// O erro de regra das Compras e a resposta HTTP dele. Vive AQUI (e não em comprasStore.ts) para quebrar o ciclo comprasStore ↔ comprasCatalogo:
// o store importa o catálogo (validação contra os Cadastros) e o catálogo, a temperatura e o pré-cadastro precisam lançar este erro.

/** Erro de regra das Compras (409 versão, 409 id alheio, 422 referência, 503 sem número). `data` vai na resposta (ex.: a versão atual). */
export class ComprasRegraError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "ComprasRegraError";
  }
}

export function responderErroDeCompra(e: unknown): never {
  if (e instanceof ComprasRegraError) {
    throw createError({ statusCode: e.statusCode, statusMessage: e.message, ...(e.data === undefined ? {} : { data: e.data }) });
  }
  throw e;
}
