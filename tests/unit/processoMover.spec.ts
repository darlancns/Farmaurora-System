import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import { FakeSupabase } from "./helpers/fakeSupabase";

// POST /api/processos/:id/mover (Kanban: mudar de coluna). Handler e processosStore REAIS; só h3
// (readBody/getRouterParam), o cliente Supabase (em memória) e o aviso ao consultor são simulados.
// "Agora": Date congelado (só o Date).

const h = vi.hoisted(() => ({ body: {} as unknown, id: "proc_1" as string | undefined }));
const aviso = vi.hoisted(() => ({ fn: vi.fn(async () => {}) }));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => h.id) };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));
vi.mock("../../server/utils/notificacoesProcesso", () => ({
  avisarConsultorDeItensNovos: aviso.fn,
}));

const { default: mover } = await import("../../server/api/processos/[id]/mover.post");
const { textoStatusAlterado, dataDaAtualizacaoStatus } = await import("../../shared/utils/moverStatus");
const { autorizarApi } = await import("../../shared/utils/permissoesPagina");

const T = "follow_up";
const VERSAO = "2026-11-05T10:00:00.123456+00:00";
const AGORA = new Date("2026-11-12T10:00:00-03:00");

function linha(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "proc_1",
    paciente: "Fulano",
    numero_remessa: 1,
    pasta: "2026 - 1",
    empresa: "FARMAURORA",
    consultor: "Dani",
    responsavel_operacional: "Bruno",
    status: "em_transito",
    status_outro: null,
    medicamentos: [],
    pendencias: [],
    atualizacoes: [{ data: "01/09", texto: "Antiga" }],
    data_chegada_brasil: "06/11",
    created_at: "2026-01-01T00:00:00.000000+00:00",
    updated_at: VERSAO,
    ...extra,
  };
}

const conta = (role: AuthUser["role"], extra: Partial<AuthUser> = {}): AuthUser => ({
  id: "u1",
  email: "u1@x.com",
  role,
  nome: "Bruno Alves",
  isAdmin: role === "administrador",
  ...extra,
});
const admin = conta("administrador");
const operacional = conta("operacional");

async function chamar(user: AuthUser | null, body: unknown, id = "proc_1") {
  h.body = JSON.parse(JSON.stringify(body ?? null));
  h.id = id;
  return mover({ context: { user } } as never);
}

async function erroDe(promessa: Promise<unknown>): Promise<{ status: number; msg: string }> {
  try {
    await promessa;
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "" };
  }
  throw new Error("esperava um erro HTTP, mas a chamada passou");
}

