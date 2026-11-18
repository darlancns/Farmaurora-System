import { describe, expect, it } from "vitest";
import type { Processo, StatusProcesso } from "#shared/types/processo";
import {
  agruparPorColuna,
  chaveDaPasta,
  colunaDoProcesso,
  COLUNAS_KANBAN,
  compararPorEntradaNaColuna,
  compararPorPasta,
  instanteDeEntradaNaColuna,
  ORDEM_POR_COLUNA,
} from "../../app/utils/processoKanban";

function proc(id: string, pasta: string, status: StatusProcesso = "em_transito"): Processo {
  return {
    id,
    paciente: `Paciente ${id}`,
    numeroRemessa: 1,
    pasta,
    empresa: "FARMAURORA",
    consultor: "Dani",
    medicamentos: [],
    status,
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "2026-10-14T00:00:00.000Z",
    updatedAt: "2026-10-14T00:00:00.000Z",
  };
}

describe("COLUNAS_KANBAN", () => {
  it("5 colunas na ordem do fluxo, com id estável e rótulo", () => {
    expect(COLUNAS_KANBAN).toEqual([
      { id: "na-origem", status: "elaboracao_fornecedores", rotulo: "Na origem" },
      { id: "em-transito", status: "em_transito", rotulo: "Em trânsito" },
      { id: "desembaraco", status: "desembaraco", rotulo: "Desembaraço" },
      { id: "liberado", status: "liberado", rotulo: "Liberado" },
      { id: "entregue", status: "entregue", rotulo: "Entregue" },
    ]);
  });

  it("colunaDoProcesso: o status; legado que escapasse cai no equivalente", () => {
    expect(colunaDoProcesso({ status: "liberado" })).toBe("liberado");
    expect(colunaDoProcesso({ status: "outro" as unknown as StatusProcesso })).toBe("desembaraco");
    expect(colunaDoProcesso({ status: "aguardando_inicio" as unknown as StatusProcesso })).toBe("elaboracao_fornecedores");
  });
});

describe("chaveDaPasta", () => {
  it("lê ano e número, tolerando espaços e hífen colado", () => {
    expect(chaveDaPasta("2026 - 366")).toMatchObject({ grupo: 0, ano: 2026, numero: 366 });
    expect(chaveDaPasta("2026-366")).toMatchObject({ grupo: 0, ano: 2026, numero: 366 });
    expect(chaveDaPasta("  2025 -9 ")).toMatchObject({ grupo: 0, ano: 2025, numero: 9 });
    expect(chaveDaPasta("2026 - 007")).toMatchObject({ grupo: 0, ano: 2026, numero: 7 });
  });

  it("fora do padrão = grupo 1; vazia ou ausente = grupo 2", () => {
    for (const p of ["ABC", "2026", "26 - 1", "2026 - 1 - 2", "2026 / 5", "2026 - X"]) {
      expect(chaveDaPasta(p).grupo, p).toBe(1);
    }
    expect(chaveDaPasta("").grupo).toBe(2);
    expect(chaveDaPasta("   ").grupo).toBe(2);
    expect(chaveDaPasta(undefined).grupo).toBe(2);
    expect(chaveDaPasta(null).grupo).toBe(2);
  });
});

describe("desempate: Pasta crescente (compararPorPasta)", () => {
  it("ano, depois número como número (9 antes de 10); fora do padrão depois; sem pasta no fim; empate pelo id", () => {
    const lista = [
      proc("z", ""),
      proc("a", "2026 - 10"),
      proc("b", "Pasta antiga"),
      proc("c", "2025 - 400"),
      proc("d2", "2026 - 9"),
      proc("d1", "2026-9"),
      proc("e", "ABC 2"),
      proc("f", "ABC 10"),
    ];
    expect([...lista].sort(compararPorPasta).map((p) => p.id)).toEqual(["c", "d1", "d2", "a", "e", "f", "b", "z"]);
  });

  it("comparação estável e simétrica", () => {
    const a = proc("a", "2026 - 1");
    const b = proc("b", "2026 - 1");
    expect(compararPorPasta(a, b)).toBeLessThan(0);
    expect(compararPorPasta(b, a)).toBeGreaterThan(0);
    expect(compararPorPasta(a, a)).toBe(0);
  });
});

