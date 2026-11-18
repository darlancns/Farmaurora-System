import { describe, expect, it } from "vitest";
import {
  emailValido,
  telefoneValido,
  validarAlertaFornecedor,
  validarNovoCadastro,
  validarPatchCadastro,
} from "../../shared/utils/cadastroValidacao";

// Validação pura dos Cadastros (servidor e formulário usam a mesma).

const erroDe = (r: { ok: boolean; erro?: string }): string => (r.ok ? "" : (r.erro ?? ""));

describe("validarAlertaFornecedor — o prazo é DECIDIDO, nunca em branco", () => {
  it("número de dias de 1 a 365", () => {
    expect(validarAlertaFornecedor(false, 1)).toEqual({ ok: true, valor: { semAlerta: false, prazoAlertaDias: 1 } });
    expect(validarAlertaFornecedor(false, 365)).toEqual({ ok: true, valor: { semAlerta: false, prazoAlertaDias: 365 } });
  });

  it('"Sem alerta" marcado, sem prazo', () => {
    expect(validarAlertaFornecedor(true, null)).toEqual({ ok: true, valor: { semAlerta: true, prazoAlertaDias: null } });
    expect(validarAlertaFornecedor(true, undefined).ok).toBe(true);
  });

  it("recusa não decidir: sem a marca, ou sem prazo e sem marca", () => {
    expect(validarAlertaFornecedor(undefined, undefined).ok).toBe(false);
    expect(validarAlertaFornecedor(false, null).ok).toBe(false);
    expect(validarAlertaFornecedor(false, undefined).ok).toBe(false);
    expect(validarAlertaFornecedor(false, "").ok).toBe(false);
  });

  it("recusa prazo fora de 1–365, não inteiro ou não numérico", () => {
    for (const prazo of [0, -1, 366, 1000, 2.5, "7", NaN]) expect(validarAlertaFornecedor(false, prazo).ok, String(prazo)).toBe(false);
  });

  it('recusa "Sem alerta" junto com um prazo', () => {
    expect(validarAlertaFornecedor(true, 7).ok).toBe(false);
  });
});

describe("validarNovoCadastro — fornecedores", () => {
  const base = { nome: "Poros", pais: "Turquia", prazoAlertaDias: 3, semAlerta: false };

  it("aceita e limpa (aparado, espaços colapsados)", () => {
    const r = validarNovoCadastro("fornecedores", { ...base, nome: "  Poros   Pharma ", pais: " Turquia " });
    expect(r).toEqual({ ok: true, valor: { nome: "Poros Pharma", pais: "Turquia", prazoAlertaDias: 3, semAlerta: false } });
  });

  it("país é opcional: ausente vira vazio", () => {
    const r = validarNovoCadastro("fornecedores", { nome: "Matsun", prazoAlertaDias: null, semAlerta: true });
    expect(r).toEqual({ ok: true, valor: { nome: "Matsun", pais: "", prazoAlertaDias: null, semAlerta: true } });
  });

  it("não salva sem decidir o prazo", () => {
    expect(validarNovoCadastro("fornecedores", { nome: "Matsun" }).ok).toBe(false);
    expect(validarNovoCadastro("fornecedores", { nome: "Matsun", prazoAlertaDias: null, semAlerta: false }).ok).toBe(false);
  });

  it('recusa o nome reservado "Outro", nome vazio e nome comprido', () => {
    expect(erroDe(validarNovoCadastro("fornecedores", { ...base, nome: "outro" }))).toMatch(/reservado/);
    expect(validarNovoCadastro("fornecedores", { ...base, nome: "   " }).ok).toBe(false);
    expect(validarNovoCadastro("fornecedores", { ...base, nome: "a".repeat(121) }).ok).toBe(false);
  });

  it("recusa campo desconhecido, corpo que não é objeto e ativo no create (nasce ativo)", () => {
    expect(validarNovoCadastro("fornecedores", { ...base, extra: 1 }).ok).toBe(false);
    expect(validarNovoCadastro("fornecedores", { ...base, ativo: false }).ok).toBe(false);
    expect(validarNovoCadastro("fornecedores", null).ok).toBe(false);
    expect(validarNovoCadastro("fornecedores", []).ok).toBe(false);
  });
});

