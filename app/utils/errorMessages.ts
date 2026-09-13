const NETWORK_ERROR_MESSAGE = "Erro de conexão com o servidor. Tente novamente.";

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof TypeError) return NETWORK_ERROR_MESSAGE;
  if (error instanceof Error) return error.message;
  return fallback;
}

/**
 * Extrai a mensagem de erro de uma `Response` HTTP que falhou (`!res.ok`).
 * Tenta `body.statusMessage` (h3 `createError`), depois `body.message`, senão
 * o `fallback`. Nunca lança — o corpo inválido/vazio cai no fallback.
 * Padrão único usado pelos composables de dados (useContas, usePagamentos,
 * usePatients, useProcessos).
 */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { statusMessage?: string; message?: string };
  return body.statusMessage || body.message || fallback;
}
