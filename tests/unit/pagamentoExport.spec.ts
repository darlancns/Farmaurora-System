import { describe, expect, it } from "vitest";
import { paisFornecedor, sanitizeNomeArquivo } from "../../app/utils/pagamentoExport";

// Só as funções puras de pagamentoExport. `copiarImagemParaClipboard` e
// `baixarBlob` dependem de DOM/Clipboard e ficam fora daqui.

describe("paisFornecedor", () => {
  // Formato real dos 4 fornecedores fixos (FORNECEDORES_PAGAMENTO em
  // shared/constants/pagamentos.ts): resolvem pelo mapa interno.
  it("devolve o país dos 4 fornecedores fixos em maiúsculas", () => {
    expect(paisFornecedor("Beldimed - Bélgica")).toBe("BÉLGICA");
    expect(paisFornecedor("Pharyx - China")).toBe("CHINA");
    expect(paisFornecedor("Poros - Turquia")).toBe("TURQUIA");
    expect(paisFornecedor("Speciality - Índia")).toBe("ÍNDIA");
  });

  // Regressão: "Outro" é texto livre e o nome pode ter hífen. O país é o que
  // vem depois do ÚLTIMO " - "; partir no primeiro hífen devolvia "RÁPIDO".
  it("usa o último ' - ' quando o nome do fornecedor tem hífen", () => {
    expect(paisFornecedor("Trans-Rápido - Turquia")).toBe("TURQUIA");
    expect(paisFornecedor("Med-Line-Express - Índia")).toBe("ÍNDIA");
  });

  it("aceita fornecedor livre fora do mapa", () => {
    expect(paisFornecedor("Fornecedor Novo - Alemanha")).toBe("ALEMANHA");
  });

  it("normaliza o país para maiúsculas", () => {
    expect(paisFornecedor("Acme - portugal")).toBe("PORTUGAL");
    expect(paisFornecedor("Acme - CoReIa Do SuL")).toBe("COREIA DO SUL");
  });

  it("devolve null quando não há ' - '", () => {
    expect(paisFornecedor("Fornecedor Qualquer")).toBeNull();
    expect(paisFornecedor("")).toBeNull();
  });

  // DECISÃO DELIBERADA, não bug: sem espaços ao redor do hífen não dá para
  // distinguir separador de nome composto ("Trans-Rápido"), então um fornecedor
  // livre fora do mapa escrito "Acme-Chile" devolve null em vez de "CHILE".
  // Os fixos não são afetados: "Poros-Turquia" ainda resolve pelo mapa.
  it("devolve null para fornecedor livre sem espaços no separador", () => {
    expect(paisFornecedor("Acme-Chile")).toBeNull();
    expect(paisFornecedor("Poros-Turquia")).toBe("TURQUIA"); // fixo: vem do mapa
  });

  it("devolve null quando o país está vazio depois do separador", () => {
    expect(paisFornecedor("Acme - ")).toBeNull();
  });
});

describe("sanitizeNomeArquivo", () => {
  it("remove acentos", () => {
    expect(sanitizeNomeArquivo("André Vitório")).toBe("andre-vitorio");
    expect(sanitizeNomeArquivo("José da Conceição")).toBe("jose-da-conceicao");
  });

  it("troca espaços e símbolos por um único hífen", () => {
    expect(sanitizeNomeArquivo("São Paulo & Cia")).toBe("sao-paulo-cia");
    expect(sanitizeNomeArquivo("Marcelo   Lima")).toBe("marcelo-lima");
    expect(sanitizeNomeArquivo("a -- b")).toBe("a-b");
  });

  it("remove hífens das pontas", () => {
    expect(sanitizeNomeArquivo("  Trans-Rápido  Ltda.  ")).toBe("trans-rapido-ltda");
    expect(sanitizeNomeArquivo("-Bruno Lopes-")).toBe("bruno-lopes");
  });

  it("preserva dígitos", () => {
    expect(sanitizeNomeArquivo("Lote 42 - USD")).toBe("lote-42-usd");
  });

  // Entradas degeneradas não quebram: viram string vazia (o chamador em
  // pagamentos.vue tem fallback "sem-nome").
  it("devolve string vazia para entrada vazia ou só de símbolos", () => {
    expect(sanitizeNomeArquivo("")).toBe("");
    expect(sanitizeNomeArquivo("   ")).toBe("");
    expect(sanitizeNomeArquivo("!!!")).toBe("");
    expect(sanitizeNomeArquivo("---")).toBe("");
  });
});
