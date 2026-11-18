import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import { agruparPorColuna } from "../../app/utils/processoKanban";
import { separarAbas } from "../../app/utils/processoListas";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { gatilhoStatusDesde } from "./helpers/gatilhoStatusDesde";

// `status_desde` (ordem do Kanban por entrada na coluna). Quem grava é o GATILHO do banco (follow_up_status_desde): aqui ele é
// simulado pelo gatilhoStatusDesde (espelho do SQL) ligado no FakeSupabase. O que se confere: o código NUNCA grava a coluna,
// todas as respostas que devolvem o processo trazem `statusDesde` (vindo da linha) e o card cai no lugar certo da coluna.

const h = vi.hoisted(() => ({ body: {} as unknown, id: "proc_1" as string | undefined }));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => h.id) };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));
vi.mock("../../server/utils/notificacoesProcesso", () => ({
  avisarConsultorDeItensNovos: vi.fn(async () => {}),
}));

const { default: mover } = await import("../../server/api/processos/[id]/mover.post");
const { default: patchHandler } = await import("../../server/api/processos/[id].patch");
const { default: postHandler } = await import("../../server/api/processos/index.post");
const { gravarChegadaProcesso, gravarCienciaPrazoAnvisa, listProcessos } = await import("../../server/utils/processosStore");

const T = "follow_up";
const VERSAO = "2026-11-05T10:00:00.123456+00:00";
const ENTROU = "2026-11-03T15:00:00.000000+00:00"; // quando o card entrou na coluna em que está
const AGORA = new Date("2026-11-18T15:30:00.000Z");

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
    medicamentos: [],
    pendencias: [],
    atualizacoes: [],
    created_at: "2026-11-01T00:00:00.000000+00:00",
    updated_at: VERSAO,
    status_desde: ENTROU,
    prazo_anvisa: "2026-12-01",
    ...extra,
  };
}

const admin: AuthUser = { id: "u1", email: "u1@x.com", role: "administrador", nome: "Admin", isAdmin: true };

