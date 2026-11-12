import { afterEach, describe, expect, it } from "vitest";
import type { StatusProcesso } from "../../shared/types/processo";
import {
  HORA_CORTE_AVISO_CHEGADA,
  avisoChegadaDevido,
  dataDaAtualizacaoChegada,
  interpretarDataChegadaPrevista,
  montarTextoAvisoChegada,
  papelNoAvisoChegada,
  podeResponderAvisoChegada,
  textoChegadaAdiada,
  textoChegadaConfirmada,
} from "../../shared/utils/avisoChegada";
import { horaBrasilia } from "../../shared/utils/dataBrasilia";

// Brasília = UTC-3 o ano todo (sem horário de verão desde 2019). Os instantes abaixo são UTC.
const BRT = (dia: string, hhmm: string): Date => new Date(`${dia}T${hhmm}:00-03:00`);

const proc = (dataChegadaBrasil: string | undefined, status: StatusProcesso = "em_transito") => ({
  status,
  datas: { dataChegadaBrasil },
});

describe("horaBrasilia", () => {
  it("é a hora de Brasília, inclusive na meia-noite (0, nunca 24)", () => {
    expect(horaBrasilia(new Date("2026-11-08T15:59:00Z"))).toBe(12);
    expect(horaBrasilia(new Date("2026-11-08T16:00:00Z"))).toBe(13);
    expect(horaBrasilia(new Date("2026-11-08T03:00:00Z"))).toBe(0);
    expect(horaBrasilia(new Date("2026-11-08T02:59:00Z"))).toBe(23);
  });
});

describe("interpretarDataChegadaPrevista", () => {
  const agora = BRT("2026-11-08", "10:00");

  it("DD/MM/AAAA usa o ano dado; DD/MM sem ano usa a ocorrência mais próxima", () => {
    expect(interpretarDataChegadaPrevista("06/11/2025", agora)).toBe("2025-11-06");
    expect(interpretarDataChegadaPrevista("06/11", agora)).toBe("2026-11-06");
    expect(interpretarDataChegadaPrevista(" 6/11 ", agora)).toBe("2026-11-06");
  });

  it("só a primeira data do início do texto conta", () => {
    expect(interpretarDataChegadaPrevista("06/11 (previsto)", agora)).toBe("2026-11-06");
  });

  it("virada do ano: hoje 30/12 e 02/01 é a de janeiro que vem; hoje 02/01 e 30/12 é a de dezembro passado", () => {
    expect(interpretarDataChegadaPrevista("02/01", BRT("2026-12-30", "10:00"))).toBe("2027-01-02");
    expect(interpretarDataChegadaPrevista("30/12", BRT("2027-01-02", "10:00"))).toBe("2026-12-30");
  });

  it("texto não interpretável, data inexistente ou ausente: null", () => {
    for (const t of ["ASD", "semana que vem", "31/02", "04/11/26", "04/112", "", "   ", undefined, null]) {
      expect(interpretarDataChegadaPrevista(t, agora)).toBeNull();
    }
  });

  it("29/02 só existe em ano bissexto entre ano-1, ano e ano+1", () => {
    expect(interpretarDataChegadaPrevista("29/02", agora)).toBeNull();
    expect(interpretarDataChegadaPrevista("29/02", BRT("2028-03-01", "10:00"))).toBe("2028-02-29");
  });
});

