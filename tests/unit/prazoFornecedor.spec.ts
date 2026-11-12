import { describe, expect, it } from "vitest";
import {
  STATUS_ALERTAVEIS_FORNECEDOR,
  TOLERANCIA_COMPRA_FUTURA_DIAS,
  calcularNotificacoesFornecedor,
  interpretarDataCompra,
  interpretarDataEmbarque,
  parseDataBR,
} from "../../app/utils/prazoFornecedor";
import type { Processo } from "#shared/types/processo";

// Note: a importação de `Processo` acima é só de tipo (`import type`), erasada
// em runtime — por isso não precisa resolver o alias #shared do Nuxt aqui,
// só o tsconfig do editor pra autocomplete/checagem.

// 08/09/2026, meio-dia em Brasília (UTC-3). Um instante (não "meia-noite local"), pra o resultado
// ser o mesmo em qualquer TZ da máquina.
const HOJE = new Date("2026-09-08T12:00:00-03:00");

// Instante a partir de um horário de parede de Brasília (UTC-3).
const brtLocal = (iso: string) => new Date(`${iso}-03:00`);

let seq = 0;
function buildProcesso(overrides: Partial<Processo> = {}): Processo {
  seq += 1;
  return {
    id: `proc_teste_${seq}`,
    paciente: "Paciente Teste",
    pasta: `2026 - ${seq}`,
    empresa: "FARMAURORA",
    consultor: "André Vitório",
    medicamentos: [],
    status: "elaboracao_fornecedores",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseDataBR", () => {
  it("aceita DD/MM assumindo o ano de referência", () => {
    expect(parseDataBR("08/09", HOJE)).toBe("2026-09-08");
  });

  it("aceita DD/MM/AAAA com ano explícito", () => {
    expect(parseDataBR("08/09/2025", HOJE)).toBe("2025-09-08");
  });

  it("rejeita datas inexistentes (ex.: 31/02)", () => {
    expect(parseDataBR("31/02", HOJE)).toBeNull();
  });

  it("rejeita texto não reconhecível sem lançar erro", () => {
    expect(parseDataBR("ASD", HOJE)).toBeNull();
    expect(parseDataBR("já tem", HOJE)).toBeNull();
    expect(parseDataBR("", HOJE)).toBeNull();
    expect(parseDataBR(undefined, HOJE)).toBeNull();
  });
});

