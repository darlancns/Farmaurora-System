import { readApiError } from "./errorMessages";

// Continua sendo um Error comum (quem só lê `.message` não muda) — com o status HTTP junto, pra quem
// precisa distinguir a resposta (ex.: 409 de conflito de versão).
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch<T>(url: string, opts: RequestInit | undefined, fallback: string): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new ApiError(await readApiError(res, fallback), res.status);
  return (await res.json()) as T;
}

export async function deleteTolerant(url: string, fallback: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new ApiError(await readApiError(res, fallback), res.status);
}
