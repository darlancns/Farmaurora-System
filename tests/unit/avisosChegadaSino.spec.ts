import { describe, expect, it } from "vitest";
import type { Processo } from "../../shared/types/processo";
import { chaveAvisoChegadaVisto } from "../../shared/utils/avisoChegada";
import { calcularAvisosChegada } from "../../app/utils/avisosChegada";
import { sectionForApiPath, canWriteSection, canReadSection } from "../../shared/utils/rbac";

const BRT = (dia: string, hhmm: string): Date => new Date(`${dia}T${hhmm}:00-03:00`);
const DEPOIS_DAS_13 = BRT("2026-11-08", "14:00");

function proc(id: string, extra: Partial<Processo> = {}): Processo {
  return {
    id,
    paciente: `Paciente ${id}`,
    numeroRemessa: 1,
    pasta: `2026 - ${id}`,
    empresa: "FARMAURORA",
    consultor: "Dani",
    responsavelOperacional: "Bruno",
    medicamentos: [],
    status: "em_transito",
    datas: { dataChegadaBrasil: "06/11" },
    pendencias: [],
    atualizacoes: [],
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

const bruno = { role: "operacional" as const, nome: "Bruno Alves" };
const rebeca = { role: "operacional" as const, nome: "Rebeca" };
const adm = { role: "administrador" as const, nome: "Cris" };

describe("calcularAvisosChegada — itens por cargo", () => {
  const lista = [
    proc("1", { responsavelOperacional: "Bruno" }),
    proc("2", { responsavelOperacional: "Rebeca" }),
    proc("3", { responsavelOperacional: undefined }),
  ];

  it("operacional vê só os dele, com título 'Chegou?' (pergunta)", () => {
    const itens = calcularAvisosChegada(lista, bruno, DEPOIS_DAS_13);
    expect(itens.map((i) => i.processoId)).toEqual(["1"]);
    expect(itens[0]).toMatchObject({ papel: "operacional", titulo: "Chegou?", dataPrevista: "2026-11-06" });
  });

  it("administrador vê TODOS (inclusive sem responsável), sem título", () => {
    const itens = calcularAvisosChegada(lista, adm, DEPOIS_DAS_13);
    expect(itens.map((i) => i.processoId).sort()).toEqual(["1", "2", "3"]);
    expect(itens.every((i) => i.papel === "administrador" && i.titulo === null)).toBe(true);
  });

  it("sócio, consultor e sem login não veem nada", () => {
    for (const role of ["socio", "consultor", null, undefined] as const) {
      expect(calcularAvisosChegada(lista, { role, nome: "Bruno" }, DEPOIS_DAS_13)).toEqual([]);
    }
  });

  it("operacional sem nome ou sem processo dele: lista vazia", () => {
    expect(calcularAvisosChegada(lista, { role: "operacional" }, DEPOIS_DAS_13)).toEqual([]);
    expect(calcularAvisosChegada(lista, { role: "operacional", nome: "Outro" }, DEPOIS_DAS_13)).toEqual([]);
  });

  it("o contador do sino é o tamanho da lista", () => {
    expect(calcularAvisosChegada(lista, adm, DEPOIS_DAS_13)).toHaveLength(3);
    expect(calcularAvisosChegada(lista, rebeca, DEPOIS_DAS_13)).toHaveLength(1);
  });
});

describe("calcularAvisosChegada — tempo e estado", () => {
  it("some quando o status muda ou a data é adiada (aviso derivado do estado)", () => {
    expect(calcularAvisosChegada([proc("1")], bruno, DEPOIS_DAS_13)).toHaveLength(1);
    expect(calcularAvisosChegada([proc("1", { status: "desembaraco" })], bruno, DEPOIS_DAS_13)).toHaveLength(0);
    expect(calcularAvisosChegada([proc("1", { datas: { dataChegadaBrasil: "12/11" } })], bruno, DEPOIS_DAS_13)).toHaveLength(0);
    // ... inclusive para o administrador.
    expect(calcularAvisosChegada([proc("1", { status: "desembaraco" })], adm, DEPOIS_DAS_13)).toHaveLength(0);
  });

  it("hoje: só a partir das 13:00 de Brasília", () => {
    const hoje = [proc("1", { datas: { dataChegadaBrasil: "08/11" } })];
    expect(calcularAvisosChegada(hoje, bruno, BRT("2026-11-08", "12:59"))).toHaveLength(0);
    expect(calcularAvisosChegada(hoje, bruno, BRT("2026-11-08", "13:00"))).toHaveLength(1);
  });

  it("mais atrasados primeiro", () => {
    const itens = calcularAvisosChegada(
      [
        proc("a", { datas: { dataChegadaBrasil: "07/11" } }),
        proc("b", { datas: { dataChegadaBrasil: "01/11" } }),
        proc("c", { datas: { dataChegadaBrasil: "08/11" } }),
      ],
      adm,
      DEPOIS_DAS_13,
    );
    expect(itens.map((i) => i.processoId)).toEqual(["b", "a", "c"]);
  });
});

describe("calcularAvisosChegada — dispensa do administrador (processo + data prevista)", () => {
  const p = proc("1");

  it("dispensado some só para o administrador; o operacional não depende de dispensa", () => {
    const vistos = new Set([chaveAvisoChegadaVisto("1", "2026-11-06")]);
    expect(calcularAvisosChegada([p], adm, DEPOIS_DAS_13, vistos)).toEqual([]);
    expect(calcularAvisosChegada([p], bruno, DEPOIS_DAS_13, vistos)).toHaveLength(1);
  });

  it("vale para a data prevista: com a data adiada e vencida de novo, o aviso reaparece", () => {
    const vistos = new Set([chaveAvisoChegadaVisto("1", "2026-11-06")]);
    const adiada = proc("1", { datas: { dataChegadaBrasil: "12/11" } });
    expect(calcularAvisosChegada([adiada], adm, DEPOIS_DAS_13, vistos)).toEqual([]); // ainda futura
    const diaSeguinteAoNovoPrazo = BRT("2026-11-12", "13:00");
    const itens = calcularAvisosChegada([adiada], adm, diaSeguinteAoNovoPrazo, vistos);
    expect(itens).toHaveLength(1);
    expect(itens[0]!.dataPrevista).toBe("2026-11-12");
  });

  it("dispensa de outro processo não esconde este", () => {
    const vistos = new Set([chaveAvisoChegadaVisto("2", "2026-11-06")]);
    expect(calcularAvisosChegada([p], adm, DEPOIS_DAS_13, vistos)).toHaveLength(1);
  });
});

describe("calcularAvisosChegada — texto do item", () => {
  it("Nº Ordem aparece quando a linha mostra (N>1 ou pasta repetida) e some caso contrário", () => {
    const unica = calcularAvisosChegada([proc("1")], adm, DEPOIS_DAS_13)[0]!;
    expect(unica.linhaProcesso).toBe("Ordem de Paciente 1 · 2026 - 1");

    const segunda = calcularAvisosChegada([proc("1", { numeroRemessa: 2 })], adm, DEPOIS_DAS_13)[0]!;
    expect(segunda.linhaProcesso).toBe("Ordem 2 de Paciente 1 · 2026 - 1");

    const repetidas = calcularAvisosChegada(
      [proc("1", { pasta: "2026 - 9" }), proc("2", { pasta: "2026 - 9", status: "entregue" })],
      adm,
      DEPOIS_DAS_13,
    );
    expect(repetidas[0]!.linhaProcesso).toBe("Ordem 1 de Paciente 1 · 2026 - 9");
  });

  it("cia aérea e AWB entram na linha da data", () => {
    const [item] = calcularAvisosChegada(
      [proc("1", { companhiaAerea: "Lufthansa", numeroAwb: "020-50680906" })],
      bruno,
      DEPOIS_DAS_13,
    );
    expect(item!.linhaData).toBe("Prevista para 06/11 (2 dias de atraso) · Lufthansa · AWB 020-50680906");
  });
});

describe("RBAC das rotas novas", () => {
  it("/api/chegada-avisos/* fica na seção liberada a todos (o handler restringe ao administrador)", () => {
    expect(sectionForApiPath("/api/chegada-avisos/visto")).toBe("recados");
    expect(sectionForApiPath("/api/chegada-avisos/vistos")).toBe("recados");
    for (const role of ["consultor", "socio", "operacional", "administrador"] as const) {
      expect(canReadSection(role, "recados")).toBe(true);
      expect(canWriteSection(role, "recados")).toBe(true);
    }
  });

  it("/api/processos/:id/chegada é da seção processos: consultor nem chega ao handler", () => {
    expect(sectionForApiPath("/api/processos/proc_1/chegada")).toBe("processos");
    expect(canWriteSection("consultor", "processos")).toBe(false);
    expect(canWriteSection("operacional", "processos")).toBe(true);
  });
});
