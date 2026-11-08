import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import { FakeSupabase } from "./helpers/fakeSupabase";

// Aviso ao CONSULTOR (sino) de nova pendência / nova atualização: POST /api/processos, PATCH /api/processos/:id
// (parcial, legado e versionado) e POST /api/processos/:id/chegada. Handlers, stores e o fan-out são os REAIS;
// só h3 (readBody/getRouterParam) e o Supabase (processos em memória + contas + INSERT de notificacoes) são simulados.

const h = vi.hoisted(() => ({
  body: {} as unknown,
  id: "proc_1" as string | undefined,
  contas: [] as unknown[],
  inserts: [] as Array<Array<Record<string, unknown>>>,
  falhaNoInsert: null as { message: string } | null,
  falhaNoListUsers: false,
}));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => h.id) };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      admin: {
        listUsers: async () =>
          h.falhaNoListUsers
            ? { data: null, error: { message: "auth fora do ar" } }
            : { data: { users: h.contas, nextPage: null }, error: null },
      },
    },
    from: (tabela: string) =>
      tabela === "notificacoes"
        ? {
            insert: async (rows: Array<Record<string, unknown>>) => {
              if (h.falhaNoInsert) return { error: h.falhaNoInsert };
              h.inserts.push(rows);
              return { error: null };
            },
          }
        : fake.from(tabela),
  }),
}));

const { default: patchHandler } = await import("../../server/api/processos/[id].patch");
const { default: postHandler } = await import("../../server/api/processos/index.post");
const { default: chegadaHandler } = await import("../../server/api/processos/[id]/chegada.post");

const T = "follow_up";
const VERSAO = "2026-11-05T10:00:00.123456+00:00";
const AGORA = new Date("2026-11-08T14:00:00-03:00");

function linha(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "proc_1",
    paciente: "Fulano de Tal",
    numero_remessa: 1,
    pasta: "2026 - 10",
    empresa: "FARMAURORA",
    consultor: "Dani",
    responsavel_operacional: "Bruno",
    status: "em_transito",
    status_outro: null,
    status_pagamento: null,
    medicamentos: [],
    pendencias: ["Laudo"],
    atualizacoes: [{ data: "01/09", texto: "Antiga" }],
    data_chegada_brasil: "06/11",
    created_at: "2026-01-01T00:00:00.000000+00:00",
    updated_at: VERSAO,
    ...extra,
  };
}

function conta(id: string, role: string, consultorNome?: string) {
  return {
    id,
    email: `${id}@farmaurora.com.br`,
    app_metadata: { role, ...(consultorNome ? { consultorNome } : {}) },
    created_at: "2026-01-01T00:00:00Z",
  };
}

const usuario = (id: string, role: AuthUser["role"], nome?: string, consultorNome?: AuthUser["consultorNome"]): AuthUser => ({
  id,
  email: `${id}@farmaurora.com.br`,
  role,
  nome,
  consultorNome,
  isAdmin: role === "administrador",
});
const admin = usuario("adm-1", "administrador", "Admin");
const bruno = usuario("op-bruno", "operacional", "Bruno Alves");
const daniLogada = usuario("cons-dani", "consultor", "Dani", "Dani");

async function chamar<R>(handler: (e: never) => Promise<R>, user: AuthUser | null, body: unknown, id = "proc_1"): Promise<R> {
  h.body = body;
  h.id = id;
  return handler({ context: { user } } as never);
}

const linhasAvisos = () => h.inserts.flat();
const mensagens = () => linhasAvisos().map((l) => l.mensagem);
const gravadoNoBanco = () => fake.linhas(T).find((r) => r.id === "proc_1")!;

function corpoNovoProcesso(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
  };
}

