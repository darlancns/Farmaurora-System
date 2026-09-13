import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatInvoiceAmountBR,
  maskCurrencyDigits,
  maskDateDdMm,
  normalizeCurrencyInput,
  padTwoDigits,
  parseBrCurrency,
  toTitleCaseName,
} from "../../app/utils/formatters";

// TESTE DE CARACTERIZAÇÃO — Round 1, item (c): app/utils/formatters.ts.
// Documenta o comportamento ATUAL, sem corrigir nada. app/utils/formatters.ts
// não foi alterado nesta rodada.

describe("normalizeCurrencyInput", () => {
  it("só vírgula: vírgula é o separador decimal (BR)", () => {
    expect(normalizeCurrencyInput("1234,5")).toBe("1.234,5");
  });

  it("só ponto, grupo final != 3 dígitos: ponto é decimal", () => {
    // groups = ["1234","5"] -> lastGroup.length = 1 (!= 3) -> ponto vira decimal.
    expect(normalizeCurrencyInput("1234.5")).toBe("1.234,5");
  });

  it("FRONTEIRA: só ponto, grupo final com exatamente 3 dígitos: ponto é separador de milhar, não decimal", () => {
    // groups = ["1","234"] -> lastGroup.length === 3 -> junta tudo como inteiro.
    // "1.234" digitado assim vira 1234 (sem casas decimais), não 1,234.
    expect(normalizeCurrencyInput("1.234")).toBe("1.234");
  });

  it("vírgula E ponto, ponto depois da vírgula (formato US colado: 1,234.56): ponto vence como decimal", () => {
    expect(normalizeCurrencyInput("1,234.56")).toBe("1.234,56");
  });

  it("vírgula E ponto, vírgula depois do ponto (formato BR: 1.234,56): vírgula vence como decimal", () => {
    expect(normalizeCurrencyInput("1.234,56")).toBe("1.234,56");
  });

  it("entrada já numérica limpa (só dígitos, sem separador): tratada como parte inteira, ganha agrupamento de milhar", () => {
    expect(normalizeCurrencyInput("12345")).toBe("12.345");
  });

  it("parte decimal é truncada em 2 dígitos (não arredondada)", () => {
    expect(normalizeCurrencyInput("1,23456")).toBe("1,23");
  });

  it("FRONTEIRA: entrada degenerada (só o separador, sem dígitos) cai no fallback '0'", () => {
    expect(normalizeCurrencyInput(",")).toBe("0");
  });

  it("caracteres fora de [0-9,.] são descartados antes de tudo (ex: prefixo de moeda)", () => {
    expect(normalizeCurrencyInput("R$ 1.234,56")).toBe("1.234,56");
  });
});

describe("maskCurrencyDigits", () => {
  it("string vazia -> string vazia", () => {
    expect(maskCurrencyDigits("")).toBe("");
  });

  it("digitação progressiva: '1' -> '0,01' (os 2 últimos dígitos são sempre centavos)", () => {
    expect(maskCurrencyDigits("1")).toBe("0,01");
  });

  it("digitação progressiva: '12' -> '0,12'", () => {
    expect(maskCurrencyDigits("12")).toBe("0,12");
  });

  it("digitação progressiva: '123' -> '1,23'", () => {
    expect(maskCurrencyDigits("123")).toBe("1,23");
  });

  it("digitação progressiva: '1234' -> '12,34'", () => {
    expect(maskCurrencyDigits("1234")).toBe("12,34");
  });

  it("digitação progressiva: '1234567' -> '12.345,67' (agrupamento de milhar entra na parte inteira)", () => {
    expect(maskCurrencyDigits("1234567")).toBe("12.345,67");
  });

  it("zeros à esquerda na parte inteira somem (ex: '00123' -> '1,23')", () => {
    expect(maskCurrencyDigits("00123")).toBe("1,23");
  });

  it("ignora qualquer caractere não-dígito na entrada (mesmo resultado de '123')", () => {
    expect(maskCurrencyDigits("R$1,23")).toBe("1,23");
  });
});

