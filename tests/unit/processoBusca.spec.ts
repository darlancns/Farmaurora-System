import { describe, expect, it } from "vitest";
import type { ConsultorProcesso, Processo } from "#shared/types/processo";
import {
  LIMITE_DETALHES_AUTOMATICOS,
  assinaturaDeResultados,
  avancarAberturaPorBusca,
  calcularAberturaAutomatica,
  criarTermoBusca,
  filtrarPorBusca,
  normalizarPasta,
  pastaCombina,
  processoCombinaBusca,
  type EstadoAbertura,
  type PassoBusca,
} from "../../app/utils/processoBusca";

// Busca em Processos (paciente OU pasta) e a abertura automática de grupos e detalhes (regra dos 5).

function proc(id: string, consultor: ConsultorProcesso, paciente: string, pasta = "2026 - 100"): Processo {
  return {
    id,
    paciente,
    pasta,
    empresa: "FARMAURORA",
    consultor,
    medicamentos: [],
    status: "em_transito",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "",
    updatedAt: "",
  };
}

const ids = (lista: readonly Processo[]) => lista.map((p) => p.id);
const vazio = (): EstadoAbertura => ({ grupos: new Set(), detalhes: new Set() });
const estado = (grupos: string[], detalhes: string[]): EstadoAbertura => ({
  grupos: new Set(grupos),
  detalhes: new Set(detalhes),
});
const lista = (e: EstadoAbertura) => ({ grupos: [...e.grupos].sort(), detalhes: [...e.detalhes].sort() });

describe("normalizarPasta / pastaCombina", () => {
  it("espaços e hífens são ignorados", () => {
    for (const v of ["2026 - 375", "2026-375", "2026 375", "2026  -  375", " 2026-375 ", "2026–375", "2026 — 375"]) {
      expect(normalizarPasta(v), v).toBe("2026375");
    }
  });

  it.each([
    ["2026 - 375"],
    ["2026-375"],
    ["2026 375"],
    ["375"],
    ["26 - 375"],
    ["6-375"],
    ["2026"],
  ])("%j acha a pasta '2026 - 375'", (termo) => {
    expect(pastaCombina("2026 - 375", termo)).toBe(true);
  });

  it.each([["376"], ["2025 - 375"], ["3750"], ["999"], ["maria"]])("%j NÃO acha a pasta '2026 - 375'", (termo) => {
    expect(pastaCombina("2026 - 375", termo)).toBe(false);
  });

  it("termo só de espaços/hífens não casa com pasta nenhuma", () => {
    expect(pastaCombina("2026 - 375", " - ")).toBe(false);
    expect(pastaCombina("2026 - 375", "")).toBe(false);
  });

  it("pasta com 2 dígitos na sequência ('2026 - 11') também é achada", () => {
    expect(pastaCombina("2026 - 11", "2026-11")).toBe(true);
    expect(pastaCombina("2026 - 11", "11")).toBe(true);
  });
});

describe("busca por paciente OU pasta", () => {
  const lote = [
    proc("1", "Dani", "Maria da Silva", "2026 - 375"),
    proc("2", "Dani", "João Álvares", "2026 - 12"),
    proc("3", "Bolívar", "Élida Souza", "2025 - 375"),
  ];

  it("paciente: sem acento e sem diferença de maiúscula, como antes", () => {
    expect(ids(filtrarPorBusca(lote, "MARIA"))).toEqual(["1"]);
    expect(ids(filtrarPorBusca(lote, "joao alvares"))).toEqual(["2"]);
    expect(ids(filtrarPorBusca(lote, "elida"))).toEqual(["3"]);
    expect(ids(filtrarPorBusca(lote, "ÉLIDA"))).toEqual(["3"]);
  });

  it("pasta: variações de digitação", () => {
    expect(ids(filtrarPorBusca(lote, "2026 - 375"))).toEqual(["1"]);
    expect(ids(filtrarPorBusca(lote, "2026-375"))).toEqual(["1"]);
    expect(ids(filtrarPorBusca(lote, "2026 375"))).toEqual(["1"]);
    expect(ids(filtrarPorBusca(lote, "375"))).toEqual(["1", "3"]);
    expect(ids(filtrarPorBusca(lote, "2026"))).toEqual(["1", "2"]);
  });

  it("paciente e pasta somam (OU)", () => {
    const misto = [proc("a", "Dani", "Paciente 375", "2026 - 1"), proc("b", "Dani", "Outro", "2026 - 375")];
    expect(ids(filtrarPorBusca(misto, "375"))).toEqual(["a", "b"]);
  });

  it("sem termo (vazio ou só espaços), devolve a lista inteira", () => {
    expect(filtrarPorBusca(lote, "")).toBe(lote);
    expect(filtrarPorBusca(lote, "   ")).toBe(lote);
  });

  it("nenhum resultado", () => {
    expect(filtrarPorBusca(lote, "zzz")).toEqual([]);
  });

  it("criarTermoBusca: null sem busca; guarda o texto, a pasta e a ordem já normalizados", () => {
    expect(criarTermoBusca("  ")).toBeNull();
    expect(criarTermoBusca("2026 - 375")).toEqual({ texto: "2026 - 375", pasta: "2026375", ordem: "2026375" });
    expect(criarTermoBusca("-")).toEqual({ texto: "-", pasta: "", ordem: "" });
  });

  it("termo só de hífen não casa com pasta (mas pode casar com um nome com hífen)", () => {
    const termo = criarTermoBusca("-")!;
    expect(processoCombinaBusca(proc("x", "Dani", "Ana Paula", "2026 - 1"), termo)).toBe(false);
    expect(processoCombinaBusca(proc("y", "Dani", "Ana-Paula", "2026 - 1"), termo)).toBe(true);
  });
});

