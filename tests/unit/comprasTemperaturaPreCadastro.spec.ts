import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import type { RespostaMedicamentoJaCadastrado, RespostaPreCadastro, RespostaTemperatura, RespostaTemperaturaInativa } from "../../shared/types/compra";
import { validarNovaTemperaturaCompra, validarPreCadastroCompra } from "../../shared/utils/compraValidacao";
import { FakeSupabase } from "./helpers/fakeSupabase";

// POST /api/compras/temperaturas e POST /api/compras/pre-cadastro-medicamentos: h3 e Supabase simulados. Dados fictícios (TESTE).

const h = vi.hoisted(() => ({ body: {} as unknown, status: 0 }));

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return {
    ...real,
    readBody: vi.fn(async () => h.body),
    setResponseStatus: vi.fn((_e: unknown, codigo: number) => {
      h.status = codigo;
    }),
  };
});

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

import temperaturaPost from "../../server/api/compras/temperaturas.post";
import preCadastroPost from "../../server/api/compras/pre-cadastro-medicamentos.post";

const adm: AuthUser = { id: "a", email: "a@x.com", role: "administrador", nome: "Adm Teste", isAdmin: true };
const operacional: AuthUser = { id: "o", email: "o@x.com", role: "operacional", nome: "Op Teste", isAdmin: false };
const socio: AuthUser = { id: "s", email: "s@x.com", role: "socio", nome: "Sócio", isAdmin: false };
const consultor: AuthUser = { id: "c", email: "c@x.com", role: "consultor", consultorNome: "Dani", isAdmin: false };

type Handler = (e: never) => Promise<unknown>;

async function chamar<T>(handler: Handler, user: AuthUser | null, body: unknown): Promise<{ status: number; corpo: T }> {
  h.body = body;
  h.status = 0;
  const corpo = (await handler({ context: { user } } as never)) as T;
  return { status: h.status, corpo };
}

async function erroDe(promessa: Promise<unknown>): Promise<{ status: number; msg: string; data?: unknown }> {
  try {
    await promessa;
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string; data?: unknown };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "", data: err.data };
  }
  throw new Error("esperava um erro HTTP, mas a chamada passou");
}

const chaveDe = (nome: string): string =>
  nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function linha(id: string, nome: string, ativo = true, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    nome,
    nome_chave: chaveDe(nome),
    ativo,
    atualizado_por: "Alguém",
    created_at: "2026-11-18T00:00:00.000Z",
    updated_at: "2026-11-18T00:00:00.000Z",
    ...extra,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  h.body = {};
  h.status = 0;
  fake.chamadas.length = 0;
  fake.tabelas.cadastro_temperaturas = [linha("temp_1", "2°C a 8°C"), linha("temp_2", "Ambiente"), linha("temp_3", "Congelado -20°C", false)];
  fake.tabelas.cadastro_medicamentos = [linha("med_1", "MEDICAMENTO EXISTENTE TESTE", true, { temperatura: "2°C a 8°C" }), linha("med_2", "MEDICAMENTO INATIVO TESTE", false, { temperatura: "Ambiente" })];
  fake.tabelas.pre_cadastro_medicamentos = [];
  fake.tabelas.compras = [{ id: "cmp_teste_1" }];
});

// ── Validação pura ──────────────────────────────────────────────────────────────────────────────────────────

describe("validação do corpo", () => {
  it("temperatura: só { nome }; aparado e com espaços colapsados; vazio, longo, 'Outro' e campo desconhecido → erro", () => {
    expect(validarNovaTemperaturaCompra({ nome: "  2°C   a  8°C " })).toEqual({ ok: true, valor: { nome: "2°C a 8°C" } });
    for (const ruim of [null, "x", [], 5, {}, { nome: "" }, { nome: "   " }, { nome: 5 }, { nome: "a".repeat(200) }, { nome: "Outro" }, { nome: " OUTRO " }, { nome: "ok", ativo: false }, { nome: "ok", id: "x" }]) {
      expect(validarNovaTemperaturaCompra(ruim).ok, JSON.stringify(ruim)).toBe(false);
    }
  });

  it("pré-cadastro: nome em MAIÚSCULAS, temperatura obrigatória, compraId opcional; chave desconhecida → erro", () => {
    expect(validarPreCadastroCompra({ nome: "  medicamento   novo ", temperatura: " 2°C  a 8°C " })).toEqual({
      ok: true,
      valor: { nome: "MEDICAMENTO NOVO", temperatura: "2°C a 8°C", compraId: null },
    });
    expect(validarPreCadastroCompra({ nome: "x", temperatura: "t", compraId: "cmp_1" })).toMatchObject({ ok: true, valor: { compraId: "cmp_1" } });
    expect(validarPreCadastroCompra({ nome: "x", temperatura: "t", compraId: null })).toMatchObject({ ok: true, valor: { compraId: null } });
    for (const ruim of [null, [], "x", {}, { nome: "x" }, { temperatura: "t" }, { nome: "", temperatura: "t" }, { nome: "x", temperatura: "" }, { nome: "Outro", temperatura: "t" }, { nome: "x", temperatura: "t", compraId: "../x" }, { nome: "x", temperatura: "t", compraId: 5 }, { nome: "x", temperatura: "t", status: "aprovado" }, { nome: "x", temperatura: "t", cadastroId: "med_1" }]) {
      expect(validarPreCadastroCompra(ruim).ok, JSON.stringify(ruim)).toBe(false);
    }
  });
});

