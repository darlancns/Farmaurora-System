import { describe, expect, it } from "vitest";
import { CHAVE_PIX_CADASTRO_MAX, LISTAS_CADASTRO, LISTAS_COM_PIX } from "../../shared/constants/cadastros";
import type { ListaCadastro } from "../../shared/types/Cadastro";
import { listaTemPix, podeVerPixCadastro } from "../../shared/utils/cadastroPix";
import { validarNovoCadastro, validarPatchCadastro } from "../../shared/utils/cadastroValidacao";
import { colunasNovoCadastro, colunasPatchCadastro, montarCadastro, type DespachanteRow, type TransportadoraRow } from "../../server/utils/cadastroMappers";
import type { Permissoes } from "../../shared/utils/permissoesPagina";
import type { Role } from "../../shared/utils/rbac";

// Chave PIX dos Cadastros (dado financeiro): regra de visibilidade, validação e mapeadores. Os valores são FICTÍCIOS.
// A regra no servidor (GET por cargo) está em cadastrosPixHandlers.spec.ts.

const PIX = "chave-ficticia-teste-0001";
const usuario = (role: Role, permissoes?: Permissoes) => ({ role, permissoes });
const pag = (nivel: "nenhum" | "ver" | "editar"): Permissoes => ({ processos: "editar", pagamentos: nivel, patients: "editar" });

describe("podeVerPixCadastro — administrador OU quem LÊ a seção Pagamentos", () => {
  it("sem usuário: não", () => {
    expect(podeVerPixCadastro(null)).toBe(false);
    expect(podeVerPixCadastro(undefined)).toBe(false);
  });

  it("administrador: sempre (o mapa não vale para ele)", () => {
    expect(podeVerPixCadastro(usuario("administrador"))).toBe(true);
    expect(podeVerPixCadastro(usuario("administrador", pag("nenhum")))).toBe(true);
  });

  it("consultor: nunca (não lê Pagamentos, e o mapa também não vale para ele)", () => {
    expect(podeVerPixCadastro(usuario("consultor"))).toBe(false);
    expect(podeVerPixCadastro(usuario("consultor", pag("editar")))).toBe(false);
  });

  it.each(["socio", "operacional"] as const)("%s sem mapa: vale a regra do cargo (lê Pagamentos, então vê)", (role) => {
    expect(podeVerPixCadastro(usuario(role))).toBe(true);
  });

  it.each(["socio", "operacional"] as const)("%s com mapa: vê com Pagamentos 'ver' (só leitura) ou 'editar'; não vê com 'nenhum'", (role) => {
    expect(podeVerPixCadastro(usuario(role, pag("ver")))).toBe(true);
    expect(podeVerPixCadastro(usuario(role, pag("editar")))).toBe(true);
    expect(podeVerPixCadastro(usuario(role, pag("nenhum")))).toBe(false);
  });

  it.each(["socio", "operacional"] as const)("%s com mapa SEM a seção pagamentos (ausente = 'nenhum'): não vê", (role) => {
    expect(podeVerPixCadastro(usuario(role, { processos: "editar" }))).toBe(false);
    expect(podeVerPixCadastro(usuario(role, {}))).toBe(false);
  });

  it("outras seções liberadas não dão PIX: só Pagamentos conta", () => {
    expect(podeVerPixCadastro(usuario("socio", { processos: "editar", pagamentos: "nenhum", dir: "editar", patients: "editar" }))).toBe(false);
  });
});

describe("listas com PIX", () => {
  it("só despachantes e transportadoras guardam a chave", () => {
    expect([...LISTAS_COM_PIX]).toEqual(["despachantes", "transportadoras"]);
    expect(LISTAS_CADASTRO.filter((l) => listaTemPix(l))).toEqual(["despachantes", "transportadoras"]);
    expect(listaTemPix("fornecedores")).toBe(false);
    expect(listaTemPix("cias-aereas")).toBe(false);
    expect(listaTemPix("consultores")).toBe(false);
    expect(listaTemPix("temperaturas")).toBe(false);
  });

  it("as listas, na ordem da tela", () => {
    expect([...LISTAS_CADASTRO]).toEqual(["fornecedores", "despachantes", "transportadoras", "cias-aereas", "consultores", "temperaturas"]);
  });
});

