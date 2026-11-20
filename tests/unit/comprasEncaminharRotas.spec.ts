import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import type { Compra, PreviaEncaminhar, RespostaEncaminhar } from "../../shared/types/compra";
import { MENSAGEM_API_SEM_PERMISSAO, autorizarApi, permissoesTudoNenhum, type NivelPermissao, type Permissoes } from "../../shared/utils/permissoesPagina";
import { statusDaCompra } from "../../shared/utils/compraChecklist";
import type { Role } from "../../shared/utils/rbac";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { COMPRA_PRONTA_ID, COMPRA_PRONTA_VERSAO, semearCompraPronta } from "./helpers/compraProntaFixtures";

// As duas rotas do Encaminhar (GET /api/compras/:id/encaminhar-previa e POST /api/compras/:id/encaminhar) com h3 e o Supabase simulados.
// O POST cria linhas na DIR, então exige compras = editar E dir = editar. Dados fictícios (TESTE).

const h = vi.hoisted(() => ({ body: {} as unknown, params: {} as Record<string, string> }));

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return {
    ...real,
    readBody: vi.fn(async () => h.body),
    getRouterParam: vi.fn((_e: unknown, nome: string) => h.params[nome]),
  };
});

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

import previaGet from "../../server/api/compras/[id]/encaminhar-previa.get";
import encaminharPost from "../../server/api/compras/[id]/encaminhar.post";

type Handler = (e: never) => Promise<unknown>;
const ID = COMPRA_PRONTA_ID;
const VERSAO = COMPRA_PRONTA_VERSAO;

function usuario(role: Role, permissoes?: Permissoes): AuthUser {
  return { id: `u_${role}`, email: `${role}@x.com`, role, nome: `Pessoa ${role}`, isAdmin: role === "administrador", ...(permissoes ? { permissoes } : {}) };
}
const mapa = (compras: NivelPermissao, dir: NivelPermissao): Permissoes => ({ ...permissoesTudoNenhum(), compras, dir });

const chamar = <T = unknown>(handler: unknown, user: AuthUser | null | undefined): Promise<T> => (handler as Handler)({ context: { user } } as never) as Promise<T>;

async function erroDe(p: Promise<unknown>): Promise<{ status: number; msg: string; data: Record<string, unknown> }> {
  try {
    await p;
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string; data?: unknown };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "", data: (err.data ?? {}) as Record<string, unknown> };
  }
  throw new Error("esperava um erro HTTP, mas a chamada passou");
}

const statusDe = async (p: Promise<unknown>): Promise<number> => {
  try {
    await p;
    return 200;
  } catch (e) {
    return (e as { statusCode?: number }).statusCode ?? 500;
  }
};

const administrador = usuario("administrador");
const escritas = () => fake.chamadas.filter((c) => c.op !== "select");

beforeEach(() => {
  semearCompraPronta(fake);
  fake.chamadas.length = 0;
  h.params = { id: ID };
  h.body = { atualizadoEm: VERSAO };
});

// [nome, usuário, pode ver a prévia (compras ≥ ver), pode encaminhar (compras = editar E dir = editar)]
const QUADRO: Array<[string, AuthUser | null, boolean, boolean]> = [
  ["administrador", usuario("administrador"), true, true],
  ["operacional sem mapa", usuario("operacional"), true, true],
  ["operacional compras=editar e dir=editar", usuario("operacional", mapa("editar", "editar")), true, true],
  ["operacional compras=editar e dir=ver", usuario("operacional", mapa("editar", "ver")), true, false],
  ["operacional compras=editar e dir=nenhum", usuario("operacional", mapa("editar", "nenhum")), true, false],
  ["operacional compras=ver e dir=editar", usuario("operacional", mapa("ver", "editar")), true, false],
  ["operacional compras=ver e dir=ver", usuario("operacional", mapa("ver", "ver")), true, false],
  ["operacional compras=nenhum e dir=editar", usuario("operacional", mapa("nenhum", "editar")), false, false],
  ["operacional com mapa SEM a chave compras", usuario("operacional", { dir: "editar" }), false, false],
  ["sócio sem mapa (lê compras, não vê a DIR)", usuario("socio"), true, false],
  ["sócio compras=editar e dir=editar", usuario("socio", mapa("editar", "editar")), true, true],
  ["sócio compras=editar e dir=nenhum", usuario("socio", mapa("editar", "nenhum")), true, false],
  ["sócio compras=editar e dir=ver", usuario("socio", mapa("editar", "ver")), true, false],
  ["sócio compras=ver e dir=editar", usuario("socio", mapa("ver", "editar")), true, false],
  ["sócio compras=nenhum e dir=editar", usuario("socio", mapa("nenhum", "editar")), false, false],
  ["consultor", usuario("consultor"), false, false],
  ["consultor com mapa que diria editar nas duas", usuario("consultor", mapa("editar", "editar")), false, false],
  ["sem usuário", null, false, false],
  ["usuário indefinido", undefined as unknown as null, false, false],
];

