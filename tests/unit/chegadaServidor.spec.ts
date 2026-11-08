import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import { FakeSupabase } from "./helpers/fakeSupabase";

// POST /api/processos/:id/chegada, POST /api/chegada-avisos/visto e GET /api/chegada-avisos/vistos. Os handlers e
// os stores são os REAIS; só h3 (readBody/getRouterParam) e o cliente Supabase (em memória) são simulados.
// "Agora": Date congelado (só o Date) — 08/11/2026 14:00 em Brasília.

const h = vi.hoisted(() => ({ body: {} as unknown, id: "proc_1" as string | undefined }));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => h.id) };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { default: responder } = await import("../../server/api/processos/[id]/chegada.post");
const { default: marcarVisto } = await import("../../server/api/chegada-avisos/visto.post");
const { default: listarVistos } = await import("../../server/api/chegada-avisos/vistos.get");
const { gravarChegadaProcesso } = await import("../../server/utils/processosStore");
const { avisoChegadaDevido } = await import("../../shared/utils/avisoChegada");
const { montarProcesso } = await import("../../server/utils/processoMappers");

const T = "follow_up";
const VISTOS = "chegada_avisos_vistos";
const AGORA = new Date("2026-11-08T14:00:00-03:00");
const VERSAO = "2026-11-05T10:00:00.123456+00:00";

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

const conta = (role: AuthUser["role"], nome?: string, id = "u1"): AuthUser => ({
  id,
  email: `${id}@x.com`,
  role,
  nome,
  isAdmin: role === "administrador",
});
const bruno = conta("operacional", "Bruno Alves");

async function chamar<T>(handler: (e: never) => Promise<T>, user: AuthUser | null, body?: unknown, id = "proc_1") {
  h.body = body;
  h.id = id;
  return handler({ context: { user } } as never);
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

const processoNoBanco = () => fake.linhas(T)[0]!;
const updatesNaTabela = () => fake.chamadas.filter((c) => c.tabela === T && c.op === "update").length;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  fake.tabelas[T] = [linha()];
  fake.tabelas[VISTOS] = [];
  fake.chamadas.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/processos/:id/chegada — permissões", () => {
  const corpo = { acao: "confirmar" };

  it("200 para o operacional responsável (primeiro nome, sem acento/caixa)", async () => {
    const res = await chamar(responder, conta("operacional", "BRUNO alves"), corpo);
    expect(res.status).toBe("desembaraco");
  });

  it("403 para outro operacional, administrador, sócio, consultor e sem login — nada é gravado", async () => {
    const proibidos: Array<AuthUser | null> = [
      conta("operacional", "Rebeca Alcântara"),
      conta("operacional"), // sem nome
      conta("administrador", "Bruno"), // administrador NÃO responde, nem com o nome do responsável
      conta("socio", "Bruno"),
      conta("consultor", "Bruno"),
      null,
    ];
    for (const user of proibidos) {
      expect((await erroDe(chamar(responder, user, corpo))).status).toBe(403);
    }
    expect(updatesNaTabela()).toBe(0);
    expect(processoNoBanco().status).toBe("em_transito");
  });

  it("403 quando o processo não tem responsável operacional", async () => {
    fake.tabelas[T] = [linha({ responsavel_operacional: null })];
    expect((await erroDe(chamar(responder, bruno, corpo))).status).toBe(403);
  });

  it("usa o responsável GRAVADO na linha, não o do corpo", async () => {
    const erro = await erroDe(
      chamar(responder, conta("operacional", "Rebeca"), { ...corpo, responsavelOperacional: "Rebeca" }),
    );
    expect(erro.status).toBe(403);
  });

  it("cargo errado nem lê o processo; processo inexistente = 404 para quem poderia responder", async () => {
    fake.chamadas.length = 0;
    await erroDe(chamar(responder, conta("socio", "Bruno"), corpo));
    expect(fake.chamadas).toHaveLength(0);
    expect((await erroDe(chamar(responder, bruno, corpo, "nao_existe"))).status).toBe(404);
  });
});

