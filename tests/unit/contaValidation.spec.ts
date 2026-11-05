import { describe, expect, it } from "vitest";
import { parseEmailProprio, parseNomeProprio, parseSenhaProprio } from "../../server/utils/contaValidation";
import {
  MENSAGEM_NOME_BLOQUEADO,
  emailValido,
  normalizarEmail,
  podeEditarNomeDaConta,
} from "../../shared/utils/contaCampos";
import { MIN_PASSWORD_LENGTH, NOME_MAX_LENGTH } from "../../shared/constants/conta";
import { ROLES } from "../../shared/utils/rbac";

// Validadores da edição da PRÓPRIA conta (Fase A de "Minha conta"): nome, e-mail e senha.

function erroDe(fn: () => unknown): { status: number; msg: string } {
  try {
    fn();
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "" };
  }
  throw new Error("esperava um erro HTTP, mas a validação passou");
}

describe("parseNomeProprio", () => {
  it("aceita e apara o nome", () => {
    expect(parseNomeProprio({ nome: "  Renan Ferreira  " })).toBe("Renan Ferreira");
  });

  it("exige nome (vazio, só espaços, ausente ou não-texto → 400)", () => {
    for (const body of [{ nome: "" }, { nome: "   " }, {}, { nome: 42 }, null, undefined, "x"]) {
      expect(erroDe(() => parseNomeProprio(body)).status).toBe(400);
    }
  });

  it("aceita exatamente NOME_MAX_LENGTH e recusa um a mais", () => {
    expect(parseNomeProprio({ nome: "a".repeat(NOME_MAX_LENGTH) })).toHaveLength(NOME_MAX_LENGTH);
    const e = erroDe(() => parseNomeProprio({ nome: "a".repeat(NOME_MAX_LENGTH + 1) }));
    expect(e.status).toBe(400);
    expect(e.msg).toContain(String(NOME_MAX_LENGTH));
  });

  it("recusa quebra de linha, inclusive a do fim (que o trim removeria)", () => {
    for (const nome of ["Ana\nMaria", "Ana\r\nMaria", "Ana\n", "\nAna", "Ana" + String.fromCharCode(0x2028) + "Maria", "Ana\tMaria"]) {
      expect(erroDe(() => parseNomeProprio({ nome })).status).toBe(400);
    }
  });
});

describe("parseEmailProprio", () => {
  const base = { senhaAtual: "segredo123", email: "Novo@Exemplo.com ", emailConfirmacao: " novo@exemplo.com" };

  it("normaliza (trim + minúsculas) e compara a confirmação já normalizada", () => {
    expect(parseEmailProprio(base)).toEqual({ senhaAtual: "segredo123", email: "novo@exemplo.com" });
  });

  it("exige a senha atual", () => {
    expect(erroDe(() => parseEmailProprio({ ...base, senhaAtual: "" })).msg).toBe("Informe a senha atual.");
    expect(erroDe(() => parseEmailProprio({ email: base.email, emailConfirmacao: base.email })).status).toBe(400);
  });

  it("e-mails diferentes → 400 'não coincidem'", () => {
    const e = erroDe(() => parseEmailProprio({ ...base, emailConfirmacao: "outro@exemplo.com" }));
    expect(e).toEqual({ status: 400, msg: "Os e-mails não coincidem." });
  });

  it("e-mail vazio ou de formato inválido → 400", () => {
    expect(erroDe(() => parseEmailProprio({ ...base, email: "", emailConfirmacao: "" })).status).toBe(400);
    for (const ruim of ["semarroba", "a@b", "a b@c.com", "@c.com"]) {
      expect(erroDe(() => parseEmailProprio({ ...base, email: ruim, emailConfirmacao: ruim })).status).toBe(400);
    }
  });

  it("e-mail acima de 254 caracteres → 400", () => {
    const longo = `${"a".repeat(250)}@x.com`;
    expect(erroDe(() => parseEmailProprio({ ...base, email: longo, emailConfirmacao: longo })).status).toBe(400);
  });

  it("a mensagem de erro nunca repete o e-mail nem a senha digitados", () => {
    const e = erroDe(() =>
      parseEmailProprio({ senhaAtual: "segredo123", email: "a@b.com", emailConfirmacao: "x@y.com" }),
    );
    expect(e.msg).not.toContain("a@b.com");
    expect(e.msg).not.toContain("segredo123");
  });
});

describe("parseSenhaProprio", () => {
  it("aceita senha nova válida e NÃO apara espaços", () => {
    expect(parseSenhaProprio({ senhaAtual: "antiga123", novaSenha: " nova senha 9 " })).toEqual({
      senhaAtual: "antiga123",
      novaSenha: " nova senha 9 ",
    });
  });

  it("exige a senha atual", () => {
    expect(erroDe(() => parseSenhaProprio({ novaSenha: "nova12345" })).msg).toBe("Informe a senha atual.");
  });

  it(`recusa senha nova com menos de ${MIN_PASSWORD_LENGTH} caracteres e aceita exatamente o mínimo`, () => {
    const curta = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    const e = erroDe(() => parseSenhaProprio({ senhaAtual: "antiga123", novaSenha: curta }));
    expect(e.status).toBe(400);
    expect(e.msg).toContain(String(MIN_PASSWORD_LENGTH));
    const ok = parseSenhaProprio({ senhaAtual: "antiga123", novaSenha: "b".repeat(MIN_PASSWORD_LENGTH) });
    expect(ok.novaSenha).toHaveLength(MIN_PASSWORD_LENGTH);
  });

  it("recusa senha acima de 72 caracteres (limite do bcrypt)", () => {
    expect(erroDe(() => parseSenhaProprio({ senhaAtual: "antiga123", novaSenha: "a".repeat(73) })).status).toBe(400);
  });

  it("recusa senha nova igual à atual", () => {
    const e = erroDe(() => parseSenhaProprio({ senhaAtual: "mesma12345", novaSenha: "mesma12345" }));
    expect(e).toEqual({ status: 400, msg: "A nova senha precisa ser diferente da atual." });
  });

  it("a mensagem de erro nunca repete as senhas", () => {
    const e = erroDe(() => parseSenhaProprio({ senhaAtual: "SenhaAntiga!", novaSenha: "curta" }));
    expect(e.msg).not.toContain("SenhaAntiga!");
    expect(e.msg).not.toContain("curta");
  });

  it("ignora chaves fora da whitelist (id, role, consultorNome, isAdmin)", () => {
    const r = parseSenhaProprio({
      senhaAtual: "antiga123",
      novaSenha: "nova12345",
      id: "outro",
      role: "administrador",
      consultorNome: "Dani",
      isAdmin: true,
    });
    expect(Object.keys(r).sort()).toEqual(["novaSenha", "senhaAtual"]);
  });
});

describe("regras compartilhadas de campos", () => {
  it("normalizarEmail e emailValido", () => {
    expect(normalizarEmail("  A@B.Com ")).toBe("a@b.com");
    expect(emailValido("a@b.co")).toBe(true);
    expect(emailValido("a@b")).toBe(false);
  });

  it("só sócio e administrador editam o próprio nome", () => {
    expect(ROLES.filter(podeEditarNomeDaConta)).toEqual(["socio", "administrador"]);
  });

  it("consultor e operacional têm mensagem de bloqueio pedindo ao administrador", () => {
    expect(MENSAGEM_NOME_BLOQUEADO.consultor).toMatch(/administrador/);
    expect(MENSAGEM_NOME_BLOQUEADO.operacional).toMatch(/administrador/);
  });
});