describe("permissão: GET /encaminhar-previa pede compras = ver; POST /encaminhar pede compras = editar E dir = editar", () => {
  it.each(QUADRO)("prévia — %s", async (_nome, user, podeVer) => {
    const status = await statusDe(chamar(previaGet, user));
    if (podeVer) expect([401, 403]).not.toContain(status);
    else expect(status).toBe(user ? 403 : 401);
  });

  it.each(QUADRO)("encaminhar — %s", async (_nome, user, _ver, podeEncaminhar) => {
    const status = await statusDe(chamar(encaminharPost, user));
    if (podeEncaminhar) expect([401, 403]).not.toContain(status);
    else expect(status).toBe(user ? 403 : 401);
  });

  it("quem não pode encaminhar leva 403 com a MESMA mensagem de Compras e NÃO toca no banco nem escreve nada", async () => {
    for (const [nome, user, , podeEncaminhar] of QUADRO) {
      if (podeEncaminhar || !user) continue;
      fake.chamadas.length = 0;
      const e = await erroDe(chamar(encaminharPost, user));
      expect(e, nome).toMatchObject({ status: 403, msg: MENSAGEM_API_SEM_PERMISSAO });
      expect(fake.chamadas, nome).toEqual([]);
    }
  });

  it("o caso decisivo: quem edita Compras mas só VÊ a DIR não cria linhas na DIR (nada é gravado)", async () => {
    const e = await erroDe(chamar(encaminharPost, usuario("operacional", mapa("editar", "ver"))));
    expect(e.status).toBe(403);
    expect(fake.linhas("dir")).toEqual([]);
    expect(fake.linhas("compra_ordens").every((o) => o.dir_id === null)).toBe(true);
  });

  it("o middleware só enxerga a seção da URL (compras): é por isso que o handler confere a DIR", () => {
    const user = usuario("operacional", mapa("editar", "nenhum"));
    expect(autorizarApi(user, `/api/compras/${ID}/encaminhar`, "POST").permitido).toBe(true);
    expect(autorizarApi(user, `/api/compras/${ID}/encaminhar-previa`, "GET").permitido).toBe(true);
  });
});