describe("validação da chave PIX (despachantes e transportadoras)", () => {
  const erroDe = (r: { ok: boolean; erro?: string }): string => (r.ok ? "" : (r.erro ?? ""));

  it("criar: a chave é aparada; vazia ou ausente vale '' (sem chave)", () => {
    expect(validarNovoCadastro("transportadoras", { nome: "DHL", chavePix: `  ${PIX}  ` })).toEqual({
      ok: true,
      valor: { nome: "DHL", chavePix: PIX },
    });
    expect(validarNovoCadastro("transportadoras", { nome: "DHL" })).toEqual({ ok: true, valor: { nome: "DHL", chavePix: "" } });
    expect(validarNovoCadastro("transportadoras", { nome: "DHL", chavePix: "   " })).toEqual({ ok: true, valor: { nome: "DHL", chavePix: "" } });
    const desp = validarNovoCadastro("despachantes", { nome: "STAR CUSTOMS", chavePix: PIX });
    expect(desp).toMatchObject({ ok: true, valor: { chavePix: PIX } });
  });

  it("limite de 140 caracteres (o mesmo do CHECK): 140 passa, 141 não", () => {
    expect(CHAVE_PIX_CADASTRO_MAX).toBe(140);
    const no_limite = "x".repeat(140);
    const acima = "x".repeat(141);
    for (const lista of ["despachantes", "transportadoras"] as const) {
      expect(validarNovoCadastro(lista, { nome: "N", chavePix: no_limite }).ok, lista).toBe(true);
      expect(validarNovoCadastro(lista, { nome: "N", chavePix: acima }).ok, lista).toBe(false);
      expect(validarPatchCadastro(lista, { chavePix: no_limite }).ok, lista).toBe(true);
      expect(validarPatchCadastro(lista, { chavePix: acima }).ok, lista).toBe(false);
    }
  });

  it("a mensagem de erro NUNCA contém a chave digitada (nem uma parte dela)", () => {
    const longa = `${PIX}-${"y".repeat(150)}`;
    const mensagens = [
      erroDe(validarNovoCadastro("transportadoras", { nome: "N", chavePix: longa })),
      erroDe(validarNovoCadastro("despachantes", { nome: "N", chavePix: longa })),
      erroDe(validarPatchCadastro("transportadoras", { chavePix: longa })),
      erroDe(validarPatchCadastro("despachantes", { chavePix: longa })),
      erroDe(validarNovoCadastro("transportadoras", { nome: "N", chavePix: 123 })),
      erroDe(validarPatchCadastro("despachantes", { chavePix: { valor: PIX } })),
    ];
    for (const m of mensagens) {
      expect(m).not.toBe("");
      expect(m).not.toContain(PIX);
      expect(m).not.toContain("yyyy");
    }
  });

  it("tipo errado (número, objeto, null no PATCH) é recusado", () => {
    expect(validarNovoCadastro("transportadoras", { nome: "N", chavePix: 123 }).ok).toBe(false);
    expect(validarPatchCadastro("transportadoras", { chavePix: null }).ok).toBe(false);
    expect(validarPatchCadastro("despachantes", { chavePix: ["a"] }).ok).toBe(false);
  });

  it("PATCH: '' limpa a chave (vira '' no DTO e NULL na coluna); só a chave basta", () => {
    expect(validarPatchCadastro("transportadoras", { chavePix: "" })).toEqual({ ok: true, valor: { chavePix: "" } });
    expect(validarPatchCadastro("despachantes", { chavePix: `  ${PIX} ` })).toEqual({ ok: true, valor: { chavePix: PIX } });
    expect(validarPatchCadastro("transportadoras", { chavePix: "  " })).toEqual({ ok: true, valor: { chavePix: "" } });
  });

  it("fornecedores, cias aéreas e temperaturas NÃO aceitam chavePix (campo desconhecido, sem repetir o valor)", () => {
    const corpos = {
      fornecedores: { nome: "N", prazoAlertaDias: 3, semAlerta: false, chavePix: PIX },
      "cias-aereas": { nome: "N", chavePix: PIX },
      temperaturas: { nome: "N", chavePix: PIX },
    } as const;
    for (const lista of ["fornecedores", "cias-aereas", "temperaturas"] as const) {
      const novo = validarNovoCadastro(lista, corpos[lista]);
      expect(novo.ok, lista).toBe(false);
      expect(erroDe(novo)).toMatch(/Campo desconhecido: chavePix/);
      expect(erroDe(novo)).not.toContain(PIX);
      expect(validarPatchCadastro(lista, { chavePix: PIX }).ok, lista).toBe(false);
    }
  });

  it("transportadora: nome obrigatório, 'Outro' reservado, sem campos além de nome e chavePix", () => {
    expect(validarNovoCadastro("transportadoras", {}).ok).toBe(false);
    expect(erroDe(validarNovoCadastro("transportadoras", { nome: "outro" }))).toMatch(/reservado/);
    expect(erroDe(validarNovoCadastro("transportadoras", { nome: "DHL", pais: "BR" }))).toMatch(/Campo desconhecido: pais/);
    expect(validarNovoCadastro("transportadoras", { nome: "  FedEx   Express " })).toMatchObject({ ok: true, valor: { nome: "FedEx Express" } });
  });
});