describe("agruparPorColuna", () => {
  it("todas as colunas existem (mesmo vazias); cada processo cai na sua; com o mesmo instante, o desempate é a Pasta", () => {
    const lista = [
      proc("1", "2026 - 5", "entregue"),
      proc("2", "2026 - 2", "em_transito"),
      proc("3", "2026 - 1", "em_transito"),
      proc("4", "2026 - 3", "elaboracao_fornecedores"),
      proc("5", "2025 - 1", "entregue"),
    ];
    const g = agruparPorColuna(lista);
    expect(Object.keys(g)).toEqual(["elaboracao_fornecedores", "em_transito", "desembaraco", "liberado", "entregue"]);
    expect(g.elaboracao_fornecedores.map((p) => p.id)).toEqual(["4"]);
    expect(g.em_transito.map((p) => p.id)).toEqual(["3", "2"]);
    expect(g.desembaraco).toEqual([]);
    expect(g.liberado).toEqual([]);
    expect(g.entregue.map((p) => p.id)).toEqual(["5", "1"]);
  });

  it("não altera a lista de entrada", () => {
    const lista = [proc("b", "2026 - 2"), proc("a", "2026 - 1")];
    agruparPorColuna(lista);
    expect(lista.map((p) => p.id)).toEqual(["b", "a"]);
  });
});

// ── Ordem pelo MOMENTO de entrada na coluna ───────────────────────────────────────────────────────────────────
function pe(id: string, statusDesde: string | undefined, extra: Partial<Processo> = {}): Processo {
  return { ...proc(id, "2026 - 100"), statusDesde, ...extra };
}
const ids = (l: Processo[]) => l.map((p) => p.id);

describe("instanteDeEntradaNaColuna", () => {
  it("statusDesde; ausente/nulo/vazio/inválido cai em createdAt; os dois inválidos = null", () => {
    expect(instanteDeEntradaNaColuna({ statusDesde: "2026-11-18T12:00:00.000Z", createdAt: "2026-01-01T00:00:00Z" })).toBe(
      Date.parse("2026-11-18T12:00:00.000Z"),
    );
    for (const ruim of [undefined, null, "", "   ", "lixo", "2026-13-45T99:00:00Z"] as unknown as string[]) {
      expect(instanteDeEntradaNaColuna({ statusDesde: ruim, createdAt: "2026-01-01T00:00:00Z" }), String(ruim)).toBe(
        Date.parse("2026-01-01T00:00:00Z"),
      );
    }
    expect(instanteDeEntradaNaColuna({ statusDesde: "lixo", createdAt: "" })).toBeNull();
    expect(instanteDeEntradaNaColuna({ statusDesde: undefined, createdAt: "também lixo" })).toBeNull();
  });
});

