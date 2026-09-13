import { readApiError } from "./errorMessages";

export async function apiFetch<T>(url: string, opts: RequestInit | undefined, fallback: string): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await readApiError(res, fallback));
  return (await res.json()) as T;
}

export async function deleteTolerant(url: string, fallback: string): Promise<void> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(await readApiError(res, fallback));
}