describe("calcularAberturaAutomatica — regra dos 5", () => {
  const mk = (n: number, consultor: ConsultorProcesso = "Dani") =>
    Array.from({ length: n }, (_, i) => proc(`${consultor}-${i}`, consultor, `Paciente ${i}`));

  it("o limite é 5", () => {
    expect(LIMITE_DETALHES_AUTOMATICOS).toBe(5);
  });

  it("0 resultados: nada abre", () => {
    expect(calcularAberturaAutomatica([], true)).toEqual({ grupos: [], detalhes: [] });
  });

  it("1 resultado: o grupo e o detalhe abrem", () => {
    const [p] = mk(1);
    expect(calcularAberturaAutomatica([p!], true)).toEqual({ grupos: ["Dani"], detalhes: [p!.id] });
  });

  it("5 resultados: grupo e os 5 detalhes", () => {
    const r = mk(5);
    expect(calcularAberturaAutomatica(r, true)).toEqual({ grupos: ["Dani"], detalhes: ids(r) });
  });

  it("6 resultados: só o grupo, detalhes fechados", () => {
    const r = mk(6);
    expect(calcularAberturaAutomatica(r, true)).toEqual({ grupos: ["Dani"], detalhes: [] });
  });

  it("vários consultores: abre TODOS os grupos que têm resultado; o total (e não o de cada grupo) decide os detalhes", () => {
    const r = [...mk(2, "Dani"), ...mk(2, "Bolívar"), ...mk(1, "Flávia")];
    const auto = calcularAberturaAutomatica(r, true);
    expect([...auto.grupos].sort()).toEqual(["Bolívar", "Dani", "Flávia"]);
    expect(auto.detalhes).toHaveLength(5); // total 5 → todos os detalhes

    const seis = [...r, ...mk(1, "Dani").map((p) => ({ ...p, id: "extra" }))];
    expect(calcularAberturaAutomatica(seis, true).detalhes).toEqual([]);
    expect([...calcularAberturaAutomatica(seis, true).grupos].sort()).toEqual(["Bolívar", "Dani", "Flávia"]);
  });

  it("consultor sem resultado não entra", () => {
    const auto = calcularAberturaAutomatica(mk(3, "Dani"), true);
    expect(auto.grupos).toEqual(["Dani"]);
    expect(auto.grupos).not.toContain("Bolívar");
  });

  it("lista plana (cargo consultor) e aba Entregues: sem grupos; só a regra dos 5", () => {
    const tres = mk(3);
    expect(calcularAberturaAutomatica(tres, false)).toEqual({ grupos: [], detalhes: ids(tres) });
    expect(calcularAberturaAutomatica(mk(6), false)).toEqual({ grupos: [], detalhes: [] });
  });
});

