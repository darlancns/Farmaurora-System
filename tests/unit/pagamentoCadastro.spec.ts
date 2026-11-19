import { describe, expect, it } from "vitest";
import type { ItemCadastroPagamento } from "../../shared/types/Pagamento";
import {
  acharFornecedorPorTexto,
  acharItemPorNome,
  mesmoNomeCadastro,
  nomeFornecedorSemPais,
  paisDoFornecedorNoCadastro,
  rotuloFornecedorPagamento,
  rotuloValorGravado,
} from "../../shared/utils/pagamentoCadastro";
import {
  fornecedoresFixos,
  montarOpcoesFornecedor,
  montarOpcoesNome,
  opcoesFiltroDosDados,
  passaFiltroNome,
} from "../../app/utils/pagamentoOptions";
import { paisFornecedor } from "../../app/utils/pagamentoExport";

// Como a tela de Pagamentos usa as listas dos Cadastros: casamento por chaveCadastro, só ativos para valor novo, valores
// antigos continuam aparecendo como estão gravados, "(inativo)" só para item que existe no Cadastro como inativo e o país
// da exportação vindo do Cadastro. Nomes "TESTE"; nada de paciente nem de chave PIX.

const item = (nome: string, ativo = true, pais = ""): ItemCadastroPagamento => ({ nome, ativo, pais });

const despachantes = [item("TESTE Despachante Alfa"), item("TESTE Despachante Beta"), item("TESTE Despachante Inativo", false)];
const fornecedores = [
  item("TESTE Fornecedor Alfa", true, "Chile"),
  item("TESTE Fornecedor Beta", true, ""),
  item("TESTE Fornecedor Inativo", false, "Peru"),
];

describe("casamento por chaveCadastro", () => {
  it("ignora acento, caixa e espaços repetidos", () => {
    expect(mesmoNomeCadastro("  Água   Azul ", "agua azul")).toBe(true);
    expect(mesmoNomeCadastro("TESTE A", "TESTE B")).toBe(false);
    expect(acharItemPorNome(despachantes, "  teste  DESPACHANTE beta ")?.nome).toBe("TESTE Despachante Beta");
  });

  it("nome vazio nunca casa com nada", () => {
    expect(acharItemPorNome(despachantes, "   ")).toBeUndefined();
    expect(acharFornecedorPorTexto(fornecedores, "")).toBeUndefined();
  });
});

describe("fornecedor: texto 'Nome - País' montado do Cadastro", () => {
  it("nome + ' - ' + país; sem país, só o nome", () => {
    expect(rotuloFornecedorPagamento(item("Beldimed", true, "Bélgica"))).toBe("Beldimed - Bélgica");
    expect(rotuloFornecedorPagamento(item("TESTE Fornecedor Beta", true, "  "))).toBe("TESTE Fornecedor Beta");
  });

  it("tira o ' - País' final (o último separador com espaços)", () => {
    expect(nomeFornecedorSemPais("Beldimed - Bélgica")).toBe("Beldimed");
    expect(nomeFornecedorSemPais("Trans-Rápido - Turquia")).toBe("Trans-Rápido");
    expect(nomeFornecedorSemPais("Sem separador")).toBe("Sem separador");
  });

  it("acha o fornecedor pelo texto inteiro ou pelo nome sem o país", () => {
    expect(acharFornecedorPorTexto(fornecedores, "teste fornecedor alfa - chile")?.nome).toBe("TESTE Fornecedor Alfa");
    expect(acharFornecedorPorTexto(fornecedores, "TESTE Fornecedor Alfa - Argentina")?.nome).toBe("TESTE Fornecedor Alfa");
    expect(acharFornecedorPorTexto(fornecedores, "TESTE Fornecedor Beta")?.nome).toBe("TESTE Fornecedor Beta");
    expect(acharFornecedorPorTexto(fornecedores, "TESTE Desconhecido - Chile")).toBeUndefined();
  });

  it("rótulo de valor gravado: '(inativo)' só quando o item existe no Cadastro como inativo", () => {
    expect(rotuloValorGravado("X", item("X", false))).toBe("X (inativo)");
    expect(rotuloValorGravado("X", item("X", true))).toBe("X");
    expect(rotuloValorGravado("Nome Antigo", undefined)).toBe("Nome Antigo"); // não existe no Cadastro: como está
  });
});

describe("select de despachante/transportadora", () => {
  it("lista só os ATIVOS (mais 'Selecione'): inativo não pode ser escolhido para lançamento novo", () => {
    expect(montarOpcoesNome(despachantes)).toEqual([
      { value: "", label: "Selecione" },
      { value: "TESTE Despachante Alfa", label: "TESTE Despachante Alfa" },
      { value: "TESTE Despachante Beta", label: "TESTE Despachante Beta" },
    ]);
  });

  it("valor atual ativo não duplica a opção", () => {
    expect(montarOpcoesNome(despachantes, "teste despachante alfa")).toHaveLength(3);
  });

  it("valor atual de item INATIVO entra como opção extra, marcado '(inativo)'", () => {
    const o = montarOpcoesNome(despachantes, "TESTE Despachante Inativo");
    expect(o.at(-1)).toEqual({ value: "TESTE Despachante Inativo", label: "TESTE Despachante Inativo (inativo)" });
  });

  it("nome antigo que não existe no Cadastro continua aparecendo como está gravado, SEM '(inativo)'", () => {
    const o = montarOpcoesNome(despachantes, "TESTE Nome Antigo");
    expect(o.at(-1)).toEqual({ value: "TESTE Nome Antigo", label: "TESTE Nome Antigo" });
    expect(o.some((x) => x.value === "TESTE Despachante Inativo")).toBe(false);
  });
});

