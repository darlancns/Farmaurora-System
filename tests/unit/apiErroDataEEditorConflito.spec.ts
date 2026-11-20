import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, codigoDoErro } from "../../app/utils/apiFetch";
import { useCompraEditor, type ApiCompra } from "../../app/composables/useCompraEditor";
import { compraTeste } from "./helpers/encaminharFixtures";

// O `data` do erro da API (code, atual, pos) chega até a tela, e o editor abre a faixa de conflito a pedido de quem soube do 409 por outro caminho.

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

describe("editor.sinalizarConflito", () => {
  const api: ApiCompra = { obter: async (id) => ({ ...compraTeste(), id }), salvar: vi.fn(async () => compraTeste()) };

  it("para o autosave, abre o conflito (sem código) e nada local some; carregar a versão salva limpa", async () => {
    const e = useCompraEditor({ api, somenteLeitura: () => false });
    await e.carregar("cmp_teste_000001");
    e.alterar({ paciente: "TESTE EDITADO" });
    e.sinalizarConflito();
    expect(e.estado.value).toBe("conflito");
    expect(e.conflito.value).toEqual({ codigo: null, mensagem: null });
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.salvar).not.toHaveBeenCalled(); // o timer do debounce foi cancelado
    expect(e.compra.value?.paciente).toBe("TESTE EDITADO");
    await e.carregarVersaoSalva();
    expect(e.estado.value).toBe("ocioso");
    expect(e.conflito.value).toBeNull();
  });

  it("sem compra aberta não faz nada", () => {
    const e = useCompraEditor({ api, somenteLeitura: () => false });
    e.sinalizarConflito();
    expect(e.estado.value).toBe("ocioso");
    expect(e.conflito.value).toBeNull();
  });
});