describe("calcularNotificacoesFornecedor", () => {
  it("gera notificação quando o prazo do fornecedor estourou", () => {
    const processo = buildProcesso({
      paciente: "Fulano de Tal",
      fornecedor: "Poros - Turquia", // prazo: 3 dias
      datas: { dataCompraPO: "01/09" }, // 01/09 + 3 = 04/09; hoje = 08/09 -> 4 dias de atraso
    });

    const notificacoes = calcularNotificacoesFornecedor([processo], HOJE);

    expect(notificacoes).toHaveLength(1);
    expect(notificacoes[0]).toMatchObject({
      processoId: processo.id,
      paciente: "Fulano de Tal",
      fornecedor: "Poros - Turquia",
      diasDeAtraso: 4,
    });
  });

  it("não gera notificação quando o prazo ainda não estourou", () => {
    const processo = buildProcesso({
      fornecedor: "Poros - Turquia", // prazo: 3 dias
      datas: { dataCompraPO: "07/09" }, // 07/09 + 3 = 10/09; hoje = 08/09 -> ainda não venceu
    });

    expect(calcularNotificacoesFornecedor([processo], HOJE)).toHaveLength(0);
  });

  it("abertura de thread preenchida suprime mesmo com prazo estourado", () => {
    const processo = buildProcesso({
      fornecedor: "Poros - Turquia",
      datas: { dataCompraPO: "01/09", aberturaThread: "05/09" },
    });

    expect(calcularNotificacoesFornecedor([processo], HOJE)).toHaveLength(0);
  });

  it("alertaFornecedorResolvido=true suprime mesmo com prazo estourado", () => {
    const processo = buildProcesso({
      fornecedor: "Poros - Turquia",
      datas: { dataCompraPO: "01/09" },
      alertaFornecedorResolvido: true,
    });

    expect(calcularNotificacoesFornecedor([processo], HOJE)).toHaveLength(0);
  });

  it("fornecedor fora da tabela de prazos nunca gera notificação", () => {
    const processo = buildProcesso({
      fornecedor: "Outro",
      datas: { dataCompraPO: "01/01" }, // bem estourado se tivesse prazo
    });

    expect(calcularNotificacoesFornecedor([processo], HOJE)).toHaveLength(0);
  });

  it("fornecedor legado sem sufixo de país nunca gera notificação (não infere por aproximação)", () => {
    const processo = buildProcesso({
      fornecedor: "Poros", // não é "Poros - Turquia" exato
      datas: { dataCompraPO: "01/01" },
    });

    expect(calcularNotificacoesFornecedor([processo], HOJE)).toHaveLength(0);
  });

  it("data de compra não parseável nunca gera notificação", () => {
    const processo = buildProcesso({
      fornecedor: "Poros - Turquia",
      datas: { dataCompraPO: "ASD" },
    });

    expect(calcularNotificacoesFornecedor([processo], HOJE)).toHaveLength(0);
  });

  it("dataCompraPO ausente nunca gera notificação (mesmo com fornecedor da tabela)", () => {
    const processo = buildProcesso({
      fornecedor: "Poros - Turquia", // prazo 3
      datas: {}, // sem a chave dataCompraPO
    });

    expect(calcularNotificacoesFornecedor([processo], HOJE)).toHaveLength(0);
  });

  it("processo sem fornecedor nunca gera notificação", () => {
    const processo = buildProcesso({ datas: { dataCompraPO: "01/01" } });
    expect(calcularNotificacoesFornecedor([processo], HOJE)).toHaveLength(0);
  });

  it("ordena por diasDeAtraso decrescente (mais atrasado primeiro)", () => {
    const poucoAtrasado = buildProcesso({
      paciente: "Pouco Atrasado",
      fornecedor: "Poros - Turquia", // prazo 3
      datas: { dataCompraPO: "04/09" }, // vence 07/09 -> 1 dia de atraso em 08/09
    });
    const muitoAtrasado = buildProcesso({
      paciente: "Muito Atrasado",
      fornecedor: "Pharyx - China", // prazo 10
      datas: { dataCompraPO: "01/08" }, // vence 11/08 -> vários dias de atraso em 08/09
    });

    const notificacoes = calcularNotificacoesFornecedor([poucoAtrasado, muitoAtrasado], HOJE);

    expect(notificacoes.map((n) => n.paciente)).toEqual(["Muito Atrasado", "Pouco Atrasado"]);
    expect(notificacoes[0]!.diasDeAtraso).toBeGreaterThan(notificacoes[1]!.diasDeAtraso);
  });

  it("respeita o prazo diferente de cada fornecedor da tabela", () => {
    // Todos comprados em 01/09; hoje = 08/09 (7 dias corridos desde a compra)
    const casos: Array<[string, boolean]> = [
      ["Poros - Turquia", true], // prazo 3 -> já venceu
      ["Speciality - Índia", true], // prazo 3 -> já venceu
      ["Beldimed - Bélgica", true], // prazo 7 -> vence exatamente hoje
      ["Pharyx - China", false], // prazo 10 -> ainda não venceu
    ];

    for (const [fornecedor, deveNotificar] of casos) {
      const processo = buildProcesso({ fornecedor, datas: { dataCompraPO: "01/09" } });
      const notificacoes = calcularNotificacoesFornecedor([processo], HOJE);
      expect(notificacoes.length, `fornecedor ${fornecedor}`).toBe(deveNotificar ? 1 : 0);
    }
  });
});

// ── Status alertáveis e embarque futuro ──────────────────────────────────────

describe("calcularNotificacoesFornecedor — status que alertam", () => {
  // Poros (prazo 3), comprado em 01/09: em 08/09 o prazo já estourou — só o status decide.
  const comStatus = (status: Processo["status"]) =>
    buildProcesso({ status, fornecedor: "Poros - Turquia", datas: { dataCompraPO: "01/09" } });

  it("a lista de status alertáveis é uma constante nomeada: só Na origem (elaboracao_fornecedores)", () => {
    expect([...STATUS_ALERTAVEIS_FORNECEDOR]).toEqual(["elaboracao_fornecedores"]);
  });

  it("status Na origem (elaboracao_fornecedores) alerta", () => {
    expect(calcularNotificacoesFornecedor([comStatus("elaboracao_fornecedores")], HOJE)).toHaveLength(1);
  });

  it.each(["desembaraco", "em_transito", "liberado", "entregue"] as const)(
    "status %s NÃO alerta, mesmo com prazo estourado e sem abertura de thread",
    (status) => {
      expect(calcularNotificacoesFornecedor([comStatus(status)], HOJE)).toHaveLength(0);
    },
  );
});

