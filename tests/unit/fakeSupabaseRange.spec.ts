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

// ── in, ilike, escrita em lista, unicidade no fim do comando e ordenação numérica ──────────────────────────────

describe("FakeSupabase: in, ilike, listas e unicidade", () => {
  function fake(linhas: Array<Record<string, unknown>>): FakeSupabase {
    const f = new FakeSupabase();
    f.semear("t", linhas);
    return f;
  }

  it("in(coluna, valores) filtra por qualquer um (e vale no delete)", async () => {
    const f = fake([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const { data } = await f.from("t").select("*").in("id", ["a", "c", "x"]).order("id");
    expect((data as Array<{ id: string }>).map((r) => r.id)).toEqual(["a", "c"]);
    await f.from("t").delete().in("id", ["a", "b"]);
    expect(f.linhas("t").map((r) => r.id)).toEqual(["c"]);
  });

  it("ilike ignora a caixa; % e _ são curingas; o resto é literal (inclusive . e parênteses)", async () => {
    const f = fake([{ n: "dipirona 500 mg" }, { n: "paracetamol" }, { n: "a.b(c)" }, { n: "axb(c)" }]);
    const busca = async (padrao: string) => ((await f.from("t").select("*").ilike("n", padrao)).data as Array<{ n: string }>).map((r) => r.n);
    expect(await busca("%DIPIRONA%")).toEqual(["dipirona 500 mg"]);
    expect(await busca("para%")).toEqual(["paracetamol"]);
    expect(await busca("%ceta%")).toEqual(["paracetamol"]);
    expect(await busca("a.b(c)")).toEqual(["a.b(c)"]); // o ponto é literal, não "qualquer caractere"
    expect(await busca("a_b(c)")).toEqual(["a.b(c)", "axb(c)"]);
    expect(await busca("%zzz%")).toEqual([]);
  });

  it("insert e upsert aceitam uma LISTA num comando só; o upsert atualiza por id e insere o que falta", async () => {
    const f = fake([{ id: "a", v: 1 }]);
    await f.from("t").insert([{ id: "b", v: 2 }, { id: "c", v: 3 }]);
    expect(f.linhas("t")).toHaveLength(3);
    const { data } = await f.from("t").upsert([{ id: "a", v: 10 }, { id: "d", v: 4 }], { onConflict: "id" }).select("*");
    expect(data).toHaveLength(2);
    expect(f.linhas("t").map((r) => `${r.id}=${r.v}`)).toEqual(["a=10", "b=2", "c=3", "d=4"]);
  });

  it("unicidade ligada: conferida no FIM do comando (uma troca de posições num upsert só passa); violou, o comando todo é desfeito (23505)", async () => {
    const f = fake([
      { id: "a", pai: "p", posicao: 1 },
      { id: "b", pai: "p", posicao: 2 },
    ]);
    f.unico("t", ["pai", "posicao"], "t_pai_posicao_uq");

    // Trocar as duas posições num único comando: no meio haveria duplicata, no fim não.
    const troca = await f.from("t").upsert([{ id: "a", pai: "p", posicao: 2 }, { id: "b", pai: "p", posicao: 1 }], { onConflict: "id" });
    expect(troca.error).toBeNull();
    expect(f.linhas("t").map((r) => `${r.id}${r.posicao}`)).toEqual(["a2", "b1"]);

    // Duas escritas em comandos separados deixam duplicata no meio: a primeira já viola.
    const um = await f.from("t").update({ posicao: 1 }).eq("id", "a");
    expect(um.error).toMatchObject({ code: "23505" });
    expect(um.error?.message).toContain("t_pai_posicao_uq");
    expect(f.linhas("t").map((r) => `${r.id}${r.posicao}`)).toEqual(["a2", "b1"]); // desfeito

    // Linhas com coluna nula não contam como duplicadas.
    f.semear("t", [{ id: "n1", pai: null, posicao: 1 }, { id: "n2", pai: null, posicao: 1 }]);
    expect((await f.from("t").insert({ id: "n3", pai: null, posicao: 1 })).error).toBeNull();
  });

  it("order por coluna numérica é NUMÉRICO (10 vem depois de 9)", async () => {
    const f = fake([{ n: 9 }, { n: 10 }, { n: 2 }]);
    const { data } = await f.from("t").select("*").order("n", { ascending: false });
    expect((data as Array<{ n: number }>).map((r) => r.n)).toEqual([10, 9, 2]);
  });
});
