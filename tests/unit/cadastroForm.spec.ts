import { describe, expect, it } from "vitest";
import type { Despachante, Fornecedor, CiaAerea } from "../../shared/types/Cadastro";
import { colunasDaLista, textoAlerta } from "../../app/utils/cadastroColunas";
import {
  formDeItem,
  formVazio,
  itemComMesmoNome,
  listaTemEdicao,
  montarAlteracao,
  montarNovo,
} from "../../app/utils/cadastroForm";

// Regras puras do formulário e das colunas da tela de Cadastros.

const BASE = { id: "x", ativo: true, atualizadoPor: "", createdAt: "", updatedAt: "" };
const forn = (e: Partial<Fornecedor> = {}): Fornecedor => ({ ...BASE, nome: "Poros", pais: "Turquia", prazoAlertaDias: 3, semAlerta: false, ...e });
const desp = (e: Partial<Despachante> = {}): Despachante => ({ ...BASE, nome: "STAR CUSTOMS", contatoNome: "", telefone: "", email: "", ...e });
const cia = (e: Partial<CiaAerea> = {}): CiaAerea => ({ ...BASE, nome: "Ambiente", ...e });

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
    expect(listaTemEdicao("fornecedores")).toBe(true);
    expect(listaTemEdicao("despachantes")).toBe(true);
    expect(montarAlteracao("cias-aereas", formDeItem("cias-aereas", cia())).ok).toBe(false);
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

describe("colunas da tela", () => {
  it("fornecedor: País e Alerta; despachante: Contato, Telefone e E-mail; cia aérea: nenhuma extra", () => {
    expect(colunasDaLista("fornecedores").map((c) => c.titulo)).toEqual(["País", "Alerta de prazo"]);
    expect(colunasDaLista("despachantes").map((c) => c.titulo)).toEqual(["Contato", "Telefone", "E-mail"]);
    expect(colunasDaLista("cias-aereas")).toEqual([]);
  });

  it("textos: vazio vira travessão; alerta é 'Sem alerta' ou 'N dias' (singular em 1)", () => {
    const [pais, alerta] = colunasDaLista("fornecedores");
    expect(pais!.texto(forn({ pais: "" }))).toBe("—");
    expect(pais!.texto(forn())).toBe("Turquia");
    expect(alerta!.texto(forn({ prazoAlertaDias: 10 }))).toBe("10 dias");
    expect(textoAlerta({ semAlerta: false, prazoAlertaDias: 1 })).toBe("1 dia");
    expect(textoAlerta({ semAlerta: true, prazoAlertaDias: null })).toBe("Sem alerta");
    const [contato, telefone, email] = colunasDaLista("despachantes");
    expect(contato!.texto(desp())).toBe("—");
    expect(telefone!.texto(desp({ telefone: "11 3333-4444" }))).toBe("11 3333-4444");
    expect(email!.texto(desp({ email: "a@b.co" }))).toBe("a@b.co");
  });
});
