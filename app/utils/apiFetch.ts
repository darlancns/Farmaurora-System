import { readApiError, readApiErrorDetalhado } from "./errorMessages";

// Continua sendo um Error comum (quem só lê `.message` não muda) — com o status HTTP junto, pra quem
// precisa distinguir a resposta (ex.: 409 de conflito de versão).
export class ApiError extends Error {
  readonly status: number;
  /** O `data` da resposta de erro (ex.: `{ code, ... }` dos erros de Compras e dos Cadastros), quando o servidor mandou. */
  readonly data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/** O `data.code` de um erro da API (ou null): é como a tela distingue os 409 e 422 das Compras e dos Cadastros. */
export function codigoDoErro(e: unknown): string | null {
  if (!(e instanceof ApiError)) return null;
  const data = e.data;
  if (data !== null && typeof data === "object" && "code" in data && typeof (data as { code: unknown }).code === "string") return (data as { code: string }).code;
  return null;
}

export async function apiFetch<T>(url: string, opts: RequestInit | undefined, fallback: string): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const erro = await readApiErrorDetalhado(res, fallback);
    throw new ApiError(erro.mensagem, res.status, erro.data);
  }
  return (await res.json()) as T;
}

export async function deleteTolerant(url: string, fallback: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new ApiError(await readApiError(res, fallback), res.status);
}