const BASE = {
  id: "x_1",
  nome: "DHL",
  nome_chave: "dhl",
  ativo: true,
  atualizado_por: "Cris",
  created_at: "2026-11-18T12:00:00.000Z",
  updated_at: "2026-11-18T12:00:00.000Z",
};

describe("mapeadores: a chave PIX só existe no resultado quando pedida", () => {
  const desp: DespachanteRow = { ...BASE, id: "desp_1", contato_nome: null, telefone: null, email: null, chave_pix: PIX };
  const transp: TransportadoraRow = { ...BASE, id: "transp_1", chave_pix: PIX };

  it("sem o pedido: a propriedade NÃO existe (nem null, nem ''), mesmo com a chave na linha", () => {
    for (const [lista, row] of [["despachantes", desp], ["transportadoras", transp]] as const) {
      const r = montarCadastro(lista, row as never);
      expect(r, lista).not.toHaveProperty("chavePix");
      expect(JSON.stringify(r), lista).not.toContain(PIX);
      expect(JSON.stringify(r), lista).not.toContain("chavePix");
    }
  });

  it("com o pedido: a chave vem; sem chave gravada vem '' (a pessoa pode ver, mas não há chave)", () => {
    expect(montarCadastro("despachantes", desp, true)).toMatchObject({ chavePix: PIX });
    expect(montarCadastro("transportadoras", transp, true)).toMatchObject({ chavePix: PIX });
    expect(montarCadastro("despachantes", { ...desp, chave_pix: null }, true)).toMatchObject({ chavePix: "" });
    expect(montarCadastro("transportadoras", { ...transp, chave_pix: undefined }, true)).toMatchObject({ chavePix: "" });
  });

  it("outras listas ignoram o pedido (não têm chave)", () => {
    const forn = montarCadastro("fornecedores", { ...BASE, pais: null, prazo_alerta_dias: null, sem_alerta: true }, true);
    const cia = montarCadastro("cias-aereas", { ...BASE }, true);
    expect(forn).not.toHaveProperty("chavePix");
    expect(cia).not.toHaveProperty("chavePix");
  });

  it("colunasNovoCadastro: chave aparada vai para chave_pix; vazia vira NULL; transportadora tem nome_chave normalizado", () => {
    expect(colunasNovoCadastro("transportadoras", { nome: "FedEx", chavePix: PIX })).toEqual({
      nome: "FedEx",
      nome_chave: "fedex",
      ativo: true,
      chave_pix: PIX,
    });
    expect(colunasNovoCadastro("transportadoras", { nome: "DHL", chavePix: "" })).toMatchObject({ chave_pix: null });
    expect(colunasNovoCadastro("transportadoras", { nome: "DHL" })).toMatchObject({ chave_pix: null });
    expect(colunasNovoCadastro("despachantes", { nome: "X", chavePix: PIX })).toMatchObject({ chave_pix: PIX });
  });

  it("colunasPatchCadastro: só grava a chave se ela veio; '' limpa (NULL); nome nunca entra", () => {
    expect(colunasPatchCadastro("transportadoras", { chavePix: PIX })).toEqual({ chave_pix: PIX });
    expect(colunasPatchCadastro("transportadoras", { chavePix: "" })).toEqual({ chave_pix: null });
    expect(colunasPatchCadastro("despachantes", { chavePix: "" })).toEqual({ chave_pix: null });
    expect(colunasPatchCadastro("transportadoras", { ativo: false })).toEqual({ ativo: false });
    expect(colunasPatchCadastro("despachantes", { telefone: "11999990000" })).not.toHaveProperty("chave_pix");
    expect(colunasPatchCadastro("transportadoras", { nome: "Outro nome" })).toEqual({});
  });

  it("nenhuma lista fora de despachantes/transportadoras escreve chave_pix", () => {
    const todas: ListaCadastro[] = ["fornecedores", "cias-aereas", "temperaturas"];
    for (const l of todas) {
      expect(JSON.stringify(colunasNovoCadastro(l, { nome: "N", prazoAlertaDias: 3, semAlerta: false } as never)), l).not.toContain("chave_pix");
    }
  });
});