beforeEach(() => {
  h.id = "proc_1";
  h.inserts = [];
  h.falhaNoInsert = null;
  h.falhaNoListUsers = false;
  h.contas = [
    conta("cons-dani", "consultor", "Dani"),
    conta("cons-flavia", "consultor", "Flávia"),
    conta("adm-1", "administrador"),
    conta("op-bruno", "operacional"),
  ];
  fake.tabelas[T] = [linha()];
  fake.chamadas.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("PATCH — pendências (formato parcial)", () => {
  it("adicionar uma pendência avisa a conta do consultor do processo, e só ela", async () => {
    await chamar(patchHandler, admin, { pendencias: ["Laudo", "Receita vencida"], parcial: true });

    expect(linhasAvisos()).toHaveLength(1);
    expect(linhasAvisos()[0]).toMatchObject({
      destinatario_id: "cons-dani",
      tipo: "pendencia_nova",
      recado_id: null,
      processo_id: "proc_1",
      mensagem: "Nova pendência · Fulano de Tal (2026 - 10): Receita vencida",
      lida: false,
    });
    expect(String(linhasAvisos()[0]!.id)).toMatch(/^notif_/);
  });

  it("editar o texto de uma pendência não avisa", async () => {
    await chamar(patchHandler, admin, { pendencias: ["Laudo corrigido"], parcial: true });
    expect(h.inserts).toHaveLength(0);
  });

  it("apagar uma pendência não avisa", async () => {
    fake.tabelas[T] = [linha({ pendencias: ["Laudo", "Receita"] })];
    await chamar(patchHandler, admin, { pendencias: ["Laudo"], parcial: true });
    expect(h.inserts).toHaveLength(0);
  });

  it("editar uma e adicionar outra → um aviso só, o da nova", async () => {
    await chamar(patchHandler, admin, { pendencias: ["Laudo corrigido", "Nova"], parcial: true });
    expect(mensagens()).toEqual(["Nova pendência · Fulano de Tal (2026 - 10): Nova"]);
  });

  it("outras mudanças do processo (sem tocar pendências/atualizações) não avisam e nem leem a linha antes", async () => {
    await chamar(patchHandler, admin, { paciente: "Outro Nome", parcial: true });
    expect(h.inserts).toHaveLength(0);
    expect(fake.chamadas.filter((c) => c.op === "select")).toHaveLength(0);
  });
});

describe("PATCH — formato legado (sem `parcial`)", () => {
  it("adicionar avisa; editar e apagar não", async () => {
    await chamar(patchHandler, admin, { pendencias: ["Laudo", "Nova"] });
    expect(mensagens()).toEqual(["Nova pendência · Fulano de Tal (2026 - 10): Nova"]);

    h.inserts = [];
    fake.tabelas[T] = [linha({ pendencias: ["Laudo", "Receita"] })];
    await chamar(patchHandler, admin, { pendencias: ["Laudo editado", "Receita"] });
    await chamar(patchHandler, admin, { pendencias: ["Receita"] });
    expect(h.inserts).toHaveLength(0);
  });
});

describe("PATCH — atualizações (versionado)", () => {
  const NOVA = { data: "08/11", texto: "Documento enviado" };

  it("adicionar uma atualização avisa o consultor", async () => {
    await chamar(patchHandler, admin, {
      atualizacoes: [{ data: "01/09", texto: "Antiga" }, NOVA],
      versao: VERSAO,
    });
    expect(linhasAvisos()).toHaveLength(1);
    expect(linhasAvisos()[0]).toMatchObject({
      destinatario_id: "cons-dani",
      tipo: "atualizacao_nova",
      processo_id: "proc_1",
      mensagem: "Nova atualização · Fulano de Tal (2026 - 10): Documento enviado",
    });
  });

  it("editar ou apagar uma atualização não avisa", async () => {
    await chamar(patchHandler, admin, { atualizacoes: [{ data: "01/09", texto: "Antiga editada" }], versao: VERSAO });
    expect(h.inserts).toHaveLength(0);

    fake.tabelas[T] = [linha()];
    await chamar(patchHandler, admin, { atualizacoes: [], versao: VERSAO });
    expect(h.inserts).toHaveLength(0);
  });

  it("versão desatualizada (409): nada é gravado e ninguém é avisado", async () => {
    await expect(
      chamar(patchHandler, admin, { atualizacoes: [NOVA], versao: "2026-01-01T00:00:00.000000+00:00" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(h.inserts).toHaveLength(0);
  });
});

describe("POST — criação de processo", () => {
  it("pendências e atualizações iniciais são todas novas: um aviso para cada", async () => {
    const criado = await chamar(
      postHandler,
      admin,
      corpoNovoProcesso({ pendencias: ["Laudo", "Receita"], atualizacoes: [{ data: "08/11", texto: "Aberto" }] }),
    );

    expect(mensagens()).toEqual([
      "Nova pendência · Beltrana (2026 - 99): Laudo",
      "Nova pendência · Beltrana (2026 - 99): Receita",
      "Nova atualização · Beltrana (2026 - 99): Aberto",
    ]);
    for (const l of linhasAvisos()) {
      expect(l).toMatchObject({ destinatario_id: "cons-dani", processo_id: (criado as { id: string }).id });
    }
  });

  it("sem pendências nem atualizações: nem consulta as contas", async () => {
    h.falhaNoListUsers = true;
    await chamar(postHandler, admin, corpoNovoProcesso());
    expect(h.inserts).toHaveLength(0);
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe("POST /chegada", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AGORA);
  });

  it("confirmar: a atualização 'Chegada confirmada…' avisa o consultor", async () => {
    await chamar(chegadaHandler, bruno, { acao: "confirmar" });
    expect(linhasAvisos()).toHaveLength(1);
    expect(linhasAvisos()[0]).toMatchObject({
      destinatario_id: "cons-dani",
      tipo: "atualizacao_nova",
      processo_id: "proc_1",
    });
    expect(String(linhasAvisos()[0]!.mensagem)).toMatch(/^Nova atualização · Fulano de Tal \(2026 - 10\): Chegada confirmada/);
  });

  it("adiar: a atualização 'Chegada adiada…' avisa o consultor", async () => {
    await chamar(chegadaHandler, bruno, { acao: "adiar", novaData: "20/11/2026" });
    expect(String(linhasAvisos()[0]!.mensagem)).toMatch(/^Nova atualização · Fulano de Tal \(2026 - 10\): Chegada adiada/);
  });

  it("403 (não é o responsável) e 409 (status mudou): ninguém é avisado", async () => {
    await expect(chamar(chegadaHandler, admin, { acao: "confirmar" })).rejects.toMatchObject({ statusCode: 403 });
    fake.tabelas[T] = [linha({ status: "desembaraco" })];
    await expect(chamar(chegadaHandler, bruno, { acao: "confirmar" })).rejects.toMatchObject({ statusCode: 409 });
    expect(h.inserts).toHaveLength(0);
  });
});

describe("quem recebe e quem não recebe", () => {
  it("o próprio consultor do processo (ator) NÃO é avisado", async () => {
    await chamar(patchHandler, daniLogada, { pendencias: ["Laudo", "Nova"], parcial: true });
    expect(h.inserts).toHaveLength(0);
    expect(gravadoNoBanco().pendencias).toEqual(["Laudo", "Nova"]);
  });

  it("outro consultor (de OUTRO processo) não recebe; só o dono", async () => {
    await chamar(patchHandler, admin, { pendencias: ["Laudo", "Nova"], parcial: true });
    const destinos = linhasAvisos().map((l) => l.destinatario_id);
    expect(destinos).toEqual(["cons-dani"]);
    expect(destinos).not.toContain("cons-flavia");
    expect(destinos).not.toContain("adm-1");
    expect(destinos).not.toContain("op-bruno");
  });

  it("quem grava num processo que não é dele (ator de outro consultor) não muda o destinatário: a Dani recebe", async () => {
    // Flávia grava no processo da Dani: quem recebe é a Dani.
    const flavia = usuario("cons-flavia", "consultor", "Flávia", "Flávia");
    await chamar(patchHandler, flavia, { pendencias: ["Laudo", "Nova"], parcial: true });
    expect(linhasAvisos().map((l) => l.destinatario_id)).toEqual(["cons-dani"]);
  });

  it("consultor sem conta: não avisa, não grava nada e a gravação do processo segue", async () => {
    h.contas = [conta("cons-flavia", "consultor", "Flávia"), conta("adm-1", "administrador")];
    await chamar(patchHandler, admin, { pendencias: ["Laudo", "Nova"], parcial: true });
    expect(h.inserts).toHaveLength(0);
    expect(gravadoNoBanco().pendencias).toEqual(["Laudo", "Nova"]);
  });

  it("conta de consultor sem consultorNome válido nunca casa", async () => {
    h.contas = [conta("cons-x", "consultor"), conta("cons-y", "consultor", "Ninguém")];
    await chamar(patchHandler, admin, { pendencias: ["Laudo", "Nova"], parcial: true });
    expect(h.inserts).toHaveLength(0);
  });

  it("duas contas do mesmo consultor: ambas recebem (menos o ator), num único INSERT", async () => {
    h.contas = [conta("cons-dani", "consultor", "Dani"), conta("cons-dani-2", "consultor", "Dani")];
    await chamar(patchHandler, admin, { pendencias: ["Laudo", "Nova"], parcial: true });
    expect(h.inserts).toHaveLength(1);
    expect(linhasAvisos().map((l) => l.destinatario_id).sort()).toEqual(["cons-dani", "cons-dani-2"]);

    h.inserts = [];
    fake.tabelas[T] = [linha()];
    await chamar(patchHandler, daniLogada, { pendencias: ["Laudo", "Nova"], parcial: true });
    expect(linhasAvisos().map((l) => l.destinatario_id)).toEqual(["cons-dani-2"]);
  });

  it("o aviso vai para o consultor do processo DEPOIS da gravação (troca de consultor no mesmo patch)", async () => {
    h.contas = [conta("cons-dani", "consultor", "Dani"), conta("cons-flavia", "consultor", "Flávia")];
    await chamar(patchHandler, admin, { consultor: "Flávia", pendencias: ["Laudo", "Nova"], parcial: true });
    expect(linhasAvisos().map((l) => l.destinatario_id)).toEqual(["cons-flavia"]);
  });
});

describe("limites e texto", () => {
  it("até 5 itens novos do mesmo tipo: um aviso por item", async () => {
    await chamar(patchHandler, admin, { pendencias: ["Laudo", "a", "b", "c", "d", "e"], parcial: true });
    expect(mensagens()).toHaveLength(5);
    expect(mensagens()[4]).toBe("Nova pendência · Fulano de Tal (2026 - 10): e");
  });

  it("mais de 5 pendências novas: UM aviso agrupado", async () => {
    await chamar(patchHandler, admin, { pendencias: ["Laudo", "a", "b", "c", "d", "e", "f"], parcial: true });
    expect(mensagens()).toEqual(["6 novas pendências · Fulano de Tal (2026 - 10)"]);
  });

  it("mais de 5 atualizações novas: UM aviso agrupado", async () => {
    const novas = Array.from({ length: 7 }, (_, i) => ({ data: "08/11", texto: `Item ${i}` }));
    await chamar(patchHandler, admin, {
      atualizacoes: [{ data: "01/09", texto: "Antiga" }, ...novas],
      versao: VERSAO,
    });
    expect(mensagens()).toEqual(["7 novas atualizações · Fulano de Tal (2026 - 10)"]);
  });

  it("o agrupamento é por tipo: 6 pendências agrupadas + 1 atualização individual", async () => {
    await chamar(patchHandler, admin, {
      pendencias: ["Laudo", "a", "b", "c", "d", "e", "f"],
      atualizacoes: [{ data: "01/09", texto: "Antiga" }, { data: "08/11", texto: "Uma" }],
      versao: VERSAO,
    });
    expect(mensagens()).toEqual([
      "6 novas pendências · Fulano de Tal (2026 - 10)",
      "Nova atualização · Fulano de Tal (2026 - 10): Uma",
    ]);
  });

  it("texto do item é cortado em 140 caracteres com reticências; até 140 fica inteiro", async () => {
    const longo = "x".repeat(200);
    const exato = "y".repeat(140);
    await chamar(patchHandler, admin, { pendencias: ["Laudo", longo, exato], parcial: true });
    expect(mensagens()).toEqual([
      `Nova pendência · Fulano de Tal (2026 - 10): ${"x".repeat(140)}…`,
      `Nova pendência · Fulano de Tal (2026 - 10): ${exato}`,
    ]);
  });
});

describe("falha do aviso NUNCA quebra nem desfaz a gravação", () => {
  it("INSERT do aviso falha (ex.: migração não aplicada): PATCH responde com sucesso e o processo fica gravado", async () => {
    h.falhaNoInsert = { message: 'invalid input value for enum tipo_notificacao: "pendencia_nova"' };
    const res = (await chamar(patchHandler, admin, { pendencias: ["Laudo", "Nova"], parcial: true })) as {
      pendencias: string[];
    };
    expect(res.pendencias).toEqual(["Laudo", "Nova"]);
    expect(gravadoNoBanco().pendencias).toEqual(["Laudo", "Nova"]);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("listagem das contas falha: PATCH versionado segue com sucesso", async () => {
    h.falhaNoListUsers = true;
    const res = await chamar(patchHandler, admin, {
      atualizacoes: [{ data: "01/09", texto: "Antiga" }, { data: "", texto: "Nova" }],
      versao: VERSAO,
    });
    expect(res).toMatchObject({ id: "proc_1" });
    expect(gravadoNoBanco().atualizacoes).toHaveLength(2);
    expect(console.error).toHaveBeenCalled();
  });

  it("POST com o INSERT do aviso falhando: o processo é criado e devolvido", async () => {
    h.falhaNoInsert = { message: "falhou" };
    const criado = (await chamar(postHandler, admin, corpoNovoProcesso({ pendencias: ["Laudo"] }))) as { id: string };
    expect(criado.id).toMatch(/^proc_/);
    expect(fake.linhas(T).some((r) => r.id === criado.id)).toBe(true);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("POST /chegada com o INSERT do aviso falhando: 200 e a chegada fica gravada", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AGORA);
    h.falhaNoInsert = { message: "falhou" };
    const res = (await chamar(chegadaHandler, bruno, { acao: "confirmar" })) as { status: string };
    expect(res.status).toBe("desembaraco");
    expect(gravadoNoBanco().status).toBe("desembaraco");
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("a leitura prévia da linha falha: o PATCH grava normalmente, sem aviso", async () => {
    fake.falhar(T, "select", "leitura caiu");
    const res = (await chamar(patchHandler, admin, { pendencias: ["Laudo", "Nova"], parcial: true })) as {
      pendencias: string[];
    };
    expect(res.pendencias).toEqual(["Laudo", "Nova"]);
    expect(h.inserts).toHaveLength(0);
  });
});
