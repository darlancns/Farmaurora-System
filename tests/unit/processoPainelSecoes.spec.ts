import { describe, expect, it } from "vitest";
import { ICONES_CARD, ICONES_PROCESSO } from "../../app/utils/processoIcones";
import { etiquetaPagamentoDe } from "../../app/utils/processoPagamento";
import { itensMedicamentos } from "../../app/utils/processoPainel";
import {
  celulaNumeroProcesso,
  celulasPessoas,
  dataCabeNaCelula,
  haLinhaDeCima,
  secaoEntrega,
  secaoEnvio,
} from "../../app/utils/processoPainelSecoes";

// Barra lateral do processo (Kanban): regras puras das seções. Vazio some, parcial mostra só o que há, completo mostra tudo.

const rotulos = (celulas: Array<{ rotulo: string }>) => celulas.map((c) => c.rotulo);

describe("celulasPessoas: Responsável / Consultor / Fornecedor", () => {
  it("completo: as 3, na ordem, com o fornecedor SÓ pelo nome (sem país)", () => {
    const c = celulasPessoas({ responsavelOperacional: "Rebeca", consultor: "Dani", fornecedor: "Beldimed - Bélgica" });
    expect(rotulos(c)).toEqual(["Responsável", "Consultor", "Fornecedor"]);
    expect(c.map((x) => x.valor)).toEqual(["Rebeca", "Dani", "Beldimed"]);
    expect(c.map((x) => x.id)).toEqual(["painel-responsavel", "painel-consultor", "painel-fornecedor"]);
    expect(c.map((x) => x.chave)).toEqual(["responsavel", "consultor", "fornecedor"]);
  });
  it("parcial: campo vazio (ausente ou só espaços) some", () => {
    expect(rotulos(celulasPessoas({ responsavelOperacional: "  ", consultor: "Dani", fornecedor: "Poros - Turquia" }))).toEqual(["Consultor", "Fornecedor"]);
    expect(rotulos(celulasPessoas({ consultor: "Dani" } as never))).toEqual(["Consultor"]);
  });
  it("vazio: nenhuma célula", () => {
    expect(celulasPessoas({ responsavelOperacional: undefined, consultor: "", fornecedor: "   " })).toEqual([]);
  });
  it("fornecedor sem separador (texto livre) aparece inteiro", () => {
    expect(celulasPessoas({ consultor: "", fornecedor: "Farma Exemplo" })[0]!.valor).toBe("Farma Exemplo");
  });
});

describe("secaoEnvio: Envio | Cia. aérea; Nº AWB | Despachante", () => {
  const completo = { modalEnvio: "Air Cargo", companhiaAerea: "Lufthansa", numeroAwb: "957-1", despachante: "Marcelo Lima" };
  it("completo: 2 linhas de 2, AWB em fonte de código, título 'Envio e desembaraço'", () => {
    const s = secaoEnvio(completo)!;
    expect(s.titulo).toBe("Envio e desembaraço");
    expect(s.linhas.map(rotulos)).toEqual([["Envio", "Cia. aérea"], ["Nº AWB", "Despachante"]]);
    expect(s.linhas[1]![0]!.mono).toBe(true);
    expect(s.linhas[0]![0]!.mono).toBeUndefined();
    expect(s.linhas.flat().map((c) => c.id)).toEqual(["painel-envio", "painel-cia", "painel-awb", "painel-despachante"]);
  });
  it("parcial: célula sozinha fica numa linha de 1; linha sem células some", () => {
    expect(secaoEnvio({ ...completo, companhiaAerea: "", despachante: "" })!.linhas.map(rotulos)).toEqual([["Envio"], ["Nº AWB"]]);
    expect(secaoEnvio({ ...completo, numeroAwb: "", despachante: "" })!.linhas.map(rotulos)).toEqual([["Envio", "Cia. aérea"]]);
    expect(secaoEnvio({ modalEnvio: "", companhiaAerea: "", numeroAwb: "", despachante: "Marcelo Lima" })!.linhas.map(rotulos)).toEqual([["Despachante"]]);
  });
  it("vazio: sem seção (o título some junto)", () => {
    expect(secaoEnvio({ modalEnvio: undefined, companhiaAerea: undefined, numeroAwb: "  ", despachante: undefined })).toBeNull();
  });
  it("Courier Simples esconde o Despachante (mesma regra do formulário), mesmo com valor gravado", () => {
    const s = secaoEnvio({ ...completo, modalEnvio: "Courier Simples", companhiaAerea: "DHL" })!;
    expect(s.linhas.map(rotulos)).toEqual([["Envio", "Cia. aérea"], ["Nº AWB"]]);
  });
});