const noBanco = () => fake.linhas(T)[0]!;
const updates = () => fake.chamadas.filter((c) => c.tabela === T && c.op === "update").length;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  fake.tabelas[T] = [linha()];
  fake.chamadas.length = 0;
  aviso.fn.mockReset();
  aviso.fn.mockImplementation(async () => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("sucesso", () => {
  it("muda o status e acrescenta UMA atualização 'Status alterado de … para … em DD/MM.' num único UPDATE", async () => {
    const res = await chamar(operacional, { status: "desembaraco", versao: VERSAO });

    expect(res.status).toBe("desembaraco");
    expect(res.atualizacoes).toEqual([
      { data: "01/09", texto: "Antiga" },
      { data: "12/11", texto: "Status alterado de Em trânsito para Desembaraço em 12/11." },
    ]);
    expect(noBanco().status).toBe("desembaraco");
    expect(noBanco().updated_at).not.toBe(VERSAO);
    expect(updates()).toBe(1);
  });

  it("Em trânsito → Desembaraço manual NÃO é o 'Chegou?': nada de 'Chegada confirmada' e a data prevista fica igual", async () => {
    const res = await chamar(admin, { status: "desembaraco", versao: VERSAO });
    expect(res.atualizacoes.map((a) => a.texto).join(" ")).not.toContain("Chegada confirmada");
    expect(noBanco().data_chegada_brasil).toBe("06/11");
  });

  it("não toca em status_outro (linha legada 'outro', lida como Desembaraço, indo para Liberado)", async () => {
    fake.tabelas[T] = [linha({ status: "outro", status_outro: "INDEFERIDO" })];
    const res = await chamar(admin, { status: "liberado", versao: VERSAO });
    expect(res.status).toBe("liberado");
    expect(res.atualizacoes.at(-1)?.texto).toBe("Status alterado de Desembaraço para Liberado em 12/11.");
    expect(noBanco().status_outro).toBe("INDEFERIDO");
    expect(res).not.toHaveProperty("statusOutro");
  });

  it("avisa o consultor com a lista de ANTES (a atualização nova é o item novo) e o ator", async () => {
    await chamar(admin, { status: "liberado", versao: VERSAO });
    expect(aviso.fn).toHaveBeenCalledTimes(1);
    const entrada = aviso.fn.mock.calls[0]![0] as unknown as {
      processo: { status: string };
      atualizacoesAntes: unknown[];
      atorId: string;
    };
    expect(entrada.processo.status).toBe("liberado");
    expect(entrada.atualizacoesAntes).toEqual([{ data: "01/09", texto: "Antiga" }]);
    expect(entrada.atorId).toBe("u1");
  });

  it("falha do aviso ao consultor NÃO desfaz a gravação nem vira erro", async () => {
    aviso.fn.mockImplementation(async () => {
      throw new Error("sem rede");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await chamar(admin, { status: "entregue", versao: VERSAO });
    expect(res.status).toBe("entregue");
    expect(noBanco().status).toBe("entregue");
  });
});

describe("400 — pedido inválido (nada gravado)", () => {
  it("mesmo status do atual", async () => {
    const erro = await erroDe(chamar(admin, { status: "em_transito", versao: VERSAO }));
    expect(erro).toEqual({ status: 400, msg: "O processo já está em Em trânsito." });
    expect(updates()).toBe(0);
  });

  it("status inválido ou ausente", async () => {
    for (const status of ["voando", "", undefined, 3]) {
      const erro = await erroDe(chamar(admin, { status, versao: VERSAO }));
      expect(erro.status).toBe(400);
      expect(erro.msg).toContain("Status inválido");
    }
    expect(updates()).toBe(0);
  });

  it("status legado (aguardando_inicio, liberado_parcial, outro): mensagem própria", async () => {
    for (const status of ["aguardando_inicio", "liberado_parcial", "outro"]) {
      const erro = await erroDe(chamar(admin, { status, versao: VERSAO }));
      expect(erro.status).toBe(400);
      expect(erro.msg).toContain("não é mais usado");
    }
    expect(updates()).toBe(0);
  });

  it("sem versão", async () => {
    const erro = await erroDe(chamar(admin, { status: "liberado" }));
    expect(erro.status).toBe(400);
    expect(updates()).toBe(0);
    expect(noBanco().status).toBe("em_transito");
  });
});

describe("409 / 404", () => {
  it("versão desatualizada: 409 e NADA gravado", async () => {
    const erro = await erroDe(chamar(admin, { status: "liberado", versao: "2026-11-01T00:00:00.000000+00:00" }));
    expect(erro.status).toBe(409);
    expect(erro.msg).toContain("alterado por outra pessoa");
    expect(updates()).toBe(0);
    expect(noBanco().status).toBe("em_transito");
    expect(noBanco().atualizacoes).toEqual([{ data: "01/09", texto: "Antiga" }]);
    expect(aviso.fn).not.toHaveBeenCalled();
  });

  it("duas pessoas com a mesma versão: a segunda leva 409", async () => {
    await chamar(admin, { status: "desembaraco", versao: VERSAO });
    const erro = await erroDe(chamar(admin, { status: "liberado", versao: VERSAO }));
    expect(erro.status).toBe(409);
    expect(noBanco().status).toBe("desembaraco");
  });

  it("processo inexistente: 404", async () => {
    const erro = await erroDe(chamar(admin, { status: "liberado", versao: VERSAO }, "nao_existe"));
    expect(erro.status).toBe(404);
  });

  it("limite de atualizações atingido: 409 sem gravar", async () => {
    const cheia = Array.from({ length: 200 }, (_, i) => ({ data: "", texto: `item ${i}` }));
    fake.tabelas[T] = [linha({ atualizacoes: cheia })];
    const erro = await erroDe(chamar(admin, { status: "liberado", versao: VERSAO }));
    expect(erro.status).toBe(409);
    expect(updates()).toBe(0);
  });
});

describe("403 — consultor e conta só-leitura", () => {
  it("consultor: 403 no handler e no middleware (POST em /api/processos/**)", async () => {
    const consultor = conta("consultor", { consultorNome: "Dani" });
    const erro = await erroDe(chamar(consultor, { status: "liberado", versao: VERSAO }));
    expect(erro.status).toBe(403);
    expect(autorizarApi(consultor, "/api/processos/proc_1/mover", "POST")).toMatchObject({ permitido: false, status: 403 });
    expect(updates()).toBe(0);
  });

  it("operacional com permissão 'ver' em processos: 403; com 'editar': grava", async () => {
    const soVer = conta("operacional", { permissoes: { processos: "ver" } });
    expect((await erroDe(chamar(soVer, { status: "liberado", versao: VERSAO }))).status).toBe(403);
    expect(autorizarApi(soVer, "/api/processos/proc_1/mover", "POST")).toMatchObject({ permitido: false, status: 403 });
    expect(updates()).toBe(0);

    const editar = conta("operacional", { permissoes: { processos: "editar" } });
    expect((await chamar(editar, { status: "liberado", versao: VERSAO })).status).toBe("liberado");
  });

  it("sem sessão: 401", async () => {
    expect((await erroDe(chamar(null, { status: "liberado", versao: VERSAO }))).status).toBe(401);
  });
});

describe("texto e data da atualização — fuso de Brasília", () => {
  it("23:30 de Brasília (já 02:30 do dia seguinte em UTC) ainda é o dia de Brasília", () => {
    const agora = new Date("2026-11-11T23:30:00-03:00");
    expect(dataDaAtualizacaoStatus(agora)).toBe("11/11");
    expect(textoStatusAlterado("elaboracao_fornecedores", "em_transito", agora)).toBe(
      "Status alterado de Na origem para Em trânsito em 11/11.",
    );
  });

  it("00:10 de Brasília já é o dia novo", () => {
    const agora = new Date("2026-11-12T00:10:00-03:00");
    expect(dataDaAtualizacaoStatus(agora)).toBe("12/11");
  });
});
