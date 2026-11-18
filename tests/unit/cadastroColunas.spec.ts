import { describe, expect, it } from "vitest";
import type { CiaAerea, Despachante, Fornecedor, Transportadora } from "../../shared/types/Cadastro";
import {
  colunasDaLista,
  filtrarPorNome,
  linhaSecundaria,
  temPix,
  textoAlerta,
  textoContagem,
  textoEncontrados,
  textoPix,
} from "../../app/utils/cadastroColunas";

// Colunas, contagem, busca e linha de resumo da aba Cadastros. A chave PIX NUNCA aparece nestes textos: só
// "Cadastrada" / "—" / "PIX cadastrada". Valores fictícios.

const BASE = { id: "x", ativo: true, atualizadoPor: "", createdAt: "", updatedAt: "" };
const PIX = "chave-ficticia-coluna-0001";
const forn = (e: Partial<Fornecedor> = {}): Fornecedor => ({ ...BASE, nome: "Poros", pais: "Turquia", prazoAlertaDias: 3, semAlerta: false, ...e });
const desp = (e: Partial<Despachante> = {}): Despachante => ({ ...BASE, nome: "STAR CUSTOMS", contatoNome: "", telefone: "", email: "", ...e });
const transp = (e: Partial<Transportadora> = {}): Transportadora => ({ ...BASE, nome: "DHL", ...e });
const cia = (e: Partial<CiaAerea> = {}): CiaAerea => ({ ...BASE, nome: "Lufthansa", ...e });

describe("colunas de cada lista (além de Nome e Ativo)", () => {
  it("fornecedores: País e Prazo de alerta", () => {
    expect(colunasDaLista("fornecedores").map((c) => c.titulo)).toEqual(["País", "Prazo de alerta"]);
    expect(colunasDaLista("fornecedores", true).map((c) => c.titulo)).toEqual(["País", "Prazo de alerta"]); // sem PIX
  });

  it("despachantes: Contato, Telefone, E-mail e — só para quem recebe a chave — PIX", () => {
    expect(colunasDaLista("despachantes").map((c) => c.titulo)).toEqual(["Contato", "Telefone", "E-mail"]);
    expect(colunasDaLista("despachantes", false).map((c) => c.titulo)).toEqual(["Contato", "Telefone", "E-mail"]);
    expect(colunasDaLista("despachantes", true).map((c) => c.titulo)).toEqual(["Contato", "Telefone", "E-mail", "PIX"]);
  });

  it("transportadoras: só PIX, e só para quem recebe a chave; cias aéreas: nenhuma", () => {
    expect(colunasDaLista("transportadoras")).toEqual([]);
    expect(colunasDaLista("transportadoras", true).map((c) => c.titulo)).toEqual(["PIX"]);
    expect(colunasDaLista("cias-aereas")).toEqual([]);
    expect(colunasDaLista("cias-aereas", true)).toEqual([]);
  });

  it("textos: vazio vira travessão; prazo é 'Sem alerta' ou 'N dias' (singular em 1)", () => {
    const [pais, alerta] = colunasDaLista("fornecedores");
    expect(pais!.texto(forn({ pais: "" }))).toBe("—");
    expect(pais!.texto(forn())).toBe("Turquia");
    expect(alerta!.texto(forn({ prazoAlertaDias: 10 }))).toBe("10 dias");
    expect(alerta!.texto(forn({ semAlerta: true, prazoAlertaDias: null }))).toBe("Sem alerta");
    expect(textoAlerta({ semAlerta: false, prazoAlertaDias: 1 })).toBe("1 dia");
    const [contato, telefone, email] = colunasDaLista("despachantes");
    expect(contato!.texto(desp())).toBe("—");
    expect(telefone!.texto(desp({ telefone: "11 3333-4444" }))).toBe("11 3333-4444");
    expect(email!.texto(desp({ email: "a@b.co" }))).toBe("a@b.co");
  });
});

describe("coluna PIX: só 'Cadastrada' ou '—', nunca a chave", () => {
  it("com chave: 'Cadastrada'; vazia, só espaços ou ausente: '—'", () => {
    expect(textoPix(desp({ chavePix: PIX }))).toBe("Cadastrada");
    expect(textoPix(transp({ chavePix: PIX }))).toBe("Cadastrada");
    expect(textoPix(desp({ chavePix: "" }))).toBe("—");
    expect(textoPix(desp({ chavePix: "   " }))).toBe("—");
    expect(textoPix(transp())).toBe("—"); // campo ausente (quem não recebe a chave)
    expect(temPix(transp({ chavePix: PIX }))).toBe(true);
    expect(temPix(transp())).toBe(false);
  });

  it("o texto da coluna e o resumo do celular nunca contêm a chave", () => {
    const colunaPix = colunasDaLista("despachantes", true).find((c) => c.chave === "pix")!;
    expect(colunaPix.texto(desp({ chavePix: PIX }))).not.toContain(PIX);
    for (const [lista, item] of [["despachantes", desp({ contatoNome: "Fulano", chavePix: PIX })], ["transportadoras", transp({ chavePix: PIX })]] as const) {
      expect(linhaSecundaria(lista, item, true), lista).not.toContain(PIX);
    }
  });
});

