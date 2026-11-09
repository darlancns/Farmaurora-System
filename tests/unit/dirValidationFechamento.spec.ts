import { describe, expect, it } from "vitest";
import { FECHAMENTO_RESTANTE_ENCERRADA_ERRO } from "../../shared/constants/dir";
import {
  DirRegraError,
  erroMarcacaoFechamentoRestante,
  isValidDirPatch,
  isValidDirPayload,
} from "../../server/utils/dirValidation";
import { nomeParaAuditoriaDir } from "../../server/utils/dirAuditoria";
import { novoDirDTO } from "./helpers/dirFixtures";

describe("dirValidation — fechamentoRestante no corpo", () => {
  it("create: fechamentoRestante é obrigatório e boolean", () => {
    expect(isValidDirPayload(novoDirDTO({ fechamentoRestante: true }))).toBe(true);
    expect(isValidDirPayload(novoDirDTO({ fechamentoRestante: false }))).toBe(true);
    const { fechamentoRestante: _f, ...sem } = novoDirDTO();
    expect(isValidDirPayload(sem)).toBe(false);
    expect(isValidDirPayload({ ...novoDirDTO(), fechamentoRestante: "sim" })).toBe(false);
  });

  it("patch: marcar e desmarcar são aceitos", () => {
    expect(isValidDirPatch({ fechamentoRestante: true })).toBe(true);
    expect(isValidDirPatch({ fechamentoRestante: false })).toBe(true);
    expect(isValidDirPatch({ fechamentoRestante: "true" })).toBe(false);
  });

  it("quem/quando marcou NUNCA vêm do cliente: _em e _por são chaves rejeitadas (create e patch)", () => {
    expect(isValidDirPatch({ fechamentoRestanteEm: "2026-10-27T10:00:00Z" })).toBe(false);
    expect(isValidDirPatch({ fechamentoRestantePor: "Rebeca" })).toBe(false);
    expect(isValidDirPatch({ fechamentoRestante: true, fechamentoRestantePor: "Rebeca" })).toBe(false);
    expect(isValidDirPayload({ ...novoDirDTO(), fechamentoRestanteEm: "x", fechamentoRestantePor: "y" })).toBe(false);
  });
});

describe("dirValidation — erroMarcacaoFechamentoRestante (PO encerrado não se marca)", () => {
  const ABERTO = { operacaoEncerrada: false };
  const ENCERRADO = { operacaoEncerrada: true };

  it("marcar PO em andamento é aceito", () => {
    expect(erroMarcacaoFechamentoRestante({ fechamentoRestante: true }, ABERTO)).toBeNull();
  });

  it("marcar PO com a operação encerrada → erro com mensagem clara", () => {
    const erro = erroMarcacaoFechamentoRestante({ fechamentoRestante: true }, ENCERRADO);
    expect(erro).toBe(FECHAMENTO_RESTANTE_ENCERRADA_ERRO);
    expect(erro).toMatch(/Operação encerrada/);
  });

  it("vale para o estado RESULTANTE: marcar e encerrar no mesmo corpo é recusado", () => {
    expect(erroMarcacaoFechamentoRestante({ fechamentoRestante: true, operacaoEncerrada: true }, ABERTO)).not.toBeNull();
  });

  it("marcar e reabrir no mesmo corpo é aceito (o estado resultante é em andamento)", () => {
    expect(erroMarcacaoFechamentoRestante({ fechamentoRestante: true, operacaoEncerrada: false }, ENCERRADO)).toBeNull();
  });

  it("desmarcar é sempre aceito, inclusive em PO encerrado", () => {
    expect(erroMarcacaoFechamentoRestante({ fechamentoRestante: false }, ENCERRADO)).toBeNull();
    expect(erroMarcacaoFechamentoRestante({ fechamentoRestante: false, operacaoEncerrada: true }, ABERTO)).toBeNull();
  });

  it("encerrar um PO que já está marcado é aceito (a marca fica guardada)", () => {
    expect(erroMarcacaoFechamentoRestante({ operacaoEncerrada: true }, ABERTO)).toBeNull();
  });

  it("create: marcado + encerrado é recusado; marcado + em andamento é aceito (sem estado atual)", () => {
    expect(erroMarcacaoFechamentoRestante(novoDirDTO({ fechamentoRestante: true, operacaoEncerrada: true }))).not.toBeNull();
    expect(erroMarcacaoFechamentoRestante(novoDirDTO({ fechamentoRestante: true, operacaoEncerrada: false }))).toBeNull();
    expect(erroMarcacaoFechamentoRestante(novoDirDTO())).toBeNull();
  });
});

describe("DirRegraError", () => {
  it("é um erro 400 com a mensagem", () => {
    const e = new DirRegraError("x");
    expect(e).toBeInstanceOf(Error);
    expect(e.statusCode).toBe(400);
    expect(e.message).toBe("x");
  });
});

describe("nomeParaAuditoriaDir — o `por` do fechamento restante", () => {
  it("usa o nome da conta", () => {
    expect(nomeParaAuditoriaDir({ nome: "Rebeca", email: "rebeca@example.com" })).toBe("Rebeca");
  });

  it("sem nome (conta antiga), usa a parte do e-mail antes do @", () => {
    expect(nomeParaAuditoriaDir({ email: "maria.souza@example.com" })).toBe("maria.souza");
    expect(nomeParaAuditoriaDir({ nome: "   ", email: "joao@example.com" })).toBe("joao");
  });

  it("sem usuário devolve 'desconhecido'", () => {
    expect(nomeParaAuditoriaDir(null)).toBe("desconhecido");
    expect(nomeParaAuditoriaDir(undefined)).toBe("desconhecido");
  });
});