describe("POST /api/processos/:id/chegada — pré-condição de status", () => {
  it("409 com mensagem clara quando já não está em_transito; nada é gravado", async () => {
    for (const status of ["desembaraco", "liberado", "entregue", "aguardando_inicio"]) {
      fake.tabelas[T] = [linha({ status })];
      fake.chamadas.length = 0;
      const erro = await erroDe(chamar(responder, bruno, { acao: "confirmar" }));
      expect(erro).toEqual({ status: 409, msg: "Este processo já foi atualizado." });
      expect(updatesNaTabela()).toBe(0);
    }
  });

  it("responder duas vezes: a segunda é 409 e não duplica a atualização", async () => {
    await chamar(responder, bruno, { acao: "confirmar" });
    expect((await erroDe(chamar(responder, bruno, { acao: "confirmar" }))).status).toBe(409);
    expect((processoNoBanco().atualizacoes as unknown[]).length).toBe(2);
  });
});

describe("POST /api/processos/:id/chegada — confirmar", () => {
  it("status e atualização vão numa ÚNICA gravação, com o texto exato e sem nome de ninguém", async () => {
    const res = await chamar(responder, bruno, { acao: "confirmar" });

    expect(updatesNaTabela()).toBe(1);
    expect(res.status).toBe("desembaraco");
    expect(res.atualizacoes).toEqual([
      { data: "01/09", texto: "Antiga" },
      { data: "08/11", texto: "Chegada confirmada em 08/11." },
    ]);
    const gravado = processoNoBanco();
    expect(gravado.status).toBe("desembaraco");
    expect(gravado.status_outro).toBeNull();
    expect(gravado.atualizacoes).toEqual(res.atualizacoes);
    expect(JSON.stringify(res.atualizacoes)).not.toMatch(/Bruno|Alves/);
    expect(gravado.updated_at).not.toBe(VERSAO);
  });

  it("a data do texto é a de Brasília (22:30 do dia 8 já é dia 9 em UTC)", async () => {
    vi.setSystemTime(new Date("2026-11-09T01:30:00Z"));
    const res = await chamar(responder, bruno, { acao: "confirmar" });
    expect(res.atualizacoes.at(-1)).toEqual({ data: "08/11", texto: "Chegada confirmada em 08/11." });
  });

  it("depois de confirmar o aviso deixa de existir (derivado do estado)", async () => {
    const antes = montarProcesso(processoNoBanco() as never);
    expect(avisoChegadaDevido(antes, AGORA).devido).toBe(true);
    const res = await chamar(responder, bruno, { acao: "confirmar" });
    expect(avisoChegadaDevido(res, AGORA).devido).toBe(false);
  });
});