describe("interpretarDataEmbarque", () => {
  it("usa só a primeira data do início do texto, ignorando o resto", () => {
    expect(interpretarDataEmbarque("10/11", HOJE)).toBe("2026-11-10");
    expect(interpretarDataEmbarque("10/11/2027", HOJE)).toBe("2027-11-10");
    expect(interpretarDataEmbarque("  10/11 (previsto)", HOJE)).toBe("2026-11-10");
    expect(interpretarDataEmbarque("10/11 - confirmar com o fornecedor; antes 05/11", HOJE)).toBe("2026-11-10");
  });

  it("sem data válida no início devolve null (nunca lança erro)", () => {
    for (const t of ["ASD", "", "   ", "semana que vem", "previsto 10/11", "31/02", "10/13", "10/11/26", "10/112", undefined, null]) {
      expect(interpretarDataEmbarque(t as string | undefined | null, HOJE), String(t)).toBeNull();
    }
  });
});

describe("calcularNotificacoesFornecedor — data de embarque", () => {
  // Poros (prazo 3), comprado em 01/09, sem thread, status inicial: alertaria em 08/09 (4 dias de atraso).
  const comEmbarque = (dataEmbarque?: string) =>
    buildProcesso({
      fornecedor: "Poros - Turquia",
      datas: { dataCompraPO: "01/09", ...(dataEmbarque === undefined ? {} : { dataEmbarque }) },
    });

  it("embarque FUTURO suprime o alerta", () => {
    expect(calcularNotificacoesFornecedor([comEmbarque("09/09")], HOJE)).toHaveLength(0);
    expect(calcularNotificacoesFornecedor([comEmbarque("30/12")], HOJE)).toHaveLength(0);
    expect(calcularNotificacoesFornecedor([comEmbarque("01/01/2027")], HOJE)).toHaveLength(0);
  });

  it("embarque no dia de HOJE NÃO suprime", () => {
    const n = calcularNotificacoesFornecedor([comEmbarque("08/09")], HOJE);
    expect(n).toHaveLength(1);
    expect(n[0]!.diasDeAtraso).toBe(4);
  });

  it("embarque PASSADO (e thread ainda sem abertura) mantém o alerta", () => {
    expect(calcularNotificacoesFornecedor([comEmbarque("07/09")], HOJE)).toHaveLength(1);
    expect(calcularNotificacoesFornecedor([comEmbarque("01/09/2026")], HOJE)).toHaveLength(1);
  });

  it("texto sujo: vale só a primeira data no início", () => {
    expect(calcularNotificacoesFornecedor([comEmbarque("15/09 (previsto)")], HOJE)).toHaveLength(0); // futuro
    expect(calcularNotificacoesFornecedor([comEmbarque("05/09 - embarcou; chega 20/09")], HOJE)).toHaveLength(1); // passado
    expect(calcularNotificacoesFornecedor([comEmbarque("previsto 20/09")], HOJE)).toHaveLength(1); // não começa com data
    expect(calcularNotificacoesFornecedor([comEmbarque("31/02")], HOJE)).toHaveLength(1); // data inexistente
  });

  it("sem data de embarque (ausente, vazia, ASD) não suprime", () => {
    expect(calcularNotificacoesFornecedor([comEmbarque()], HOJE)).toHaveLength(1);
    expect(calcularNotificacoesFornecedor([comEmbarque("")], HOJE)).toHaveLength(1);
    expect(calcularNotificacoesFornecedor([comEmbarque("ASD")], HOJE)).toHaveLength(1);
  });

  it("embarque sem ano usa o ano de Brasília; 'hoje' é o dia de Brasília (22:00 BRT)", () => {
    // 22:00 BRT de 07/09 (UTC já é 08/09): embarque em 08/09 ainda é FUTURO em Brasília.
    expect(calcularNotificacoesFornecedor([comEmbarque("08/09")], brtLocal("2026-09-07T22:00:00"))).toHaveLength(0);
    // À meia-noite de Brasília vira "hoje" e o alerta volta.
    expect(calcularNotificacoesFornecedor([comEmbarque("08/09")], brtLocal("2026-09-08T00:00:00"))).toHaveLength(1);
  });

  it("as outras supressões continuam valendo: thread aberta, resolvido, fornecedor sem prazo", () => {
    const base = { fornecedor: "Poros - Turquia" as const };
    expect(calcularNotificacoesFornecedor([buildProcesso({ ...base, datas: { dataCompraPO: "01/09", aberturaThread: "05/09", dataEmbarque: "01/09" } })], HOJE)).toHaveLength(0);
    expect(calcularNotificacoesFornecedor([buildProcesso({ ...base, alertaFornecedorResolvido: true, datas: { dataCompraPO: "01/09", dataEmbarque: "01/09" } })], HOJE)).toHaveLength(0);
    expect(calcularNotificacoesFornecedor([buildProcesso({ fornecedor: "Baiyue", datas: { dataCompraPO: "01/01", dataEmbarque: "01/01" } })], HOJE)).toHaveLength(0);
  });
});

