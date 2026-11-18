// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Processo } from "#shared/types/processo";
import { useChegadaAvisos } from "../../app/composables/useChegadaAvisos";
import { useProcessos } from "../../app/composables/useProcessos";
import { agruparPorColuna } from "../../app/utils/processoKanban";

// Cliente: NENHUM caminho de mudança de status atualiza o card de forma otimista. Toda mudança (arrastar/menu "Mover para…",
// formulário Editar, "Chegada confirmada") só entra no estado com o processo que o servidor devolve — que já traz o
// statusDesde novo (o gatilho do banco o grava no mesmo UPDATE). Por isso o card cai no FIM da coluna nova (no TOPO, em
// Entregue) e não na posição antiga.

function proc(id: string, extra: Partial<Processo> = {}): Processo {
  return {
    id,
    paciente: `Paciente ${id}`,
    numeroRemessa: 1,
    pasta: "2026 - 100",
    empresa: "FARMAURORA",
    consultor: "Dani",
    medicamentos: [],
    status: "em_transito",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "v1",
    statusDesde: "2026-11-01T12:00:00.000Z",
    ...extra,
  };
}

const AGORA = "2026-11-18T15:30:00.000Z";
// O que o servidor devolve depois da mudança: status novo, statusDesde novo, versão nova.
const resposta = (p: Processo, status: Processo["status"]): Processo => ({ ...p, status, statusDesde: AGORA, updatedAt: "v2" });

let chamadas: Array<{ method: string; url: string; body: Record<string, unknown> | undefined }> = [];
let responder: (url: string, method: string) => Processo | null = () => null;

beforeEach(() => {
  chamadas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      const method = opts?.method ?? "GET";
      chamadas.push({ method, url, body: opts?.body ? (JSON.parse(String(opts.body)) as Record<string, unknown>) : undefined });
      const corpo = responder(url, method);
      return { ok: true, status: 200, json: async () => corpo } as Response;
    }),
  );
  useProcessos().processos.value = [
    proc("antigo-a", { status: "desembaraco", pasta: "2026 - 9", statusDesde: "2026-11-02T12:00:00.000Z" }),
    proc("antigo-b", { status: "desembaraco", pasta: "2026 - 1", statusDesde: "2026-11-10T12:00:00.000Z" }),
    proc("alvo", { status: "em_transito", pasta: "2026 - 0", statusDesde: "2026-10-01T12:00:00.000Z" }),
    proc("entregue-1", { status: "entregue", statusDesde: "2026-11-04T12:00:00.000Z" }),
  ];
});
afterEach(() => {
  vi.unstubAllGlobals();
  useProcessos().processos.value = [];
});

const alvo = () => useProcessos().processos.value.find((p) => p.id === "alvo")!;
const colunas = () => agruparPorColuna(useProcessos().processos.value);

describe("mudança de status no cliente — o card só muda com a resposta do servidor", () => {
  it("antes da resposta o card NÃO se mexe (sem atualização otimista) e depois cai no fim da coluna nova", async () => {
    let liberar!: () => void;
    const portao = new Promise<void>((r) => (liberar = r));
    responder = () => resposta(alvo(), "desembaraco");
    const fetchOriginal = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (...args: Parameters<typeof fetch>) => {
      await portao;
      return fetchOriginal(...args);
    }));

    const promessa = useProcessos().moverProcesso("alvo", "desembaraco", "v1");
    await Promise.resolve();
    expect(alvo().status, "sem atualização otimista").toBe("em_transito");
    expect(colunas().em_transito.map((p) => p.id)).toEqual(["alvo"]);

    liberar();
    await promessa;
    expect(alvo().statusDesde).toBe(AGORA);
    expect(colunas().desembaraco.map((p) => p.id)).toEqual(["antigo-a", "antigo-b", "alvo"]);
  });

  it("mover para Entregue: o card vai para o TOPO de Entregue", async () => {
    responder = () => resposta(alvo(), "entregue");
    await useProcessos().moverProcesso("alvo", "entregue", "v1");
    expect(colunas().entregue.map((p) => p.id)).toEqual(["alvo", "entregue-1"]);
  });

  it("formulário Editar mudando o Status (PATCH): a resposta traz o statusDesde novo e o card muda de lugar", async () => {
    responder = () => resposta(alvo(), "desembaraco");
    await useProcessos().patchProcesso("alvo", { status: "desembaraco", parcial: true });
    expect(chamadas[0]).toMatchObject({ method: "PATCH", url: "/api/processos/alvo" });
    expect(chamadas[0]!.body).not.toHaveProperty("statusDesde"); // o cliente nunca manda statusDesde
    expect(colunas().desembaraco.map((p) => p.id)).toEqual(["antigo-a", "antigo-b", "alvo"]);
  });

  it("'Chegada confirmada' (Em trânsito → Desembaraço): o processo devolvido substitui o do estado e vai para o fim", async () => {
    responder = () => resposta(alvo(), "desembaraco");
    await useChegadaAvisos().confirmarChegada("alvo");
    expect(chamadas[0]).toMatchObject({ method: "POST", url: "/api/processos/alvo/chegada" });
    expect(alvo().statusDesde).toBe(AGORA);
    expect(colunas().desembaraco.map((p) => p.id)).toEqual(["antigo-a", "antigo-b", "alvo"]);
  });

  it("mudança que NÃO é de status (ex.: outro campo no PATCH) mantém o statusDesde e a posição", async () => {
    responder = () => ({ ...alvo(), numeroAwb: "ZZ999999999BR", updatedAt: "v2" });
    await useProcessos().patchProcesso("alvo", { numeroAwb: "ZZ999999999BR" });
    expect(alvo().statusDesde).toBe("2026-10-01T12:00:00.000Z");
    expect(colunas().em_transito.map((p) => p.id)).toEqual(["alvo"]);
  });
});
