import { describe, expect, it, vi } from "vitest";
import { createRetryingFetch, ehRecusaTransitoriaDeJwt } from "../../server/utils/retryFetch";

function jwtRecusado(): Response {
  return new Response(JSON.stringify({ code: "PGRST303", message: "JWT claims validation failed" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

const ok = () => new Response(null, { status: 201 });
const URL_POST = "https://x.supabase.co/rest/v1/prestacao_pacientes?select=*";

function criar(respostas: Array<() => Response | Promise<Response>>) {
  const base = vi.fn(async (_input: unknown, _init?: unknown) => {
    const next = respostas.shift();
    if (!next) throw new Error("fetch chamado a mais");
    return next();
  });
  const log = vi.fn();
  const sleep = vi.fn(async () => undefined);
  const retrying = createRetryingFetch(base as unknown as typeof fetch, { log, sleep, delayMs: 123 });
  return { base, log, sleep, retrying };
}

describe("createRetryingFetch", () => {
  it("401 + PGRST303 em POST: repete UMA vez, com a mesma requisição, e devolve o sucesso", async () => {
    const { base, log, sleep, retrying } = criar([jwtRecusado, ok]);
    const init = { method: "POST", body: JSON.stringify({ id: "p_1" }) };

    const res = await retrying(URL_POST, init);

    expect(res.status).toBe(201);
    expect(base).toHaveBeenCalledTimes(2);
    expect(base.mock.calls[1]).toEqual(base.mock.calls[0]);
    expect(sleep).toHaveBeenCalledWith(123);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("o log traz método e caminho, nunca query, corpo ou chaves", async () => {
    const { log, retrying } = criar([jwtRecusado, ok]);
    await retrying(URL_POST, { method: "POST", body: "segredo", headers: { apikey: "sb_secret_xyz" } });

    const mensagem = String(log.mock.calls[0]![0]);
    expect(mensagem).toContain("POST /rest/v1/prestacao_pacientes");
    expect(mensagem).not.toContain("select=*");
    expect(mensagem).not.toContain("segredo");
    expect(mensagem).not.toContain("sb_secret");
  });

  it("reconhece a recusa também pelo cabeçalho proxy-status", async () => {
    const res = new Response("", { status: 401, headers: { "proxy-status": "PostgREST; error=PGRST303" } });
    expect(await ehRecusaTransitoriaDeJwt(res)).toBe(true);
  });

  it("se a segunda tentativa também for recusada, devolve essa resposta (sem terceira tentativa)", async () => {
    const { base, retrying } = criar([jwtRecusado, jwtRecusado]);
    const res = await retrying(URL_POST, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["401 sem PGRST303", () => new Response(JSON.stringify({ code: "PGRST301" }), { status: 401 })],
    ["500", () => new Response("{}", { status: 500 })],
    ["200", () => new Response("[]", { status: 200 })],
    ["409 duplicata", () => new Response(JSON.stringify({ code: "23505" }), { status: 409 })],
  ])("%s: passa direto, sem retry", async (_nome, resposta) => {
    const { base, sleep, retrying } = criar([resposta]);
    await retrying(URL_POST, { method: "POST", body: "{}" });
    expect(base).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("corpo em stream não pode ser reenviado: não repete", async () => {
    const { base, retrying } = criar([jwtRecusado]);
    const body = new ReadableStream();
    const res = await retrying(URL_POST, { method: "POST", body, duplex: "half" } as RequestInit);
    expect(res.status).toBe(401);
    expect(base).toHaveBeenCalledTimes(1);
  });
});
