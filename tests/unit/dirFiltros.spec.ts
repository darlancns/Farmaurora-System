import { describe, expect, it } from "vitest";
import {
  CHECKLIST_QUALQUER,
  FILTROS_DIR_VAZIOS,
  STATUS_SEM_STATUS,
  aplicarFiltrosDir,
  contarChecklistMarcados,
  contarFiltrosAtivos,
  contarPorPo,
  mesDoRegistro,
  mesesDisponiveis,
  ordenarPorPoDesc,
  separarAbasDir,
  valoresDistintos,
  type FiltrosDir,
} from "../../app/utils/dirFiltros";
import { novoDir } from "./helpers/dirFixtures";

const filtros = (parcial: Partial<FiltrosDir>): FiltrosDir => ({ ...FILTROS_DIR_VAZIOS, ...parcial });

describe("dirFiltros — busca", () => {
  const lista = [
    novoDir({ po: "PO26-01-0001", paciente: "João Ávila", medicamento: "ENHERTU", awb: "Lufthansa: 020-111" }),
    novoDir({ po: "PO26-01-0002", paciente: "MARIA SOUZA", medicamento: "KEYTRUDA", awb: "Emirates: 176-222" }),
  ];

  it("sem filtro devolve tudo", () => {
    expect(aplicarFiltrosDir(lista, FILTROS_DIR_VAZIOS)).toHaveLength(2);
  });

  it("busca por paciente ignorando acento e caixa", () => {
    expect(aplicarFiltrosDir(lista, filtros({ busca: "joao avila" })).map((d) => d.po)).toEqual(["PO26-01-0001"]);
  });

  it("busca por PO, medicamento e AWB", () => {
    expect(aplicarFiltrosDir(lista, filtros({ busca: "0002" })).map((d) => d.po)).toEqual(["PO26-01-0002"]);
    expect(aplicarFiltrosDir(lista, filtros({ busca: "keytruda" })).map((d) => d.po)).toEqual(["PO26-01-0002"]);
    expect(aplicarFiltrosDir(lista, filtros({ busca: "176-222" })).map((d) => d.po)).toEqual(["PO26-01-0002"]);
  });

  it("busca sem resultado", () => {
    expect(aplicarFiltrosDir(lista, filtros({ busca: "zzz" }))).toEqual([]);
  });
});

describe("dirFiltros — filtros por campo", () => {
  const a = novoDir({ po: "PO26-02-0001", responsavel: "Bruno", vendedor: "Mateus Morais", fornecedor: "Poros", banco: "XP", status: "entregue", exigencia: true, conferido: true });
  const b = novoDir({ po: "PO26-02-0002", responsavel: "Rebeca", vendedor: "ASD", fornecedor: "Pharyx", banco: "Sicoob", status: "on_going", exigencia: false, conferido: false });
  const c = novoDir({ po: "PO26-03-0003", responsavel: "", vendedor: "ASD", fornecedor: "", banco: "", status: null, exigencia: false, conferido: true, dataEmissao: "" });
  const lista = [a, b, c];
  const pos = (f: Partial<FiltrosDir>) => aplicarFiltrosDir(lista, filtros(f)).map((d) => d.po);

  it("responsável, vendedor, fornecedor e banco (igualdade exata)", () => {
    expect(pos({ responsavel: "Rebeca" })).toEqual(["PO26-02-0002"]);
    expect(pos({ vendedor: "ASD" })).toEqual(["PO26-02-0002", "PO26-03-0003"]);
    expect(pos({ fornecedor: "Poros" })).toEqual(["PO26-02-0001"]);
    expect(pos({ banco: "Sicoob" })).toEqual(["PO26-02-0002"]);
  });

  it("status, inclusive 'sem status'", () => {
    expect(pos({ status: "entregue" })).toEqual(["PO26-02-0001"]);
    expect(pos({ status: STATUS_SEM_STATUS })).toEqual(["PO26-03-0003"]);
  });

  it("exigência e conferido (sim/não)", () => {
    expect(pos({ exigencia: "sim" })).toEqual(["PO26-02-0001"]);
    expect(pos({ exigencia: "nao" })).toEqual(["PO26-02-0002", "PO26-03-0003"]);
    expect(pos({ conferido: "sim" })).toEqual(["PO26-02-0001", "PO26-03-0003"]);
    expect(pos({ conferido: "nao" })).toEqual(["PO26-02-0002"]);
  });

  it("mês: da emissão; sem emissão, o mês do número do PO", () => {
    expect(pos({ mes: "2026-10" })).toEqual(["PO26-02-0001", "PO26-02-0002"]); // fixtures emitidas em 2026-10-05
    expect(pos({ mes: "2026-03" })).toEqual(["PO26-03-0003"]); // sem emissão → PO26-03
    expect(mesDoRegistro({ dataEmissao: "", po: "PO26-03-0003" })).toBe("2026-03");
    expect(mesDoRegistro({ dataEmissao: "2026-10-05", po: "PO26-03-0003" })).toBe("2026-10");
  });

  it("combina filtros (E lógico)", () => {
    expect(pos({ vendedor: "ASD", conferido: "sim" })).toEqual(["PO26-03-0003"]);
    expect(pos({ vendedor: "ASD", banco: "XP" })).toEqual([]);
  });
});

