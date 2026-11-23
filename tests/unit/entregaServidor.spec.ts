import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import { semearConsultores } from "./helpers/consultoresFixtures";
import { FakeSupabase } from "./helpers/fakeSupabase";

// Regra do status Entregue no servidor: Data de entrega obrigatória e nunca futura, padrões dos controles (pagamento da
// transportadora e DIR) gravados no MESMO UPDATE, valores/combinações inválidos = 400 (nunca 500 da CHECK). Handlers e
// processosStore REAIS; só h3, o Supabase (em memória) e o aviso ao consultor são simulados. "Hoje" = 12/11/2026 (Brasília).

const h = vi.hoisted(() => ({ body: {} as unknown, id: "proc_1" as string | undefined }));
const fake = new FakeSupabase();
// O servidor confere o consultor contra os ativos do Cadastro (cadastro_consultores).
semearConsultores(fake);

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
const { patchProcessoComLeitura } = await import("../../server/utils/processosStore");
const { MENSAGEM_VERSAO_AUSENTE } = await import("../../server/utils/processoValidation");

const T = "follow_up";
const VERSAO = "2026-11-05T10:00:00.123456+00:00";
const AGORA = new Date("2026-11-12T10:00:00-03:00"); // 12/11/2026 em Brasília
const FORMAL = "Courier Formal";
const SIMPLES = "Courier Simples";

function linha(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "proc_1",
    paciente: "Fulano",
    numero_remessa: 1,
    pasta: "2026 - 1",
    empresa: "FARMAURORA",
    consultor: "Dani",
    responsavel_operacional: "Bruno",
    status: "liberado",
    medicamentos: [],
    pendencias: [],
    atualizacoes: [],
    created_at: "2026-11-01T00:00:00.000000+00:00",
    updated_at: VERSAO,
    ...extra,
  };
}

const admin: AuthUser = { id: "u1", email: "u1@x.com", role: "administrador", nome: "Admin", isAdmin: true };

async function chamar(handler: (e: never) => Promise<unknown>, body: unknown, id = "proc_1") {
  h.body = JSON.parse(JSON.stringify(body ?? null));
  h.id = id;
  return handler({ context: { user: admin } } as never) as Promise<Record<string, any>>;
}
const moverPara = (body: unknown) => chamar(mover as never, body);
const patch = (body: unknown) => chamar(patchHandler as never, body);
const criar = (body: unknown) => chamar(postHandler as never, body);

async function erroDe(promessa: Promise<unknown>): Promise<{ status: number; msg: string }> {
  try {
    await promessa;
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "" };
  }
  throw new Error("esperava um erro HTTP, mas a chamada passou");
}