// ── Temperaturas ────────────────────────────────────────────────────────────────────────────────────────────

describe("POST /api/compras/temperaturas", () => {
  it("nome novo: 201 { criada: true }, nasce ativa e com atualizado_por = o usuário", async () => {
    const r = await chamar<RespostaTemperatura>(temperaturaPost as Handler, operacional, { nome: "15°C a 25°C" });
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ criada: true, item: { nome: "15°C a 25°C", ativo: true } });
    expect(r.corpo.item.id).toMatch(/^temp_/);
    const gravada = fake.tabelas.cadastro_temperaturas!.find((l) => l.nome === "15°C a 25°C")!;
    expect(gravada).toMatchObject({ ativo: true, atualizado_por: "Op Teste", nome_chave: "15°c a 25°c" });
  });

  it("já existe e está ativa (mesmo texto): 200 { criada: false, item } e NÃO duplica", async () => {
    const r = await chamar<RespostaTemperatura>(temperaturaPost as Handler, adm, { nome: "2°C a 8°C" });
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ criada: false, item: { id: "temp_1", nome: "2°C a 8°C", ativo: true } });
    expect(fake.tabelas.cadastro_temperaturas).toHaveLength(3);
  });

  it.each([
    ["2°c a 8°c", "caixa"],
    ["2°C  a 8°C", "espaços repetidos"],
    ["  2°C a 8°C  ", "espaços nas pontas"],
    ["2°C   A   8°C", "caixa e espaços"],
    ["AMBIENTE", "caixa (outra temperatura)"],
    ["ambiênte", "acento"],
  ])("variante %j (%s) é a MESMA temperatura: 200, devolve a existente e não cria", async (variante) => {
    const antes = fake.tabelas.cadastro_temperaturas!.length;
    const r = await chamar<RespostaTemperatura>(temperaturaPost as Handler, adm, { nome: variante });
    expect(r.status).toBe(200);
    expect(r.corpo.criada).toBe(false);
    expect(["temp_1", "temp_2"]).toContain(r.corpo.item.id);
    expect(fake.tabelas.cadastro_temperaturas).toHaveLength(antes);
  });

  it("existe mas está INATIVA: 409 com o item e a informação de inativo; não reativa e não cria", async () => {
    const e = await erroDe(chamar(temperaturaPost as Handler, adm, { nome: "congelado -20°c" }));
    expect(e.status).toBe(409);
    expect(e.msg).toMatch(/inativa/);
    const data = e.data as RespostaTemperaturaInativa;
    expect(data).toEqual({ criada: false, inativo: true, item: { id: "temp_3", nome: "Congelado -20°C", ativo: false } });
    expect(fake.tabelas.cadastro_temperaturas).toHaveLength(3);
    expect(fake.tabelas.cadastro_temperaturas!.find((l) => l.id === "temp_3")!.ativo).toBe(false);
  });

  it("nome inválido → 400 e nada é gravado; 'Outro' é reservado", async () => {
    for (const corpo of [{}, { nome: "" }, { nome: "Outro" }, { nome: "x", extra: 1 }, { nome: "a".repeat(300) }]) {
      expect((await erroDe(chamar(temperaturaPost as Handler, adm, corpo))).status, JSON.stringify(corpo)).toBe(400);
    }
    expect(fake.tabelas.cadastro_temperaturas).toHaveLength(3);
    expect(fake.chamadas.filter((c) => c.op !== "select")).toEqual([]);
  });

  it("corrida: outra pessoa criou o mesmo nome entre a leitura e o insert → responde como 'já existia' (200), sem duplicar", async () => {
    const from = fake.from.bind(fake);
    vi.spyOn(fake, "from").mockImplementation(((tabela: string) => {
      const consulta = from(tabela);
      if (tabela !== "cadastro_temperaturas") return consulta;
      return Object.assign(consulta, {
        insert: (row: Record<string, unknown>) => {
          fake.semear("cadastro_temperaturas", [linha("temp_rival", String(row.nome))]); // a rival entrou primeiro
          return Promise.resolve({ data: null, error: { message: "duplicate key value", code: "23505" } });
        },
      });
    }) as unknown as typeof fake.from);
    const r = await chamar<RespostaTemperatura>(temperaturaPost as Handler, adm, { nome: "10°C a 15°C" });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ criada: false, item: { id: "temp_rival", nome: "10°C a 15°C" } });
    expect(fake.tabelas.cadastro_temperaturas!.filter((l) => l.nome === "10°C a 15°C")).toHaveLength(1);
  });

  it("não mexe em nenhuma outra lista nem em pré-cadastro", async () => {
    await chamar(temperaturaPost as Handler, adm, { nome: "20°C a 30°C" });
    const escritas = fake.chamadas.filter((c) => c.op !== "select");
    expect(escritas).toEqual([{ tabela: "cadastro_temperaturas", op: "insert" }]);
  });
});

