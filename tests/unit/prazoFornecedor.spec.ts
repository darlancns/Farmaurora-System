import { describe, expect, it } from "vitest";
import { calcularNotificacoesFornecedor, parseDataBR } from "../../app/utils/prazoFornecedor";
import type { Processo } from "#shared/types/processo";

// Note: a importação de `Processo` acima é só de tipo (`import type`), erasada
// em runtime — por isso não precisa resolver o alias #shared do Nuxt aqui,
// só o tsconfig do editor pra autocomplete/checagem.

// 08/09/2026, meio-dia em Brasília (UTC-3). Um instante (não "meia-noite local"), pra o resultado
// ser o mesmo em qualquer TZ da máquina.
const HOJE = new Date("2026-09-08T12:00:00-03:00");

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
    // Em 01/01/2027 (BRT) o ano corrente passa a ser 2027: "29/12" vira 29/12/2027 (futuro, sem alerta),
    // exatamente como já era para o navegador em BRT.
    expect(calcularNotificacoesFornecedor([poros("29/12")], brt("2027-01-01T00:30:00"))).toHaveLength(0);
    // Com o ano explícito o alerta aparece normalmente.
    const [n] = calcularNotificacoesFornecedor([poros("29/12/2026")], brt("2027-01-01T00:30:00"));
    expect(n?.diasDeAtraso).toBe(0);
  });

  it("parseDataBR usa o ano de Brasília como padrão, não o ano UTC", () => {
    // 31/12/2026 22:00 BRT = 01/01/2027 01:00 UTC
    expect(parseDataBR("15/03", brt("2026-12-31T22:00:00"))).toBe("2026-03-15");
    expect(parseDataBR("15/03", brt("2027-01-01T00:00:00"))).toBe("2027-03-15");
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
function antigoParse(str: string | undefined, hoje: Date): Date | null {
  if (!str) return null;
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = m[3] ? Number(m[3]) : hoje.getFullYear();
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(ano, mes - 1, dia);
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return d;
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
