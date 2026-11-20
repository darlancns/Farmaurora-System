import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dir } from "../../shared/types/dir";
import { invalidarCacheDir, useDir } from "../../app/composables/useDir";
import { novoDir } from "./helpers/dirFixtures";

// useDir guarda a lista e só relê depois de 5 s. O Encaminhar da Compra cria linhas na DIR por fora da página: invalidarDir faz a PRÓXIMA leitura ir ao
// servidor, para a linha nova aparecer ao abrir /dir. Dados fictícios (TESTE).

let servidor: Dir[] = [];
const fetchFalso = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => servidor }) as Response);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-12-01T12:00:00.000Z"));
  servidor = [];
  fetchFalso.mockClear();
  vi.stubGlobal("fetch", fetchFalso);
  invalidarCacheDir();
  useDir().registros.value = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("cache de 5 s e invalidação", () => {
  it("sem invalidar, a segunda leitura dentro de 5 s NÃO vai ao servidor (o cache de sempre)", async () => {
    const { fetchDir } = useDir();
    await fetchDir();
    await fetchDir();
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-12-01T12:00:06.000Z"));
    await fetchDir();
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("invalidarDir: a leitura seguinte vai ao servidor mesmo dentro dos 5 s e traz a linha nova", async () => {
    const { fetchDir, invalidarDir, registros } = useDir();
    await fetchDir();
    expect(registros.value).toEqual([]);
    servidor = [novoDir({ id: "dir_ord_teste_0001", po: "PO26-12-9998", paciente: "TESTE PACIENTE" })];
    invalidarDir();
    await fetchDir();
    expect(fetchFalso).toHaveBeenCalledTimes(2);
    expect(registros.value.map((d) => d.po)).toEqual(["PO26-12-9998"]);
  });

  it("a função solta (invalidarCacheDir) faz o mesmo para quem não está num componente", async () => {
    const { fetchDir } = useDir();
    await fetchDir();
    invalidarCacheDir();
    await fetchDir();
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it("uma leitura que já estava VOANDO quando se invalidou não grava a lista velha por cima da nova", async () => {
    const { fetchDir, invalidarDir, registros } = useDir();
    let soltarVelha: (r: Dir[]) => void = () => undefined;
    fetchFalso.mockImplementationOnce(() => new Promise((r) => (soltarVelha = (lista) => r({ ok: true, status: 200, json: async () => lista } as Response))));
    const velha = fetchDir();
    servidor = [novoDir({ id: "dir_nova", po: "PO26-12-9999" })];
    invalidarDir();
    await fetchDir(); // a leitura nova (a mesma lista que o servidor tem agora)
    expect(registros.value.map((d) => d.po)).toEqual(["PO26-12-9999"]);
    soltarVelha([]); // a velha chega depois, com a lista de antes
    await velha;
    expect(registros.value.map((d) => d.po)).toEqual(["PO26-12-9999"]);
  });

  it("dá erro depois de invalidar: o erro é mostrado (e a lista anterior continua)", async () => {
    const { fetchDir, invalidarDir, registros, error } = useDir();
    servidor = [novoDir({ id: "dir_a", po: "PO26-12-0001" })];
    await fetchDir();
    invalidarDir();
    fetchFalso.mockImplementationOnce(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response);
    await fetchDir();
    expect(error.value).toBe("Falha ao carregar a DIR.");
    expect(registros.value.map((d) => d.po)).toEqual(["PO26-12-0001"]);
  });
});
