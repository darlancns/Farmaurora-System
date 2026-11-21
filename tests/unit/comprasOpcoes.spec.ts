import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../shared/types/auth";
import type { OpcoesCompra, PaginaMedicamentos } from "../../shared/types/compra";
import { COMPRA_BUSCA_MAX } from "../../shared/constants/compra";
import { normalizarBuscaCompra, validarConsultaMedicamentos } from "../../shared/utils/compraValidacao";
import { FakeSupabase, TETO_LINHAS_POR_CONSULTA } from "./helpers/fakeSupabase";
import { semearConsultores } from "./helpers/consultoresFixtures";

// GET /api/compras/opcoes: as listas ativas do formulário, sem chave PIX em nível nenhum, e os medicamentos paginados com busca.
// Dados fictícios (TESTE).

const h = vi.hoisted(() => ({ query: {} as Record<string, unknown> }));

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, getQuery: vi.fn(() => h.query) };
});

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

import opcoesGet from "../../server/api/compras/opcoes.get";
import medicamentosGet from "../../server/api/compras/opcoes/medicamentos.get";

const PIX = "CHAVE-PIX-SECRETA-TESTE";

const adm: AuthUser = { id: "a", email: "a@x.com", role: "administrador", nome: "Adm", isAdmin: true };
const socio: AuthUser = { id: "s", email: "s@x.com", role: "socio", nome: "Sócio", isAdmin: false };
const consultor: AuthUser = { id: "c", email: "c@x.com", role: "consultor", consultorNome: "Dani", isAdmin: false };