describe("avisoChegadaDevido — corte das 13:00 de Brasília", () => {
  it("o corte é 13", () => {
    expect(HORA_CORTE_AVISO_CHEGADA).toBe(13);
  });

  it("hoje, 12:59: ainda não; 13:00: devido, rótulo 'hoje', 0 dia de atraso", () => {
    const antes = avisoChegadaDevido(proc("08/11"), BRT("2026-11-08", "12:59"));
    expect(antes.devido).toBe(false);
    expect(antes.dataPrevista).toBe("2026-11-08");

    const depois = avisoChegadaDevido(proc("08/11"), BRT("2026-11-08", "13:00"));
    expect(depois).toEqual({ devido: true, dataPrevista: "2026-11-08", rotuloData: "hoje", diasAtraso: 0 });
  });

  it("usa o horário de Brasília, não o do navegador (instantes em UTC, qualquer TZ)", () => {
    // 15:59Z = 12:59 em Brasília (mas já 00:59 do dia 09 em Tóquio e 05:59 em Honolulu).
    expect(avisoChegadaDevido(proc("08/11"), new Date("2026-11-08T15:59:00Z")).devido).toBe(false);
    expect(avisoChegadaDevido(proc("08/11"), new Date("2026-11-08T16:00:00Z")).devido).toBe(true);
    // 23:30 em Brasília do dia 08 já é dia 09 em UTC: "hoje" ainda é 08.
    const noite = avisoChegadaDevido(proc("08/11"), new Date("2026-11-09T02:30:00Z"));
    expect(noite).toMatchObject({ devido: true, rotuloData: "hoje", diasAtraso: 0 });
  });

  describe("o resultado é o mesmo com o processo rodando em outros fusos", () => {
    const original = process.env.TZ;
    afterEach(() => {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    });

    it.each(["America/Sao_Paulo", "Pacific/Honolulu", "Asia/Tokyo", "UTC"])("TZ=%s", (tz) => {
      process.env.TZ = tz;
      expect(avisoChegadaDevido(proc("08/11"), new Date("2026-11-08T15:59:00Z")).devido).toBe(false);
      expect(avisoChegadaDevido(proc("08/11"), new Date("2026-11-08T16:00:00Z")).devido).toBe(true);
      expect(avisoChegadaDevido(proc("06/11"), new Date("2026-11-08T12:00:00Z"))).toMatchObject({
        devido: true,
        diasAtraso: 2,
      });
      expect(avisoChegadaDevido(proc("09/11"), new Date("2026-11-08T23:00:00Z")).devido).toBe(false);
    });
  });
});

describe("avisoChegadaDevido — datas vencidas, futuras e status", () => {
  it("data vencida aparece na hora (mesmo antes das 13h), com rótulo DD/MM e dias de atraso", () => {
    const r = avisoChegadaDevido(proc("06/11"), BRT("2026-11-08", "07:00"));
    expect(r).toEqual({ devido: true, dataPrevista: "2026-11-06", rotuloData: "06/11", diasAtraso: 2 });
  });

  it("1 dia e vários dias de atraso", () => {
    expect(avisoChegadaDevido(proc("07/11"), BRT("2026-11-08", "08:00")).diasAtraso).toBe(1);
    expect(avisoChegadaDevido(proc("28/10"), BRT("2026-11-08", "08:00")).diasAtraso).toBe(11);
  });

  it("amanhã e depois: não é devido, a qualquer hora", () => {
    expect(avisoChegadaDevido(proc("09/11"), BRT("2026-11-08", "23:59")).devido).toBe(false);
    expect(avisoChegadaDevido(proc("15/11"), BRT("2026-11-08", "18:00")).devido).toBe(false);
  });

  it("ano diferente do de hoje: rótulo DD/MM/AAAA", () => {
    expect(avisoChegadaDevido(proc("06/11/2025"), BRT("2026-11-08", "10:00"))).toMatchObject({
      devido: true,
      rotuloData: "06/11/2025",
      diasAtraso: 367,
    });
    expect(avisoChegadaDevido(proc("06/11/2027"), BRT("2026-11-08", "10:00")).devido).toBe(false);
  });

  it("virada do ano: hoje 30/12 e 02/01 NÃO é vencida; hoje 02/01 e 30/12 é vencida", () => {
    expect(avisoChegadaDevido(proc("02/01"), BRT("2026-12-30", "15:00")).devido).toBe(false);
    expect(avisoChegadaDevido(proc("30/12"), BRT("2027-01-02", "09:00"))).toMatchObject({
      devido: true,
      rotuloData: "30/12/2026",
      diasAtraso: 3,
    });
  });

  it("data ausente ou texto que não dá para interpretar: nunca devido", () => {
    for (const t of [undefined, "", "ASD", "31/02", "semana que vem"]) {
      expect(avisoChegadaDevido(proc(t), BRT("2026-11-08", "15:00"))).toEqual({
        devido: false,
        dataPrevista: null,
        rotuloData: "",
        diasAtraso: 0,
      });
    }
  });

  it("status diferente de em_transito: nunca devido", () => {
    const outros: StatusProcesso[] = ["elaboracao_fornecedores", "desembaraco", "liberado", "entregue"];
    for (const status of outros) {
      expect(avisoChegadaDevido(proc("01/11", status), BRT("2026-11-08", "15:00")).devido).toBe(false);
    }
  });
});

