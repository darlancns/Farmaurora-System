import { describe, expect, it } from "vitest";
import { colunasDeDir, montarDir, type DirRow } from "../../server/utils/dirMappers";
import { novoDirDTO } from "./helpers/dirFixtures";

const MARCA = { em: "2026-10-27T15:30:00.000Z", por: "Rebeca" };

describe("dirMappers — colunasDeDir", () => {
  it("create: traz TODAS as colunas editáveis, em snake_case", () => {
    const col = colunasDeDir(novoDirDTO({ conferido: true, dsiDirDuimp: true, protocoloAssinado: true }));
    expect(col).toMatchObject({
      po: "PO26-10-0001",
      paciente: "PACIENTE TESTE UM",
      vendedor: "Mateus Morais",
      responsavel: "Bruno",
      conferido: true,
      dsi_dir_duimp: true,
      protocolo_assinado: true,
      contrato_cambio: "123456789",
      data_emissao: "2026-10-05",
      data_cobranca_fornecedores: "2026-10-08",
      operacao_encerrada: false,
      fechamento_restante: false,
      status: "on_going",
    });
    // 32 campos do DTO + fechamento_restante_em/_por (zerados quando desmarcado) = 34 colunas
    // (sem id e sem created_at/updated_at).
    expect(Object.keys(col)).toHaveLength(34);
  });

  it('texto e data vazios ("" ou só espaços) viram NULL; status nulo continua NULL', () => {
    const col = colunasDeDir(novoDirDTO({ responsavel: "  ", awb: "", dataEntrega: "", dataPagamento: "", status: null }));
    expect(col).toMatchObject({ responsavel: null, awb: null, data_entrega: null, data_pagamento: null, status: null });
  });

  it("aparas em po, paciente e vendedor", () => {
    const col = colunasDeDir({ po: " PO26-10-0001 ", paciente: " X ", vendedor: " ASD " });
    expect(col).toEqual({ po: "PO26-10-0001", paciente: "X", vendedor: "ASD" });
  });

  it("patch é seletivo: só as chaves presentes viram coluna", () => {
    expect(colunasDeDir({ conferido: true })).toEqual({ conferido: true });
    expect(colunasDeDir({ dataPagamento: "2026-10-20", banco: "XP" })).toEqual({ data_pagamento: "2026-10-20", banco: "XP" });
    expect(colunasDeDir({ status: null })).toEqual({ status: null });
    expect(colunasDeDir({})).toEqual({});
  });

  it("patch de limpeza: texto vazio apaga (NULL)", () => {
    expect(colunasDeDir({ banco: "" })).toEqual({ banco: null });
  });
});

describe("dirMappers — fechamento restante (quem/quando marcou)", () => {
  it("marcar COM a marca grava fechamento_restante e preenche _em e _por", () => {
    expect(colunasDeDir({ fechamentoRestante: true }, MARCA)).toEqual({
      fechamento_restante: true,
      fechamento_restante_em: "2026-10-27T15:30:00.000Z",
      fechamento_restante_por: "Rebeca",
    });
  });

  it("marcar SEM marca (PO que já estava marcado) não mexe em _em e _por", () => {
    expect(colunasDeDir({ fechamentoRestante: true })).toEqual({ fechamento_restante: true });
  });

  it("desmarcar zera _em e _por (mesmo que venha uma marca)", () => {
    const esperado = { fechamento_restante: false, fechamento_restante_em: null, fechamento_restante_por: null };
    expect(colunasDeDir({ fechamentoRestante: false })).toEqual(esperado);
    expect(colunasDeDir({ fechamentoRestante: false }, MARCA)).toEqual(esperado);
  });

  it("patch que não fala de fechamentoRestante não toca nas colunas de auditoria, mesmo com marca", () => {
    expect(colunasDeDir({ operacaoEncerrada: true }, MARCA)).toEqual({ operacao_encerrada: true });
    expect(colunasDeDir({ conferido: true }, MARCA)).toEqual({ conferido: true });
  });

  it("encerrar a operação NÃO apaga a marca (reabrir devolve o PO à lista)", () => {
    const col = colunasDeDir({ operacaoEncerrada: true });
    expect(col).not.toHaveProperty("fechamento_restante");
    expect(col).not.toHaveProperty("fechamento_restante_em");
    expect(col).not.toHaveProperty("fechamento_restante_por");
  });

  it("create marcado com marca grava os três campos", () => {
    const col = colunasDeDir(novoDirDTO({ fechamentoRestante: true }), MARCA);
    expect(col).toMatchObject({ fechamento_restante: true, fechamento_restante_em: MARCA.em, fechamento_restante_por: "Rebeca" });
  });
});