describe("dirFiltros — checklist pendente", () => {
  const completo = novoDir({ po: "PO26-04-0001", dactes: true, dsiDirDuimp: true, logger: true, fechamento: true, numerario: true, protocoloAssinado: true, swift: true, termometro: false });
  const semFechamento = novoDir({ po: "PO26-04-0002", dactes: true, dsiDirDuimp: true, logger: true, fechamento: false, numerario: true, protocoloAssinado: true, swift: true, termometro: false });
  const vazio = novoDir({ po: "PO26-04-0003" });
  const lista = [completo, semFechamento, vazio];
  const pos = (f: FiltrosDir["checklistPendente"]) => aplicarFiltrosDir(lista, filtros({ checklistPendente: f })).map((d) => d.po);

  it("item específico: quem NÃO tem aquele item marcado", () => {
    expect(pos("fechamento")).toEqual(["PO26-04-0002", "PO26-04-0003"]);
    expect(pos("swift")).toEqual(["PO26-04-0003"]);
  });

  it("'qualquer' ignora o Termômetro (FALSO em todas as linhas da planilha)", () => {
    expect(pos(CHECKLIST_QUALQUER)).toEqual(["PO26-04-0002", "PO26-04-0003"]);
  });

  it("filtrar por Termômetro pendente ainda funciona se for pedido explicitamente", () => {
    expect(pos("termometro")).toEqual(["PO26-04-0001", "PO26-04-0002", "PO26-04-0003"]);
  });

  it("conta os itens marcados (0 a 8)", () => {
    expect(contarChecklistMarcados(completo)).toBe(7);
    expect(contarChecklistMarcados(vazio)).toBe(0);
    expect(contarChecklistMarcados({ ...completo, termometro: true })).toBe(8);
  });
});

describe("dirFiltros — abas, ordenação e contagens", () => {
  it("abas pela operação", () => {
    const lista = [novoDir({ operacaoEncerrada: false }), novoDir({ operacaoEncerrada: true }), novoDir({ operacaoEncerrada: false })];
    const { emAberto, encerradas } = separarAbasDir(lista);
    expect(emAberto).toHaveLength(2);
    expect(encerradas).toHaveLength(1);
    expect(emAberto.length + encerradas.length).toBe(lista.length);
  });

  it("ordena por PO decrescente (e id para desempatar PO repetido), sem mutar a entrada", () => {
    const lista = [
      novoDir({ id: "b", po: "PO26-03-0109" }),
      novoDir({ id: "a", po: "PO26-03-0109" }),
      novoDir({ id: "c", po: "PO26-10-0470" }),
      novoDir({ id: "d", po: "PO26-01-0001" }),
    ];
    const copia = [...lista];
    expect(ordenarPorPoDesc(lista).map((d) => d.id)).toEqual(["c", "a", "b", "d"]);
    expect(lista).toEqual(copia);
  });

  it("PO 0382 de meses diferentes ordena por texto completo", () => {
    const lista = [novoDir({ id: "x", po: "PO26-07-0382" }), novoDir({ id: "y", po: "PO26-08-0382" })];
    expect(ordenarPorPoDesc(lista).map((d) => d.id)).toEqual(["y", "x"]);
  });

  it("contarPorPo acha o PO repetido", () => {
    const mapa = contarPorPo([{ po: "PO26-03-0109" }, { po: "PO26-03-0109" }, { po: "PO26-03-0110" }]);
    expect(mapa.get("PO26-03-0109")).toBe(2);
    expect(mapa.get("PO26-03-0110")).toBe(1);
  });

  it("valores distintos e meses disponíveis", () => {
    const lista = [
      novoDir({ vendedor: "Mateus Morais", dataEmissao: "2026-10-05" }),
      novoDir({ vendedor: "ASD", dataEmissao: "2026-09-01" }),
      novoDir({ vendedor: "Mateus Morais", dataEmissao: "2026-10-20" }),
    ];
    expect(valoresDistintos(lista, "vendedor")).toEqual(["ASD", "Mateus Morais"]);
    expect(mesesDisponiveis(lista)).toEqual(["2026-10", "2026-09"]);
  });

  it("conta filtros ativos sem contar a busca", () => {
    expect(contarFiltrosAtivos(FILTROS_DIR_VAZIOS)).toBe(0);
    expect(contarFiltrosAtivos(filtros({ busca: "abc" }))).toBe(0);
    expect(contarFiltrosAtivos(filtros({ banco: "XP", exigencia: "sim", busca: "x" }))).toBe(2);
  });
});
