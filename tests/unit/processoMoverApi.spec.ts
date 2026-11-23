// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Processo } from "#shared/types/processo";
import { useProcessos } from "../../app/composables/useProcessos";

// useProcessos.moverProcesso: o corpo de POST /api/processos/:id/mover. A dataEntrega ("AAAA-MM-DD") só vai ao entregar; os
// outros destinos mandam { status, versao } como sempre. O `fetch` é simulado.

const processo = (extra: Partial<Processo> = {}): Processo => ({
  id: "p1",
  paciente: "Maria",
  numeroRemessa: 1,
  pasta: "",
  empresa: "FARMAURORA",
  consultor: "Dani",
  medicamentos: [],
  status: "liberado",
  datas: {},
  pendencias: [],
  atualizacoes: [],
  createdAt: "",
  updatedAt: "v1",
  ...extra,
});

afterEach(() => {
  vi.unstubAllGlobals();
  useProcessos().processos.value = [];
});

function simular(resposta: Processo): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => resposta }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("moverProcesso: corpo do POST /mover", () => {
  it("ao entregar leva { status, versao, dataEntrega }", async () => {
    const { moverProcesso, processos } = useProcessos();
    processos.value = [processo()];
    const f = simular(processo({ status: "entregue", datas: { dataEntrega: "2026-11-10" }, updatedAt: "v2" }));

    const atualizado = await moverProcesso("p1", "entregue", "v1", "2026-11-10");

    expect(f).toHaveBeenCalledTimes(1);
    const [url, opts] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/processos/p1/mover");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string)).toEqual({ status: "entregue", versao: "v1", dataEntrega: "2026-11-10" });
    expect(atualizado.status).toBe("entregue");
    expect(processos.value[0]!.status).toBe("entregue"); // a resposta substitui o processo (o card muda de coluna)
  });

  it("os outros destinos mandam só { status, versao } (sem a chave dataEntrega)", async () => {
    const { moverProcesso, processos } = useProcessos();
    processos.value = [processo()];
    const f = simular(processo({ status: "desembaraco", updatedAt: "v2" }));

    await moverProcesso("p1", "desembaraco", "v1");

    const [, opts] = f.mock.calls[0] as unknown as [string, RequestInit];
    const corpo = JSON.parse(opts.body as string);
    expect(corpo).toEqual({ status: "desembaraco", versao: "v1" });
    expect("dataEntrega" in corpo).toBe(false);
  });

  it("400 do servidor (data futura, aba antiga) vira ApiError com a mensagem e NADA muda na lista", async () => {
    const { moverProcesso, processos } = useProcessos();
    processos.value = [processo()];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ statusMessage: "Data de entrega: não pode ser uma data futura." }),
      })),
    );
    await expect(moverProcesso("p1", "entregue", "v1", "2099-01-01")).rejects.toMatchObject({ status: 400 });
    expect(processos.value[0]!.status).toBe("liberado");
  });
});
