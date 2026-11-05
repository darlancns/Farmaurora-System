import { describe, expect, it } from "vitest";
import { ABA_PADRAO, abasParaCargo, resolverAba } from "../../app/utils/abasConfiguracoes";
import { rotaParaContas } from "../../app/utils/contaFoco";
import { ROLES, type Role } from "../../shared/utils/rbac";

// Abas de /configuracoes por cargo, ordem, aba padrão e leitura de ?aba=.
// "Minha conta" é a PRIMEIRA aba e a aba padrão de todos os cargos; "Contas" vem depois, só pra
// sócio e administrador.

const chaves = (role: Role | null) => abasParaCargo(role).map((a) => a.key);

describe("abasParaCargo", () => {
  it("sócio e administrador: Minha conta + Contas, nessa ordem (Minha conta primeiro)", () => {
    expect(chaves("socio")).toEqual(["minha-conta", "contas"]);
    expect(chaves("administrador")).toEqual(["minha-conta", "contas"]);
  });

  it("consultor e operacional: SÓ Minha conta", () => {
    expect(chaves("consultor")).toEqual(["minha-conta"]);
    expect(chaves("operacional")).toEqual(["minha-conta"]);
  });

  it("todo cargo vê 'Minha conta', e ela é sempre a primeira aba", () => {
    for (const r of ROLES) {
      expect(chaves(r)).toContain("minha-conta");
      expect(chaves(r)[0], r).toBe("minha-conta");
    }
  });

  it("rótulos em pt-BR, na ordem de exibição", () => {
    expect(abasParaCargo("administrador").map((a) => a.label)).toEqual(["Minha conta", "Contas"]);
  });

  it("sem cargo (ainda não carregado): nenhuma aba", () => {
    expect(chaves(null)).toEqual([]);
    expect(abasParaCargo(undefined)).toEqual([]);
  });
});

describe("aba padrão", () => {
  it("ABA_PADRAO é 'minha-conta' e coincide com a primeira aba de TODOS os cargos", () => {
    expect(ABA_PADRAO).toBe("minha-conta");
    for (const r of ROLES) expect(abasParaCargo(r)[0]?.key, r).toBe(ABA_PADRAO);
  });

  it("sem ?aba=, todo cargo abre em Minha conta (inclusive sócio e administrador, que antes abriam em Contas)", () => {
    for (const r of ROLES) expect(resolverAba(r, undefined), r).toBe("minha-conta");
  });

  it("sem cargo cai em Minha conta", () => {
    expect(resolverAba(null, undefined)).toBe("minha-conta");
  });
});

describe("resolverAba (?aba=)", () => {
  it("sem ?aba= (ausente ou nulo) → Minha conta, pra qualquer cargo", () => {
    for (const r of ROLES) {
      expect(resolverAba(r, undefined), r).toBe("minha-conta");
      expect(resolverAba(r, null), r).toBe("minha-conta");
    }
  });

  it("valor válido E permitido ao cargo → esse valor (?aba=contas continua abrindo Contas pra quem a vê)", () => {
    expect(resolverAba("administrador", "contas")).toBe("contas");
    expect(resolverAba("socio", "contas")).toBe("contas");
    expect(resolverAba("administrador", "minha-conta")).toBe("minha-conta");
    expect(resolverAba("operacional", "minha-conta")).toBe("minha-conta");
    expect(resolverAba("consultor", "minha-conta")).toBe("minha-conta");
  });

  it("valor válido mas NÃO permitido ao cargo → aba padrão, sem erro", () => {
    expect(resolverAba("consultor", "contas")).toBe("minha-conta");
    expect(resolverAba("operacional", "contas")).toBe("minha-conta");
  });

  it("valor inválido (desconhecido, vazio, caixa errada, número, objeto) → aba padrão, pra qualquer cargo", () => {
    for (const ruim of ["xpto", "", "Contas", "MINHA-CONTA", "minha_conta", "contas ", 3, {}, true]) {
      for (const r of ROLES) expect(resolverAba(r, ruim), `${r} / ${String(ruim)}`).toBe("minha-conta");
    }
  });

  it("lista de valores (?aba=a&aba=b): usa o primeiro, validando-o", () => {
    expect(resolverAba("administrador", ["contas", "minha-conta"])).toBe("contas");
    expect(resolverAba("administrador", ["minha-conta", "contas"])).toBe("minha-conta");
    expect(resolverAba("administrador", ["xpto", "contas"])).toBe("minha-conta"); // 1º inválido → padrão
    expect(resolverAba("consultor", ["contas", "minha-conta"])).toBe("minha-conta"); // 1º não permitido → padrão
    expect(resolverAba("administrador", [])).toBe("minha-conta");
  });

  it("sem cargo → Minha conta, qualquer que seja o valor", () => {
    expect(resolverAba(null, "contas")).toBe("minha-conta");
  });

  it("o link do sino (?aba=contas) abre Contas para sócio e administrador", () => {
    const { query } = rotaParaContas();
    expect(resolverAba("administrador", query.aba)).toBe("contas");
    expect(resolverAba("socio", query.aba)).toBe("contas");
  });
});
