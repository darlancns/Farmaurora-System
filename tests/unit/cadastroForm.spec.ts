import { describe, expect, it } from "vitest";
import type { Despachante, Fornecedor, CiaAerea, Transportadora } from "../../shared/types/Cadastro";
import {
  formDeItem,
  formVazio,
  itemComMesmoNome,
  listaTemEdicao,
  montarAlteracao,
  montarNovo,
} from "../../app/utils/cadastroForm";

// Regras puras do formulário de Cadastros (as colunas e a busca estão em cadastroColunas.spec.ts). Valores de PIX fictícios.

const BASE = { id: "x", ativo: true, atualizadoPor: "", createdAt: "", updatedAt: "" };
const forn = (e: Partial<Fornecedor> = {}): Fornecedor => ({ ...BASE, nome: "Poros", pais: "Turquia", prazoAlertaDias: 3, semAlerta: false, ...e });
const desp = (e: Partial<Despachante> = {}): Despachante => ({ ...BASE, nome: "STAR CUSTOMS", contatoNome: "", telefone: "", email: "", ...e });
const cia = (e: Partial<CiaAerea> = {}): CiaAerea => ({ ...BASE, nome: "Ambiente", ...e });
const transp = (e: Partial<Transportadora> = {}): Transportadora => ({ ...BASE, nome: "DHL", ...e });
const PIX = "chave-ficticia-form-0001";
const PIX2 = "chave-ficticia-form-0002";

describe("formulário do fornecedor — o alerta nasce SEM escolha", () => {
  it("formVazio não pré-seleciona 'Número de dias' nem 'Sem alerta'", () => {
    expect(formVazio().alertaOpcao).toBe("");
  });

  it("sem escolher o alerta não monta o corpo: devolve a mensagem de decidir", () => {
    const form = { ...formVazio(), nome: "Matsun" };
    const r = montarNovo("fornecedores", form);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.erro).toMatch(/Defina o alerta/);
  });

  it("'Número de dias' sem digitar os dias também é recusado; fora de 1–365 também", () => {
    const base = { ...formVazio(), nome: "Matsun", alertaOpcao: "dias" as const };
    expect(montarNovo("fornecedores", { ...base, prazoTexto: "" }).ok).toBe(false);
    expect(montarNovo("fornecedores", { ...base, prazoTexto: "0" }).ok).toBe(false);
    expect(montarNovo("fornecedores", { ...base, prazoTexto: "366" }).ok).toBe(false);
    expect(montarNovo("fornecedores", { ...base, prazoTexto: "2,5" }).ok).toBe(false);
    expect(montarNovo("fornecedores", { ...base, prazoTexto: "abc" }).ok).toBe(false);
  });

  it("o <input type=number> entrega NÚMERO no v-model: o corpo sai igual", () => {
    const base = { ...formVazio(), nome: "Matsun", alertaOpcao: "dias" as const };
    expect(montarNovo("fornecedores", { ...base, prazoTexto: 7 })).toMatchObject({ ok: true, valor: { prazoAlertaDias: 7 } });
    expect(montarNovo("fornecedores", { ...base, prazoTexto: "" }).ok).toBe(false);
  });

  it("número de dias válido e 'Sem alerta' montam o corpo", () => {
    const dias = montarNovo("fornecedores", { ...formVazio(), nome: " Matsun ", alertaOpcao: "dias", prazoTexto: "10", pais: " Japão " });
    expect(dias).toEqual({ ok: true, valor: { nome: "Matsun", pais: "Japão", semAlerta: false, prazoAlertaDias: 10 } });
    const sem = montarNovo("fornecedores", { ...formVazio(), nome: "Matsun", alertaOpcao: "sem", prazoTexto: "99" });
    expect(sem).toEqual({ ok: true, valor: { nome: "Matsun", pais: "", semAlerta: true, prazoAlertaDias: null } });
  });

  it("o nome 'Outro' é recusado", () => {
    const r = montarNovo("cias-aereas", { ...formVazio(), nome: "OUTRO" });
    expect(r.ok).toBe(false);
  });
});