describe("avancarAberturaPorBusca — digitar, mudar resultados, limpar", () => {
  const A = proc("a", "Dani", "Maria Alves");
  const B = proc("b", "Bolívar", "Maria Bastos");
  const C = proc("c", "Dani", "Mariana Costa");

  function passo(termo: string, encontrados: Processo[], anterior: PassoBusca, agrupado = true): PassoBusca {
    return avancarAberturaPorBusca({
      termo,
      encontrados,
      agrupado,
      atual: anterior.estado,
      snapshot: anterior.snapshot,
      assinatura: anterior.assinatura,
    });
  }
  const inicio = (e: EstadoAbertura = vazio()): PassoBusca => ({ estado: e, snapshot: null, assinatura: null });

  it("sem busca e sem instantâneo: o estado fica como está", () => {
    const e = estado(["Dani"], ["a"]);
    const p = passo("", [A], inicio(e));
    expect(p.estado).toBe(e);
    expect(p.snapshot).toBeNull();
    expect(p.assinatura).toBeNull();
  });

  it("primeira digitação: guarda o instantâneo e abre os grupos e detalhes da regra", () => {
    const antes = estado(["Flávia"], ["z"]);
    const p = passo("maria", [A, B], inicio(antes));

    expect(lista(p.snapshot!)).toEqual({ grupos: ["Flávia"], detalhes: ["z"] });
    expect(lista(p.estado)).toEqual({ grupos: ["Bolívar", "Dani", "Flávia"], detalhes: ["a", "b"] });
  });

  it("apagar a busca restaura EXATAMENTE o estado de antes de digitar", () => {
    const antes = estado(["Flávia"], ["z"]);
    const digitando = passo("maria", [A, B], inicio(antes));
    const limpo = passo("", [A, B, C], digitando);

    expect(lista(limpo.estado)).toEqual({ grupos: ["Flávia"], detalhes: ["z"] });
    expect(limpo.snapshot).toBeNull();
    expect(limpo.assinatura).toBeNull();
  });

  it("restaurar vale mesmo depois de escolhas manuais e de vários resultados diferentes", () => {
    const antes = estado([], []);
    let p = passo("m", [A, B, C], inicio(antes));
    p = { ...p, estado: estado(["Dani"], []) }; // a pessoa fechou um grupo e um detalhe à mão
    p = passo("ma", [A], p);
    p = passo("", [A, B, C], p);
    expect(lista(p.estado)).toEqual({ grupos: [], detalhes: [] });
  });

  it("o instantâneo é guardado só na PRIMEIRA digitação (não é sobrescrito pelas seguintes)", () => {
    const antes = estado(["Flávia"], []);
    let p = passo("m", [A, B, C], inicio(antes));
    const snap = p.snapshot;
    p = passo("ma", [A, B], p);
    expect(p.snapshot).toBe(snap);
    p = passo("mar", [A], p);
    expect(lista(p.snapshot!)).toEqual({ grupos: ["Flávia"], detalhes: [] });
  });

  it("digitar mais uma letra que NÃO muda os resultados mantém as escolhas manuais", () => {
    let p = passo("mar", [A, B], inicio());
    p = { ...p, estado: estado(["Bolívar"], ["a"]) }; // fechou o grupo Dani e o detalhe de b à mão
    const depois = passo("mari", [A, B], p); // mesmos resultados
    expect(depois.estado).toBe(p.estado);
    expect(lista(depois.estado)).toEqual({ grupos: ["Bolívar"], detalhes: ["a"] });
  });

  it("quando o conjunto de resultados MUDA, a regra automática é reaplicada (escolhas manuais caem)", () => {
    let p = passo("mar", [A, B, C], inicio());
    p = { ...p, estado: estado([], []) }; // fechou tudo à mão
    const depois = passo("mari", [A, C], p);
    expect(lista(depois.estado)).toEqual({ grupos: ["Dani"], detalhes: ["a", "c"] });
  });

  it("reaplicar não fecha grupos que já estavam abertos e não têm resultado agora", () => {
    let p = passo("mar", [A, B], inicio(estado(["Flávia"], [])));
    p = passo("alves", [A], p);
    expect([...p.estado.grupos].sort()).toEqual(["Bolívar", "Dani", "Flávia"]);
    expect([...p.estado.detalhes]).toEqual(["a"]); // os detalhes seguem exatamente a regra
  });

  it("passar de 5 para 6 resultados fecha os detalhes; voltar a 5 abre de novo", () => {
    const cinco = Array.from({ length: 5 }, (_, i) => proc(`p${i}`, "Dani", `Maria ${i}`));
    const seis = [...cinco, proc("p5", "Dani", "Maria 5")];
    let p = passo("maria", cinco, inicio());
    expect(p.estado.detalhes.size).toBe(5);
    p = passo("maria", seis, p);
    expect(p.estado.detalhes.size).toBe(0);
    expect([...p.estado.grupos]).toEqual(["Dani"]);
    p = passo("maria", cinco, p);
    expect(p.estado.detalhes.size).toBe(5);
  });

  it("zero resultados é um conjunto como outro qualquer (e restaura ao limpar)", () => {
    const antes = estado(["Dani"], ["a"]);
    let p = passo("zzz", [], inicio(antes));
    expect(lista(p.estado)).toEqual({ grupos: ["Dani"], detalhes: [] });
    p = passo("", [], p);
    expect(lista(p.estado)).toEqual({ grupos: ["Dani"], detalhes: ["a"] });
  });

  it("termo só de espaços conta como sem busca", () => {
    const antes = estado(["Dani"], []);
    let p = passo("a", [A], inicio(antes));
    p = passo("   ", [A, B, C], p);
    expect(lista(p.estado)).toEqual({ grupos: ["Dani"], detalhes: [] });
  });

  it("aba Entregues / lista plana: só detalhes", () => {
    const antes = estado([], []);
    const p = passo("maria", [A, B], inicio(antes), false);
    expect(lista(p.estado)).toEqual({ grupos: [], detalhes: ["a", "b"] });
  });

  it("a assinatura identifica o conjunto (e o modo), não o texto", () => {
    expect(assinaturaDeResultados([A, B], true)).toBe(assinaturaDeResultados([A, B], true));
    expect(assinaturaDeResultados([A, B], true)).not.toBe(assinaturaDeResultados([A], true));
    expect(assinaturaDeResultados([A], true)).not.toBe(assinaturaDeResultados([A], false));
  });
});
