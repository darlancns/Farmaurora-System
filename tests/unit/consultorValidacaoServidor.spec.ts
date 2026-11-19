import { beforeEach, describe, expect, it, vi } from "vitest";
import { validarProcessoForm } from "../../app/utils/processoFormPayload";
import type { AuthUser } from "../../shared/types/auth";
import { CONSULTOR_ERRO } from "../../shared/utils/consultorRegra";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { CONSULTOR_INATIVO_FIXTURE, TABELA_CONSULTORES as T, linhaConsultor, semearConsultores } from "./helpers/consultoresFixtures";
import { MEDICAMENTOS, formCompleto, linhaCompleta } from "./helpers/processoEdicaoFixtures";

// O Cadastro é a ÚNICA fonte de consultores: o servidor confere o consultor de Contas (login), Follow-Up e Prestação contra a
// lista "consultores" — conta aceita ativo OU inativo (com cache curto só de acertos); gravação de processo e de prestação exige
// consultor ATIVO como valor novo e tolera o valor igual ao já gravado. Handlers e stores REAIS; só h3 e o Supabase em memória.
// Fixtures sintéticas: só nomes de consultor e pacientes "TESTE".

const h = vi.hoisted(() => ({
  body: {} as unknown,
  params: {} as Record<string, string | undefined>,
  criados: [] as Array<{ email: string; app_metadata: Record<string, unknown> }>,
}));
const fake = new FakeSupabase();
semearConsultores(fake);

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return {
    ...real,
    readBody: vi.fn(async () => h.body),
    getRouterParam: vi.fn((_event: unknown, nome: string) => h.params[nome] ?? h.params.id),
  };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => ({
    from: (tabela: string) => fake.from(tabela),
    auth: {
      admin: {
        createUser: async (dados: { email: string; app_metadata: Record<string, unknown> }) => {
          h.criados.push(dados);
          return { data: { user: { id: "novo", email: dados.email, app_metadata: dados.app_metadata, created_at: "" } }, error: null };
        },
      },
    },
  }),
}));

const { consultorExisteNoCadastro, esquecerConsultorEmCache, CONSULTOR_CACHE_TTL_MS } = await import("../../server/utils/consultoresCadastro");
const { conferirConsultorDaSessao, exigirConsultorDaContaNoCadastro } = await import("../../server/utils/contaConsultor");
const { default: postProcesso } = await import("../../server/api/processos/index.post");
const { default: patchProcesso } = await import("../../server/api/processos/[id].patch");
const { default: postPaciente } = await import("../../server/api/patients/index.post");
const { default: putPaciente } = await import("../../server/api/patients/[id].put");
const { default: postUsuario } = await import("../../server/api/admin/users.post");

const INATIVO = CONSULTOR_INATIVO_FIXTURE; // "Junior"
const admin: AuthUser = { id: "adm", email: "adm@x.com", role: "administrador", nome: "Adm", isAdmin: true };

const leituras = () => fake.chamadas.filter((c) => c.tabela === T && c.op === "select").length;

async function statusDe(p: Promise<unknown>): Promise<{ status: number; msg: string }> {
  try {
    await p;
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "" };
  }
  return { status: 200, msg: "" };
}

beforeEach(() => {
  semearConsultores(fake);
  fake.chamadas.length = 0;
  h.criados.length = 0;
  esquecerConsultorEmCache();
});

// ── Cache de acertos ───────────────────────────────────────────────────────────────────────────────────

