/**
 * `fetch` com um único retry para a recusa transitória de JWT do gateway do
 * Supabase (401 + PGRST303 — "JWT claims validation failed").
 *
 * Por que é seguro para qualquer método (inclusive POST/PATCH): o PostgREST
 * recusa a requisição ANTES de executar o comando, então nada foi gravado e
 * repetir não duplica nada. Qualquer outro status (inclusive outro 401) passa
 * direto, sem retry. O log traz só método e caminho — nunca chaves nem corpo.
 */

const RETRY_JWT_DELAY_MS = 250;

type FetchLike = typeof fetch;

interface RetryOptions {
  delayMs?: number;
  log?: (message: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

const PGRST303 = "PGRST303";

export async function ehRecusaTransitoriaDeJwt(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  if ((res.headers.get("proxy-status") ?? "").includes(PGRST303)) return true;
  try {
    const body = (await res.clone().json()) as { code?: unknown };
    return body.code === PGRST303;
  } catch {
    return false;
  }
}

// Corpo em stream só pode ser lido uma vez: não dá pra reenviar, então não repete.
function corpoPodeSerReenviado(init: RequestInit | undefined): boolean {
  const body = init?.body;
  return !(typeof ReadableStream !== "undefined" && body instanceof ReadableStream);
}

function descrever(input: Parameters<FetchLike>[0], init: RequestInit | undefined): string {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let caminho = raw;
  try {
    caminho = new URL(raw).pathname;
  } catch {
    // URL relativa ou inválida: loga como veio, sem query.
    caminho = raw.split("?")[0] ?? raw;
  }
  const metodo = init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");
  return `${metodo} ${caminho}`;
}

export function createRetryingFetch(baseFetch: FetchLike, options: RetryOptions = {}): FetchLike {
  const delayMs = options.delayMs ?? RETRY_JWT_DELAY_MS;
  const log = options.log ?? ((message: string) => console.warn(message));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  return async (input, init) => {
    const first = await baseFetch(input, init);
    if (!corpoPodeSerReenviado(init) || !(await ehRecusaTransitoriaDeJwt(first))) return first;

    log(`[supabase] 401 PGRST303 em ${descrever(input, init)}; repetindo uma vez em ${delayMs}ms`);
    await first.body?.cancel().catch(() => undefined);
    await sleep(delayMs);
    return baseFetch(input, init);
  };
}
