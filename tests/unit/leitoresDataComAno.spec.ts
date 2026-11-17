import { describe, expect, it } from "vitest";
import type { Processo } from "../../shared/types/processo";
import { avisoChegadaDevido, interpretarDataChegadaPrevista } from "../../shared/utils/avisoChegada";
import { parseDataBR } from "../../shared/utils/dataBrasilia";
import {
  calcularNotificacoesFornecedor,
  interpretarDataCompra,
  interpretarDataEmbarque,
} from "../../app/utils/prazoFornecedor";
import { calcularNotificacoesMandado, interpretarRegistroLpco } from "../../app/utils/prazoMandado";
import { dataDePrevisao, ordenarPorPrevisaoEntrega } from "../../app/utils/ordenarPorPrevisao";
import { camposDatas } from "../../app/utils/processoPainel";
import { getPatientMonthKey } from "../../app/utils/monthGroups";

// Com o ano automático, os valores NOVOS das datas do Follow-Up (e a data de /prestacao) chegam como "DD/MM/AAAA";
// os ANTIGOS continuam "DD/MM" (e com anotação). Todos os leitores entendem os dois: com ano explícito vale o ano;
// sem ano, a heurística de cada um, como antes. "Agora" é um instante fixo (independe do fuso da máquina).

// 17/11/2026 12:00 em Brasília (15:00 UTC).
const AGORA = new Date("2026-11-17T15:00:00Z");
// 05/01/2027 12:00 em Brasília — logo depois da virada do ano.
const JANEIRO = new Date("2027-01-05T15:00:00Z");

function processo(extra: Partial<Processo> & { datas?: Processo["datas"] } = {}): Processo {
  return {
    id: "p1",
    paciente: "Fulano",
    numeroRemessa: 1,
    pasta: "2026 - 1",
    empresa: "FARMAURORA",
    consultor: "Dani",
    medicamentos: [],
    status: "em_transito",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...extra,
  };
}

describe("parseDataBR", () => {
  it("DD/MM/AAAA: o ano do texto; DD/MM: o ano corrente de Brasília", () => {
    expect(parseDataBR("22/10/2027", AGORA)).toBe("2027-10-22");
    expect(parseDataBR("22/10", AGORA)).toBe("2026-10-22");
  });
});

describe("Chegou? (avisoChegada.ts)", () => {
  it("interpreta os dois formatos", () => {
    expect(interpretarDataChegadaPrevista("10/11/2026", AGORA)).toBe("2026-11-10");
    expect(interpretarDataChegadaPrevista("10/11", AGORA)).toBe("2026-11-10");
    // virada do ano: com ano vale o ano; sem ano, a ocorrência mais próxima (como antes)
    expect(interpretarDataChegadaPrevista("30/12/2026", JANEIRO)).toBe("2026-12-30");
    expect(interpretarDataChegadaPrevista("30/12", JANEIRO)).toBe("2026-12-30");
    expect(interpretarDataChegadaPrevista("30/12/2027", JANEIRO)).toBe("2027-12-30");
  });

  it("aviso devido igual nos dois formatos; ano futuro explícito não avisa", () => {
    const com = avisoChegadaDevido(processo({ datas: { dataChegadaBrasil: "10/11/2026" } }), AGORA);
    const sem = avisoChegadaDevido(processo({ datas: { dataChegadaBrasil: "10/11" } }), AGORA);
    expect(com).toEqual(sem);
    expect(com.devido).toBe(true);
    expect(com.diasAtraso).toBe(7);
    expect(avisoChegadaDevido(processo({ datas: { dataChegadaBrasil: "10/11/2027" } }), AGORA).devido).toBe(false);
  });
});