describe("GET /api/compras/:id/encaminhar-previa", () => {
  it("o formato EXATO: { linhas, conflitosPo, erros, vendedorInativo, posRepetidosNaCompra }, e cada linha { ordemPosicao, ordemId, dir, temperaturaMista, jaEncaminhada }", async () => {
    const r = await chamar<PreviaEncaminhar>(previaGet, administrador);
    expect(Object.keys(r).sort()).toEqual(["conflitosPo", "erros", "linhas", "posRepetidosNaCompra", "vendedorInativo"]);
    expect(r.linhas).toHaveLength(2);
    for (const l of r.linhas) expect(Object.keys(l).sort()).toEqual(["dir", "jaEncaminhada", "ordemId", "ordemPosicao", "temperaturaMista"]);
    expect(r.linhas[0]).toMatchObject({ ordemPosicao: 1, ordemId: "ord_teste_0001", temperaturaMista: false, jaEncaminhada: false });
    expect(r.linhas[0]!.dir).toMatchObject({ id: "dir_ord_teste_0001", po: "PO26-11-0001", status: "on_going" });
    expect(r.erros).toEqual([]);
    expect(r.conflitosPo).toEqual([]);
    expect(r.vendedorInativo).toBe(false);
  });

  it("só leitura: nenhuma escrita em lugar nenhum", async () => {
    await chamar(previaGet, administrador);
    expect(escritas()).toEqual([]);
  });

  it("o sócio (compras = ver) vê a prévia e dela só sai quais POs já existem na DIR", async () => {
    fake.tabelas.dir = [{ id: "dir_alheia_1", po: "PO26-11-0001", paciente: "PACIENTE ALHEIO TESTE", vendedor: "Dani" }];
    const r = await chamar<PreviaEncaminhar>(previaGet, usuario("socio"));
    expect(r.conflitosPo).toEqual(["PO26-11-0001"]);
    expect(JSON.stringify(r)).not.toMatch(/PACIENTE ALHEIO TESTE|dir_alheia_1/);
  });

  it("404 se a compra não existe; 400 se o id é inválido; 409 se está cancelada", async () => {
    h.params = { id: "cmp_nao_existe_1" };
    expect(await erroDe(chamar(previaGet, administrador))).toMatchObject({ status: 404, msg: "Compra não encontrada." });
    h.params = { id: "../x" };
    expect((await erroDe(chamar(previaGet, administrador))).status).toBe(400);
    h.params = { id: ID };
    semearCompraPronta(fake, { cancelada: true });
    expect((await erroDe(chamar(previaGet, administrador))).status).toBe(409);
  });
});