describe("dirMappers — montarDir", () => {
  const linhaCompleta: DirRow = {
    id: "dir_1",
    po: "PO26-03-0109",
    paciente: "PACIENTE TESTE UM",
    conferido: true,
    vendedor: "Braulio (3RB)",
    responsavel: null,
    exigencia: true,
    data_emissao: "2026-03-12",
    data_cobranca_fornecedores: null,
    receita: null,
    medicamento: "MEDICAMENTO X",
    temperatura: null,
    fornecedor: "Matsun",
    origem: null,
    envio: null,
    awb: null,
    despachante: null,
    status: null,
    data_entrega: null,
    contrato_cambio: null,
    observacao: null,
    banco: "Sicoob",
    data_pagamento: "2026-03-16",
    operacao_encerrada: true,
    dactes: true,
    dsi_dir_duimp: false,
    logger: false,
    fechamento: true,
    numerario: false,
    protocolo_assinado: false,
    swift: false,
    termometro: false,
    fechamento_restante: false,
    fechamento_restante_em: null,
    fechamento_restante_por: null,
    created_at: "2026-10-26T10:00:00.000Z",
    updated_at: "2026-10-26T10:00:00.000Z",
  };

  it('colunas NULL viram "" e status nulo continua null', () => {
    const dir = montarDir(linhaCompleta);
    expect(dir).toMatchObject({
      id: "dir_1",
      vendedor: "Braulio (3RB)",
      responsavel: "",
      dataCobrancaFornecedores: "",
      dataEntrega: "",
      status: null,
      banco: "Sicoob",
      dataPagamento: "2026-03-16",
      exigencia: true,
      operacaoEncerrada: true,
      dactes: true,
      dsiDirDuimp: false,
      fechamentoRestante: false,
      fechamentoRestanteEm: "",
      fechamentoRestantePor: "",
      createdAt: "2026-10-26T10:00:00.000Z",
    });
  });

  it("PO marcado: fechamentoRestante, quem e quando vêm da linha", () => {
    const dir = montarDir({
      ...linhaCompleta,
      fechamento_restante: true,
      fechamento_restante_em: "2026-10-27T15:30:00+00:00",
      fechamento_restante_por: "Bruno",
    });
    expect(dir).toMatchObject({
      fechamentoRestante: true,
      fechamentoRestanteEm: "2026-10-27T15:30:00+00:00",
      fechamentoRestantePor: "Bruno",
    });
  });

  it("ida e volta: DTO → colunas → Dir devolve o mesmo DTO", () => {
    const dto = novoDirDTO({ conferido: true, swift: true, status: "entregue", dataEntrega: "2026-10-20" });
    const col = colunasDeDir(dto);
    const dir = montarDir({ ...(col as unknown as DirRow), id: "dir_x", created_at: "t", updated_at: "t" });
    const { id: _id, createdAt: _c, updatedAt: _u, fechamentoRestanteEm, fechamentoRestantePor, ...resto } = dir;
    expect(resto).toEqual(dto);
    expect([fechamentoRestanteEm, fechamentoRestantePor]).toEqual(["", ""]);
  });

  it("ida e volta de um PO marcado preserva a marca e quem/quando", () => {
    const dto = novoDirDTO({ fechamentoRestante: true });
    const col = colunasDeDir(dto, MARCA);
    const dir = montarDir({ ...(col as unknown as DirRow), id: "dir_y", created_at: "t", updated_at: "t" });
    expect(dir).toMatchObject({ fechamentoRestante: true, fechamentoRestanteEm: MARCA.em, fechamentoRestantePor: "Rebeca" });
  });
});