describe("Fornecedor (prazoFornecedor.ts)", () => {
  it("data de compra: ano explícito respeitado mesmo na virada (sem ano, a regra dos 60 dias)", () => {
    expect(interpretarDataCompra("01/11/2026", AGORA)).toBe("2026-11-01");
    expect(interpretarDataCompra("01/11", AGORA)).toBe("2026-11-01");
    expect(interpretarDataCompra("28/12/2026", JANEIRO)).toBe("2026-12-28");
    expect(interpretarDataCompra("28/12", JANEIRO)).toBe("2026-12-28");
  });

  it("embarque: os dois formatos", () => {
    expect(interpretarDataEmbarque("20/11/2026", AGORA)).toBe("2026-11-20");
    expect(interpretarDataEmbarque("20/11", AGORA)).toBe("2026-11-20");
  });

  it("alerta igual nos dois formatos", () => {
    const base = { status: "elaboracao_fornecedores" as const, fornecedor: "Poros - Turquia" };
    const com = calcularNotificacoesFornecedor([processo({ ...base, datas: { dataCompraPO: "01/11/2026" } })], AGORA);
    const sem = calcularNotificacoesFornecedor([processo({ ...base, datas: { dataCompraPO: "01/11" } })], AGORA);
    expect(com).toEqual(sem);
    expect(com[0]?.diasDeAtraso).toBe(13);
  });
});

describe("Mandado (prazoMandado.ts)", () => {
  it("registro do LPCO: os dois formatos; ano explícito respeitado na virada", () => {
    expect(interpretarRegistroLpco("01/11/2026", AGORA)).toBe("2026-11-01");
    expect(interpretarRegistroLpco("01/11", AGORA)).toBe("2026-11-01");
    expect(interpretarRegistroLpco("20/12/2026", JANEIRO)).toBe("2026-12-20");
    expect(interpretarRegistroLpco("20/12", JANEIRO)).toBe("2026-12-20");
  });

  it("alerta igual nos dois formatos", () => {
    const com = calcularNotificacoesMandado(
      [processo({ status: "desembaraco", datas: { registroLpco: "01/11/2026" } })],
      AGORA,
    );
    const sem = calcularNotificacoesMandado([processo({ status: "desembaraco", datas: { registroLpco: "01/11" } })], AGORA);
    expect(com).toEqual(sem);
    expect(com[0]?.diasDecorridos).toBe(16);
  });
});

describe("Previsão de entrega (ordenarPorPrevisao.ts)", () => {
  it("dataDePrevisao: os dois formatos e com anotação", () => {
    expect(dataDePrevisao("20/12/2026", "2026-11-17")).toBe("2026-12-20");
    expect(dataDePrevisao("20/12", "2026-11-17")).toBe("2026-12-20");
    expect(dataDePrevisao("13/10/2026; deferido 14/10", "2026-11-17")).toBe("2026-10-13");
  });

  it("ordena misturando DD/MM antigo e DD/MM/AAAA novo pela data real", () => {
    const lista = [
      processo({ id: "a", datas: { previsaoEntrega: "05/01/2027" } }),
      processo({ id: "b", datas: { previsaoEntrega: "20/12" } }),
      processo({ id: "c", datas: { previsaoEntrega: "10/12/2026" } }),
      processo({ id: "d", datas: { previsaoEntrega: "já tem" } }),
    ];
    expect(ordenarPorPrevisaoEntrega(lista, AGORA).map((p) => p.id)).toEqual(["c", "b", "a", "d"]);
  });
});

describe("Exibição (painel, detalhe, linha)", () => {
  it("mostra o texto como está gravado, nos dois formatos", () => {
    const campos = camposDatas({ datas: { dataCompraPO: "01/11/2026", dataEmbarque: "05/11" } });
    expect(campos.find((c) => c.rotulo === "Compra (PO)")?.valor).toBe("01/11/2026");
    expect(campos.find((c) => c.rotulo === "Embarque")?.valor).toBe("05/11");
  });
});

describe("/prestacao (monthGroups.ts)", () => {
  it("mês da prestação: DD/MM/AAAA vale o ano; DD/MM usa o ano do createdAt", () => {
    expect(getPatientMonthKey({ data: "22/10/2025", createdAt: "2026-11-01T12:00:00Z" })).toEqual({ year: 2025, month: 9 });
    expect(getPatientMonthKey({ data: "22/10", createdAt: "2026-11-01T12:00:00Z" })).toEqual({ year: 2026, month: 9 });
  });
});