describe("linha secundária (celular)", () => {
  it("fornecedor: 'país · prazo' (sem país, só o prazo)", () => {
    expect(linhaSecundaria("fornecedores", forn())).toBe("Turquia · 3 dias");
    expect(linhaSecundaria("fornecedores", forn({ pais: "" }))).toBe("3 dias");
    expect(linhaSecundaria("fornecedores", forn({ semAlerta: true, prazoAlertaDias: null }))).toBe("Turquia · Sem alerta");
  });

  it("despachante: contato e, com chave e permissão, 'PIX cadastrada'", () => {
    expect(linhaSecundaria("despachantes", desp({ contatoNome: "Fulano", chavePix: PIX }), true)).toBe("Fulano · PIX cadastrada");
    expect(linhaSecundaria("despachantes", desp({ contatoNome: "Fulano", chavePix: PIX }), false)).toBe("Fulano");
    expect(linhaSecundaria("despachantes", desp({ chavePix: PIX }), true)).toBe("PIX cadastrada");
    expect(linhaSecundaria("despachantes", desp(), true)).toBe("");
  });

  it("transportadora: 'PIX cadastrada' só com chave e permissão; cia aérea: nada", () => {
    expect(linhaSecundaria("transportadoras", transp({ chavePix: PIX }), true)).toBe("PIX cadastrada");
    expect(linhaSecundaria("transportadoras", transp({ chavePix: PIX }), false)).toBe("");
    expect(linhaSecundaria("transportadoras", transp({ chavePix: "" }), true)).toBe("");
    expect(linhaSecundaria("cias-aereas", cia(), true)).toBe("");
  });
});

describe("contagem do cabeçalho", () => {
  it("'total · ativos'", () => {
    const treze = Array.from({ length: 13 }, (_, i) => ({ ativo: true, nome: `F${i}` }));
    expect(textoContagem(treze)).toBe("13 · 13 ativos");
    expect(textoContagem([...treze.slice(0, 11), { ativo: false, nome: "x" }, { ativo: false, nome: "y" }])).toBe("13 · 11 ativos");
    expect(textoContagem([{ ativo: true }])).toBe("1 · 1 ativo");
    expect(textoContagem([])).toBe("0 · 0 ativos");
    expect(textoContagem([{ ativo: false }])).toBe("1 · 0 ativos");
  });

  it("com busca: 'N encontrado(s)'", () => {
    expect(textoEncontrados(0)).toBe("0 encontrados");
    expect(textoEncontrados(1)).toBe("1 encontrado");
    expect(textoEncontrados(5)).toBe("5 encontrados");
  });
});

describe("busca por nome", () => {
  const itens = [{ nome: "Speciality" }, { nome: "Can Pharma" }, { nome: "Baiyue" }, { nome: "Zürich Logística" }];

  it("sem acento, sem diferença de caixa e com espaços colapsados", () => {
    expect(filtrarPorNome(itens, "SPEC").map((i) => i.nome)).toEqual(["Speciality"]);
    expect(filtrarPorNome(itens, "  can   pharma ").map((i) => i.nome)).toEqual(["Can Pharma"]);
    expect(filtrarPorNome(itens, "zurich").map((i) => i.nome)).toEqual(["Zürich Logística"]);
    expect(filtrarPorNome(itens, "logistica").map((i) => i.nome)).toEqual(["Zürich Logística"]);
  });

  it("acha no meio do nome e mantém a ordem recebida", () => {
    expect(filtrarPorNome(itens, "a").map((i) => i.nome)).toEqual(["Speciality", "Can Pharma", "Baiyue", "Zürich Logística"]);
    expect(filtrarPorNome(itens, "ty").map((i) => i.nome)).toEqual(["Speciality"]);
  });

  it("termo vazio ou só espaços devolve tudo (uma cópia); sem resultado devolve vazio", () => {
    expect(filtrarPorNome(itens, "")).toEqual(itens);
    expect(filtrarPorNome(itens, "   ")).toEqual(itens);
    expect(filtrarPorNome(itens, "")).not.toBe(itens);
    expect(filtrarPorNome(itens, "xyz")).toEqual([]);
  });

  it("não procura por país, contato nem chave PIX: só pelo nome", () => {
    const comOutrosCampos = [{ nome: "DHL", chavePix: PIX, pais: "Alemanha", contatoNome: "Fulano" }];
    expect(filtrarPorNome(comOutrosCampos, "ficticia")).toEqual([]);
    expect(filtrarPorNome(comOutrosCampos, "alemanha")).toEqual([]);
    expect(filtrarPorNome(comOutrosCampos, "dhl")).toHaveLength(1);
  });
});
