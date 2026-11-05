import { describe, expect, it } from "vitest";
import type { GrupoPagamento } from "#shared/types/Pagamento";
import { aplicarGrupoNaLista } from "../../app/utils/gruposLista";

function grupo(id: string, createdAt: string, extra: Partial<GrupoPagamento> = {}): GrupoPagamento {
  return {
    id,
    tipo: "DESPACHANTE",
    data: "2026-11-05",
    empresa: "FARMAURORA",
    nomeGrupo: "Grupo",
    itens: [],
    realizado: false,
    pagoEm: null,
    createdAt,
    ...extra,
  };
}

describe("aplicarGrupoNaLista", () => {
  const a = grupo("grp_a", "2026-11-05T12:00:00+00:00");
  const b = grupo("grp_b", "2026-11-04T12:00:00+00:00");
  const c = grupo("grp_c", "2026-11-03T12:00:00+00:00");

  it("troca o grupo existente no mesmo lugar, sem mexer nos outros nem na ordem", () => {
    const novo = grupo("grp_b", "2026-11-04T12:00:00+00:00", { nomeGrupo: "Editado" });
    const lista = [a, b, c];
    const r = aplicarGrupoNaLista(lista, novo);
    expect(r.map((g) => g.id)).toEqual(["grp_a", "grp_b", "grp_c"]);
    expect(r[1]).toBe(novo);
    expect(r[0]).toBe(a);
    expect(r[2]).toBe(c);
  });

  it("não muta a lista recebida", () => {
    const lista = [a, b];
    const r = aplicarGrupoNaLista(lista, grupo("grp_b", b.createdAt, { nomeGrupo: "X" }));
    expect(r).not.toBe(lista);
    expect(lista[1]).toBe(b);
  });

  it("grupo novo (mais recente) vai para o topo, como o servidor ordena", () => {
    const novo = grupo("grp_n", "2026-11-06T09:00:00+00:00");
    expect(aplicarGrupoNaLista([a, b, c], novo).map((g) => g.id)).toEqual(["grp_n", "grp_a", "grp_b", "grp_c"]);
  });

  it("grupo novo vai para a posição certa mesmo que a lista local esteja defasada", () => {
    const novo = grupo("grp_m", "2026-11-04T18:00:00+00:00");
    expect(aplicarGrupoNaLista([a, b, c], novo).map((g) => g.id)).toEqual(["grp_a", "grp_m", "grp_b", "grp_c"]);
  });

  it("empate de created_at desempata por id crescente", () => {
    const mesmo = "2026-11-05T12:00:00+00:00";
    const x = grupo("grp_x", mesmo);
    const y = grupo("grp_y", mesmo);
    expect(aplicarGrupoNaLista([y], x).map((g) => g.id)).toEqual(["grp_x", "grp_y"]);
  });

  it("lista vazia recebe o grupo", () => {
    expect(aplicarGrupoNaLista([], a)).toEqual([a]);
  });
});