// ── Fuso e virada de ano ─────────────────────────────────────────────────────
// Instante a partir de um horário de parede de Brasília (UTC-3).
const brt = (iso: string) => new Date(`${iso}-03:00`);

describe("calcularNotificacoesFornecedor — dia de Brasília, independente do fuso da máquina", () => {
  const poros = (dataCompraPO: string) =>
    buildProcesso({ fornecedor: "Poros - Turquia", datas: { dataCompraPO } }); // prazo 3 dias

  it("às 22:00 BRT (UTC já é o dia seguinte) a contagem é a do dia de Brasília", () => {
    // 01/09 + 3 = 04/09. Hoje em Brasília = 07/09 (22:00 BRT; em UTC já seria 08/09) -> 3 dias de atraso.
    const [n] = calcularNotificacoesFornecedor([poros("01/09")], brt("2026-09-07T22:00:00"));
    expect(n?.diasDeAtraso).toBe(3);
  });

  it("20:59, 21:00, 23:59 e 00:00 BRT: o atraso só aumenta na meia-noite de Brasília", () => {
    const dias = (agora: string) =>
      calcularNotificacoesFornecedor([poros("01/09")], brt(agora))[0]?.diasDeAtraso;
    expect(dias("2026-09-07T20:59:00")).toBe(3);
    expect(dias("2026-09-07T21:00:00")).toBe(3);
    expect(dias("2026-09-07T23:59:59")).toBe(3);
    expect(dias("2026-09-08T00:00:00")).toBe(4);
  });

  it("o prazo vence no próprio dia final (0 dias de atraso) e não antes", () => {
    // 01/09 + 3 = 04/09
    expect(calcularNotificacoesFornecedor([poros("01/09")], brt("2026-09-03T23:59:59"))).toHaveLength(0);
    const [n] = calcularNotificacoesFornecedor([poros("01/09")], brt("2026-09-04T00:00:00"));
    expect(n?.diasDeAtraso).toBe(0);
  });

  it("atravessa a virada de mês e de ano em dias corridos", () => {
    // 29/12/2026 + 3 = 01/01/2027
    expect(calcularNotificacoesFornecedor([poros("29/12/2026")], brt("2026-12-31T22:00:00"))).toHaveLength(0);
    const [n] = calcularNotificacoesFornecedor([poros("29/12/2026")], brt("2027-01-03T10:00:00"));
    expect(n?.diasDeAtraso).toBe(2);
    // 30/10 + 3 = 02/11
    const [m] = calcularNotificacoesFornecedor([poros("30/10/2026")], brt("2026-11-05T10:00:00"));
    expect(m?.diasDeAtraso).toBe(3);
  });

  it("dataCompraPO sem ano usa o ano de Brasília, inclusive às 22:00 BRT de 31/12 (UTC já é 01/01)", () => {
    // Em Brasília ainda é 31/12/2026: "29/12" é 29/12/2026 (+3 = 01/01/2027, ainda não venceu).
    expect(calcularNotificacoesFornecedor([poros("29/12")], brt("2026-12-31T22:00:00"))).toHaveLength(0);
    // Em 01/01/2027 (BRT) o ano corrente passa a ser 2027, mas "29/12/2027" seria uma compra 362 dias no
    // futuro: a correção da virada de ano usa o ano anterior — 29/12/2026 (+3 = 01/01/2027) — e o alerta
    // aparece, igual ao de quem digitou o ano.
    const [sem] = calcularNotificacoesFornecedor([poros("29/12")], brt("2027-01-01T00:30:00"));
    expect(sem?.diasDeAtraso).toBe(0);
    const [n] = calcularNotificacoesFornecedor([poros("29/12/2026")], brt("2027-01-01T00:30:00"));
    expect(n?.diasDeAtraso).toBe(0);
  });

  it("parseDataBR usa o ano de Brasília como padrão, não o ano UTC", () => {
    // 31/12/2026 22:00 BRT = 01/01/2027 01:00 UTC
    expect(parseDataBR("15/03", brt("2026-12-31T22:00:00"))).toBe("2026-03-15");
    expect(parseDataBR("15/03", brt("2027-01-01T00:00:00"))).toBe("2027-03-15");
  });
});

