import { describe, expect, it } from "vitest";
import {
  BANCO_FILTRO_SEM_BANCO,
  FILTROS_DIR_VAZIOS,
  agruparPorPaciente,
  aplicarFiltrosDir,
  candidatosAFechamentoRestante,
  contarFiltrosAtivos,
  contarPorBanco,
  estaNaListaFechamentosRestantes,
  nomeBasePaciente,
  resumoFechamentosRestantes,
  slugBanco,
  slugId,
  sufixoOrdemPaciente,
  textoResumoFechamentos,
  visaoFechamentosRestantes,
  type FiltrosDir,
} from "../../app/utils/dirFiltros";
import type { Dir } from "../../shared/types/dir";
import { novoDir } from "./helpers/dirFixtures";

const filtros = (parcial: Partial<FiltrosDir>): FiltrosDir => ({ ...FILTROS_DIR_VAZIOS, ...parcial });
const marcado = (extra: Partial<Dir> = {}) =>
  novoDir({ fechamentoRestante: true, fechamentoRestantePor: "Rebeca", fechamentoRestanteEm: "2026-10-27T15:30:00.000Z", ...extra });

describe("dirFiltros — filtro 'Fechamento restante: sim/não'", () => {
  const a = marcado({ po: "PO26-10-0001" });
  const b = novoDir({ po: "PO26-10-0002" });
  const c = marcado({ po: "PO26-10-0003", operacaoEncerrada: true }); // marca guardada, operação encerrada
  const lista = [a, b, c];
  const pos = (f: Partial<FiltrosDir>) => aplicarFiltrosDir(lista, filtros(f)).map((d) => d.po);

  it("sim: os marcados (inclusive o encerrado, que tem a marca guardada)", () => {
    expect(pos({ fechamentoRestante: "sim" })).toEqual(["PO26-10-0001", "PO26-10-0003"]);
  });

  it("não: os não marcados", () => {
    expect(pos({ fechamentoRestante: "nao" })).toEqual(["PO26-10-0002"]);
  });

  it("vazio não filtra; conta como filtro ativo quando preenchido", () => {
    expect(pos({})).toHaveLength(3);
    expect(contarFiltrosAtivos(filtros({ fechamentoRestante: "sim" }))).toBe(1);
  });
});

describe("dirFiltros — a visão da aba 'Fechamentos restantes'", () => {
  it("só entra PO marcado E com a operação em andamento", () => {
    const naLista = marcado({ po: "PO26-10-0001" });
    const naoMarcado = novoDir({ po: "PO26-10-0002" });
    const encerrado = marcado({ po: "PO26-10-0003", operacaoEncerrada: true });
    expect(visaoFechamentosRestantes([naLista, naoMarcado, encerrado]).map((d) => d.po)).toEqual(["PO26-10-0001"]);
    expect(estaNaListaFechamentosRestantes(naLista)).toBe(true);
    expect(estaNaListaFechamentosRestantes(naoMarcado)).toBe(false);
    expect(estaNaListaFechamentosRestantes(encerrado)).toBe(false);
  });

  it("saída AUTOMÁTICA ao encerrar a operação e retorno ao reabrir — sem apagar a marca", () => {
    const original = marcado({ po: "PO26-10-0001" });
    expect(visaoFechamentosRestantes([original])).toHaveLength(1);

    const encerrado: Dir = { ...original, operacaoEncerrada: true };
    expect(visaoFechamentosRestantes([encerrado])).toHaveLength(0); // saiu da aba
    expect(encerrado.fechamentoRestante).toBe(true); // a marca continua gravada
    expect(encerrado.fechamentoRestantePor).toBe("Rebeca");

    const reaberto: Dir = { ...encerrado, operacaoEncerrada: false };
    expect(visaoFechamentosRestantes([reaberto]).map((d) => d.po)).toEqual(["PO26-10-0001"]); // voltou
  });

  it("a visão respeita a busca e os demais filtros", () => {
    const lista = [
      marcado({ po: "PO26-10-0001", paciente: "ANA TESTE", banco: "XP" }),
      marcado({ po: "PO26-10-0002", paciente: "BETO TESTE", banco: "INTEX" }),
    ];
    const visao = (f: Partial<FiltrosDir>) => visaoFechamentosRestantes(aplicarFiltrosDir(lista, filtros(f))).map((d) => d.po);
    expect(visao({ busca: "beto" })).toEqual(["PO26-10-0002"]);
    expect(visao({ banco: "XP" })).toEqual(["PO26-10-0001"]);
    expect(visao({ banco: "Rendimento" })).toEqual([]);
  });
});