describe("validarNovoCadastro — despachantes (só empresa; contato, telefone e e-mail opcionais)", () => {
  it("só o nome basta", () => {
    expect(validarNovoCadastro("despachantes", { nome: "STAR CUSTOMS" })).toEqual({
      ok: true,
      valor: { nome: "STAR CUSTOMS", contatoNome: "", telefone: "", email: "", chavePix: "" },
    });
  });

  it("valida o formato só se preenchido", () => {
    const ok = validarNovoCadastro("despachantes", {
      nome: "SOUTH AMERICA",
      contatoNome: " Fulano de Tal ",
      telefone: "+55 (11) 98888-7777",
      email: "contato@empresa.com",
    });
    expect(ok).toEqual({
      ok: true,
      valor: {
        nome: "SOUTH AMERICA",
        contatoNome: "Fulano de Tal",
        telefone: "+55 (11) 98888-7777",
        email: "contato@empresa.com",
        chavePix: "",
      },
    });
    expect(erroDe(validarNovoCadastro("despachantes", { nome: "X", email: "sem-arroba" }))).toMatch(/e-mail/i);
    expect(erroDe(validarNovoCadastro("despachantes", { nome: "X", telefone: "abc" }))).toMatch(/telefone/i);
    expect(validarNovoCadastro("despachantes", { nome: "X", telefone: "123" }).ok).toBe(false);
  });

  it("vazio ou só espaços em contato, telefone e e-mail valem vazio (não é erro)", () => {
    expect(validarNovoCadastro("despachantes", { nome: "X", telefone: "  ", email: "" }).ok).toBe(true);
  });
});

describe("validarNovoCadastro — cias aéreas", () => {
  it("só o nome", () => {
    expect(validarNovoCadastro("cias-aereas", { nome: "2°C a 8°C" })).toEqual({ ok: true, valor: { nome: "2°C a 8°C" } });
    expect(validarNovoCadastro("cias-aereas", { nome: "2°C a 8°C", pais: "x" }).ok).toBe(false);
    expect(validarNovoCadastro("cias-aereas", { nome: "Outro" }).ok).toBe(false);
  });
});

describe("validarPatchCadastro", () => {
  it("fornecedor: país, ativo e alerta (os dois campos juntos)", () => {
    expect(validarPatchCadastro("fornecedores", { pais: " Índia " })).toEqual({ ok: true, valor: { pais: "Índia" } });
    expect(validarPatchCadastro("fornecedores", { ativo: false })).toEqual({ ok: true, valor: { ativo: false } });
    expect(validarPatchCadastro("fornecedores", { semAlerta: false, prazoAlertaDias: 10 })).toEqual({
      ok: true,
      valor: { semAlerta: false, prazoAlertaDias: 10 },
    });
    expect(validarPatchCadastro("fornecedores", { semAlerta: true, prazoAlertaDias: null })).toEqual({
      ok: true,
      valor: { semAlerta: true, prazoAlertaDias: null },
    });
  });

  it("fornecedor: o alerta não pode ir pela metade nem ficar sem decidir", () => {
    expect(validarPatchCadastro("fornecedores", { semAlerta: true }).ok).toBe(false);
    expect(validarPatchCadastro("fornecedores", { prazoAlertaDias: 5 }).ok).toBe(false);
    expect(validarPatchCadastro("fornecedores", { semAlerta: false, prazoAlertaDias: null }).ok).toBe(false);
    expect(validarPatchCadastro("fornecedores", { semAlerta: false, prazoAlertaDias: 400 }).ok).toBe(false);
  });

  it("despachante: contato, telefone e e-mail (esvaziar é permitido)", () => {
    expect(validarPatchCadastro("despachantes", { telefone: "", email: "" })).toEqual({
      ok: true,
      valor: { telefone: "", email: "" },
    });
    expect(validarPatchCadastro("despachantes", { email: "x@y" }).ok).toBe(false);
  });

  it("aceita `nome` (aparado) só para o servidor comparar e recusar a troca", () => {
    expect(validarPatchCadastro("cias-aereas", { nome: "  Ambiente " })).toEqual({ ok: true, valor: { nome: "Ambiente" } });
  });

  it("recusa corpo vazio, campo desconhecido, campo de outra lista e ativo não booleano", () => {
    expect(validarPatchCadastro("cias-aereas", {}).ok).toBe(false);
    expect(validarPatchCadastro("cias-aereas", { pais: "x" }).ok).toBe(false);
    expect(validarPatchCadastro("despachantes", { prazoAlertaDias: 3 }).ok).toBe(false);
    expect(validarPatchCadastro("cias-aereas", { ativo: "sim" }).ok).toBe(false);
    expect(validarPatchCadastro("cias-aereas", "x").ok).toBe(false);
  });
});

describe("emailValido / telefoneValido", () => {
  it("e-mail", () => {
    expect(emailValido("a@b.co")).toBe(true);
    for (const e of ["a@b", "a b@c.com", "@c.com", "a@.com"]) expect(emailValido(e), e).toBe(false);
  });

  it("telefone: 8 a 15 dígitos, só com + ( ) - . e espaço", () => {
    for (const t of ["11 98888-7777", "(11) 3333-4444", "+55 11 98888 7777", "+1 202 555 0143"]) expect(telefoneValido(t), t).toBe(true);
    for (const t of ["1234567", "1".repeat(16), "11 9888x-7777", "++5511999999999"]) expect(telefoneValido(t), t).toBe(false);
  });
});