describe("maskDateDdMm", () => {
  // Round 1b: esta função (app/utils/formatters.ts) agora usa a MESMA
  // proteção de app/utils/processoFormatters.ts's maskDataDDMM — só mexe no
  // valor enquanto ele for puramente numérico (0 a 4 dígitos); qualquer outra
  // coisa (texto livre, ou o próprio "/" que a máscara já inseriu) volta
  // inalterada. O ano de fechamento (DD/MM/AAAA) também deixou de ser fixo —
  // usa o ano corrente (nunca hardcodado de novo aqui no teste).
  const anoAtual = new Date().getFullYear();

  it("digitação progressiva: 1 dígito fica cru", () => {
    expect(maskDateDdMm("2")).toBe("2");
  });

  it("digitação progressiva: 2 dígitos ficam crus (ainda sem barra)", () => {
    expect(maskDateDdMm("27")).toBe("27");
  });

  it("digitação progressiva: 3 dígitos -> DD/M (barra já aparece, mês parcial)", () => {
    expect(maskDateDdMm("270")).toBe("27/0");
  });

  it("digitação progressiva: 4 dígitos -> DD/MM/AAAA com o ano CORRENTE (não mais fixo)", () => {
    expect(maskDateDdMm("2708")).toBe(`27/08/${anoAtual}`);
  });

  it("FRONTEIRA: mais de 4 dígitos puros (ex: colar '270899') não bate no formato esperado — devolve cru, sem mascarar", () => {
    // Mesma regra de maskDataDDMM: a proteção exige 0-4 dígitos EXATOS; um
    // valor com 5+ dígitos (colado de uma vez, não digitado progressivamente)
    // não é "puramente numérico até 4 dígitos" e passa direto, sem máscara.
    expect(maskDateDdMm("270899")).toBe("270899");
  });

  it("protege texto livre: texto sem formato de data numérica volta inalterado (não vira mais string vazia)", () => {
    expect(maskDateDdMm("ASD")).toBe("ASD");
  });

  it("protege texto livre: uma data com anotação (ex: '26/11 - obs') não perde mais a anotação, porque já tem '/' e não bate mais no formato puramente numérico", () => {
    expect(maskDateDdMm("26/11 - estratégia da compra")).toBe("26/11 - estratégia da compra");
  });

  it("já tem uma barra (mascarada ou colada) -> não mexe mais, mesmo em formato DD/MM válido", () => {
    // Consistente com maskDataDDMM: uma vez que o valor tem "/", a função para
    // de agir e devolve como está — é o que permite o usuário digitar livre
    // depois que a barra já apareceu.
    expect(maskDateDdMm("27/08")).toBe("27/08");
  });
});

describe("toTitleCaseName", () => {
  it("conectores 'de/da/do/das/dos/e' ficam minúsculos QUANDO NÃO são a 1ª palavra", () => {
    expect(toTitleCaseName("joão da silva de souza")).toBe("João da Silva de Souza");
  });

  it("conector 'e' entre nomes também fica minúsculo", () => {
    expect(toTitleCaseName("joão e maria")).toBe("João e Maria");
  });

  it("FRONTEIRA: um conector como 1ª palavra NÃO é minúsculo (regra só vale a partir do índice > 0)", () => {
    expect(toTitleCaseName("de souza")).toBe("De Souza");
  });

  it("nome com acento na 1ª letra é capitalizado corretamente", () => {
    expect(toTitleCaseName("álvaro")).toBe("Álvaro");
  });

  it("nome já em maiúsculas é normalizado (força minúsculo e recapitaliza, não é só um no-op)", () => {
    expect(toTitleCaseName("MARIA EDUARDA")).toBe("Maria Eduarda");
  });

  it("nome já em minúsculas é capitalizado normalmente", () => {
    expect(toTitleCaseName("maria eduarda")).toBe("Maria Eduarda");
  });

  it("espaço duplo produz um segmento vazio que é preservado como está (o espaço duplo não é colapsado)", () => {
    expect(toTitleCaseName("maria  eduarda")).toBe("Maria  Eduarda");
  });
});

// Cobertura leve do restante do módulo (não pedida explicitamente, mas
// investigado "por inteiro" como pedido).
describe("padTwoDigits / formatCurrency / parseBrCurrency / formatInvoiceAmountBR", () => {
  it("padTwoDigits: preenche com zero à esquerda até 2 dígitos", () => {
    expect(padTwoDigits(5)).toBe("05");
    expect(padTwoDigits(12)).toBe("12");
  });

  it("padTwoDigits: número com 3+ dígitos não é truncado, só não ganha padding", () => {
    expect(padTwoDigits(123)).toBe("123");
  });

  it("formatCurrency: sempre 2 casas decimais, separador de milhar BR", () => {
    expect(formatCurrency(1234.5)).toBe("1.234,50");
    expect(formatCurrency(0)).toBe("0,00");
  });

  it("parseBrCurrency: converte 'nn.nnn,nn' de volta pro number", () => {
    expect(parseBrCurrency("1.234,56")).toBe(1234.56);
  });

  it("parseBrCurrency: entrada vazia ou inválida vira 0 (nunca NaN)", () => {
    expect(parseBrCurrency("")).toBe(0);
    expect(parseBrCurrency("abc")).toBe(0);
  });

  it("formatInvoiceAmountBR: formato US colado ($8,550.00) normaliza pra BR", () => {
    expect(formatInvoiceAmountBR("$8,550.00")).toBe("8.550,00");
  });

  it("formatInvoiceAmountBR: valor sem decimais ($9,835) ganha ',00'", () => {
    expect(formatInvoiceAmountBR("$9,835")).toBe("9.835,00");
  });
});