describe("consultorExisteNoCadastro — cache curto SÓ de acertos", () => {
  it("existe (ativo OU inativo): acerta; o segundo pedido vem do cache, sem nova leitura do banco", async () => {
    expect(await consultorExisteNoCadastro("Mateus Morais", 1_000)).toBe(true);
    expect(leituras()).toBe(1);
    expect(await consultorExisteNoCadastro("Mateus Morais", 1_000 + 5_000)).toBe(true);
    expect(leituras()).toBe(1);
    expect(await consultorExisteNoCadastro(INATIVO, 1_000)).toBe(true);
    expect(leituras()).toBe(2);
  });

  it("o acerto vale 30 s; passou disso, relê o banco (e renova o prazo)", async () => {
    expect(CONSULTOR_CACHE_TTL_MS).toBe(30_000);
    await consultorExisteNoCadastro("Dani", 1_000);
    await consultorExisteNoCadastro("Dani", 1_000 + 29_999);
    expect(leituras()).toBe(1);
    await consultorExisteNoCadastro("Dani", 1_000 + 30_001);
    expect(leituras()).toBe(2);
    await consultorExisteNoCadastro("Dani", 1_000 + 30_001 + 10_000);
    expect(leituras()).toBe(2);
  });

  it("NÃO cacheia erros: nome que não está no cache relê o banco SEMPRE antes de recusar", async () => {
    expect(await consultorExisteNoCadastro("Recém Criado Teste", 1_000)).toBe(false);
    expect(await consultorExisteNoCadastro("Recém Criado Teste", 1_001)).toBe(false);
    expect(leituras()).toBe(2);
    // O consultor é criado no Cadastro: o próximo pedido já acha (não espera nenhum prazo) e passa a ser cacheado.
    fake.tabelas[T]!.push(linhaConsultor("Recém Criado Teste"));
    expect(await consultorExisteNoCadastro("Recém Criado Teste", 1_002)).toBe(true);
    expect(await consultorExisteNoCadastro("Recém Criado Teste", 1_003)).toBe(true);
    expect(leituras()).toBe(3);
  });

  it("comparação exata (caixa e acento contam) e esquecerConsultorEmCache derruba o acerto (renomear)", async () => {
    expect(await consultorExisteNoCadastro("mateus morais", 1_000)).toBe(false);
    expect(await consultorExisteNoCadastro("Mateus Morais", 1_000)).toBe(true);
    esquecerConsultorEmCache("Mateus Morais");
    await consultorExisteNoCadastro("Mateus Morais", 1_001);
    expect(leituras()).toBe(3);
    esquecerConsultorEmCache();
    await consultorExisteNoCadastro("Mateus Morais", 1_002);
    expect(leituras()).toBe(4);
  });

  it("falha ao ler o Cadastro sobe como erro (nunca vira 'existe')", async () => {
    fake.falhar(T, "select", "banco fora");
    await expect(consultorExisteNoCadastro("Qualquer Teste")).rejects.toThrow();
  });
});

// ── Conta de login: sessão ─────────────────────────────────────────────────────────────────────────────

describe("conferirConsultorDaSessao (middleware) — o nome da conta precisa existir no Cadastro", () => {
  const consultor = (consultorNome?: string): AuthUser => ({
    id: "u1",
    email: "u@x.com",
    role: "consultor",
    ...(consultorNome ? { consultorNome } : {}),
    isAdmin: false,
  });

  it("consultor ATIVO e consultor INATIVO mantêm o nome (a conta de um consultor desativado continua funcionando)", async () => {
    expect((await conferirConsultorDaSessao(consultor("Mateus Morais"))).consultorNome).toBe("Mateus Morais");
    expect((await conferirConsultorDaSessao(consultor(INATIVO))).consultorNome).toBe(INATIVO);
  });

  it("nome que NÃO existe no Cadastro ('Flavinha', 'Fulano'): fica como conta sem consultor válido (consultorNome some), o resto da conta fica", async () => {
    for (const nome of ["Flavinha", "Fulano"]) {
      const r = await conferirConsultorDaSessao(consultor(nome));
      expect(r.consultorNome, nome).toBeUndefined();
      expect("consultorNome" in r).toBe(false);
      expect(r).toMatchObject({ id: "u1", email: "u@x.com", role: "consultor" });
    }
  });

  it("outros cargos e conta sem nome passam direto SEM tocar o banco", async () => {
    const adminUser: AuthUser = { id: "a", email: "a@x.com", role: "administrador", isAdmin: true };
    expect(await conferirConsultorDaSessao(adminUser)).toBe(adminUser);
    const semNome = consultor();
    expect(await conferirConsultorDaSessao(semNome)).toBe(semNome);
    expect(leituras()).toBe(0);
  });

  it("falha ao ler o Cadastro: a conta fecha (sem consultor válido), nunca abre", async () => {
    const aviso = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fake.falhar(T, "select", "banco fora");
    expect((await conferirConsultorDaSessao(consultor("Mateus Morais"))).consultorNome).toBeUndefined();
    aviso.mockRestore();
  });

  it("requisições seguidas da mesma conta usam o cache de acertos (uma leitura só)", async () => {
    for (let i = 0; i < 5; i++) await conferirConsultorDaSessao(consultor("Paulo Braga"));
    expect(leituras()).toBe(1);
  });

  it("o middleware passa o usuário resolvido por conferirConsultorDaSessao", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const mw = readFileSync(join(process.cwd(), "server/middleware/auth.ts"), "utf-8");
    expect(mw).toContain("await conferirConsultorDaSessao(resolveAuthUser(user, parseAdminEmails(config.adminEmails)))");
  });
});

// ── Conta de login: cadastro/edição pelo administrador ─────────────────────────────────────────────────