function chaveDe(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function linha(id: string, nome: string, extra: Record<string, unknown> = {}, ativo = true): Record<string, unknown> {
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

function medicamentos(n: number): Array<Record<string, unknown>> {
  // Nomes com prefixo numérico de 4 dígitos: a ordem alfabética é a ordem numérica.
  return Array.from({ length: n }, (_, i) => linha(`med_${String(i).padStart(4, "0")}`, `TESTE MED ${String(i).padStart(4, "0")}`, { temperatura: i % 2 === 0 ? "2°C a 8°C" : null }));
}

async function chamar(user: AuthUser | null, query: Record<string, unknown> = {}): Promise<OpcoesCompra> {
  h.query = query;
  return (await opcoesGet({ context: { user } } as never)) as OpcoesCompra;
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

beforeEach(() => {
  h.query = {};
  semearConsultores(fake);
  fake.tabelas.cadastro_fornecedores = [
    linha("f1", "Fornecedor Teste B", { pais: "Alemanha", prazo_alerta_dias: "30", sem_alerta: false }),
    linha("f2", "Fornecedor Teste A", { pais: null, prazo_alerta_dias: null, sem_alerta: true }),
    linha("f3", "Fornecedor Inativo", { pais: "X", prazo_alerta_dias: 5, sem_alerta: false }, false),
  ];
  fake.tabelas.cadastro_despachantes = [
    linha("d1", "Despachante Teste", { contato_nome: "Contato TESTE", telefone: "11 90000-0000", email: "d@x.com", chave_pix: PIX }),
    linha("d2", "Despachante Sem Dados", { contato_nome: null, telefone: null, email: null, chave_pix: PIX }),
    linha("d3", "Despachante Inativo", { chave_pix: PIX }, false),
  ];
  fake.tabelas.cadastro_transportadoras = [linha("t1", "Transportadora Teste", { chave_pix: PIX }), linha("t2", "Transportadora Inativa", { chave_pix: PIX }, false)];
  fake.tabelas.cadastro_temperaturas = [linha("p1", "2°C a 8°C"), linha("p2", "Ambiente"), linha("p3", "Antiga", {}, false)];
  fake.tabelas.cadastro_medicamentos = medicamentos(414);
});

describe("o conteúdo: só ativos, só os campos necessários", () => {
  it("fornecedores (só o nome), despachantes (nome, contato, telefone, e-mail), consultores e temperaturas, em ordem alfabética; sem cias nem transportadoras", async () => {
    const o = await chamar(adm);
    expect(o.fornecedores).toEqual([{ nome: "Fornecedor Teste A" }, { nome: "Fornecedor Teste B" }]);
    expect(Object.keys(o).sort()).toEqual(["consultores", "despachantes", "fornecedores", "medicamentos", "temperaturas"]);
    expect(o.despachantes).toEqual([
      { nome: "Despachante Sem Dados", contatoNome: "", telefone: "", email: "" },
      { nome: "Despachante Teste", contatoNome: "Contato TESTE", telefone: "11 90000-0000", email: "d@x.com" },
    ]);
    expect(o.temperaturas.map((t) => t.nome)).toEqual(["2°C a 8°C", "Ambiente"]);
    expect(o.consultores.map((c) => c.nome)).toEqual(["André Vitório", "Bolívar", "Dani", "Flávia", "Mateus Morais", "Paulo Braga"]); // o inativo (Junior) não vem
  });

  it("itens inativos não aparecem em lista nenhuma (nem nos medicamentos)", async () => {
    fake.tabelas.cadastro_medicamentos = [...medicamentos(3), linha("med_x", "TESTE MED INATIVO", {}, false)];
    const texto = JSON.stringify(await chamar(adm));
    for (const inativo of ["Inativo", "Inativa", "Antiga", "Junior"]) expect(texto, inativo).not.toContain(inativo);
  });

  it("cada medicamento traz id (o medicamentoCadastroId), nome e temperatura ('' quando não há)", async () => {
    const o = await chamar(adm, { limite: "2" });
    expect(o.medicamentos.itens).toEqual([
      { id: "med_0000", nome: "TESTE MED 0000", temperatura: "2°C a 8°C" },
      { id: "med_0001", nome: "TESTE MED 0001", temperatura: "" },
    ]);
  });

  it("listas vazias viram [] (nunca erro)", async () => {
    for (const t of ["cadastro_fornecedores", "cadastro_despachantes", "cadastro_temperaturas", "cadastro_medicamentos"]) fake.tabelas[t] = [];
    const o = await chamar(adm);
    expect(o).toMatchObject({ fornecedores: [], despachantes: [], temperaturas: [], medicamentos: { itens: [], temMais: false } });
  });

  it("as listas completas passam do teto de 1000 linhas por consulta do PostgREST (lê em páginas)", async () => {
    expect(TETO_LINHAS_POR_CONSULTA).toBe(1000);
    fake.tabelas.cadastro_fornecedores = Array.from({ length: 1500 }, (_, i) => linha(`f_${String(i).padStart(4, "0")}`, `Fornecedor ${String(i).padStart(4, "0")}`, { pais: "", prazo_alerta_dias: null, sem_alerta: false }));
    expect((await chamar(adm)).fornecedores).toHaveLength(1500);
  });
});

describe("chave PIX: nunca, em nível nenhum", () => {
  it("a resposta inteira não tem a chave (nem o campo, em chave de objeto nenhuma), mesmo com PIX em despachantes (e em transportadoras, que a Compra nem lê mais)", async () => {
    const o = await chamar(adm, { q: "teste" });
    const texto = JSON.stringify(o);
    expect(texto).not.toContain(PIX);
    expect(texto.toLowerCase()).not.toMatch(/chave_?pix|\bpix\b/);

    const chaves = new Set<string>();
    const varrer = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(varrer);
      else if (v && typeof v === "object") {
        for (const [k, f] of Object.entries(v)) {
          chaves.add(k);
          varrer(f);
        }
      }
    };
    varrer(o);
    expect([...chaves].filter((k) => /pix/i.test(k))).toEqual([]);
    expect([...chaves].sort()).toEqual(
      ["consultores", "contatoNome", "despachantes", "email", "fornecedores", "id", "itens", "limite", "medicamentos", "nome", "pagina", "q", "telefone", "temMais", "temperatura", "temperaturas"].sort(),
    );
  });

  it("o sócio (só leitura) recebe o mesmo, também sem a chave", async () => {
    expect(JSON.stringify(await chamar(socio))).not.toContain(PIX);
  });
});

describe("medicamentos: página, busca e limite", () => {
  it("padrão: 50 por página, em ordem; temMais quando há mais", async () => {
    const m = (await chamar(adm)).medicamentos;
    expect(m).toMatchObject({ pagina: 1, limite: 50, temMais: true, q: "" });
    expect(m.itens).toHaveLength(50);
    expect(m.itens[0]!.nome).toBe("TESTE MED 0000");
    expect(m.itens[49]!.nome).toBe("TESTE MED 0049");
  });

  it("as páginas seguem sem repetir nem pular, até a última (414 itens, 100 por página: 5 páginas; a última tem 14 e temMais=false)", async () => {
    const vistos: string[] = [];
    for (let pagina = 1; pagina <= 5; pagina++) {
      const m = (await chamar(adm, { limite: "100", pagina: String(pagina) })).medicamentos;
      vistos.push(...m.itens.map((i) => i.id));
      expect(m.temMais, `página ${pagina}`).toBe(pagina < 5);
      expect(m.itens.length, `página ${pagina}`).toBe(pagina < 5 ? 100 : 14);
    }
    expect(vistos).toHaveLength(414);
    expect(new Set(vistos).size).toBe(414);
    expect(vistos).toEqual([...vistos].sort());
    expect((await chamar(adm, { limite: "100", pagina: "6" })).medicamentos).toMatchObject({ itens: [], temMais: false });
  });

  it("exatamente na borda: 100 itens com limite 100 → temMais=false", async () => {
    fake.tabelas.cadastro_medicamentos = medicamentos(100);
    expect((await chamar(adm, { limite: "100" })).medicamentos).toMatchObject({ temMais: false });
    fake.tabelas.cadastro_medicamentos = medicamentos(101);
    expect((await chamar(adm, { limite: "100" })).medicamentos).toMatchObject({ temMais: true });
  });

  it("a busca ignora acento, caixa e espaços repetidos, e acha no meio do nome; devolve o `q` normalizado", async () => {
    fake.tabelas.cadastro_medicamentos = [
      linha("m1", "ÁCIDO FÓLICO TESTE"),
      linha("m2", "OUTRO REMÉDIO TESTE"),
      linha("m3", "TESTE ACIDO ASCORBICO"),
      linha("m4", "Inativo ácido", {}, false),
    ];
    const m = (await chamar(adm, { q: "  Ácido   " })).medicamentos;
    expect(m.q).toBe("acido");
    expect(m.itens.map((i) => i.id)).toEqual(["m1", "m3"]);
    expect((await chamar(adm, { q: "remedio teste" })).medicamentos.itens.map((i) => i.id)).toEqual(["m2"]);
    expect((await chamar(adm, { q: "nada disso" })).medicamentos.itens).toEqual([]);
  });

  it("a busca pagina junto (resultado da busca em páginas)", async () => {
    const m1 = (await chamar(adm, { q: "teste med 00", limite: "30" })).medicamentos; // 0000..0099 = 100 itens
    expect(m1.itens).toHaveLength(30);
    expect(m1.temMais).toBe(true);
    const m4 = (await chamar(adm, { q: "teste med 00", limite: "30", pagina: "4" })).medicamentos;
    expect(m4.itens).toHaveLength(10);
    expect(m4.temMais).toBe(false);
  });

  it("curingas do LIKE na busca não funcionam como curinga (% e _ viram espaço)", async () => {
    expect((await chamar(adm, { q: "%" })).medicamentos).toMatchObject({ q: "", temMais: true }); // só curinga = sem busca
    fake.tabelas.cadastro_medicamentos = [linha("m1", "TESTE A"), linha("m2", "TESTE B")];
    // Como curinga, "test_ a" e "te%te" achariam "teste a"; como texto (% e _ viram espaço) não acham nada.
    expect((await chamar(adm, { q: "test_ a" })).medicamentos.itens).toEqual([]);
    expect((await chamar(adm, { q: "te%te" })).medicamentos.itens).toEqual([]);
    expect((await chamar(adm, { q: "teste_a" })).medicamentos.itens.map((i) => i.id)).toEqual(["m1"]); // "_" virou espaço: "teste a"
  });
});

describe("a consulta é validada (400) e nunca devolve a lista inteira", () => {
  it("limite fora de 1..100, não numérico ou repetido; página < 1; busca longa ou repetida → 400", async () => {
    for (const ruim of [{ limite: "0" }, { limite: "101" }, { limite: "-1" }, { limite: "1.5" }, { limite: "abc" }, { limite: "1e2" }, { limite: ["10", "20"] }, { pagina: "0" }, { pagina: "-2" }, { pagina: "x" }, { q: ["a", "b"] }, { q: "a".repeat(COMPRA_BUSCA_MAX + 1) }]) {
      expect((await erroDe(chamar(adm, ruim))).status, JSON.stringify(ruim)).toBe(400);
    }
    expect((await chamar(adm, { limite: "100" })).medicamentos.itens).toHaveLength(100);
    expect((await chamar(adm, { limite: "1" })).medicamentos.itens).toHaveLength(1);
  });

  it("validarConsultaMedicamentos: padrões e normalização", () => {
    expect(validarConsultaMedicamentos({})).toEqual({ ok: true, valor: { q: "", limite: 50, pagina: 1 } });
    expect(validarConsultaMedicamentos({ q: " Ácido  FÓLICO ", limite: "10", pagina: "3" })).toEqual({ ok: true, valor: { q: "acido folico", limite: 10, pagina: 3 } });
    expect(validarConsultaMedicamentos({ limite: "" })).toMatchObject({ ok: true });
    expect(normalizarBuscaCompra("A%_B\\C")).toBe("a b c");
  });
});

describe("permissão: compras ver", () => {
  it("sem usuário 401; consultor 403; sócio e administrador leem", async () => {
    expect((await erroDe(chamar(null))).status).toBe(401);
    expect((await erroDe(chamar(consultor))).status).toBe(403);
    expect(await chamar(socio)).toHaveProperty("fornecedores");
    expect(await chamar(adm)).toHaveProperty("fornecedores");
  });

  it("não escreve em nada: nenhuma chamada além de select", async () => {
    fake.chamadas.length = 0;
    await chamar(adm);
    expect(fake.chamadas.length).toBeGreaterThan(0);
    expect(fake.chamadas.filter((c) => c.op !== "select")).toEqual([]);
  });
});

// ── A rota LEVE: GET /api/compras/opcoes/medicamentos ───────────────────────────────────────────────────────────

describe("GET /api/compras/opcoes/medicamentos (busca leve)", () => {
  async function leve(user: AuthUser | null, query: Record<string, unknown> = {}): Promise<PaginaMedicamentos> {
    h.query = query;
    return (await medicamentosGet({ context: { user } } as never)) as PaginaMedicamentos;
  }

  it("devolve SÓ a página de medicamentos ({ itens, pagina, limite, temMais, q }): nenhuma outra lista, em nenhum nível", async () => {
    const r = await leve(adm, { q: "teste med 000", limite: "5" });
    expect(Object.keys(r).sort()).toEqual(["itens", "limite", "pagina", "q", "temMais"]);
    expect(r.itens.map((i) => i.id)).toEqual(["med_0000", "med_0001", "med_0002", "med_0003", "med_0004"]);
    expect(r).toMatchObject({ pagina: 1, limite: 5, temMais: true, q: "teste med 000" });
    const texto = JSON.stringify(r);
    for (const outra of ["fornecedores", "despachantes", "consultores", "temperaturas", "Fornecedor Teste", "Despachante Teste"]) {
      expect(texto, outra).not.toContain(outra);
    }
  });

  it("não traz chave PIX em nível nenhum (nem na lista, que nem é lida)", async () => {
    const r = await leve(adm);
    const texto = JSON.stringify(r);
    expect(texto).not.toContain(PIX);
    expect(texto.toLowerCase()).not.toMatch(/chave_?pix|\bpix\b/);
    const chaves = new Set<string>();
    const varrer = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(varrer);
      else if (v && typeof v === "object") for (const [k, f] of Object.entries(v)) (chaves.add(k), varrer(f));
    };
    varrer(r);
    expect([...chaves].sort()).toEqual(["id", "itens", "limite", "nome", "pagina", "q", "temMais", "temperatura"]);
  });

  it("lê SÓ a tabela de medicamentos (nenhuma outra lista é consultada) e só faz select", async () => {
    fake.chamadas.length = 0;
    await leve(adm, { q: "teste" });
    expect(new Set(fake.chamadas.map((c) => c.tabela))).toEqual(new Set(["cadastro_medicamentos"]));
    expect(fake.chamadas.filter((c) => c.op !== "select")).toEqual([]);
  });

  it("os mesmos itens da página de medicamentos da rota geral (mesma busca, ordem, paginação e limite)", async () => {
    for (const query of [{}, { q: "teste med 00", limite: "30", pagina: "2" }, { limite: "100", pagina: "5" }, { q: "ácido" }]) {
      expect((await leve(adm, query)).itens, JSON.stringify(query)).toEqual((await chamar(adm, query)).medicamentos.itens);
    }
  });

  it("só ativos; busca sem acento nem caixa; páginas sem repetir; temMais; limite 1..100", async () => {
    fake.tabelas.cadastro_medicamentos = [linha("m1", "ÁCIDO FÓLICO TESTE"), linha("m2", "OUTRO TESTE"), linha("m3", "ACIDO ASCORBICO TESTE"), linha("m4", "Inativo ácido", {}, false)];
    expect((await leve(adm, { q: "  Ácido " })).itens.map((i) => i.id)).toEqual(["m3", "m1"]); // ordenado por nome_chave; o inativo fica de fora
    fake.tabelas.cadastro_medicamentos = medicamentos(414);
    const vistos: string[] = [];
    for (let pagina = 1; pagina <= 5; pagina++) {
      const p = await leve(adm, { limite: "100", pagina: String(pagina) });
      vistos.push(...p.itens.map((i) => i.id));
      expect(p.temMais, `página ${pagina}`).toBe(pagina < 5);
    }
    expect(new Set(vistos).size).toBe(414);
    for (const ruim of [{ limite: "0" }, { limite: "101" }, { limite: "abc" }, { pagina: "0" }, { q: ["a", "b"] }, { q: "a".repeat(COMPRA_BUSCA_MAX + 1) }]) {
      expect((await erroDe(leve(adm, ruim))).status, JSON.stringify(ruim)).toBe(400);
    }
  });

  it("permissão compras = ver: sem usuário 401, consultor 403, sócio e administrador leem", async () => {
    expect((await erroDe(leve(null))).status).toBe(401);
    expect((await erroDe(leve(consultor))).status).toBe(403);
    expect(await leve(socio)).toHaveProperty("itens");
    expect(await leve(adm)).toHaveProperty("itens");
  });
});
