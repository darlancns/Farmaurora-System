import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { FECHAMENTO_RESTANTE_ENCERRADA_ERRO } from "../../shared/constants/dir";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { novoDirDTO } from "./helpers/dirFixtures";

// dirStore com o cliente Supabase em memória (tests/unit/helpers/fakeSupabase.ts); nada de rede.
// Cobre a regra do servidor da lista "Fechamentos restantes": quem vira true preenche _em (agora) e
// _por (usuário logado); false zera os dois; PO com operação encerrada não se marca (400).

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { createDir, patchDir } = await import("../../server/utils/dirStore");
const { DirRegraError } = await import("../../server/utils/dirValidation");

const T = "dir";
const AGORA = new Date("2026-10-27T15:30:00.000Z");

function semear(id: string, extra: Record<string, unknown> = {}): void {
  fake.tabelas[T] = [
    ...(fake.tabelas[T] ?? []),
    {
      id,
      po: "PO26-10-0001",
      paciente: "PACIENTE TESTE UM",
      vendedor: "Mateus Morais",
      conferido: false,
      exigencia: false,
      operacao_encerrada: false,
      fechamento_restante: false,
      fechamento_restante_em: null,
      fechamento_restante_por: null,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
      ...extra,
    },
  ];
}

const linha = (id: string) => fake.linhas(T).find((r) => r.id === id)!;