describe("montarTextoAvisoChegada", () => {
  const base = {
    paciente: "Andrelino Oliveira de Santana",
    pasta: "2026 - 387",
    numeroRemessa: 1,
    remessaVisivel: false,
    rotuloData: "06/11",
    diasAtraso: 2,
  };

  it("responsável: título 'Chegou?', 'Ordem de …', data + cia + AWB (exemplo do pedido)", () => {
    const t = montarTextoAvisoChegada({
      ...base,
      papel: "operacional",
      companhiaAerea: "Lufthansa",
      numeroAwb: "020-50680906",
    });
    expect(t).toEqual({
      titulo: "Chegou?",
      linhaProcesso: "Ordem de Andrelino Oliveira de Santana · 2026 - 387",
      linhaData: "Prevista para 06/11 (2 dias de atraso) · Lufthansa · AWB 020-50680906",
    });
  });

  it("administrador: sem título (sem pergunta), mesmas duas linhas", () => {
    const t = montarTextoAvisoChegada({ ...base, papel: "administrador", companhiaAerea: "Lufthansa", numeroAwb: "1" });
    expect(t.titulo).toBeNull();
    expect(t.linhaProcesso).toBe("Ordem de Andrelino Oliveira de Santana · 2026 - 387");
    expect(t.linhaData).toBe("Prevista para 06/11 (2 dias de atraso) · Lufthansa · AWB 1");
  });

  it("Nº Ordem só quando visível na linha: 'Ordem {N} de …'", () => {
    const t = montarTextoAvisoChegada({ ...base, papel: "operacional", numeroRemessa: 3, remessaVisivel: true });
    expect(t.linhaProcesso).toBe("Ordem 3 de Andrelino Oliveira de Santana · 2026 - 387");
    expect(montarTextoAvisoChegada({ ...base, papel: "operacional", numeroRemessa: 3 }).linhaProcesso).toBe(
      "Ordem de Andrelino Oliveira de Santana · 2026 - 387",
    );
  });

  it("sem cia e sem AWB essa parte some; só um dos dois também funciona", () => {
    expect(montarTextoAvisoChegada({ ...base, papel: "operacional" }).linhaData).toBe(
      "Prevista para 06/11 (2 dias de atraso)",
    );
    expect(
      montarTextoAvisoChegada({ ...base, papel: "operacional", companhiaAerea: "  ", numeroAwb: "" }).linhaData,
    ).toBe("Prevista para 06/11 (2 dias de atraso)");
    expect(montarTextoAvisoChegada({ ...base, papel: "operacional", numeroAwb: "123" }).linhaData).toBe(
      "Prevista para 06/11 (2 dias de atraso) · AWB 123",
    );
    expect(montarTextoAvisoChegada({ ...base, papel: "operacional", companhiaAerea: "LATAM" }).linhaData).toBe(
      "Prevista para 06/11 (2 dias de atraso) · LATAM",
    );
  });

  it("hoje: 'Prevista para hoje'; 1 dia no singular, vários no plural; ano de outro ano no rótulo", () => {
    expect(montarTextoAvisoChegada({ ...base, papel: "operacional", rotuloData: "hoje", diasAtraso: 0 }).linhaData).toBe(
      "Prevista para hoje",
    );
    expect(montarTextoAvisoChegada({ ...base, papel: "operacional", diasAtraso: 1 }).linhaData).toBe(
      "Prevista para 06/11 (1 dia de atraso)",
    );
    expect(montarTextoAvisoChegada({ ...base, papel: "operacional", rotuloData: "30/12/2026", diasAtraso: 3 }).linhaData).toBe(
      "Prevista para 30/12/2026 (3 dias de atraso)",
    );
  });
});

