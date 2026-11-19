import { describe, expect, it } from "vitest";
import { FakeSupabase, TETO_LINHAS_POR_CONSULTA } from "./helpers/fakeSupabase";

// O FakeSupabase imita o PostgREST: `.range(de, ate)` é inclusivo e uma consulta devolve no máximo 1000 linhas.

function fakeComLinhas(n: number): FakeSupabase {
  const fake = new FakeSupabase();
  fake.semear(
    "t",
    Array.from({ length: n }, (_, i) => ({ id: `id_${String(i).padStart(5, "0")}` })),
  );
  return fake;
}

describe("FakeSupabase: range e teto de 1000 linhas", () => {
  it("o teto é 1000", () => {
    expect(TETO_LINHAS_POR_CONSULTA).toBe(1000);
  });

  it("um select sem range devolve só as primeiras 1000 linhas (sem erro)", async () => {
    const { data, error } = await fakeComLinhas(2500).from("t").select("*").order("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1000);
  });

  it("range(de, ate) é inclusivo e respeita a ordem", async () => {
    const { data } = await fakeComLinhas(20).from("t").select("*").order("id").range(5, 7);
    expect((data as Array<{ id: string }>).map((r) => r.id)).toEqual(["id_00005", "id_00006", "id_00007"]);
  });

  it("range maior que o teto também é cortado em 1000", async () => {
    const { data } = await fakeComLinhas(2500).from("t").select("*").order("id").range(0, 1999);
    expect(data).toHaveLength(1000);
  });

  it("paginando com range, as páginas cobrem todas as linhas sem repetir", async () => {
    const fake = fakeComLinhas(2500);
    const ids: string[] = [];
    for (let de = 0; ; de += 1000) {
      const { data } = await fake.from("t").select("*").order("id").range(de, de + 999);
      const pagina = data as Array<{ id: string }>;
      ids.push(...pagina.map((r) => r.id));
      if (pagina.length < 1000) break;
    }
    expect(ids).toHaveLength(2500);
    expect(new Set(ids).size).toBe(2500);
  });
});