describe("edição: o nome não vai no corpo", () => {
  it("formDeItem carrega o fornecedor (dias ou sem alerta) e o PATCH só leva país e alerta", () => {
    const f = formDeItem("fornecedores", forn());
    expect(f).toMatchObject({ nome: "Poros", pais: "Turquia", alertaOpcao: "dias", prazoTexto: "3" });
    expect(montarAlteracao("fornecedores", { ...f, nome: "Nome Mudado", prazoTexto: "7" })).toEqual({
      ok: true,
      valor: { pais: "Turquia", semAlerta: false, prazoAlertaDias: 7 },
    });

    const semAlerta = formDeItem("fornecedores", forn({ semAlerta: true, prazoAlertaDias: null }));
    expect(semAlerta).toMatchObject({ alertaOpcao: "sem", prazoTexto: "" });
    expect(montarAlteracao("fornecedores", semAlerta)).toEqual({
      ok: true,
      valor: { pais: "Turquia", semAlerta: true, prazoAlertaDias: null },
    });
  });

  it("despachante: PATCH só com contato, telefone e e-mail; formato validado só se preenchido", () => {
    const f = formDeItem("despachantes", desp({ contatoNome: "Fulano", telefone: "11 3333-4444", email: "a@b.co" }));
    expect(montarAlteracao("despachantes", f)).toEqual({
      ok: true,
      valor: { contatoNome: "Fulano", telefone: "11 3333-4444", email: "a@b.co" },
    });
    expect(montarAlteracao("despachantes", { ...f, email: "ruim" }).ok).toBe(false);
    expect(montarAlteracao("despachantes", { ...f, telefone: "", email: "" }).ok).toBe(true);
  });

  it("cia aérea não tem campo editável: só desativar/reativar", () => {
    expect(listaTemEdicao("cias-aereas")).toBe(false);
    expect(listaTemEdicao("cias-aereas", true)).toBe(false);
    expect(listaTemEdicao("fornecedores")).toBe(true);
    expect(listaTemEdicao("despachantes")).toBe(true);
    expect(montarAlteracao("cias-aereas", formDeItem("cias-aereas", cia())).ok).toBe(false);
  });

  it("transportadora só tem a chave PIX: edita quem a vê; quem não vê só desativa/reativa", () => {
    expect(listaTemEdicao("transportadoras", true)).toBe(true);
    expect(listaTemEdicao("transportadoras", false)).toBe(false);
  });
});

describe("itemComMesmoNome (aviso de duplicado e 'Reativar')", () => {
  const itens = [cia({ id: "a", nome: "Ambiente" }), cia({ id: "b", nome: "2°C a 8°C", ativo: false })];

  it("acha pelo nome normalizado (caixa, acento, espaços), ativo ou inativo", () => {
    expect(itemComMesmoNome(itens, "  AMBIENTE ")?.id).toBe("a");
    expect(itemComMesmoNome(itens, "2°c  a 8°C")?.id).toBe("b");
    expect(itemComMesmoNome(itens, "2°C a 8°C")?.ativo).toBe(false);
  });

  it("nome vazio ou novo → nenhum", () => {
    expect(itemComMesmoNome(itens, "")).toBeNull();
    expect(itemComMesmoNome(itens, "   ")).toBeNull();
    expect(itemComMesmoNome(itens, "Congelado")).toBeNull();
  });
});