describe("textos das atualizações (sem nome de ninguém)", () => {
  it("confirmada usa o DD/MM de hoje em Brasília", () => {
    expect(textoChegadaConfirmada(BRT("2026-11-08", "14:00"))).toBe("Chegada confirmada em 08/11.");
    // 02:30Z do dia 09 ainda é dia 08 em Brasília.
    expect(textoChegadaConfirmada(new Date("2026-11-09T02:30:00Z"))).toBe("Chegada confirmada em 08/11.");
    expect(dataDaAtualizacaoChegada(new Date("2026-11-09T02:30:00Z"))).toBe("08/11");
  });

  it("adiada", () => {
    expect(textoChegadaAdiada("06/11", "12/11")).toBe("Chegada adiada de 06/11 para 12/11.");
    expect(textoChegadaAdiada("30/12/2026", "05/01/2027")).toBe("Chegada adiada de 30/12/2026 para 05/01/2027.");
    expect(textoChegadaAdiada(null, "12/11")).toBe("Chegada adiada para 12/11.");
  });
});

describe("quem recebe e quem responde", () => {
  it("administrador vê qualquer aviso mas NÃO responde", () => {
    const adm = { role: "administrador" as const, nome: "Cris" };
    expect(papelNoAvisoChegada(adm, "Bruno")).toBe("administrador");
    expect(papelNoAvisoChegada(adm, undefined)).toBe("administrador");
    expect(podeResponderAvisoChegada(adm, "Bruno")).toBe(false);
  });

  it("operacional: só o responsável (primeiro nome, sem acento nem caixa)", () => {
    expect(papelNoAvisoChegada({ role: "operacional", nome: "BRUNO Alves" }, "Bruno")).toBe("operacional");
    expect(papelNoAvisoChegada({ role: "operacional", nome: "Rebeca Alcântara" }, "rebeca")).toBe("operacional");
    expect(papelNoAvisoChegada({ role: "operacional", nome: "Rebeca" }, "Bruno")).toBeNull();
    expect(podeResponderAvisoChegada({ role: "operacional", nome: "Bruno" }, "Bruno")).toBe(true);
    expect(podeResponderAvisoChegada({ role: "operacional", nome: "Rebeca" }, "Bruno")).toBe(false);
  });

  it("operacional sem nome, processo sem responsável: nada", () => {
    expect(papelNoAvisoChegada({ role: "operacional" }, "Bruno")).toBeNull();
    expect(papelNoAvisoChegada({ role: "operacional", nome: "Bruno" }, undefined)).toBeNull();
    expect(papelNoAvisoChegada({ role: "operacional", nome: "Bruno" }, "")).toBeNull();
  });

  it("sócio, consultor e sem login: nada, mesmo com o mesmo nome", () => {
    for (const role of ["socio", "consultor", null, undefined] as const) {
      expect(papelNoAvisoChegada({ role, nome: "Bruno" }, "Bruno")).toBeNull();
      expect(podeResponderAvisoChegada({ role, nome: "Bruno" }, "Bruno")).toBe(false);
    }
  });
});