const noBanco = (id = "proc_1") => fake.linhas(T).find((r) => r.id === id)!;
const colunasGravadas = () => fake.chamadas.filter((c) => c.tabela === T && c.op === "update");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  fake.tabelas[T] = [linha()];
  fake.chamadas.length = 0;
  fake.gatilho(T, gatilhoStatusDesde);
  h.id = "proc_1";
});
afterEach(() => {
  fake.gatilho(T, null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function post(user: AuthUser, handler: (e: never) => Promise<unknown>, body: unknown) {
  h.body = JSON.parse(JSON.stringify(body));
  return handler({ context: { user } } as never) as Promise<{ status: string; statusDesde?: string; updatedAt: string; id: string; createdAt: string }>;
}

describe("mover (Kanban)", () => {
  it("a resposta traz o statusDesde NOVO (o do gatilho); o código não grava a coluna", async () => {
    const res = await post(admin, mover, { status: "desembaraco", versao: VERSAO });
    expect(res.status).toBe("desembaraco");
    expect(res.statusDesde).toBe(AGORA.toISOString());
    expect(noBanco().status_desde).toBe(AGORA.toISOString());
    expect(res.updatedAt).not.toBe(VERSAO); // o gatilho não mexe em updated_at: quem muda é o código, como sempre
  });

  it("o card movido cai no FIM da coluna nova e, em Entregue, no TOPO (nunca na posição antiga)", async () => {
    fake.tabelas[T] = [
      linha({ id: "a", pasta: "2026 - 9", status: "desembaraco", status_desde: "2026-11-02T12:00:00.000Z" }),
      linha({ id: "b", pasta: "2026 - 1", status: "desembaraco", status_desde: "2026-11-10T12:00:00.000Z" }),
      linha({ id: "mov", pasta: "2026 - 0", status: "em_transito", status_desde: "2026-10-01T12:00:00.000Z" }),
      linha({ id: "e1", pasta: "2026 - 3", status: "entregue", status_desde: "2026-11-04T12:00:00.000Z" }),
    ];
    h.id = "mov";
    const antes = (await listProcessos()).map((p) => p);
    expect(agruparPorColuna(antes).em_transito.map((p) => p.id)).toEqual(["mov"]);

    const movido = await post(admin, mover, { status: "desembaraco", versao: VERSAO });
    const depois = antes.map((p) => (p.id === "mov" ? { ...p, ...(movido as object) } : p)) as typeof antes;
    expect(agruparPorColuna(depois as never).desembaraco.map((p) => p.id)).toEqual(["a", "b", "mov"]);

    h.id = "mov";
    const entregue = await post(admin, mover, { status: "entregue", versao: (movido as { updatedAt: string }).updatedAt });
    const depois2 = depois.map((p) => (p.id === "mov" ? { ...p, ...(entregue as object) } : p));
    expect(agruparPorColuna(depois2 as never).entregue.map((p) => p.id)).toEqual(["mov", "e1"]);
  });
});

describe("PATCH (formulário Editar)", () => {
  it("mudar o status pelo formulário: a resposta traz o statusDesde novo", async () => {
    h.body = { status: "liberado", parcial: true };
    const res = (await patchHandler({ context: { user: admin } } as never)) as { statusDesde?: string; status: string };
    expect(res.status).toBe("liberado");
    expect(res.statusDesde).toBe(AGORA.toISOString());
  });

  it("não mexer no status (outro campo, com ou sem versao): statusDesde fica igual", async () => {
    h.body = { numeroAwb: "ZZ999999999BR", parcial: true };
    const res = (await patchHandler({ context: { user: admin } } as never)) as { statusDesde?: string };
    expect(res.statusDesde).toBe(ENTROU);

    h.body = { numeroAwb: "AA111111111BR", parcial: true, versao: (noBanco().updated_at as string) };
    const res2 = (await patchHandler({ context: { user: admin } } as never)) as { statusDesde?: string };
    expect(res2.statusDesde).toBe(ENTROU);
  });

  it("um statusDesde vindo do cliente é IGNORADO (a coluna não é gravada)", async () => {
    h.body = { numeroAwb: "ZZ999999999BR", statusDesde: "2000-01-01T00:00:00Z", status_desde: "2000-01-01T00:00:00Z", parcial: true };
    const res = (await patchHandler({ context: { user: admin } } as never)) as { statusDesde?: string };
    expect(res.statusDesde).toBe(ENTROU);
    expect(noBanco().status_desde).toBe(ENTROU);
    expect(noBanco()).not.toHaveProperty("statusDesde");
    expect(colunasGravadas()).toHaveLength(1);
  });
});

describe("criação (POST)", () => {
  const corpo = (extra: Record<string, unknown> = {}) => ({
    paciente: "Beltrana",
    pasta: "2026 - 99",
    empresa: "FARMAURORA",
    consultor: "Dani",
    status: "em_transito",
    medicamentos: [],
    pendencias: [],
    atualizacoes: [],
    datas: {},
    ...extra,
  });

  it("statusDesde = createdAt (o que o gatilho grava no INSERT) na resposta e no banco", async () => {
    const res = await post(admin, postHandler, corpo());
    expect(res.statusDesde).toBe(res.createdAt);
    expect(noBanco(res.id).status_desde).toBe(res.createdAt);
  });

  it("um statusDesde vindo do cliente é descartado: nem na resposta nem no banco", async () => {
    const res = await post(admin, postHandler, corpo({ statusDesde: "2000-01-01T00:00:00Z", status_desde: "2000-01-01T00:00:00Z" }));
    expect(res.statusDesde).toBe(res.createdAt);
    expect(res.statusDesde).not.toContain("2000");
    expect(noBanco(res.id).status_desde).toBe(res.createdAt);
  });
});

describe("chegada confirmada, ciente da ANVISA e lista", () => {
  it("'Chegada confirmada' (Em trânsito → Desembaraço): o processo devolvido traz o statusDesde novo", async () => {
    const r = await gravarChegadaProcesso("proc_1", () => ({ status: "desembaraco", atualizacoes: [{ data: "18/11", texto: "Chegada confirmada em 18/11." }] }));
    expect(r.tipo).toBe("ok");
    if (r.tipo === "ok") expect(r.processo.statusDesde).toBe(AGORA.toISOString());
  });

  it("'Chegada adiada' (só a data) e o Ciente da ANVISA não mudam o statusDesde", async () => {
    const adiada = await gravarChegadaProcesso("proc_1", () => ({ datas: { dataChegadaBrasil: "20/11/2026" }, atualizacoes: [] }));
    expect(adiada.tipo === "ok" && adiada.processo.statusDesde).toBe(ENTROU);
    const ciente = await gravarCienciaPrazoAnvisa("proc_1", "2026-12-01");
    expect(ciente.tipo === "ok" && ciente.processo.statusDesde).toBe(ENTROU);
  });

  it("a Lista e a aba Entregues NÃO mudam: ordem do servidor (created_at desc, id), seja qual for o statusDesde", async () => {
    fake.tabelas[T] = [
      linha({ id: "velho", created_at: "2026-11-01T00:00:00.000000+00:00", status_desde: "2026-11-17T00:00:00.000Z", status: "entregue" }),
      linha({ id: "novo", created_at: "2026-11-09T00:00:00.000000+00:00", status_desde: "2026-11-02T00:00:00.000Z", status: "entregue" }),
      linha({ id: "meio-b", created_at: "2026-11-05T00:00:00.000000+00:00", status_desde: "2026-11-05T00:00:00.000Z" }),
      linha({ id: "meio-a", created_at: "2026-11-05T00:00:00.000000+00:00", status_desde: "2026-11-30T00:00:00.000Z" }),
    ];
    const lista = await listProcessos();
    expect(lista.map((p) => p.id)).toEqual(["novo", "meio-a", "meio-b", "velho"]);
    const { entregues, andamento } = separarAbas(lista);
    expect(entregues.map((p) => p.id)).toEqual(["novo", "velho"]); // Entregues: a ordem da lista (nada de "mais novo em cima" por statusDesde)
    expect(andamento.map((p) => p.id)).toEqual(["meio-a", "meio-b"]);
    // E o Kanban, com os mesmos dados, ordena pelo statusDesde (Entregue: o mais novo em cima).
    expect(agruparPorColuna(lista).entregue.map((p) => p.id)).toEqual(["velho", "novo"]);
  });
});

describe("tolerância: coluna ausente (Supabase falso dos e2e não roda gatilho)", () => {
  it("sem gatilho e sem status_desde na linha: statusDesde = created_at em todas as respostas", async () => {
    fake.gatilho(T, null);
    const sem = linha();
    delete sem.status_desde;
    fake.tabelas[T] = [sem];

    const lista = await listProcessos();
    expect(lista[0]!.statusDesde).toBe("2026-11-01T00:00:00.000000+00:00");

    const res = await post(admin, mover, { status: "desembaraco", versao: VERSAO });
    expect(res.statusDesde).toBe("2026-11-01T00:00:00.000000+00:00");
  });
});