describe("POST /api/processos/:id/chegada — adiar", () => {
  it("válido: grava a nova data (DD/MM do ano corrente) e UMA atualização, numa gravação", async () => {
    const res = await chamar(responder, bruno, { acao: "adiar", novaData: "12/11" });

    expect(updatesNaTabela()).toBe(1);
    expect(res.status).toBe("em_transito");
    expect(res.datas.dataChegadaBrasil).toBe("12/11");
    expect(res.atualizacoes.at(-1)).toEqual({ data: "08/11", texto: "Chegada adiada de 06/11 para 12/11." });
    expect(res.atualizacoes).toHaveLength(2);
    expect(processoNoBanco().data_chegada_brasil).toBe("12/11");
    expect(JSON.stringify(res.atualizacoes)).not.toMatch(/Bruno|Alves/);
  });

  it("normaliza para o formato do calendário: outro ano vira DD/MM/AAAA; ano corrente explícito vira DD/MM", async () => {
    let res = await chamar(responder, bruno, { acao: "adiar", novaData: "5/1/2027" });
    expect(res.datas.dataChegadaBrasil).toBe("05/01/2027");
    expect(res.atualizacoes.at(-1)!.texto).toBe("Chegada adiada de 06/11 para 05/01/2027.");

    fake.tabelas[T] = [linha()];
    res = await chamar(responder, bruno, { acao: "adiar", novaData: "12/11/2026" });
    expect(res.datas.dataChegadaBrasil).toBe("12/11");
  });

  it("não mexe nos outros campos da linha", async () => {
    const antes = { ...processoNoBanco() };
    await chamar(responder, bruno, { acao: "adiar", novaData: "12/11" });
    const depois = processoNoBanco();
    for (const k of ["paciente", "pasta", "status", "responsavel_operacional", "numero_remessa", "data_embarque"]) {
      expect(depois[k]).toEqual(antes[k]);
    }
  });

  it("400 para formato inválido, data inexistente, ausente ou de tipo errado", async () => {
    for (const novaData of ["abc", "31/02", "", "12-11", "12/11/26", 12, null, undefined]) {
      expect((await erroDe(chamar(responder, bruno, { acao: "adiar", novaData }))).status).toBe(400);
    }
    expect((await erroDe(chamar(responder, bruno, { acao: "adiar" }))).status).toBe(400);
    expect(updatesNaTabela()).toBe(0);
  });

  it("400 para hoje e para datas passadas (a nova data é depois de hoje em Brasília)", async () => {
    for (const novaData of ["08/11", "08/11/2026", "07/11", "01/01/2026", "01/11"]) {
      expect((await erroDe(chamar(responder, bruno, { acao: "adiar", novaData }))).status).toBe(400);
    }
    expect(updatesNaTabela()).toBe(0);
    // amanhã vale
    const res = await chamar(responder, bruno, { acao: "adiar", novaData: "09/11" });
    expect(res.datas.dataChegadaBrasil).toBe("09/11");
  });

  it("'hoje' é o de Brasília: 22:30 do dia 8 (dia 9 em UTC) -> 08/11 é hoje (400) e 09/11 é amanhã", async () => {
    vi.setSystemTime(new Date("2026-11-09T01:30:00Z"));
    expect((await erroDe(chamar(responder, bruno, { acao: "adiar", novaData: "08/11" }))).status).toBe(400);
    const res = await chamar(responder, bruno, { acao: "adiar", novaData: "09/11" });
    expect(res.datas.dataChegadaBrasil).toBe("09/11");
  });

  it("data antiga sem data legível: 'Chegada adiada para {nova}.'", async () => {
    fake.tabelas[T] = [linha({ data_chegada_brasil: "ASD" })];
    const res = await chamar(responder, bruno, { acao: "adiar", novaData: "12/11" });
    expect(res.atualizacoes.at(-1)!.texto).toBe("Chegada adiada para 12/11.");
  });

  it("ação inválida ou corpo vazio = 400", async () => {
    expect((await erroDe(chamar(responder, bruno, { acao: "apagar" }))).status).toBe(400);
    expect((await erroDe(chamar(responder, bruno, undefined))).status).toBe(400);
  });
});

describe("gravarChegadaProcesso — sem janela de corrida", () => {
  const patch = (atual: { atualizacoes: Array<{ data: string; texto: string }> }) => ({
    status: "desembaraco" as const,
    atualizacoes: [...atual.atualizacoes, { data: "08/11", texto: "Chegada confirmada em 08/11." }],
  });

  it("se o status muda entre a leitura e a gravação, nada é gravado (UPDATE condicional) -> status_mudou", async () => {
    const r = await gravarChegadaProcesso("proc_1", (atual) => {
      processoNoBanco().status = "liberado"; // outra pessoa mexeu agora
      return patch(atual);
    });
    expect(r.tipo).toBe("status_mudou");
    expect(processoNoBanco().status).toBe("liberado");
    expect(processoNoBanco().atualizacoes).toEqual([{ data: "01/09", texto: "Antiga" }]);
  });

  it("uma atualização gravada por outra pessoa no meio NÃO é perdida: relê e tenta de novo", async () => {
    let chamadas = 0;
    const r = await gravarChegadaProcesso("proc_1", (atual) => {
      chamadas += 1;
      if (chamadas === 1) {
        // outra pessoa adiciona uma atualização e a versão muda
        processoNoBanco().atualizacoes = [...(processoNoBanco().atualizacoes as unknown[]), { data: "07/11", texto: "Da outra pessoa" }];
        processoNoBanco().updated_at = "2026-11-08T16:59:59.000000+00:00";
      }
      return patch(atual);
    });
    expect(r.tipo).toBe("ok");
    expect(chamadas).toBe(2);
    expect(processoNoBanco().atualizacoes).toEqual([
      { data: "01/09", texto: "Antiga" },
      { data: "07/11", texto: "Da outra pessoa" },
      { data: "08/11", texto: "Chegada confirmada em 08/11." },
    ]);
  });

  it("se a versão muda em todas as tentativas, desiste com 'conflito' sem gravar", async () => {
    let n = 0;
    const r = await gravarChegadaProcesso("proc_1", (atual) => {
      n += 1;
      processoNoBanco().updated_at = `2026-11-08T17:00:0${n}.000000+00:00`;
      return patch(atual);
    });
    expect(r.tipo).toBe("conflito");
    expect(processoNoBanco().status).toBe("em_transito");
  });

  it("processo que não existe: nao_encontrado", async () => {
    expect((await gravarChegadaProcesso("nada", patch)).tipo).toBe("nao_encontrado");
  });
});