// ── Virada de ano na data de COMPRA ──────────────────────────────────────────────────────────────
// Sem ano, DD/MM é do ano corrente de Brasília; se ficar MAIS de 60 dias no futuro, é do ano anterior (uma
// compra não está no futuro distante). Com ano explícito, vale o ano do texto. A regra é só da compra:
// embarque futuro é legítimo e o alerta de Mandado tem a sua correção.
const em = (iso: string) => new Date(`${iso}T12:00:00-03:00`); // meio-dia em Brasília

describe("interpretarDataCompra — virada de ano", () => {
  it("compra de 28/12 lida em janeiro é de dezembro passado (hoje 2027-01-05)", () => {
    expect(interpretarDataCompra("28/12", em("2027-01-05"))).toBe("2026-12-28");
  });

  it("data dentro do ano corrente e já passada não muda (hoje 2026-11-07, '29/10')", () => {
    expect(interpretarDataCompra("29/10", em("2026-11-07"))).toBe("2026-10-29");
  });

  it("de 0 a 60 dias no futuro continua futura (erro de digitação de poucos dias): '05/12' a 28 dias", () => {
    expect(interpretarDataCompra("05/12", em("2026-11-07"))).toBe("2026-12-05");
  });

  it("o limite é 60 dias: 60 fica como está, 61 vira o ano anterior", () => {
    // hoje 2026-01-05 + 60 dias = 2026-03-06
    expect(interpretarDataCompra("06/03", em("2026-01-05"))).toBe("2026-03-06");
    expect(interpretarDataCompra("07/03", em("2026-01-05"))).toBe("2025-03-07");
    expect(TOLERANCIA_COMPRA_FUTURA_DIAS).toBe(60);
  });

  it("futuro distante no meio do ano vira o ano anterior (hoje 2026-03-10, '20/12' = 285 dias à frente)", () => {
    expect(interpretarDataCompra("20/12", em("2026-03-10"))).toBe("2025-12-20");
  });

  it("'20/01' com hoje 2026-11-07: janeiro deste ano já PASSOU (não é futuro), então a regra não mexe: 2026-01-20", () => {
    // O código só olha para o futuro dentro do ano corrente. 20/01/2026 está 291 dias no PASSADO; o ano seguinte
    // (2027, 74 dias à frente) nunca é considerado — uma compra não é planejada para o futuro.
    expect(interpretarDataCompra("20/01", em("2026-11-07"))).toBe("2026-01-20");
  });

  it("com ano explícito, vale o ano do texto (mesmo no futuro)", () => {
    expect(interpretarDataCompra("20/01/2027", em("2026-11-07"))).toBe("2027-01-20");
    expect(interpretarDataCompra("28/12/2027", em("2027-01-05"))).toBe("2027-12-28");
    expect(interpretarDataCompra("28/12/2026", em("2027-01-05"))).toBe("2026-12-28");
    expect(interpretarDataCompra("1/2/2025", em("2026-11-07"))).toBe("2025-02-01");
  });

  it("o ano corrente é o de Brasília na virada (00:30 BRT de 01/01 = 03:30 UTC do mesmo dia; 22:00 BRT de 31/12 já é 01/01 UTC)", () => {
    expect(interpretarDataCompra("29/12", brt("2027-01-01T00:30:00"))).toBe("2026-12-29");
    expect(interpretarDataCompra("29/12", brt("2026-12-31T22:00:00"))).toBe("2026-12-29");
  });

  it("segue estrito: só o texto INTEIRO DD/MM ou DD/MM/AAAA; o resto devolve null sem lançar erro", () => {
    for (const texto of ["28/12 (obs)", "ASD", "", "   ", "28-12", "28/12/26", "28/12/2026 x", "já tem"]) {
      expect(interpretarDataCompra(texto, em("2027-01-05")), texto).toBeNull();
    }
    expect(interpretarDataCompra(undefined, em("2027-01-05"))).toBeNull();
    expect(interpretarDataCompra(null, em("2027-01-05"))).toBeNull();
  });

  it("data inexistente continua inválida: 31/02 e 29/02 em ano não bissexto", () => {
    expect(interpretarDataCompra("31/02", em("2026-11-07"))).toBeNull();
    expect(interpretarDataCompra("29/02", em("2027-01-05"))).toBeNull(); // 2027 não é bissexto
    expect(interpretarDataCompra("29/02/2027", em("2027-01-05"))).toBeNull();
    expect(interpretarDataCompra("29/02", em("2028-03-10"))).toBe("2028-02-29"); // bissexto, no passado
    expect(interpretarDataCompra("29/02/2028", em("2026-11-07"))).toBe("2028-02-29");
  });

  it("parseDataBR segue como era (sem a regra): é só a COMPRA que a usa", () => {
    expect(parseDataBR("28/12", em("2027-01-05"))).toBe("2027-12-28");
    expect(interpretarDataEmbarque("28/12", em("2027-01-05"))).toBe("2027-12-28");
  });
});