beforeEach(() => {
  fake.tabelas[T] = [];
  fake.chamadas.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("dirStore.patchDir — marcar e desmarcar", () => {
  it("marcar preenche _em (agora) e _por (usuário logado)", async () => {
    semear("a");
    const dir = await patchDir("a", { fechamentoRestante: true }, "Rebeca");
    expect(linha("a")).toMatchObject({
      fechamento_restante: true,
      fechamento_restante_em: AGORA.toISOString(),
      fechamento_restante_por: "Rebeca",
    });
    expect(dir).toMatchObject({
      fechamentoRestante: true,
      fechamentoRestanteEm: AGORA.toISOString(),
      fechamentoRestantePor: "Rebeca",
    });
  });

  it("marcar um PO que já estava marcado NÃO sobrescreve quem/quando", async () => {
    semear("a", {
      fechamento_restante: true,
      fechamento_restante_em: "2026-10-20T09:00:00.000Z",
      fechamento_restante_por: "Bruno",
    });
    await patchDir("a", { fechamentoRestante: true }, "Rebeca");
    expect(linha("a")).toMatchObject({
      fechamento_restante: true,
      fechamento_restante_em: "2026-10-20T09:00:00.000Z",
      fechamento_restante_por: "Bruno",
    });
  });

  it("desmarcar volta _em e _por a NULL", async () => {
    semear("a", {
      fechamento_restante: true,
      fechamento_restante_em: "2026-10-20T09:00:00.000Z",
      fechamento_restante_por: "Bruno",
    });
    const dir = await patchDir("a", { fechamentoRestante: false }, "Rebeca");
    expect(linha("a")).toMatchObject({
      fechamento_restante: false,
      fechamento_restante_em: null,
      fechamento_restante_por: null,
    });
    expect(dir).toMatchObject({ fechamentoRestante: false, fechamentoRestanteEm: "", fechamentoRestantePor: "" });
  });

  it("desmarcar é permitido mesmo com a operação encerrada (limpa uma marca guardada)", async () => {
    semear("a", { operacao_encerrada: true, fechamento_restante: true, fechamento_restante_em: "x", fechamento_restante_por: "y" });
    await patchDir("a", { fechamentoRestante: false }, "Rebeca");
    expect(linha("a").fechamento_restante).toBe(false);
  });

  it("PO inexistente → null (404 no endpoint)", async () => {
    expect(await patchDir("nao-existe", { fechamentoRestante: true }, "Rebeca")).toBeNull();
    expect(await patchDir("nao-existe", { conferido: true }, "Rebeca")).toBeNull();
  });
});

describe("dirStore.patchDir — PO com operação encerrada não se marca (400)", () => {
  it("marcar PO encerrado lança DirRegraError (400) com a mensagem clara e não grava nada", async () => {
    semear("a", { operacao_encerrada: true });
    const antes = { ...linha("a") };
    await expect(patchDir("a", { fechamentoRestante: true }, "Rebeca")).rejects.toThrowError(DirRegraError);
    await expect(patchDir("a", { fechamentoRestante: true }, "Rebeca")).rejects.toThrowError(FECHAMENTO_RESTANTE_ENCERRADA_ERRO);
    expect(linha("a")).toEqual(antes);
    expect(fake.chamadas.some((c) => c.op === "update")).toBe(false);
  });

  it("marcar e encerrar no mesmo PATCH é recusado", async () => {
    semear("a");
    await expect(patchDir("a", { fechamentoRestante: true, operacaoEncerrada: true }, "Rebeca")).rejects.toBeInstanceOf(DirRegraError);
    expect(linha("a").fechamento_restante).toBe(false);
  });

  it("marcar e reabrir no mesmo PATCH é aceito", async () => {
    semear("a", { operacao_encerrada: true });
    await patchDir("a", { fechamentoRestante: true, operacaoEncerrada: false }, "Rebeca");
    expect(linha("a")).toMatchObject({ fechamento_restante: true, operacao_encerrada: false, fechamento_restante_por: "Rebeca" });
  });
});

describe("dirStore.patchDir — saída automática ao encerrar e retorno ao reabrir", () => {
  it("encerrar a operação de um PO marcado NÃO apaga a marca nem quem/quando; reabrir devolve o PO à lista", async () => {
    semear("a");
    await patchDir("a", { fechamentoRestante: true }, "Rebeca");

    await patchDir("a", { operacaoEncerrada: true }, "Bruno");
    expect(linha("a")).toMatchObject({
      operacao_encerrada: true,
      fechamento_restante: true, // a marca fica guardada
      fechamento_restante_por: "Rebeca",
      fechamento_restante_em: AGORA.toISOString(),
    });

    await patchDir("a", { operacaoEncerrada: false }, "Bruno");
    expect(linha("a")).toMatchObject({
      operacao_encerrada: false,
      fechamento_restante: true,
      fechamento_restante_por: "Rebeca",
    });
  });

  it("PATCH que não mexe em fechamentoRestante não faz a leitura extra (só o UPDATE)", async () => {
    semear("a");
    await patchDir("a", { conferido: true }, "Rebeca");
    expect(fake.chamadas.map((c) => c.op)).toEqual(["update"]);
    expect(linha("a")).toMatchObject({ conferido: true, fechamento_restante: false });
  });
});

describe("dirStore.createDir", () => {
  it("criar já marcado preenche _em e _por", async () => {
    const dir = await createDir(novoDirDTO({ fechamentoRestante: true }), "Rebeca");
    expect(dir).toMatchObject({ fechamentoRestante: true, fechamentoRestantePor: "Rebeca", fechamentoRestanteEm: AGORA.toISOString() });
    expect(fake.linhas(T)[0]).toMatchObject({
      fechamento_restante: true,
      fechamento_restante_em: AGORA.toISOString(),
      fechamento_restante_por: "Rebeca",
    });
  });

  it("criar sem marcar deixa _em e _por NULL", async () => {
    const dir = await createDir(novoDirDTO(), "Rebeca");
    expect(dir).toMatchObject({ fechamentoRestante: false, fechamentoRestanteEm: "", fechamentoRestantePor: "" });
    expect(fake.linhas(T)[0]).toMatchObject({ fechamento_restante: false, fechamento_restante_em: null, fechamento_restante_por: null });
  });

  it("criar marcado com a operação encerrada é recusado", async () => {
    await expect(createDir(novoDirDTO({ fechamentoRestante: true, operacaoEncerrada: true }), "Rebeca")).rejects.toBeInstanceOf(DirRegraError);
    expect(fake.linhas(T)).toHaveLength(0);
  });
});