const noBanco = (id = "proc_1") => fake.linhas(T).find((r) => r.id === id)!;
const updates = () => fake.chamadas.filter((c) => c.tabela === T && c.op === "update").length;
const inserts = () => fake.chamadas.filter((c) => c.tabela === T && c.op === "insert").length;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  fake.tabelas[T] = [linha()];
  fake.chamadas.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("/mover para Entregue", () => {
  it("sem dataEntrega (aba antiga): 400 com a mensagem padrão e NADA gravado", async () => {
    const erro = await erroDe(moverPara({ status: "entregue", versao: VERSAO }));
    expect(erro).toEqual({ status: 400, msg: MENSAGEM_VERSAO_AUSENTE });
    expect(MENSAGEM_VERSAO_AUSENTE).toContain("Ctrl+Shift+R");
    expect(updates()).toBe(0);
    expect(noBanco().status).toBe("liberado");
  });

  it("dataEntrega vazia, só espaços ou null: o mesmo 400", async () => {
    for (const dataEntrega of ["", "   ", null]) {
      const erro = await erroDe(moverPara({ status: "entregue", versao: VERSAO, dataEntrega }));
      expect(erro, String(dataEntrega)).toEqual({ status: 400, msg: MENSAGEM_VERSAO_AUSENTE });
    }
    expect(updates()).toBe(0);
  });

  it("dataEntrega inválida (31/04, formato DD/MM/AAAA, número): 400", async () => {
    for (const dataEntrega of ["2026-04-31", "10/11/2026", "ontem", 20261110]) {
      const erro = await erroDe(moverPara({ status: "entregue", versao: VERSAO, dataEntrega }));
      expect(erro.status, String(dataEntrega)).toBe(400);
      expect(erro.msg).toContain("Data de entrega");
    }
    expect(updates()).toBe(0);
  });

  it("dataEntrega FUTURA (depois de hoje em Brasília): 400; hoje e ontem passam", async () => {
    const erro = await erroDe(moverPara({ status: "entregue", versao: VERSAO, dataEntrega: "2026-11-13" }));
    expect(erro).toEqual({ status: 400, msg: "Data de entrega: não pode ser uma data futura." });
    expect(updates()).toBe(0);

    await moverPara({ status: "entregue", versao: VERSAO, dataEntrega: "2026-11-12" });
    expect(noBanco().data_entrega).toBe("2026-11-12");
  });

  it("não valida contra a data da compra (entrega anterior à compra passa)", async () => {
    fake.tabelas[T] = [linha({ data_compra_po: "01/10/2026" })];
    const res = await moverPara({ status: "entregue", versao: VERSAO, dataEntrega: "2026-09-01" });
    expect(res.datas.dataEntrega).toBe("2026-09-01");
  });

  it("grava status, data_entrega e a atualização num ÚNICO UPDATE; a linha da timeline usa a DATA DE ENTREGA", async () => {
    const res = await moverPara({ status: "entregue", versao: VERSAO, dataEntrega: "2026-11-10" });

    expect(res.status).toBe("entregue");
    expect(res.datas.dataEntrega).toBe("2026-11-10");
    expect(res.atualizacoes).toEqual([{ data: "10/11", texto: "Status alterado de Liberado para Entregue em 10/11." }]);
    expect(noBanco().data_entrega).toBe("2026-11-10");
    expect(updates()).toBe(1);
  });

  it("outros status continuam usando a data de HOJE e ignoram dataEntrega", async () => {
    const res = await moverPara({ status: "desembaraco", versao: VERSAO, dataEntrega: "2026-01-01" });
    expect(res.atualizacoes.at(-1)).toEqual({ data: "12/11", texto: "Status alterado de Liberado para Desembaraço em 12/11." });
    expect(noBanco().data_entrega).toBeUndefined();
    expect(res.datas.dataEntrega).toBeUndefined();
  });

  it("Courier Formal + AJC: pagamento 'pendente' e 'pegar_dir' no MESMO UPDATE (atômico)", async () => {
    fake.tabelas[T] = [linha({ modal_envio: FORMAL, transportadora_nacional_nome: "AJC" })];
    const res = await moverPara({ status: "entregue", versao: VERSAO, dataEntrega: "2026-11-10" });

    expect(updates()).toBe(1);
    expect(noBanco()).toMatchObject({
      status: "entregue",
      data_entrega: "2026-11-10",
      pagamento_transportadora: "pendente",
      dir_protocolo: "pegar_dir",
    });
    expect(res.pagamentoTransportadora).toBe("pendente");
    expect(res.dirProtocolo).toBe("pegar_dir");
  });

  it("Courier Simples: 'pegar_dir_protocolo'; a transportadora oculta (mesmo AJC) não ganha pagamento", async () => {
    fake.tabelas[T] = [linha({ modal_envio: SIMPLES, transportadora_nacional_nome: "AJC" })];
    await moverPara({ status: "entregue", versao: VERSAO, dataEntrega: "2026-11-10" });
    expect(noBanco().dir_protocolo).toBe("pegar_dir_protocolo");
    expect(noBanco().pagamento_transportadora).toBeUndefined();
  });

  it("Air Cargo + Doctor (nome com caixa/espaço diferentes): só o pagamento", async () => {
    fake.tabelas[T] = [linha({ modal_envio: "Air Cargo", transportadora_nacional_nome: " doctor " })];
    await moverPara({ status: "entregue", versao: VERSAO, dataEntrega: "2026-11-10" });
    expect(noBanco().pagamento_transportadora).toBe("pendente");
    expect(noBanco().dir_protocolo).toBeUndefined();
  });

  it("sem envio e sem transportadora (ou outra transportadora): nenhum padrão", async () => {
    await moverPara({ status: "entregue", versao: VERSAO, dataEntrega: "2026-11-10" });
    expect(noBanco().pagamento_transportadora).toBeUndefined();
    expect(noBanco().dir_protocolo).toBeUndefined();

    fake.tabelas[T] = [linha({ modal_envio: "Air Cargo", transportadora_nacional_nome: "Braspress" })];
    await moverPara({ status: "entregue", versao: VERSAO, dataEntrega: "2026-11-10" });
    expect(noBanco().pagamento_transportadora).toBeUndefined();
  });

  it("só em campo vazio: valores já gravados são mantidos", async () => {
    fake.tabelas[T] = [
      linha({
        modal_envio: FORMAL,
        transportadora_nacional_nome: "AJC",
        pagamento_transportadora: "pago",
        dir_protocolo: "dir_no_drive",
      }),
    ];
    await moverPara({ status: "entregue", versao: VERSAO, dataEntrega: "2026-11-10" });
    expect(noBanco().pagamento_transportadora).toBe("pago");
    expect(noBanco().dir_protocolo).toBe("dir_no_drive");
  });

  it("sair de Entregue mantém data e controles; voltar troca a data pela confirmada e mantém os controles", async () => {
    fake.tabelas[T] = [
      linha({
        status: "entregue",
        modal_envio: FORMAL,
        transportadora_nacional_nome: "AJC",
        data_entrega: "2026-11-03",
        pagamento_transportadora: "pago",
        dir_protocolo: "dir_no_drive",
      }),
    ];
    const saiu = await moverPara({ status: "liberado", versao: VERSAO });
    expect(noBanco()).toMatchObject({
      status: "liberado",
      data_entrega: "2026-11-03",
      pagamento_transportadora: "pago",
      dir_protocolo: "dir_no_drive",
    });

    await moverPara({ status: "entregue", versao: saiu.updatedAt, dataEntrega: "2026-11-11" });
    expect(noBanco()).toMatchObject({
      status: "entregue",
      data_entrega: "2026-11-11",
      pagamento_transportadora: "pago",
      dir_protocolo: "dir_no_drive",
    });
  });

  it("versão antiga continua dando 409 e nada é gravado", async () => {
    const erro = await erroDe(moverPara({ status: "entregue", versao: "2026-01-01T00:00:00.000000+00:00", dataEntrega: "2026-11-10" }));
    expect(erro.status).toBe(409);
    expect(updates()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("PATCH com status -> Entregue", () => {
  it("sem data no corpo e nada gravado: 400 com a mensagem padrão; nada gravado", async () => {
    const erro = await erroDe(patch({ status: "entregue", parcial: true }));
    expect(erro).toEqual({ status: 400, msg: MENSAGEM_VERSAO_AUSENTE });
    expect(updates()).toBe(0);
    expect(noBanco().status).toBe("liberado");
  });

  it("com datas.dataEntrega no corpo: grava a data e os padrões no mesmo UPDATE", async () => {
    fake.tabelas[T] = [linha({ modal_envio: FORMAL, transportadora_nacional_nome: "AJC" })];
    const res = await patch({ status: "entregue", datas: { dataEntrega: "2026-11-10" }, parcial: true });

    expect(updates()).toBe(1);
    expect(res.status).toBe("entregue");
    expect(noBanco()).toMatchObject({
      status: "entregue",
      data_entrega: "2026-11-10",
      pagamento_transportadora: "pendente",
      dir_protocolo: "pegar_dir",
    });
  });

  it("data já gravada (voltando a Entregue): não exige no corpo", async () => {
    fake.tabelas[T] = [linha({ data_entrega: "2026-11-03", modal_envio: SIMPLES })];
    await patch({ status: "entregue", parcial: true });
    expect(noBanco().status).toBe("entregue");
    expect(noBanco().data_entrega).toBe("2026-11-03");
    expect(noBanco().dir_protocolo).toBe("pegar_dir_protocolo");
  });

  it("limpar a data (null) no mesmo patch que entrega: 400", async () => {
    fake.tabelas[T] = [linha({ data_entrega: "2026-11-03" })];
    const erro = await erroDe(patch({ status: "entregue", datas: { dataEntrega: null }, parcial: true }));
    expect(erro).toEqual({ status: 400, msg: MENSAGEM_VERSAO_AUSENTE });
    expect(noBanco().status).toBe("liberado");
  });

  it("data futura ou inválida: 400", async () => {
    const futura = await erroDe(patch({ status: "entregue", datas: { dataEntrega: "2026-11-13" }, parcial: true }));
    expect(futura).toEqual({ status: 400, msg: "Data de entrega: não pode ser uma data futura." });
    const invalida = await erroDe(patch({ status: "entregue", datas: { dataEntrega: "10/11/2026" }, parcial: true }));
    expect(invalida.status).toBe(400);
    expect(invalida.msg).toContain("Data de entrega");
    expect(updates()).toBe(0);
  });

  it("padrão só em campo vazio, considerando o corpo: o 'pago' enviado e o DIR gravado são mantidos", async () => {
    fake.tabelas[T] = [linha({ modal_envio: FORMAL, transportadora_nacional_nome: "AJC", dir_protocolo: "dir_no_drive" })];
    await patch({ status: "entregue", datas: { dataEntrega: "2026-11-10" }, pagamentoTransportadora: "pago", parcial: true });
    expect(noBanco().pagamento_transportadora).toBe("pago");
    expect(noBanco().dir_protocolo).toBe("dir_no_drive");
  });

  it("padrão usa o envio e a transportadora do CORPO (o formulário muda tudo de uma vez)", async () => {
    await patch({
      status: "entregue",
      datas: { dataEntrega: "2026-11-10" },
      modalEnvio: FORMAL,
      transportadoraNacional: { nome: "Doctor" },
      parcial: true,
    });
    expect(noBanco()).toMatchObject({ pagamento_transportadora: "pendente", dir_protocolo: "pegar_dir", modal_envio: FORMAL });
  });

  it("já Entregue (inclusive antigo, sem data): editar e reenviar status 'entregue' segue sem exigir data nem padrões", async () => {
    fake.tabelas[T] = [linha({ status: "entregue", modal_envio: FORMAL, transportadora_nacional_nome: "AJC" })];
    await patch({ status: "entregue", numeroAwb: "AA1", parcial: true });
    expect(noBanco().numero_awb).toBe("AA1");
    expect(noBanco().data_entrega).toBeUndefined();
    expect(noBanco().pagamento_transportadora).toBeUndefined();
  });

  it("com versao igual: grava; com versao antiga: 409 e nada gravado", async () => {
    const ok = await patch({ status: "entregue", datas: { dataEntrega: "2026-11-10" }, parcial: true, versao: VERSAO });
    expect(ok.status).toBe("entregue");

    fake.tabelas[T] = [linha()];
    const erro = await erroDe(
      patch({ status: "entregue", datas: { dataEntrega: "2026-11-10" }, parcial: true, versao: "2026-01-01T00:00:00.000000+00:00" }),
    );
    expect(erro.status).toBe(409);
    expect(noBanco().status).toBe("liberado");
  });

  it("outros status e patches sem status não passam por esta regra", async () => {
    await patch({ status: "desembaraco", parcial: true });
    expect(noBanco().status).toBe("desembaraco");
    await patch({ numeroAwb: "BB2", parcial: true });
    expect(noBanco().numero_awb).toBe("BB2");
  });
});

describe("patchProcessoComLeitura (gravar condicionado ao updated_at lido)", () => {
  it("se a versão muda entre a leitura e a gravação, relê e grava na nova (a regra roda de novo)", async () => {
    let chamadas = 0;
    const res = await patchProcessoComLeitura(
      "proc_1",
      (lido) => {
        chamadas++;
        if (chamadas === 1) noBanco().updated_at = "2026-11-06T00:00:00.000000+00:00"; // outra pessoa gravou no meio
        return { numeroAwb: `lido-${lido.updatedAt}` };
      },
      { parcial: true },
    );
    expect(chamadas).toBe(2);
    expect(res.tipo).toBe("ok");
    expect(noBanco().numero_awb).toBe("lido-2026-11-06T00:00:00.000000+00:00");
  });

  it("3 tentativas seguidas perdidas: 'conflito' e nada gravado", async () => {
    let chamadas = 0;
    const res = await patchProcessoComLeitura("proc_1", () => {
      chamadas++;
      noBanco().updated_at = `2026-11-0${5 + chamadas}T00:00:00.000000+00:00`;
      return { numeroAwb: "nunca" };
    });
    expect(chamadas).toBe(3);
    expect(res).toEqual({ tipo: "conflito" });
    expect(noBanco().numero_awb).toBeUndefined();
  });

  it("processo inexistente: nao_encontrado", async () => {
    expect(await patchProcessoComLeitura("nao_existe", () => ({}))).toEqual({ tipo: "nao_encontrado" });
  });

  it("a regra pode abortar com 400 (nada gravado)", async () => {
    const erro = await erroDe(
      patchProcessoComLeitura("proc_1", () => {
        throw Object.assign(new Error("x"), { statusCode: 400, statusMessage: "regra" });
      }),
    );
    expect(erro).toEqual({ status: 400, msg: "regra" });
    expect(updates()).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("PATCH: valores e combinações dos controles (400, nunca 500 da CHECK)", () => {
  it("valores fora da lista", async () => {
    const pag = await erroDe(patch({ pagamentoTransportadora: "talvez", parcial: true }));
    expect(pag).toEqual({ status: 400, msg: "Pagamento da transportadora inválido. Opções: Pendente ou Pago." });
    for (const dirProtocolo of ["x", "Pegar DIR", 3]) {
      const dir = await erroDe(patch({ dirProtocolo, parcial: true }));
      expect(dir.status, String(dirProtocolo)).toBe(400);
      expect(dir.msg).toContain("DIR e Protocolo inválido");
    }
    expect(updates()).toBe(0);
  });

  it("DIR × envio: Formal rejeita pegar_dir_protocolo e dir_protocolo; Simples rejeita pegar_dir", async () => {
    fake.tabelas[T] = [linha({ modal_envio: FORMAL })];
    for (const dirProtocolo of ["pegar_dir_protocolo", "dir_protocolo"]) {
      const erro = await erroDe(patch({ dirProtocolo, parcial: true }));
      expect(erro.status, dirProtocolo).toBe(400);
      expect(erro.msg).toBe("DIR e Protocolo inválido para o envio Courier Formal. Opções: Pegar DIR, DIR no Drive.");
    }
    await patch({ dirProtocolo: "pegar_dir", parcial: true });
    expect(noBanco().dir_protocolo).toBe("pegar_dir");

    fake.tabelas[T] = [linha({ modal_envio: SIMPLES })];
    const erro = await erroDe(patch({ dirProtocolo: "pegar_dir", parcial: true }));
    expect(erro.status).toBe(400);
    expect(erro.msg).toContain("Courier Simples");
    for (const dirProtocolo of ["pegar_dir_protocolo", "dir_no_drive", "dir_protocolo"]) {
      await patch({ dirProtocolo, parcial: true });
      expect(noBanco().dir_protocolo).toBe(dirProtocolo);
    }
  });

  it("DIR usa o envio EFETIVO: o do corpo na mesma gravação vale", async () => {
    fake.tabelas[T] = [linha({ modal_envio: "Air Cargo" })];
    await patch({ modalEnvio: FORMAL, dirProtocolo: "pegar_dir", parcial: true });
    expect(noBanco()).toMatchObject({ modal_envio: FORMAL, dir_protocolo: "pegar_dir" });
  });

  it("DIR sem Courier (Air Cargo, sem envio): 400", async () => {
    fake.tabelas[T] = [linha({ modal_envio: "Air Cargo" })];
    expect(await erroDe(patch({ dirProtocolo: "dir_no_drive", parcial: true }))).toEqual({
      status: 400,
      msg: "DIR e Protocolo só vale com o envio Courier Simples ou Courier Formal.",
    });
    fake.tabelas[T] = [linha()];
    expect((await erroDe(patch({ dirProtocolo: "dir_no_drive", parcial: true }))).status).toBe(400);
  });

  it("trocar Courier Simples -> Formal com DIR inválido para o Formal salvo: 400; com o DIR mapeado junto, passa", async () => {
    fake.tabelas[T] = [linha({ modal_envio: SIMPLES, dir_protocolo: "dir_protocolo" })];
    const erro = await erroDe(patch({ modalEnvio: FORMAL, parcial: true }));
    expect(erro.status).toBe(400);
    expect(erro.msg).toContain("Courier Formal");
    expect(noBanco().modal_envio).toBe(SIMPLES);

    await patch({ modalEnvio: FORMAL, dirProtocolo: "dir_no_drive", parcial: true });
    expect(noBanco()).toMatchObject({ modal_envio: FORMAL, dir_protocolo: "dir_no_drive" });
  });

  it("trocar para um envio sem DIR mantém o valor gravado (oculto, nada se apaga) e dir_no_drive vale nos dois Courier", async () => {
    fake.tabelas[T] = [linha({ modal_envio: SIMPLES, dir_protocolo: "dir_protocolo" })];
    await patch({ modalEnvio: "Air Cargo", parcial: true });
    expect(noBanco()).toMatchObject({ modal_envio: "Air Cargo", dir_protocolo: "dir_protocolo" });

    fake.tabelas[T] = [linha({ modal_envio: SIMPLES, dir_protocolo: "dir_no_drive" })];
    await patch({ modalEnvio: FORMAL, parcial: true });
    expect(noBanco().modal_envio).toBe(FORMAL);
  });

  it("pagamento só se a transportadora se aplica (AJC/Doctor e envio que a mostra)", async () => {
    // sem transportadora
    expect((await erroDe(patch({ pagamentoTransportadora: "pago", parcial: true }))).msg).toBe(
      "Pagamento da transportadora só vale com a transportadora AJC ou Doctor (e um envio que use transportadora).",
    );
    // outra transportadora
    fake.tabelas[T] = [linha({ modal_envio: "Air Cargo", transportadora_nacional_nome: "Braspress" })];
    expect((await erroDe(patch({ pagamentoTransportadora: "pago", parcial: true }))).status).toBe(400);
    // Courier Simples esconde a transportadora, mesmo AJC gravada
    fake.tabelas[T] = [linha({ modal_envio: SIMPLES, transportadora_nacional_nome: "AJC" })];
    expect((await erroDe(patch({ pagamentoTransportadora: "pago", parcial: true }))).status).toBe(400);
    // AJC visível
    fake.tabelas[T] = [linha({ modal_envio: "Air Cargo", transportadora_nacional_nome: "AJC" })];
    await patch({ pagamentoTransportadora: "pago", parcial: true });
    expect(noBanco().pagamento_transportadora).toBe("pago");
  });

  it("pagamento com o nome da transportadora vindo no MESMO patch (efetivo)", async () => {
    await patch({ transportadoraNacional: { nome: "Doctor" }, pagamentoTransportadora: "pendente", parcial: true });
    expect(noBanco()).toMatchObject({ transportadora_nacional_nome: "Doctor", pagamento_transportadora: "pendente" });
  });

  it("trocar AJC <-> Doctor mantém o valor (nada a fazer no servidor); trocar para outra transportadora não apaga o dado", async () => {
    fake.tabelas[T] = [linha({ transportadora_nacional_nome: "AJC", pagamento_transportadora: "pago" })];
    await patch({ transportadoraNacional: { nome: "Doctor" }, parcial: true });
    expect(noBanco()).toMatchObject({ transportadora_nacional_nome: "Doctor", pagamento_transportadora: "pago" });
    await patch({ transportadoraNacional: { nome: "Braspress" }, parcial: true });
    expect(noBanco()).toMatchObject({ transportadora_nacional_nome: "Braspress", pagamento_transportadora: "pago" });
  });

  it("os dois controles podem ser limpos (null grava NULL) e valores nulos nunca dão erro", async () => {
    fake.tabelas[T] = [
      linha({ modal_envio: FORMAL, transportadora_nacional_nome: "AJC", pagamento_transportadora: "pago", dir_protocolo: "pegar_dir" }),
    ];
    await patch({ pagamentoTransportadora: null, dirProtocolo: null, parcial: true });
    expect(noBanco().pagamento_transportadora).toBeNull();
    expect(noBanco().dir_protocolo).toBeNull();
  });

  it("data_entrega pode ser editada e limpa por um patch comum (grava ISO; vazio = NULL)", async () => {
    fake.tabelas[T] = [linha({ status: "entregue", data_entrega: "2026-11-03" })];
    await patch({ datas: { dataEntrega: "2026-11-05" }, parcial: true });
    expect(noBanco().data_entrega).toBe("2026-11-05");
    await patch({ datas: { dataEntrega: null }, parcial: true });
    expect(noBanco().data_entrega).toBeNull();
    await patch({ datas: { dataEntrega: "  " }, parcial: true });
    expect(noBanco().data_entrega).toBeNull();
  });

  it("um patch que não mexe no envio nem nos controles NÃO valida (dado antigo não trava outros campos)", async () => {
    fake.tabelas[T] = [linha({ modal_envio: FORMAL, dir_protocolo: "dir_protocolo" })]; // inconsistente (não deveria existir)
    await patch({ numeroAwb: "CC3", parcial: true });
    expect(noBanco().numero_awb).toBe("CC3");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("POST (criar)", () => {
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

  beforeEach(() => {
    fake.tabelas[T] = [];
  });

  it("já Entregue sem data: 400 com a mensagem padrão e nada inserido", async () => {
    const erro = await erroDe(criar(corpo({ status: "entregue" })));
    expect(erro).toEqual({ status: 400, msg: MENSAGEM_VERSAO_AUSENTE });
    expect(inserts()).toBe(0);
  });

  it("já Entregue com data futura ou inválida: 400", async () => {
    expect((await erroDe(criar(corpo({ status: "entregue", datas: { dataEntrega: "2026-11-13" } })))).msg).toBe(
      "Data de entrega: não pode ser uma data futura.",
    );
    expect((await erroDe(criar(corpo({ status: "entregue", datas: { dataEntrega: "10/11/2026" } })))).status).toBe(400);
    expect(inserts()).toBe(0);
  });

  it("já Entregue com data: grava a data e os padrões ANTES do INSERT (um só INSERT)", async () => {
    const res = await criar(
      corpo({ status: "entregue", datas: { dataEntrega: "2026-11-10" }, modalEnvio: FORMAL, transportadoraNacional: { nome: "AJC" } }),
    );
    expect(inserts()).toBe(1);
    expect(noBanco(res.id)).toMatchObject({
      status: "entregue",
      data_entrega: "2026-11-10",
      pagamento_transportadora: "pendente",
      dir_protocolo: "pegar_dir",
    });
    expect(res.pagamentoTransportadora).toBe("pendente");
    expect(res.dirProtocolo).toBe("pegar_dir");
    expect(res.datas.dataEntrega).toBe("2026-11-10");
  });

  it("o valor enviado no corpo vence o padrão; valores nulos saem da resposta", async () => {
    const res = await criar(
      corpo({
        status: "entregue",
        datas: { dataEntrega: "2026-11-10" },
        modalEnvio: SIMPLES,
        dirProtocolo: "dir_no_drive",
        pagamentoTransportadora: null,
      }),
    );
    expect(noBanco(res.id).dir_protocolo).toBe("dir_no_drive");
    expect(res).not.toHaveProperty("pagamentoTransportadora");
  });

  it("fora de Entregue não há padrão; valor inválido ou combinação inválida: 400", async () => {
    const res = await criar(corpo({ modalEnvio: FORMAL, transportadoraNacional: { nome: "AJC" } }));
    expect(noBanco(res.id).pagamento_transportadora).toBeUndefined();
    expect(noBanco(res.id).dir_protocolo).toBeUndefined();

    expect((await erroDe(criar(corpo({ pagamentoTransportadora: "x" })))).status).toBe(400);
    expect((await erroDe(criar(corpo({ dirProtocolo: "pegar_dir_protocolo", modalEnvio: FORMAL })))).status).toBe(400);
    expect((await erroDe(criar(corpo({ dirProtocolo: "pegar_dir" })))).status).toBe(400); // sem Courier
    expect((await erroDe(criar(corpo({ pagamentoTransportadora: "pago" })))).status).toBe(400); // sem transportadora
    expect(inserts()).toBe(1);
  });
});
