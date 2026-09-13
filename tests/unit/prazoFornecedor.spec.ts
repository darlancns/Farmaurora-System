import { describe, expect, it } from "vitest";
import { calcularNotificacoesFornecedor, parseDataBR } from "../../app/utils/prazoFornecedor";
import type { Processo } from "#shared/types/processo";

// Note: a importação de `Processo` acima é só de tipo (`import type`), erasada
// em runtime — por isso não precisa resolver o alias #shared do Nuxt aqui,
// só o tsconfig do editor pra autocomplete/checagem.

const HOJE = new Date(2026, 8, 8); // 08/09/2026, mesma data "hoje" usada no resto do projeto

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
    const date = parseDataBR("08/09", HOJE);
    expect(date).toEqual(new Date(2026, 8, 8));
  });

  it("aceita DD/MM/AAAA com ano explícito", () => {
    const date = parseDataBR("08/09/2025", HOJE);
    expect(date).toEqual(new Date(2025, 8, 8));
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