// ── Pré-cadastro de medicamento ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/compras/pre-cadastro-medicamentos", () => {
  const pedido = (extra: Record<string, unknown> = {}) => ({ nome: "medicamento novo teste", temperatura: "2°C a 8°C", ...extra });

  it("novo: 201 { criado: true }, pendente, nome em MAIÚSCULAS, solicitado_por = usuário, compra vinculada", async () => {
    const r = await chamar<RespostaPreCadastro>(preCadastroPost as Handler, operacional, pedido({ compraId: "cmp_teste_1" }));
    expect(r.status).toBe(201);
    expect(r.corpo.criado).toBe(true);
    expect(r.corpo.preCadastro).toMatchObject({
      nome: "MEDICAMENTO NOVO TESTE",
      temperatura: "2°C a 8°C",
      status: "pendente",
      compraId: "cmp_teste_1",
      cadastroId: null,
      solicitadoPor: "Op Teste",
    });
    expect(r.corpo.preCadastro.id).toMatch(/^pre_/);
    expect(fake.tabelas.pre_cadastro_medicamentos).toEqual([
      expect.objectContaining({ nome: "MEDICAMENTO NOVO TESTE", nome_chave: "medicamento novo teste", status: "pendente", compra_id: "cmp_teste_1", cadastro_id: null, solicitado_por: "Op Teste" }),
    ]);
    // Nada foi escrito no Cadastro de medicamentos (a aprovação é de outra etapa).
    expect(fake.tabelas.cadastro_medicamentos).toHaveLength(2);
  });

  it("sem compraId: cria com compra_id null", async () => {
    const r = await chamar<RespostaPreCadastro>(preCadastroPost as Handler, adm, pedido());
    expect(r.status).toBe(201);
    expect(r.corpo.preCadastro.compraId).toBeNull();
  });

  it("já existe no Cadastro (variantes de caixa, acento e espaços): 409 com o item do Cadastro; não cria nada", async () => {
    for (const nome of ["medicamento existente teste", "  MEDICAMENTO   EXISTENTE  TESTE ", "Medicaménto Existente Teste"]) {
      const e = await erroDe(chamar(preCadastroPost as Handler, adm, pedido({ nome })));
      expect(e.status, nome).toBe(409);
      expect(e.data as RespostaMedicamentoJaCadastrado, nome).toEqual({
        criado: false,
        medicamento: { id: "med_1", nome: "MEDICAMENTO EXISTENTE TESTE", temperatura: "2°C a 8°C", ativo: true },
      });
    }
    expect(fake.tabelas.pre_cadastro_medicamentos).toEqual([]);
  });

  it("existe no Cadastro mas INATIVO: também 409 (o nome é único contando os inativos), com ativo=false", async () => {
    const e = await erroDe(chamar(preCadastroPost as Handler, adm, pedido({ nome: "medicamento inativo teste" })));
    expect(e.status).toBe(409);
    expect((e.data as RespostaMedicamentoJaCadastrado).medicamento).toMatchObject({ id: "med_2", ativo: false });
  });

  it("já há um PENDENTE com o mesmo nome: 200 com o pendente (o mesmo id), sem duplicar — mesmo com outra caixa, acento ou espaços", async () => {
    const primeiro = await chamar<RespostaPreCadastro>(preCadastroPost as Handler, adm, pedido());
    for (const nome of ["MEDICAMENTO NOVO TESTE", "  Medicamento   Novo  Teste ", "medicaménto novo teste"]) {
      const r = await chamar<RespostaPreCadastro>(preCadastroPost as Handler, operacional, pedido({ nome, temperatura: "outra" }));
      expect(r.status, nome).toBe(200);
      expect(r.corpo.criado).toBe(false);
      expect(r.corpo.preCadastro.id).toBe(primeiro.corpo.preCadastro.id);
      expect(r.corpo.preCadastro.temperatura).toBe("2°C a 8°C"); // devolve o pendente como está
    }
    expect(fake.tabelas.pre_cadastro_medicamentos).toHaveLength(1);
  });

  it("um pré-cadastro REJEITADO (ou aprovado) com o mesmo nome não impede um novo pedido pendente", async () => {
    fake.tabelas.pre_cadastro_medicamentos = [{ id: "pre_velho", nome: "MEDICAMENTO NOVO TESTE", nome_chave: "medicamento novo teste", temperatura: "x", status: "rejeitado", compra_id: null, cadastro_id: null, solicitado_por: "Alguém" }];
    const r = await chamar<RespostaPreCadastro>(preCadastroPost as Handler, adm, pedido());
    expect(r.status).toBe(201);
    expect(r.corpo.preCadastro.id).not.toBe("pre_velho");
    expect(fake.tabelas.pre_cadastro_medicamentos).toHaveLength(2);
  });

  it("compraId que não existe → 404 e nada é criado", async () => {
    const e = await erroDe(chamar(preCadastroPost as Handler, adm, pedido({ compraId: "cmp_nao_existe" })));
    expect(e).toMatchObject({ status: 404, msg: "Compra não encontrada." });
    expect(fake.tabelas.pre_cadastro_medicamentos).toEqual([]);
  });

  it("corpo inválido → 400 (inclui status/cadastroId vindos do cliente: a decisão não é daqui)", async () => {
    for (const corpo of [{}, { nome: "x" }, { nome: "x", temperatura: "t", status: "aprovado" }, { nome: "x", temperatura: "t", decididoPor: "eu" }, { nome: "Outro", temperatura: "t" }]) {
      expect((await erroDe(chamar(preCadastroPost as Handler, adm, corpo))).status, JSON.stringify(corpo)).toBe(400);
    }
    expect(fake.tabelas.pre_cadastro_medicamentos).toEqual([]);
  });

  it("corrida: outra pessoa pediu o mesmo nome entre a leitura e o insert (índice único parcial) → 200 com o pendente dela", async () => {
    const from = fake.from.bind(fake);
    vi.spyOn(fake, "from").mockImplementation(((tabela: string) => {
      const consulta = from(tabela);
      if (tabela !== "pre_cadastro_medicamentos") return consulta;
      return Object.assign(consulta, {
        insert: (row: Record<string, unknown>) => {
          fake.semear("pre_cadastro_medicamentos", [{ ...row, id: "pre_rival", solicitado_por: "Rival" }]);
          return Promise.resolve({ data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } });
        },
      });
    }) as unknown as typeof fake.from);
    const r = await chamar<RespostaPreCadastro>(preCadastroPost as Handler, adm, pedido());
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ criado: false, preCadastro: { id: "pre_rival", solicitadoPor: "Rival" } });
    expect(fake.tabelas.pre_cadastro_medicamentos).toHaveLength(1);
  });

  it("só escreve em pre_cadastro_medicamentos (nunca em cadastro_*)", async () => {
    await chamar(preCadastroPost as Handler, adm, pedido());
    expect(fake.chamadas.filter((c) => c.op !== "select")).toEqual([{ tabela: "pre_cadastro_medicamentos", op: "insert" }]);
  });
});