describe("calcularNotificacoesFornecedor — compra atravessando a virada de ano", () => {
  const com = (fornecedor: Processo["fornecedor"], compra: string) =>
    buildProcesso({ fornecedor, datas: { dataCompraPO: compra } });

  it("compra 30/12 (sem ano) e hoje 02/01: o prazo de cada fornecedor conta pela virada, em dias corridos", () => {
    // Poros e Speciality: 3 dias → vence 02/01/2027 (0 dias de atraso hoje)
    for (const f of ["Poros - Turquia", "Speciality - Índia"] as const) {
      const [n] = calcularNotificacoesFornecedor([com(f, "30/12")], em("2027-01-02"));
      expect(n?.diasDeAtraso, f).toBe(0);
      expect(calcularNotificacoesFornecedor([com(f, "30/12")], em("2027-01-01")), `${f} antes do prazo`).toHaveLength(0);
    }
    // Beldimed: 7 dias → vence 06/01/2027
    expect(calcularNotificacoesFornecedor([com("Beldimed - Bélgica", "30/12")], em("2027-01-05"))).toHaveLength(0);
    expect(calcularNotificacoesFornecedor([com("Beldimed - Bélgica", "30/12")], em("2027-01-06"))[0]?.diasDeAtraso).toBe(0);
    expect(calcularNotificacoesFornecedor([com("Beldimed - Bélgica", "30/12")], em("2027-01-08"))[0]?.diasDeAtraso).toBe(2);
    // Pharyx: 10 dias → vence 09/01/2027
    expect(calcularNotificacoesFornecedor([com("Pharyx - China", "30/12")], em("2027-01-08"))).toHaveLength(0);
    expect(calcularNotificacoesFornecedor([com("Pharyx - China", "30/12")], em("2027-01-09"))[0]?.diasDeAtraso).toBe(0);
  });

  it("o MESMO resultado de quem digitou o ano (30/12/2026)", () => {
    for (const f of ["Poros - Turquia", "Speciality - Índia", "Beldimed - Bélgica", "Pharyx - China"] as const) {
      for (const dia of ["2027-01-02", "2027-01-06", "2027-01-09", "2027-01-15"]) {
        expect(calcularNotificacoesFornecedor([com(f, "30/12")], em(dia))[0]?.diasDeAtraso, `${f} ${dia}`).toBe(
          calcularNotificacoesFornecedor([com(f, "30/12/2026")], em(dia))[0]?.diasDeAtraso,
        );
      }
    }
  });

  it("compra futura de poucos dias (erro de digitação) NÃO dispara alerta", () => {
    expect(calcularNotificacoesFornecedor([com("Poros - Turquia", "05/12")], em("2026-11-07"))).toHaveLength(0);
    expect(calcularNotificacoesFornecedor([com("Poros - Turquia", "05/12")], em("2026-12-20"))[0]?.diasDeAtraso).toBe(12);
  });

  it("a regra do embarque NÃO muda: embarque sem ano de dezembro, lido em janeiro, segue 'futuro' e suprime o alerta", () => {
    const p = buildProcesso({
      fornecedor: "Poros - Turquia",
      datas: { dataCompraPO: "20/12", dataEmbarque: "28/12" },
    });
    expect(calcularNotificacoesFornecedor([p], em("2027-01-05"))).toHaveLength(0); // embarque lido como 28/12/2027
    const semEmbarque = buildProcesso({ fornecedor: "Poros - Turquia", datas: { dataCompraPO: "20/12" } });
    expect(calcularNotificacoesFornecedor([semEmbarque], em("2027-01-05"))[0]?.diasDeAtraso).toBe(13);
  });
});