describe("dirFiltros — chips por banco", () => {
  const lista = [
    marcado({ banco: "XP" }),
    marcado({ banco: "XP" }),
    marcado({ banco: "INTEX" }),
    marcado({ banco: "Pendente" }),
    marcado({ banco: "" }),
  ];

  it("conta por banco, do maior para o menor (empate: ordem alfabética)", () => {
    const c = contarPorBanco(lista);
    expect(c.map((x) => [x.rotulo, x.quantidade])).toEqual([
      ["XP", 2],
      ["INTEX", 1],
      ["Pendente", 1],
      ["Sem banco", 1],
    ]);
    expect(c.reduce((soma, x) => soma + x.quantidade, 0)).toBe(lista.length);
  });

  it("o chip 'Sem banco' filtra pelo valor especial e casa só PO sem banco", () => {
    const sem = contarPorBanco(lista).find((x) => x.banco === "")!;
    expect(sem.valorFiltro).toBe(BANCO_FILTRO_SEM_BANCO);
    expect(aplicarFiltrosDir(lista, filtros({ banco: sem.valorFiltro }))).toHaveLength(1);
    expect(aplicarFiltrosDir(lista, filtros({ banco: "XP" }))).toHaveLength(2);
  });

  it("slug de id: sem acento, minúsculo, sem símbolos", () => {
    expect(slugBanco("Não Cotado")).toBe("nao-cotado");
    expect(slugBanco("XP")).toBe("xp");
    expect(slugBanco("")).toBe("sem-banco");
    expect(slugId("MARIA DA SILVA (3RB)", "paciente")).toBe("maria-da-silva-3rb");
    expect(slugId("", "paciente")).toBe("paciente");
  });
});