describe("exigirConsultorDaContaNoCadastro + POST /api/admin/users", () => {
  it("cargo consultor: consultor ativo e inativo existem (ok); inexistente → 400 com a mensagem de sempre; outros cargos não conferem nada", async () => {
    await expect(exigirConsultorDaContaNoCadastro("consultor", "Mateus Morais")).resolves.toBeUndefined();
    await expect(exigirConsultorDaContaNoCadastro("consultor", INATIVO)).resolves.toBeUndefined();
    for (const nome of ["Rodrigão", "Daniel", "Flavinha", "Fulano"]) {
      const e = await statusDe(exigirConsultorDaContaNoCadastro("consultor", nome));
      expect(e.status, nome).toBe(400);
      expect(e.msg, nome).toMatch(/consultorNome/);
    }
    fake.chamadas.length = 0;
    await exigirConsultorDaContaNoCadastro("socio", "Fulano");
    await exigirConsultorDaContaNoCadastro("administrador", undefined);
    expect(leituras()).toBe(0);
  });

  it("criar conta de consultor: nome do Cadastro (ativo ou inativo) cria; nome fora do Cadastro é 400 e nenhuma conta nasce", async () => {
    const base = { email: "novo@x.com", password: "SenhaForte123!", role: "consultor", nome: "Conta Teste" };
    h.body = { ...base, consultorNome: INATIVO };
    expect((await statusDe(postUsuario({ context: { user: admin } } as never))).status).toBe(200);
    expect(h.criados[0]!.app_metadata).toMatchObject({ role: "consultor", consultorNome: INATIVO });

    h.criados.length = 0;
    h.body = { ...base, consultorNome: "Consultor Inexistente" };
    const e = await statusDe(postUsuario({ context: { user: admin } } as never));
    expect(e.status).toBe(400);
    expect(e.msg).toMatch(/consultorNome/);
    expect(h.criados).toHaveLength(0);
  });
});

// ── Follow-Up ──────────────────────────────────────────────────────────────────────────────────────────

const TP = "follow_up";
const evento = { context: { user: null } } as never;
const linhaProc = () => fake.linhas(TP).find((r) => r.id === "proc_1")!;

function corpoPost(consultor: string): Record<string, unknown> {
  const r = validarProcessoForm({ ...formCompleto(), consultor }, MEDICAMENTOS, [], "Poros - Turquia");
  if (!r.valido) throw new Error(r.erro);
  return { ...JSON.parse(JSON.stringify(r.payload)), atualizacoes: [] };
}

describe("Follow-Up — valor NOVO de consultor só de consultor ativo do Cadastro", () => {
  beforeEach(() => {
    fake.tabelas[TP] = [linhaCompleta()]; // consultor "Dani"
  });

  it("POST: consultor ativo cria (sem espaços nas pontas); inativo, 'Flavinha' e desconhecido são 400 e nada é gravado", async () => {
    h.body = corpoPost(" Mateus Morais ");
    expect((await statusDe(postProcesso(evento))).status).toBe(200);
    expect(fake.linhas(TP).some((r) => r.consultor === "Mateus Morais")).toBe(true);

    const antes = fake.linhas(TP).length;
    for (const nome of [INATIVO, "Flavinha", "Fulano"]) {
      h.body = corpoPost(nome);
      const e = await statusDe(postProcesso(evento));
      expect(e, nome).toEqual({ status: 400, msg: CONSULTOR_ERRO });
    }
    expect(fake.linhas(TP)).toHaveLength(antes);
  });

  it("PATCH: consultor ativo grava; inativo e desconhecido (valor novo) são 400 e o processo não muda", async () => {
    h.params = { id: "proc_1" };
    h.body = { consultor: "Paulo Braga" };
    expect((await statusDe(patchProcesso(evento))).status).toBe(200);
    expect(linhaProc().consultor).toBe("Paulo Braga");

    for (const nome of [INATIVO, "Flavinha"]) {
      h.body = { consultor: nome };
      expect(await statusDe(patchProcesso(evento)), nome).toEqual({ status: 400, msg: CONSULTOR_ERRO });
    }
    expect(linhaProc().consultor).toBe("Paulo Braga");
  });

  it("PATCH: o valor IGUAL ao já gravado (inativo, 'Flavinha', desconhecido) é aceito para salvar os outros campos; não é apagado", async () => {
    h.params = { id: "proc_1" };
    for (const antigo of [INATIVO, "Flavinha", "A ser definido"]) {
      fake.tabelas[TP] = [linhaCompleta({ consultor: antigo })];
      h.body = { consultor: antigo, pasta: "2026 - 77" };
      expect((await statusDe(patchProcesso(evento))).status, antigo).toBe(200);
      expect(linhaProc(), antigo).toMatchObject({ consultor: antigo, pasta: "2026 - 77" });
    }
  });

  it("PATCH: trocar um valor antigo por OUTRO inativo é 400; por um ativo grava", async () => {
    fake.tabelas[TP] = [linhaCompleta({ consultor: "Flavinha" })];
    h.params = { id: "proc_1" };
    h.body = { consultor: INATIVO };
    expect((await statusDe(patchProcesso(evento))).status).toBe(400);
    h.body = { consultor: "Bolívar" };
    expect((await statusDe(patchProcesso(evento))).status).toBe(200);
    expect(linhaProc().consultor).toBe("Bolívar");
  });

  it("PATCH sem `consultor` NÃO consulta o Cadastro; processo inexistente com consultor inválido é 404", async () => {
    h.params = { id: "proc_1" };
    h.body = { pasta: "2026 - 88" };
    expect((await statusDe(patchProcesso(evento))).status).toBe(200);
    expect(leituras()).toBe(0);
    h.params = { id: "nao-existe" };
    h.body = { consultor: INATIVO };
    expect((await statusDe(patchProcesso(evento))).status).toBe(404);
  });

  it("consultor ativo no corpo: grava sem ler o processo só para isso", async () => {
    h.params = { id: "proc_1" };
    h.body = { consultor: "Flávia" };
    await patchProcesso(evento);
    expect(fake.chamadas.filter((c) => c.tabela === TP).map((c) => c.op)).toEqual(["update"]);
  });
});