describe("compararPorEntradaNaColuna", () => {
  it("o instante mais antigo vem primeiro (antigo_primeiro) e o mais novo primeiro (novo_primeiro)", () => {
    const velho = pe("velho", "2026-11-01T12:00:00.000Z");
    const novo = pe("novo", "2026-11-10T12:00:00.000Z");
    expect([novo, velho].sort((a, b) => compararPorEntradaNaColuna(a, b)).map((p) => p.id)).toEqual(["velho", "novo"]);
    expect([velho, novo].sort((a, b) => compararPorEntradaNaColuna(a, b, "novo_primeiro")).map((p) => p.id)).toEqual(["novo", "velho"]);
  });

  it("compara o INSTANTE, não o texto: fusos diferentes e frações de segundo", () => {
    // Como texto, "…09:00-03:00" vem antes de "…10:00Z", mas o instante 09:00-03:00 = 12:00Z é DEPOIS de 10:00Z.
    const brasilia = pe("brasilia", "2026-11-10T09:00:00.000-03:00"); // 12:00Z
    const utc = pe("utc", "2026-11-10T10:00:00.000Z");
    expect([brasilia, utc].sort((a, b) => compararPorEntradaNaColuna(a, b)).map((p) => p.id)).toEqual(["utc", "brasilia"]);
    // Frações de segundo (milissegundos) e o formato do Postgres (+00:00).
    const a = pe("a", "2026-11-10T12:00:00.100+00:00");
    const b = pe("b", "2026-11-10T12:00:00.020+00:00");
    const c = pe("c", "2026-11-10T12:00:00+00:00");
    expect([a, b, c].sort((x, y) => compararPorEntradaNaColuna(x, y)).map((p) => p.id)).toEqual(["c", "b", "a"]);
    // Dia 9 antes do dia 10 pelo instante.
    const d9 = pe("d9", "2026-11-09T12:00:00Z");
    const d10 = pe("d10", "2026-11-10T12:00:00Z");
    expect([d10, d9].sort((x, y) => compararPorEntradaNaColuna(x, y)).map((p) => p.id)).toEqual(["d9", "d10"]);
  });

  it("empate no instante: Pasta crescente, sem pasta no fim, depois id — nas duas direções", () => {
    const mesmo = "2026-11-10T12:00:00.000Z";
    const lista = [
      pe("sem", mesmo, { pasta: "" }),
      pe("p10", mesmo, { pasta: "2026 - 10" }),
      pe("p9b", mesmo, { pasta: "2026 - 9" }),
      pe("p9a", mesmo, { pasta: "2026 - 9" }),
      pe("p2025", mesmo, { pasta: "2025 - 400" }),
    ];
    const esperado = ["p2025", "p9a", "p9b", "p10", "sem"];
    expect(ids([...lista].sort((a, b) => compararPorEntradaNaColuna(a, b)))).toEqual(esperado);
    expect(ids([...lista].sort((a, b) => compararPorEntradaNaColuna(a, b, "novo_primeiro")))).toEqual(esperado);
  });

  it("sem statusDesde usa createdAt; os dois inválidos vão para o FIM (nas duas direções) e desempatam por Pasta/id", () => {
    const comStatus = pe("comStatus", "2026-11-12T12:00:00Z", { createdAt: "2020-01-01T00:00:00Z" });
    const soCreated = pe("soCreated", undefined, { createdAt: "2026-11-05T12:00:00Z" });
    const invalidoA = pe("invA", "lixo", { createdAt: "lixo", pasta: "2026 - 2" });
    const invalidoB = pe("invB", undefined, { createdAt: "", pasta: "2026 - 1" });
    const lista = [invalidoA, comStatus, invalidoB, soCreated];
    expect(ids([...lista].sort((a, b) => compararPorEntradaNaColuna(a, b)))).toEqual(["soCreated", "comStatus", "invB", "invA"]);
    expect(ids([...lista].sort((a, b) => compararPorEntradaNaColuna(a, b, "novo_primeiro")))).toEqual([
      "comStatus",
      "soCreated",
      "invB",
      "invA",
    ]);
  });

  it("comparação simétrica e estável", () => {
    const a = pe("a", "2026-11-10T12:00:00Z");
    const b = pe("b", "2026-11-10T12:00:00Z");
    expect(compararPorEntradaNaColuna(a, b)).toBeLessThan(0);
    expect(compararPorEntradaNaColuna(b, a)).toBeGreaterThan(0);
    expect(compararPorEntradaNaColuna(a, a)).toBe(0);
  });
});