describe("secaoEntrega: Transportadora e Local de entrega, cada um numa linha", () => {
  const base = { modalEnvio: "Air Cargo", transportadoraNacional: { nome: "AJC", cotacao: "COT-9", valor: 1500 }, localEntrega: "Clínica X" };
  it("completo", () => {
    const s = secaoEntrega(base)!;
    expect(s.titulo).toBe("Entrega");
    expect(s.linhas.map(rotulos)).toEqual([["Transportadora"], ["Local de entrega"]]);
    expect(s.linhas[0]![0]!.valor).toBe("AJC · COT-9 · R$ 1.500,00");
    expect(s.linhas.flat().map((c) => c.id)).toEqual(["painel-transportadora", "painel-local-entrega"]);
  });
  it("parcial: só o local, ou só a transportadora", () => {
    expect(secaoEntrega({ ...base, transportadoraNacional: undefined })!.linhas.map(rotulos)).toEqual([["Local de entrega"]]);
    expect(secaoEntrega({ ...base, localEntrega: " " })!.linhas.map(rotulos)).toEqual([["Transportadora"]]);
  });
  it("vazio: sem seção", () => {
    expect(secaoEntrega({ modalEnvio: "Air Cargo", transportadoraNacional: undefined, localEntrega: undefined })).toBeNull();
  });
  it("Courier Simples esconde a Transportadora; o Local continua", () => {
    expect(secaoEntrega({ ...base, modalEnvio: "Courier Simples" })!.linhas.map(rotulos)).toEqual([["Local de entrega"]]);
  });
});

describe("celulaNumeroProcesso", () => {
  it("com valor: bloquinho em fonte de código, sem título; vazio: null", () => {
    const c = celulaNumeroProcesso({ numeroProcesso: " 25BR0001 " })!;
    expect(c).toMatchObject({ id: "painel-numero-processo", valor: "25BR0001", mono: true, chave: "numeroProcesso" });
    expect(celulaNumeroProcesso({ numeroProcesso: "   " })).toBeNull();
    expect(celulaNumeroProcesso({ numeroProcesso: undefined })).toBeNull();
  });
});

describe("haLinhaDeCima", () => {
  it("só com pasta/PO, Ordem N ou pagamento", () => {
    expect(haLinhaDeCima({ pastaPo: "", ordem: "", pagamento: null })).toBe(false);
    expect(haLinhaDeCima({ pastaPo: "Pasta 1", ordem: "", pagamento: null })).toBe(true);
    expect(haLinhaDeCima({ pastaPo: "", ordem: "Ordem 2", pagamento: null })).toBe(true);
    expect(haLinhaDeCima({ pastaPo: "", ordem: "", pagamento: "Pago" })).toBe(true);
  });
});

describe("itensMedicamentos: campos aditivos (quantidade e nome separados; linha e extra como sempre)", () => {
  it("quantidade e nome separados, mantendo `linha` e `extra`", () => {
    const [a, b, c] = itensMedicamentos([
      { nome: "Opdivo", dosagem: "40mg", quantidade: "6 caixas", laboratorio: "BMS", brand: "referencia" },
      { nome: "NIVOLUMABE" },
      { nome: "  " },
    ]);
    expect(a).toEqual({ linha: "6 caixas — Opdivo 40mg", extra: "BMS · Referência", quantidade: "6 caixas", nome: "Opdivo 40mg" });
    expect(b).toEqual({ linha: "NIVOLUMABE", extra: "", quantidade: "", nome: "NIVOLUMABE" });
    expect(c).toBeUndefined();
  });
});

describe("etiquetaPagamentoDe (compartilhada com o card)", () => {
  it("Pago verde, Pendente âmbar, vazio = nenhuma", () => {
    expect(etiquetaPagamentoDe("pago")).toEqual({ texto: "Pago", classe: "bg-green-100 text-green-800" });
    expect(etiquetaPagamentoDe("pendente")).toEqual({ texto: "Pendente", classe: "bg-amber-100 text-amber-800" });
    expect(etiquetaPagamentoDe(undefined)).toBeNull();
    expect(etiquetaPagamentoDe(null)).toBeNull();
    expect(etiquetaPagamentoDe("" as never)).toBeNull();
  });
});

describe("ícones compartilhados", () => {
  it("os 6 do card não mudaram de desenho (primeiro path de cada um), o calendário da previsão foi acrescentado e todos os do painel existem", () => {
    expect(Object.keys(ICONES_CARD)).toEqual(["responsavel", "consultor", "pendencias", "fornecedor", "despachante", "aereo", "previsao"]);
    // Calendário (lucide): rect x3 y4 w18 h18 rx2 (como path) + M16 2v4, M8 2v4, M3 10h18.
    expect(ICONES_CARD.previsao).toEqual(["M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", "M16 2v4", "M8 2v4", "M3 10h18"]);
    expect(ICONES_CARD.responsavel[0]).toBe("M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2");
    expect(ICONES_CARD.aereo[0]!.startsWith("M17.8 19.2 16 11")).toBe(true);
    for (const chave of ["envio", "awb", "transportadora", "local", "numeroProcesso", "mover", "editar", "fechar", "alerta", "lixeira"] as const) {
      expect(ICONES_PROCESSO[chave].length, chave).toBeGreaterThan(0);
      for (const d of ICONES_PROCESSO[chave]) expect(d, chave).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9\s.,-]+$/);
    }
    expect(ICONES_PROCESSO.fechar).toEqual(["M18 6 6 18", "m6 6 12 12"]);
    expect(ICONES_PROCESSO.awb).toHaveLength(5);
  });
});

describe("dataCabeNaCelula: só DD/MM e DD/MM/AAAA ficam em 1 coluna", () => {
  it("datas curtas cabem; anotações não", () => {
    for (const v of ["05/08", "5/8", "10/08/2026", "10/08/26", " 05/08 "]) expect(dataCabeNaCelula(v), v).toBe(true);
    for (const v of ["09/10 - agd. análise", "fim do mês", "Entre 28/08 e 02/09", "", "2026-11-25"]) expect(dataCabeNaCelula(v), v).toBe(false);
  });
});