// ── Equivalência com a implementação anterior (Date local do navegador) ──────
// A versão antiga contava os dias com `new Date()` local. Para um navegador em BRT o resultado
// precisa ser idêntico ao novo. Só roda quando a máquina do teste está em BRT (TZ=America/Sao_Paulo);
// nos outros fusos a versão antiga muda de resposta — que é justamente o que a nova corrige.
const TZ_DA_MAQUINA = Intl.DateTimeFormat().resolvedOptions().timeZone;

function antigoComHoraZerada(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function antigoData(dia: number, mes: number, ano: number): Date | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(ano, mes - 1, dia);
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return d;
}
function antigoParse(str: string | undefined, hoje: Date): Date | null {
  if (!str) return null;
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const d = antigoData(dia, mes, m[3] ? Number(m[3]) : hoje.getFullYear());
  if (!d || m[3]) return d;
  // A única diferença da implementação nova (a correção da virada de ano, não existia na antiga): sem ano e
  // mais de 60 dias no futuro, a compra é do ano anterior.
  const limite = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + TOLERANCIA_COMPRA_FUTURA_DIAS);
  return d.getTime() > limite.getTime() ? antigoData(dia, mes, d.getFullYear() - 1) : d;
}
const PRAZOS: Record<string, number> = {
  "Poros - Turquia": 3,
  "Speciality - Índia": 3,
  "Beldimed - Bélgica": 7,
  "Pharyx - China": 10,
};
function antigoDias(fornecedor: string, dataCompraPO: string, hoje: Date): number | null {
  const compra = antigoParse(dataCompraPO, hoje);
  if (!compra) return null;
  const final = new Date(compra);
  final.setDate(final.getDate() + PRAZOS[fornecedor]!);
  const hojeZ = antigoComHoraZerada(hoje);
  const finalZ = antigoComHoraZerada(final);
  if (hojeZ < finalZ) return null;
  return Math.round((hojeZ.getTime() - finalZ.getTime()) / (24 * 60 * 60 * 1000));
}

describe.skipIf(TZ_DA_MAQUINA !== "America/Sao_Paulo")("equivalência com a contagem anterior (navegador em BRT)", () => {
  it("mesmos dias de atraso em ~2 anos de 'hoje', 4 fornecedores e várias datas de compra (inclusive 29/02 e virada de ano)", () => {
    const compras = ["01/01", "29/02", "28/02/2028", "15/03", "30/06/2026", "31/10", "30/11", "28/12", "29/12/2026", "31/12/2026", "31/02", "ASD", ""];
    let comparados = 0;
    for (let i = 0; i < 730; i += 3) {
      const base = new Date(Date.UTC(2026, 0, 1) + i * 24 * 60 * 60 * 1000);
      // hoje às 00:00, 12:00 e 23:30 BRT daquele dia civil
      for (const hora of ["00:00:00", "12:00:00", "23:30:00"]) {
        const diaISO = base.toISOString().slice(0, 10);
        const hoje = new Date(`${diaISO}T${hora}-03:00`);
        for (const [fornecedor] of Object.entries(PRAZOS)) {
          for (const compra of compras) {
            const processo = buildProcesso({ fornecedor: fornecedor as Processo["fornecedor"], datas: { dataCompraPO: compra } });
            const novo = calcularNotificacoesFornecedor([processo], hoje)[0]?.diasDeAtraso ?? null;
            expect(novo, `${fornecedor} compra=${compra} hoje=${diaISO}T${hora}`).toBe(antigoDias(fornecedor, compra, hoje));
            comparados++;
          }
        }
      }
    }
    expect(comparados).toBeGreaterThan(10000);
  });
});
