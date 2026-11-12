import { describe, expect, it } from "vitest";
import {
  calcularNotificacoesMandado,
  calcularNotificacoesMandadoDoUsuario,
  interpretarRegistroLpco,
  PRAZO_MANDADO_DIAS,
  STATUS_ALERTAVEIS_MANDADO,
} from "../../app/utils/prazoMandado";
import type { Processo } from "#shared/types/processo";

// 08/09/2026, meio-dia em Brasília (UTC-3): um instante, igual em qualquer TZ da máquina.
const HOJE = new Date("2026-09-08T12:00:00-03:00");
const brt = (iso: string) => new Date(`${iso}-03:00`);

let seq = 0;
function buildProcesso(overrides: Partial<Processo> = {}): Processo {
  seq += 1;
  return {
    id: `proc_mandado_${seq}`,
    paciente: "Paciente Teste",
    pasta: `2026 - ${seq}`,
    empresa: "FARMAURORA",
    consultor: "André Vitório",
    responsavelOperacional: "Bruno",
    medicamentos: [],
    status: "desembaraco",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const comLpco = (registroLpco: string | undefined, extra: Partial<Processo> = {}) =>
  buildProcesso({ datas: registroLpco === undefined ? {} : { registroLpco }, ...extra });

describe("constantes", () => {
  it("prazo de 7 dias corridos e só o status desembaraco é alertável", () => {
    expect(PRAZO_MANDADO_DIAS).toBe(7);
    expect(STATUS_ALERTAVEIS_MANDADO).toEqual(["desembaraco"]);
  });
});

describe("interpretarRegistroLpco — só a PRIMEIRA data no início do texto", () => {
  it("exemplos reais do follow_up", () => {
    expect(interpretarRegistroLpco("25/08", HOJE)).toBe("2026-08-25");
    expect(interpretarRegistroLpco("15/09; aguardando análise", brt("2026-09-20T12:00:00"))).toBe("2026-09-15");
    expect(interpretarRegistroLpco("01/10; agd. análise 05/10", brt("2026-10-20T12:00:00"))).toBe("2026-10-01");
    expect(interpretarRegistroLpco("29/09 - agd. análise - prazo até dia 13/10", brt("2026-10-20T12:00:00"))).toBe(
      "2026-09-29",
    );
  });

  it("aceita DD/MM/AAAA, espaços iniciais e dia/mês de 1 dígito", () => {
    expect(interpretarRegistroLpco("25/08/2025", HOJE)).toBe("2025-08-25");
    expect(interpretarRegistroLpco("  5/8 aguardando", HOJE)).toBe("2026-08-05");
  });

  it("não interpreta: vazio, sem data no início, data no meio, inexistente, ano com 2 dígitos", () => {
    expect(interpretarRegistroLpco(undefined, HOJE)).toBeNull();
    expect(interpretarRegistroLpco("", HOJE)).toBeNull();
    expect(interpretarRegistroLpco("aguardando", HOJE)).toBeNull();
    expect(interpretarRegistroLpco("agd. análise 05/08", HOJE)).toBeNull();
    expect(interpretarRegistroLpco("31/02", HOJE)).toBeNull();
    expect(interpretarRegistroLpco("25/08/26", HOJE)).toBeNull();
    expect(interpretarRegistroLpco("25/082", HOJE)).toBeNull();
  });

  it("sem ano e data posterior a hoje: usa o ano anterior (virada de ano)", () => {
    // Hoje = 05/01/2027: "28/12" em 2027 seria futuro -> 28/12/2026.
    expect(interpretarRegistroLpco("28/12", brt("2027-01-05T12:00:00"))).toBe("2026-12-28");
    // Hoje = 08/09/2026: "10/09" em 2026 seria futuro -> 10/09/2025.
    expect(interpretarRegistroLpco("10/09", HOJE)).toBe("2025-09-10");
    // O próprio dia de hoje não é futuro.
    expect(interpretarRegistroLpco("08/09", HOJE)).toBe("2026-09-08");
  });

  it("com ano explícito não aplica a correção do ano anterior", () => {
    expect(interpretarRegistroLpco("10/09/2026", HOJE)).toBe("2026-09-10");
  });
});

describe("calcularNotificacoesMandado", () => {
  it("dia 6 não alerta; dia 7 alerta (dia do registro = dia 0)", () => {
    // hoje = 08/09: 02/09 -> 6 dias; 01/09 -> 7 dias.
    expect(calcularNotificacoesMandado([comLpco("02/09")], HOJE)).toHaveLength(0);

    const [n] = calcularNotificacoesMandado([comLpco("01/09", { paciente: "Fulano" })], HOJE);
    expect(n).toMatchObject({ paciente: "Fulano", diasDecorridos: 7, registroDDMM: "01/09", registroLpco: "2026-09-01" });
  });

  it("depois do dia 7 segue alertando e conta os dias decorridos", () => {
    const [n] = calcularNotificacoesMandado([comLpco("25/08")], HOJE);
    expect(n?.diasDecorridos).toBe(14);
  });

  it("texto sujo: usa só a primeira data", () => {
    const processo = comLpco("29/08 - agd. análise - prazo até dia 13/10");
    const [n] = calcularNotificacoesMandado([processo], HOJE);
    expect(n?.registroDDMM).toBe("29/08");
    expect(n?.diasDecorridos).toBe(10);
  });

  it("sem data (ausente, vazio ou sem data no início) nunca alerta", () => {
    expect(calcularNotificacoesMandado([comLpco(undefined)], HOJE)).toHaveLength(0);
    expect(calcularNotificacoesMandado([comLpco("")], HOJE)).toHaveLength(0);
    expect(calcularNotificacoesMandado([comLpco("aguardando LPCO")], HOJE)).toHaveLength(0);
    expect(calcularNotificacoesMandado([comLpco("31/02")], HOJE)).toHaveLength(0);
  });

  it("virada de ano: registro em dezembro, hoje em janeiro, sem ano no texto", () => {
    const hoje = brt("2027-01-05T12:00:00");
    const [n] = calcularNotificacoesMandado([comLpco("28/12")], hoje);
    expect(n).toMatchObject({ registroLpco: "2026-12-28", registroDDMM: "28/12", diasDecorridos: 8 });
    // 30/12 -> 6 dias em 05/01: ainda não.
    expect(calcularNotificacoesMandado([comLpco("30/12")], hoje)).toHaveLength(0);
  });

  it("status diferente de desembaraco nunca alerta", () => {
    for (const status of ["elaboracao_fornecedores", "em_transito", "liberado", "entregue"] as const) {
      const processo = comLpco("01/08", { status });
      expect(calcularNotificacoesMandado([processo], HOJE), status).toHaveLength(0);
    }
  });

  it("alertaMandadoResolvido=true suprime; o resolvido do fornecedor NÃO suprime", () => {
    expect(calcularNotificacoesMandado([comLpco("01/08", { alertaMandadoResolvido: true })], HOJE)).toHaveLength(0);
    expect(calcularNotificacoesMandado([comLpco("01/08", { alertaFornecedorResolvido: true })], HOJE)).toHaveLength(1);
  });

  it("dia de Brasília, não UTC: vira o 7º dia na meia-noite de Brasília", () => {
    // 01/09 + 7 = 08/09
    expect(calcularNotificacoesMandado([comLpco("01/09")], brt("2026-09-07T23:59:59"))).toHaveLength(0);
    expect(calcularNotificacoesMandado([comLpco("01/09")], brt("2026-09-08T00:00:00"))).toHaveLength(1);
    // 22:00 BRT de 07/09 já é 08/09 em UTC, mas em Brasília ainda é o dia 6.
    expect(calcularNotificacoesMandado([comLpco("01/09")], brt("2026-09-07T22:00:00"))).toHaveLength(0);
  });

  it("ordena do mais antigo para o mais recente", () => {
    const recente = comLpco("01/09", { paciente: "Recente" });
    const antigo = comLpco("20/08", { paciente: "Antigo" });
    expect(calcularNotificacoesMandado([recente, antigo], HOJE).map((n) => n.paciente)).toEqual(["Antigo", "Recente"]);
  });
});


describe("calcularNotificacoesMandadoDoUsuario — filtro por papel/primeiro nome (regra em mandadoPermissao.spec.ts)", () => {
  const bruno = { role: "operacional" as const, nome: "Bruno Alves" };
  const rebeca = { role: "operacional" as const, nome: "Rebeca Alcântara" };

  it("aplica o filtro de visibilidade sobre a lista", () => {
    const doBruno = comLpco("01/08", { paciente: "Do Bruno", responsavelOperacional: "Bruno" });
    const daRebeca = comLpco("01/08", { paciente: "Da Rebeca", responsavelOperacional: "Rebeca" });
    const lista = [doBruno, daRebeca];

    expect(calcularNotificacoesMandadoDoUsuario(lista, bruno, HOJE).map((n) => n.paciente)).toEqual(["Do Bruno"]);
    expect(calcularNotificacoesMandadoDoUsuario(lista, rebeca, HOJE).map((n) => n.paciente)).toEqual(["Da Rebeca"]);
    expect(calcularNotificacoesMandadoDoUsuario(lista, { role: "administrador" }, HOJE)).toHaveLength(2);
    expect(calcularNotificacoesMandadoDoUsuario(lista, { role: "socio", nome: "Bruno" }, HOJE)).toHaveLength(0);
    expect(calcularNotificacoesMandadoDoUsuario(lista, { role: "consultor", nome: "Bruno" }, HOJE)).toHaveLength(0);
  });
});