describe("select de fornecedor do lançamento", () => {
  it("'Nome - País' dos ativos, 'Outro' por último, inativo fora", () => {
    expect(montarOpcoesFornecedor(fornecedores).map((o) => o.value)).toEqual([
      "",
      "TESTE Fornecedor Alfa - Chile",
      "TESTE Fornecedor Beta",
      "Outro",
    ]);
  });

  it("edição de lançamento de fornecedor INATIVO: o valor gravado continua escolhido, marcado '(inativo)'", () => {
    const atual = "TESTE Fornecedor Inativo - Peru";
    expect(fornecedoresFixos(fornecedores, atual)).toContain(atual);
    const o = montarOpcoesFornecedor(fornecedores, atual);
    expect(o.find((x) => x.value === atual)?.label).toBe(`${atual} (inativo)`);
    expect(o.at(-1)?.value).toBe("Outro");
  });

  it("valor antigo que o Cadastro não conhece NÃO vira opção fixa (a tela o carrega como 'Outro', texto livre, como hoje)", () => {
    expect(fornecedoresFixos(fornecedores, "TESTE Antigo - Chile")).toEqual(["TESTE Fornecedor Alfa - Chile", "TESTE Fornecedor Beta"]);
  });
});

describe("filtros: valores que já existem nos dados", () => {
  const achar = (valor: string) => acharItemPorNome(despachantes, valor);

  it("lista os nomes dos dados, sem repetição por chaveCadastro, em ordem alfabética, como estão gravados", () => {
    const o = opcoesFiltroDosDados(["TESTE Despachante Beta", "teste despachante beta", "TESTE Nome Antigo", "TESTE Despachante Alfa"], achar, "Todos");
    expect(o).toEqual([
      { value: "", label: "Todos" },
      { value: "TESTE Despachante Alfa", label: "TESTE Despachante Alfa" },
      { value: "TESTE Despachante Beta", label: "TESTE Despachante Beta" },
      { value: "TESTE Nome Antigo", label: "TESTE Nome Antigo" },
    ]);
  });

  it("'(inativo)' só quando existe no Cadastro como inativo; nome antigo (fora do Cadastro) não leva o selo", () => {
    const o = opcoesFiltroDosDados(["TESTE Despachante Inativo", "TESTE Nome Antigo"], achar, "Todos");
    expect(o.map((x) => x.label)).toEqual(["Todos", "TESTE Despachante Inativo (inativo)", "TESTE Nome Antigo"]);
    expect(o[1]!.value).toBe("TESTE Despachante Inativo"); // o valor continua sendo o texto gravado
  });

  it("filtro compara por chaveCadastro: vazio passa tudo; grafia diferente do mesmo nome passa", () => {
    expect(passaFiltroNome("", "qualquer")).toBe(true);
    expect(passaFiltroNome("TESTE Despachante Beta", "teste  despachante BETA")).toBe(true);
    expect(passaFiltroNome("TESTE Despachante Beta", "TESTE Despachante Alfa")).toBe(false);
  });

  it("fornecedores: o selo usa o casamento do texto gravado com o Cadastro", () => {
    const o = opcoesFiltroDosDados(
      ["TESTE Fornecedor Inativo - Peru", "TESTE Fornecedor Alfa - Chile"],
      (v) => acharFornecedorPorTexto(fornecedores, v),
      "Todos os fornecedores",
    );
    expect(o.map((x) => x.label)).toEqual(["Todos os fornecedores", "TESTE Fornecedor Alfa - Chile", "TESTE Fornecedor Inativo - Peru (inativo)"]);
  });
});

describe("exportação: país do fornecedor vem do Cadastro", () => {
  it("usa o campo país do Cadastro, casando o nome sem o ' - País' (em maiúsculas)", () => {
    expect(paisFornecedor("TESTE Fornecedor Alfa - Chile", fornecedores)).toBe("CHILE");
    // O texto gravado diz outro país: vale o do Cadastro (a fonte é o campo `pais`).
    expect(paisFornecedor("teste fornecedor alfa - Argentina", fornecedores)).toBe("CHILE");
    expect(paisFornecedor("TESTE Fornecedor Inativo - Peru", fornecedores)).toBe("PERU"); // inativo também tem país
  });

  it("o mapa fixo NÃO manda mais quando o Cadastro conhece o fornecedor", () => {
    const cadastro = [item("Poros", true, "Marrocos")];
    expect(paisFornecedor("Poros - Turquia", cadastro)).toBe("MARROCOS");
    expect(paisDoFornecedorNoCadastro(cadastro, "Poros - Turquia")).toBe("MARROCOS");
  });

  it("não achou no Cadastro (ou sem país lá): mantém o comportamento atual para o texto gravado", () => {
    expect(paisFornecedor("Poros - Turquia", fornecedores)).toBe("TURQUIA"); // mapa de reserva
    expect(paisFornecedor("Acme Livre - Alemanha", fornecedores)).toBe("ALEMANHA");
    expect(paisFornecedor("TESTE Fornecedor Beta", fornecedores)).toBeNull(); // existe, mas sem país e sem " - País"
    expect(paisFornecedor("Acme Livre")).toBeNull();
  });
});