describe("POST /api/compras/:id/encaminhar", () => {
  it("o formato EXATO: { compra, criadas, jaEncaminhada }; a compra no mesmo formato do GET", async () => {
    const r = await chamar<RespostaEncaminhar>(encaminharPost, administrador);
    expect(Object.keys(r).sort()).toEqual(["compra", "criadas", "jaEncaminhada"]);
    expect(r.jaEncaminhada).toBe(false);
    expect(r.criadas).toEqual([
      { ordemId: "ord_teste_0001", dirId: "dir_ord_teste_0001", po: "PO26-11-0001" },
      { ordemId: "ord_teste_0002", dirId: "dir_ord_teste_0002", po: "PO26-11-0002" },
    ]);
    const c: Compra = r.compra;
    expect(c.id).toBe(ID);
    expect(Object.keys(c).sort()).toEqual(
      ["anoMes", "atualizadoPor", "cancelada", "compraParticular", "contatos", "courierSimples", "createdAt", "criadoPor", "despachante", "documentos", "entrega", "id", "isencao", "isencaoPara", "localAplicacao", "localDeclarado", "medico", "observacoes", "ordens", "pagamentoAlvara", "pagamentoMomento", "paciente", "pendencias", "processoNumero", "recorrente", "responsavel", "sequencia", "termoObservacao", "termoPosterior", "updatedAt", "vendedor"].sort(),
    );
    expect(c.ordens.map((o) => o.dirId)).toEqual(["dir_ord_teste_0001", "dir_ord_teste_0002"]);
    expect(statusDaCompra(c)).toBe("encaminhada");
    expect(fake.linhas("dir")).toHaveLength(2);
  });

  it("administrador e operacional (sem mapa) encaminham; o sócio com compras e dir = editar também", async () => {
    for (const user of [usuario("administrador"), usuario("operacional"), usuario("socio", mapa("editar", "editar"))]) {
      semearCompraPronta(fake);
      fake.chamadas.length = 0;
      const r = await chamar<RespostaEncaminhar>(encaminharPost, user);
      expect(r.criadas, user.role).toHaveLength(2);
    }
  });

  it("repetir: 200 jaEncaminhada, sem criar nada", async () => {
    await chamar(encaminharPost, administrador);
    fake.chamadas.length = 0;
    const r = await chamar<RespostaEncaminhar>(encaminharPost, administrador);
    expect(r).toMatchObject({ jaEncaminhada: true, criadas: [] });
    expect(escritas()).toEqual([]);
    expect(fake.linhas("dir")).toHaveLength(2);
  });

  it("ordemIds: só a ordem pedida", async () => {
    h.body = { atualizadoEm: VERSAO, ordemIds: ["ord_teste_0002"] };
    const r = await chamar<RespostaEncaminhar>(encaminharPost, administrador);
    expect(r.criadas.map((c) => c.ordemId)).toEqual(["ord_teste_0002"]);
    expect(statusDaCompra(r.compra)).toBe("parcial");
  });

  it("corpo inválido: 400 (sem atualizadoEm, chave desconhecida, ordemIds ruim, confirmação que não é booleano) e nada é gravado", async () => {
    for (const corpo of [{}, { atualizadoEm: "ontem" }, { atualizadoEm: VERSAO, outra: 1 }, { atualizadoEm: VERSAO, ordemIds: [] }, { atualizadoEm: VERSAO, ordemIds: ["../x"] }, { atualizadoEm: VERSAO, ordemIds: "ord_teste_0001" }, { atualizadoEm: VERSAO, confirmarTemperaturaMista: "sim" }, null, "texto"]) {
      h.body = corpo;
      expect((await erroDe(chamar(encaminharPost, administrador))).status, JSON.stringify(corpo)).toBe(400);
    }
    expect(escritas()).toEqual([]);
  });

  it("id inválido: 400; compra que não existe: 404", async () => {
    h.params = { id: "a b" };
    expect((await erroDe(chamar(encaminharPost, administrador))).status).toBe(400);
    h.params = { id: "cmp_nao_existe_1" };
    expect(await erroDe(chamar(encaminharPost, administrador))).toMatchObject({ status: 404, msg: "Compra não encontrada." });
  });

  it("versão antiga: 409 com a compra atual em data.atual", async () => {
    h.body = { atualizadoEm: "2026-11-19T11:00:00.000Z" };
    const e = await erroDe(chamar(encaminharPost, administrador));
    expect(e.status).toBe(409);
    expect((e.data.atual as Compra).updatedAt).toBe(VERSAO);
    expect(escritas()).toEqual([]);
  });

  it("os erros de regra chegam com o status e o data.code: 409 PO na DIR, 422 vendedor inativo, 422 temperatura mista, 422 checklist", async () => {
    fake.tabelas.dir = [{ id: "dir_alheia_1", po: "PO26-11-0001", paciente: "X", vendedor: "Dani" }];
    let e = await erroDe(chamar(encaminharPost, administrador));
    expect(e).toMatchObject({ status: 409, data: { code: "po_ja_na_dir", pos: ["PO26-11-0001"] } });

    semearCompraPronta(fake, { vendedor: "Junior" });
    e = await erroDe(chamar(encaminharPost, administrador));
    expect(e).toMatchObject({ status: 422, msg: "Escolha um consultor ativo para o vendedor desta compra", data: { code: "vendedor_inativo" } });

    semearCompraPronta(fake);
    fake.tabelas.compra_itens!.push({ ...fake.tabelas.compra_itens![0]!, id: "itm_teste_0009", posicao: 2, temperatura: "Ambiente" });
    e = await erroDe(chamar(encaminharPost, administrador));
    expect(e).toMatchObject({ status: 422, data: { code: "temperatura_mista_nao_confirmada" } });

    semearCompraPronta(fake, { medico: "" });
    e = await erroDe(chamar(encaminharPost, administrador));
    expect(e).toMatchObject({ status: 422, data: { code: "checklist_com_erros" } });
    expect(fake.linhas("dir")).toHaveLength(0);
  });

  it("temperatura mista confirmada no corpo: encaminha", async () => {
    fake.tabelas.compra_itens!.push({ ...fake.tabelas.compra_itens![0]!, id: "itm_teste_0009", posicao: 2, temperatura: "Ambiente" });
    h.body = { atualizadoEm: VERSAO, confirmarTemperaturaMista: true };
    const r = await chamar<RespostaEncaminhar>(encaminharPost, administrador);
    expect(r.criadas).toHaveLength(2);
    expect(fake.linhas("dir")[0]!.temperatura).toBe("2°C a 8°C / Ambiente");
  });
});