describe("agruparPorColuna — ordem pela entrada na coluna", () => {
  it("regra por coluna: 4 colunas com o mais antigo em cima, Entregue com o mais novo em cima", () => {
    expect(ORDEM_POR_COLUNA).toEqual({
      elaboracao_fornecedores: "antigo_primeiro",
      em_transito: "antigo_primeiro",
      desembaraco: "antigo_primeiro",
      liberado: "antigo_primeiro",
      entregue: "novo_primeiro",
    });
  });

  it("cada coluna pelo instante; a Pasta não manda mais (pasta 1 entrou depois da pasta 9)", () => {
    const t = (dia: number) => `2026-11-${String(dia).padStart(2, "0")}T12:00:00.000Z`;
    const lista = [
      pe("t3", t(3), { status: "em_transito", pasta: "2026 - 1" }),
      pe("t1", t(1), { status: "em_transito", pasta: "2026 - 9" }),
      pe("t2", t(2), { status: "em_transito", pasta: "2026 - 5" }),
      pe("e1", t(1), { status: "entregue" }),
      pe("e3", t(3), { status: "entregue" }),
      pe("e2", t(2), { status: "entregue" }),
      pe("l2", t(2), { status: "liberado" }),
      pe("l1", t(1), { status: "liberado" }),
    ];
    const g = agruparPorColuna(lista);
    expect(ids(g.em_transito)).toEqual(["t1", "t2", "t3"]);
    expect(ids(g.liberado)).toEqual(["l1", "l2"]);
    expect(ids(g.entregue)).toEqual(["e3", "e2", "e1"]);
  });

  it("empate de instante: Pasta crescente (card sem Pasta no fim), depois id — também em Entregue", () => {
    const mesmo = "2026-11-10T12:00:00.000Z";
    const lista = [
      pe("sem", mesmo, { status: "desembaraco", pasta: "" }),
      pe("b", mesmo, { status: "desembaraco", pasta: "2026 - 20" }),
      pe("a", mesmo, { status: "desembaraco", pasta: "2026 - 3" }),
      pe("es", mesmo, { status: "entregue", pasta: "" }),
      pe("eb", mesmo, { status: "entregue", pasta: "2026 - 20" }),
      pe("ea", mesmo, { status: "entregue", pasta: "2026 - 3" }),
    ];
    const g = agruparPorColuna(lista);
    expect(ids(g.desembaraco)).toEqual(["a", "b", "sem"]);
    expect(ids(g.entregue)).toEqual(["ea", "eb", "es"]);
  });

  it("status legado cai na coluna normalizada e ordena lá pelo seu instante", () => {
    const lista = [
      pe("novo", "2026-11-10T12:00:00Z", { status: "desembaraco" }),
      pe("legado-outro", "2026-11-01T12:00:00Z", { status: "outro" as unknown as StatusProcesso }),
      pe("legado-parcial", "2026-11-05T12:00:00Z", { status: "liberado_parcial" as unknown as StatusProcesso }),
      pe("legado-inicio", "2026-11-02T12:00:00Z", { status: "aguardando_inicio" as unknown as StatusProcesso }),
    ];
    const g = agruparPorColuna(lista);
    expect(ids(g.desembaraco)).toEqual(["legado-outro", "legado-parcial", "novo"]);
    expect(ids(g.elaboracao_fornecedores)).toEqual(["legado-inicio"]);
  });

  it("lote carregado de uma vez (createdAt igual, sem statusDesde): a ordem é a Pasta de sempre", () => {
    const lote = "2026-11-05T10:00:00.000Z";
    const lista = [
      { ...proc("c", "2026 - 12"), createdAt: lote },
      { ...proc("a", "2026 - 3"), createdAt: lote },
      { ...proc("b", ""), createdAt: lote },
    ];
    expect(ids(agruparPorColuna(lista).em_transito)).toEqual(["a", "c", "b"]);
  });

  it("não altera a lista de entrada", () => {
    const lista = [pe("b", "2026-11-02T12:00:00Z"), pe("a", "2026-11-01T12:00:00Z")];
    agruparPorColuna(lista);
    expect(ids(lista)).toEqual(["b", "a"]);
  });
});