// ── Prestação ──────────────────────────────────────────────────────────────────────────────────────────

const TPa = "prestacao_pacientes";

function corpoPrestacao(consultor: string): Record<string, unknown> {
  return {
    data: "01/11/2026",
    paciente: "PACIENTE TESTE",
    descricaoCompra: "1x Medicamento Teste",
    descricaoResumo: "Teste",
    medicamentos: [{ qtd: "1", medicamento: "Medicamento Teste" }],
    empresa: "FARMAURORA",
    consultor,
    alvara: 100,
    custoImportacao: 50,
    despesaTotal: 10,
    transporteTotal: 5,
    despachanteRemessas: 1,
    transporteRemessas: 1,
    remessas: 1,
    despesasPorRemessa: ["10"],
    transportesPorRemessa: ["5"],
  };
}

describe("Prestação — consultores ativos do CADASTRO (fim da lista de 7)", () => {
  beforeEach(() => {
    fake.tabelas[TPa] = [];
  });

  it("POST aceita QUALQUER consultor ativo do Cadastro (inclusive os que não estavam nos 7: Dani, Bolívar…) e o vazio", async () => {
    for (const nome of ["Mateus Morais", "Dani", "Bolívar", "Flávia", ""]) {
      h.body = corpoPrestacao(nome);
      expect((await statusDe(postPaciente(evento))).status, nome || "(vazio)").toBe(200);
    }
    expect(fake.linhas(TPa).map((r) => r.consultor)).toEqual(["Mateus Morais", "Dani", "Bolívar", "Flávia", null]);
  });

  it("POST recusa consultor inativo, 'Flavinha' e desconhecido (400) e não grava", async () => {
    for (const nome of [INATIVO, "Flavinha", "Fulano"]) {
      h.body = corpoPrestacao(nome);
      expect(await statusDe(postPaciente(evento)), nome).toEqual({ status: 400, msg: CONSULTOR_ERRO });
    }
    expect(fake.linhas(TPa)).toHaveLength(0);
  });

  it("PUT: valor novo só de ativo; o valor IGUAL ao gravado (inativo, desconhecido) é aceito; o vazio limpa o consultor", async () => {
    h.params = { id: "pac_1" };
    for (const antigo of [INATIVO, "Flavinha"]) {
      fake.tabelas[TPa] = [{ id: "pac_1", consultor: antigo, paciente: "PACIENTE TESTE" }];
      h.body = corpoPrestacao(antigo);
      expect((await statusDe(putPaciente(evento))).status, antigo).toBe(200);
      expect(fake.linhas(TPa)[0]!.consultor, antigo).toBe(antigo);

      h.body = corpoPrestacao("Fulano");
      expect((await statusDe(putPaciente(evento))).status, `${antigo} → Fulano`).toBe(400);
      expect(fake.linhas(TPa)[0]!.consultor).toBe(antigo);
    }
    h.body = corpoPrestacao("Paulo Braga");
    expect((await statusDe(putPaciente(evento))).status).toBe(200);
    expect(fake.linhas(TPa)[0]!.consultor).toBe("Paulo Braga");
    h.body = corpoPrestacao("");
    expect((await statusDe(putPaciente(evento))).status).toBe(200);
    expect(fake.linhas(TPa)[0]!.consultor).toBeNull();
  });

  it("consultor vazio não consulta o Cadastro", async () => {
    h.body = corpoPrestacao("");
    await postPaciente(evento);
    expect(leituras()).toBe(0);
  });
});
