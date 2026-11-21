import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, codigoDoErro } from "../../app/utils/apiFetch";

// O `data` do erro da API (code, atual, pos) chega até a tela (o ApiError guarda o `data` e `codigoDoErro` lê o `code`).

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function respostaDeErro(status: number, corpo: unknown): Response {
  return { ok: false, status, json: async () => corpo } as Response;
}

describe("apiFetch guarda o data do erro", () => {
  it("o ApiError traz status, mensagem e o `data` do h3 (code e o que mais vier)", async () => {
    vi.stubGlobal("fetch", async () => respostaDeErro(409, { statusMessage: "PO já existe na DIR: PO26-12-9998", data: { code: "po_ja_na_dir", pos: ["PO26-12-9998"] } }));
    const e = await apiFetch("/x", undefined, "falha").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(409);
    expect((e as ApiError).message).toBe("PO já existe na DIR: PO26-12-9998");
    expect((e as ApiError).data).toEqual({ code: "po_ja_na_dir", pos: ["PO26-12-9998"] });
    expect(codigoDoErro(e)).toBe("po_ja_na_dir");
  });

  it("sem data (ou corpo inválido): data indefinido, código null, mensagem de reserva", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 500, json: async () => Promise.reject(new Error("vazio")) }) as unknown as Response);
    const e = await apiFetch("/x", undefined, "Falha de reserva").catch((x: unknown) => x);
    expect((e as ApiError).message).toBe("Falha de reserva");
    expect((e as ApiError).data).toBeUndefined();
    expect(codigoDoErro(e)).toBeNull();
    expect(codigoDoErro(new Error("x"))).toBeNull();
    expect(codigoDoErro(new ApiError("x", 409, { atual: 1 }))).toBeNull(); // data sem code
  });
});