// ── Permissão: compras EDITAR ───────────────────────────────────────────────────────────────────────────────

describe("as duas rotas exigem compras EDITAR (o sócio só lê; consultor e anônimo não entram)", () => {
  const rotas: Array<[string, Handler, Record<string, unknown>]> = [
    ["temperaturas", temperaturaPost as Handler, { nome: "5°C a 10°C" }],
    ["pre-cadastro-medicamentos", preCadastroPost as Handler, { nome: "x teste", temperatura: "2°C a 8°C" }],
  ];

  for (const [nome, handler, corpo] of rotas) {
    it(`${nome}: administrador e operacional passam; sócio → 403; consultor → 403; sem usuário → 401; nada é gravado para quem é barrado`, async () => {
      expect((await chamar(handler, adm, corpo)).status).toBeGreaterThan(0);
      expect((await chamar(handler, operacional, { ...corpo, nome: `${String(corpo.nome)} 2` })).status).toBeGreaterThan(0);
      const antes = JSON.stringify(fake.tabelas);
      expect((await erroDe(chamar(handler, socio, corpo))).status).toBe(403);
      expect((await erroDe(chamar(handler, consultor, corpo))).status).toBe(403);
      expect((await erroDe(chamar(handler, null, corpo))).status).toBe(401);
      expect(JSON.stringify(fake.tabelas)).toBe(antes);
    });
  }
});