describe("dirFiltros — nome do paciente, '(N)' como escrito e agrupamento", () => {
  it('nomeBasePaciente tira só o sufixo numérico "(N)" do fim', () => {
    expect(nomeBasePaciente("ANA TESTE (5)")).toBe("ANA TESTE");
    expect(nomeBasePaciente("ANA TESTE (12) ")).toBe("ANA TESTE");
    expect(nomeBasePaciente("ANA TESTE")).toBe("ANA TESTE");
    // anotações que NÃO são "(N)" ficam no nome
    expect(nomeBasePaciente("ANA TESTE (3RB)")).toBe("ANA TESTE (3RB)");
    expect(nomeBasePaciente("ANA TESTE (Ordem 1)")).toBe("ANA TESTE (Ordem 1)");
    expect(nomeBasePaciente("ANA (2) TESTE")).toBe("ANA (2) TESTE");
  });

  it('sufixoOrdemPaciente devolve o "(N)" exatamente como escrito, ou vazio (não é campo de ordem)', () => {
    expect(sufixoOrdemPaciente("ANA TESTE (5)")).toBe("(5)");
    expect(sufixoOrdemPaciente("ANA TESTE (12)")).toBe("(12)");
    expect(sufixoOrdemPaciente("ANA TESTE")).toBe("");
    expect(sufixoOrdemPaciente("ANA TESTE (3RB)")).toBe("");
  });

  it('agrupa por paciente: "(1)" e "(2)" do mesmo nome ficam num grupo só, POs em ordem crescente', () => {
    const lista = [
      marcado({ id: "c", po: "PO26-10-0300", paciente: "CARLA TESTE" }),
      marcado({ id: "a2", po: "PO26-10-0200", paciente: "ANA TESTE (2)" }),
      marcado({ id: "a1", po: "PO26-09-0100", paciente: "ANA TESTE (1)" }),
    ];
    const grupos = agruparPorPaciente(lista);
    expect(grupos.map((g) => g.nome)).toEqual(["ANA TESTE", "CARLA TESTE"]);
    expect(grupos[0]!.registros.map((d) => d.id)).toEqual(["a1", "a2"]);
    expect(grupos[0]!.registros.map((d) => sufixoOrdemPaciente(d.paciente))).toEqual(["(1)", "(2)"]);
    expect(grupos[1]!.registros).toHaveLength(1);
  });

  it("a chave do grupo ignora acento, caixa e espaços; grupos em ordem alfabética pt-BR", () => {
    const grupos = agruparPorPaciente([
      marcado({ id: "1", paciente: "ÁGATA TESTE (1)" }),
      marcado({ id: "2", paciente: "agata teste (2)" }),
      marcado({ id: "3", paciente: "ÉRICA TESTE" }),
      marcado({ id: "4", paciente: "BEATRIZ TESTE" }),
    ]);
    expect(grupos.map((g) => g.registros.length)).toEqual([2, 1, 1]);
    expect(grupos.map((g) => g.chave)).toEqual(["agata teste", "beatriz teste", "erica teste"]);
  });

  it("anotações não numéricas separam pacientes diferentes (o '(3RB)' faz parte do nome)", () => {
    const grupos = agruparPorPaciente([marcado({ paciente: "ANA TESTE (3RB)" }), marcado({ paciente: "ANA TESTE" })]);
    expect(grupos).toHaveLength(2);
  });

  it("resumo 'n POs · m pacientes' e texto com singular/plural", () => {
    const lista = [
      marcado({ paciente: "ANA TESTE (1)" }),
      marcado({ paciente: "ANA TESTE (2)" }),
      marcado({ paciente: "BETO TESTE" }),
    ];
    expect(resumoFechamentosRestantes(lista)).toEqual({ pos: 3, pacientes: 2 });
    expect(textoResumoFechamentos({ pos: 97, pacientes: 93 })).toBe("97 POs · 93 pacientes");
    expect(textoResumoFechamentos({ pos: 1, pacientes: 1 })).toBe("1 PO · 1 paciente");
    expect(textoResumoFechamentos({ pos: 0, pacientes: 0 })).toBe("0 POs · 0 pacientes");
  });
});

describe("dirFiltros — busca para INCLUIR um paciente na lista", () => {
  const lista = [
    novoDir({ id: "1", po: "PO26-10-0001", paciente: "ANA TESTE" }),
    novoDir({ id: "2", po: "PO26-10-0002", paciente: "ANA TESTE (2)" }),
    marcado({ id: "3", po: "PO26-10-0003", paciente: "ANA TESTE (3)" }), // já incluído
    novoDir({ id: "4", po: "PO26-10-0004", paciente: "ANA TESTE (4)", operacaoEncerrada: true }), // encerrado
    novoDir({ id: "5", po: "PO26-10-0005", paciente: "BETO TESTE" }),
  ];

  it("sem busca não lista nada (a tela pede para digitar)", () => {
    expect(candidatosAFechamentoRestante(lista, "  ")).toEqual({ itens: [], total: 0 });
  });

  it("lista só POs com operação em andamento e ainda não incluídos, por paciente ou PO", () => {
    expect(candidatosAFechamentoRestante(lista, "ana").itens.map((d) => d.id)).toEqual(["2", "1"]);
    expect(candidatosAFechamentoRestante(lista, "0005").itens.map((d) => d.id)).toEqual(["5"]);
    expect(candidatosAFechamentoRestante(lista, "po26-10-0004").itens).toEqual([]); // encerrado
    expect(candidatosAFechamentoRestante(lista, "po26-10-0003").itens).toEqual([]); // já na lista
  });

  it("ignora acento e caixa", () => {
    const l = [novoDir({ id: "x", paciente: "JOSÉ TESTE" })];
    expect(candidatosAFechamentoRestante(l, "jose").itens).toHaveLength(1);
  });

  it("corta no limite e informa o total", () => {
    const muitos = Array.from({ length: 40 }, (_, i) => novoDir({ id: `m${i}`, po: `PO26-10-${String(1000 + i)}`, paciente: "MARIA TESTE" }));
    const r = candidatosAFechamentoRestante(muitos, "maria", 30);
    expect(r.itens).toHaveLength(30);
    expect(r.total).toBe(40);
  });
});
