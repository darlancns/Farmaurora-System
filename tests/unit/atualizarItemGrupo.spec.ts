import { describe, expect, it } from "vitest";
import {
  isTransicaoStatusItemValida,
  isValidAtualizarItemGrupo,
} from "../../server/utils/pagamentoValidation";

// Cobre a validação do PATCH de status de item de grupo (Despachante/Transportadora):
//  - forma do body (index inteiro >= 0, status no enum)  — isValidAtualizarItemGrupo
//  - alvo permitido (nunca PAGO por aqui)                 — isValidAtualizarItemGrupo
//  - transição permitida (só o ciclo NAO_PAGO <-> COMPLEMENTO) — isTransicaoStatusItemValida
// PAGO só entra via `pagarGrupoPagamento` ("Marcar grupo como pago").

describe("isValidAtualizarItemGrupo — forma + alvo do body", () => {
  it("aceita alvo NAO_PAGO e COMPLEMENTO com index válido", () => {
    expect(isValidAtualizarItemGrupo({ index: 0, status: "COMPLEMENTO" })).toBe(true);
    expect(isValidAtualizarItemGrupo({ index: 3, status: "NAO_PAGO" })).toBe(true);
  });

  it("rejeita PAGO como alvo (só via 'pagar grupo')", () => {
    expect(isValidAtualizarItemGrupo({ index: 0, status: "PAGO" })).toBe(false);
  });

  it("rejeita index inválido como antes", () => {
    expect(isValidAtualizarItemGrupo({ index: -1, status: "NAO_PAGO" })).toBe(false);
    expect(isValidAtualizarItemGrupo({ index: 1.5, status: "NAO_PAGO" })).toBe(false);
    expect(isValidAtualizarItemGrupo({ status: "NAO_PAGO" })).toBe(false);
  });

  it("rejeita status fora do enum e body malformado", () => {
    expect(isValidAtualizarItemGrupo({ index: 0, status: "SEI_LA" })).toBe(false);
    expect(isValidAtualizarItemGrupo(null)).toBe(false);
    expect(isValidAtualizarItemGrupo("x")).toBe(false);
  });
});

describe("isTransicaoStatusItemValida — só o ciclo clicável", () => {
  it("aceita NAO_PAGO -> COMPLEMENTO e COMPLEMENTO -> NAO_PAGO", () => {
    expect(isTransicaoStatusItemValida("NAO_PAGO", "COMPLEMENTO")).toBe(true);
    expect(isTransicaoStatusItemValida("COMPLEMENTO", "NAO_PAGO")).toBe(true);
  });

  it("rejeita qualquer coisa envolvendo PAGO (setar direto ou sair de PAGO)", () => {
    expect(isTransicaoStatusItemValida("NAO_PAGO", "PAGO")).toBe(false);
    expect(isTransicaoStatusItemValida("COMPLEMENTO", "PAGO")).toBe(false);
    expect(isTransicaoStatusItemValida("PAGO", "NAO_PAGO")).toBe(false);
    expect(isTransicaoStatusItemValida("PAGO", "COMPLEMENTO")).toBe(false);
    expect(isTransicaoStatusItemValida("PAGO", "PAGO")).toBe(false);
  });

  it("rejeita 'mesmo -> mesmo'", () => {
    expect(isTransicaoStatusItemValida("NAO_PAGO", "NAO_PAGO")).toBe(false);
    expect(isTransicaoStatusItemValida("COMPLEMENTO", "COMPLEMENTO")).toBe(false);
  });
});