describe("POST /api/chegada-avisos/visto e GET /api/chegada-avisos/vistos", () => {
  const adm1 = conta("administrador", "Cris", "adm1");
  const adm2 = conta("administrador", "Outro", "adm2");
  const corpo = { processoId: "proc_1", dataPrevista: "2026-11-06" };

  it("só o administrador: operacional (inclusive o responsável), sócio, consultor e sem login recebem 403", async () => {
    for (const user of [bruno, conta("socio"), conta("consultor"), null]) {
      expect((await erroDe(chamar(marcarVisto, user, corpo))).status).toBe(403);
      expect((await erroDe(chamar(listarVistos, user))).status).toBe(403);
    }
    expect(fake.linhas(VISTOS)).toHaveLength(0);
  });

  it("grava a dispensa e a devolve na leitura; não altera o processo", async () => {
    expect(await chamar(marcarVisto, adm1, corpo)).toEqual({ visto: true });
    expect(fake.linhas(VISTOS)).toEqual([{ usuario_id: "adm1", processo_id: "proc_1", data_prevista: "2026-11-06" }]);
    expect(await chamar(listarVistos, adm1)).toEqual([{ processoId: "proc_1", dataPrevista: "2026-11-06" }]);
    expect(updatesNaTabela()).toBe(0);
  });

  it("idempotente: marcar de novo não falha nem duplica", async () => {
    await chamar(marcarVisto, adm1, corpo);
    await chamar(marcarVisto, adm1, corpo);
    expect(fake.linhas(VISTOS)).toHaveLength(1);
  });

  it("por usuário: a dispensa de um administrador não aparece para o outro", async () => {
    await chamar(marcarVisto, adm1, corpo);
    expect(await chamar(listarVistos, adm2)).toEqual([]);
    await chamar(marcarVisto, adm2, corpo);
    expect(fake.linhas(VISTOS)).toHaveLength(2);
    expect(await chamar(listarVistos, adm1)).toHaveLength(1);
  });

  it("por data prevista: outra data do mesmo processo é outra dispensa (adiar cria um aviso novo)", async () => {
    await chamar(marcarVisto, adm1, corpo);
    await chamar(marcarVisto, adm1, { ...corpo, dataPrevista: "2026-11-12" });
    const lista = await chamar(listarVistos, adm1);
    expect(lista.map((v) => v.dataPrevista).sort()).toEqual(["2026-11-06", "2026-11-12"]);
  });

  it("adiar pelo operacional muda a data prevista: a dispensa antiga não cobre o aviso novo", async () => {
    await chamar(marcarVisto, adm1, corpo); // dispensou o aviso de 06/11
    const adiado = await chamar(responder, bruno, { acao: "adiar", novaData: "10/11" });
    // No dia 10 às 13h o aviso é devido de novo, com OUTRA data prevista (a dispensa de 06/11 não vale).
    const devido = avisoChegadaDevido(adiado, new Date("2026-11-10T13:00:00-03:00"));
    expect(devido).toMatchObject({ devido: true, dataPrevista: "2026-11-10" });
    const vistos = await chamar(listarVistos, adm1);
    expect(vistos.some((v) => v.dataPrevista === devido.dataPrevista)).toBe(false);
  });

  it("400 para corpo inválido; 404 para processo que não existe (nada é gravado)", async () => {
    for (const b of [undefined, {}, { processoId: "", dataPrevista: "2026-11-06" }, { processoId: "proc_1" }, { processoId: "proc_1", dataPrevista: "06/11" }, { processoId: "proc_1", dataPrevista: "2026-02-31" }]) {
      expect((await erroDe(chamar(marcarVisto, adm1, b))).status).toBe(400);
    }
    expect((await erroDe(chamar(marcarVisto, adm1, { ...corpo, processoId: "nada" }))).status).toBe(404);
    expect(fake.linhas(VISTOS)).toHaveLength(0);
  });
});