describe("chave PIX no formulário (despachantes e transportadoras)", () => {
  it("formVazio e formDeItem: chave vazia por padrão; carrega a chave do item quando ela veio da API", () => {
    expect(formVazio().chavePix).toBe("");
    expect(formDeItem("despachantes", desp({ chavePix: PIX })).chavePix).toBe(PIX);
    expect(formDeItem("transportadoras", transp({ chavePix: PIX })).chavePix).toBe(PIX);
    expect(formDeItem("transportadoras", transp()).chavePix).toBe(""); // campo ausente (quem não recebe a chave)
    expect(formDeItem("fornecedores", forn()).chavePix).toBe("");
  });

  it("criar: a chave só vai no corpo com `incluirPix` (quem pode ver/gravar)", () => {
    const form = { ...formVazio(), nome: "DHL", chavePix: `  ${PIX}  ` };
    expect(montarNovo("transportadoras", form, true)).toEqual({ ok: true, valor: { nome: "DHL", chavePix: PIX } });
    // Sem permissão a chave digitada nem entra: o corpo leva só o nome (a validação normaliza a chave ausente para "").
    expect(montarNovo("transportadoras", form)).toEqual({ ok: true, valor: { nome: "DHL", chavePix: "" } });
    expect(montarNovo("transportadoras", form, false)).toEqual({ ok: true, valor: { nome: "DHL", chavePix: "" } });
    expect(JSON.stringify(montarNovo("transportadoras", form, false))).not.toContain(PIX);
    expect(montarNovo("despachantes", { ...form, nome: "STAR CUSTOMS" }, true)).toMatchObject({ ok: true, valor: { chavePix: PIX } });
    const semPermissao = montarNovo("despachantes", { ...form, nome: "STAR CUSTOMS" }, false);
    expect(JSON.stringify(semPermissao)).not.toContain(PIX);
  });

  it("criar com chave maior que 140 é recusado, sem repetir a chave na mensagem", () => {
    const longa = `${PIX}-${"w".repeat(150)}`;
    const r = montarNovo("transportadoras", { ...formVazio(), nome: "DHL", chavePix: longa }, true);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.erro).not.toContain("wwww");
    expect(r.ok ? "" : r.erro).not.toContain(PIX);
  });

  it("editar: a chave só vai no PATCH se MUDOU (e só com `incluirPix`); '' limpa", () => {
    const original = transp({ chavePix: PIX });
    const igual = formDeItem("transportadoras", original);
    // Igual ao que está gravado: nada a enviar (a chave não é regravada à toa).
    const semMudar = montarAlteracao("transportadoras", igual, original, true);
    expect(semMudar.ok).toBe(false);
    expect(semMudar.ok ? "" : semMudar.erro).toMatch(/Nenhuma alteração/);

    expect(montarAlteracao("transportadoras", { ...igual, chavePix: PIX2 }, original, true)).toEqual({ ok: true, valor: { chavePix: PIX2 } });
    expect(montarAlteracao("transportadoras", { ...igual, chavePix: "" }, original, true)).toEqual({ ok: true, valor: { chavePix: "" } });
    expect(montarAlteracao("transportadoras", { ...igual, chavePix: "   " }, original, true)).toEqual({ ok: true, valor: { chavePix: "" } });
    // Sem permissão a chave nunca entra, mude o que mudar.
    expect(montarAlteracao("transportadoras", { ...igual, chavePix: PIX2 }, original, false).ok).toBe(false);
  });

  it("despachante: a chave acompanha contato, telefone e e-mail só quando mudou", () => {
    const original = desp({ contatoNome: "Fulano", telefone: "11 3333-4444", email: "a@b.co", chavePix: PIX });
    const f = formDeItem("despachantes", original);
    expect(montarAlteracao("despachantes", f, original, true)).toEqual({
      ok: true,
      valor: { contatoNome: "Fulano", telefone: "11 3333-4444", email: "a@b.co" },
    });
    expect(montarAlteracao("despachantes", { ...f, chavePix: PIX2 }, original, true)).toMatchObject({ ok: true, valor: { chavePix: PIX2 } });
    expect(montarAlteracao("despachantes", { ...f, chavePix: "" }, original, true)).toMatchObject({ ok: true, valor: { chavePix: "" } });
    const semPermissao = montarAlteracao("despachantes", { ...f, chavePix: PIX2 }, original, false);
    expect(JSON.stringify(semPermissao)).not.toContain(PIX2);
    expect(semPermissao.ok).toBe(true); // o resto do cadastro continua salvando
  });

  it("fornecedor e cia aérea nunca enviam chave", () => {
    expect(JSON.stringify(montarNovo("fornecedores", { ...formVazio(), nome: "X", alertaOpcao: "sem", chavePix: PIX }, true))).not.toContain(PIX);
    expect(JSON.stringify(montarNovo("cias-aereas", { ...formVazio(), nome: "X", chavePix: PIX }, true))).not.toContain(PIX);
    expect(JSON.stringify(montarAlteracao("fornecedores", { ...formDeItem("fornecedores", forn()), chavePix: PIX }, forn(), true))).not.toContain(PIX);
  });
});
