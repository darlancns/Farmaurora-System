import { beforeEach, describe, expect, it, vi } from "vitest";
import { TABELA_CADASTRO } from "../../shared/constants/cadastros";
import type { AuthUser } from "../../shared/types/auth";
import { medicamentosLidos } from "../../shared/utils/cadastroLeitura";
import { chaveCadastro } from "../../shared/utils/cadastroNome";
import { autorizarApi, permissoesTudoNenhum } from "../../shared/utils/permissoesPagina";
import { ROLES, type Role } from "../../shared/utils/rbac";
import { FakeSupabase } from "./helpers/fakeSupabase";

// A sugestão do nome do medicamento no Follow-Up lê GET /api/cadastros/medicamentos (NÃO a rota de Compras, que exige a seção compras e daria 403 a um
// consultor). Aqui se CONFIRMA, com o handler e o middleware reais: (1) todo cargo lê, mesmo com o mapa de permissões todo em "nenhum" (a lista de
// Cadastros é da seção "config", aberta a todos); (2) a resposta só tem campos de medicamento, nada financeiro; (3) o que o Follow-Up guarda é só
// nome e ativo. Só nomes de medicamento de exemplo; nada de paciente nem de chave PIX.

const h = vi.hoisted(() => ({ params: {} as Record<string, string | undefined> }));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, getRouterParam: vi.fn((_event: unknown, nome: string) => h.params[nome]) };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { default: listar } = await import("../../server/api/cadastros/[lista]/index.get");

const MED = TABELA_CADASTRO.medicamentos;
const AGORA = "2026-11-20T12:00:00.000Z";

function linha(id: string, nome: string, ativo = true): Record<string, unknown> {
  return { id, nome, nome_chave: chaveCadastro(nome), temperatura: "2°C a 8°C", ativo, atualizado_por: "Cris Admin", created_at: AGORA, updated_at: AGORA };
}

const conta = (role: Role, permissoes?: AuthUser["permissoes"]): AuthUser => ({
  id: `u_${role}`,
  email: `${role}@x.com`,
  role,
  isAdmin: role === "administrador",
  ...(permissoes ? { permissoes } : {}),
});

async function ler(user: AuthUser): Promise<Array<Record<string, unknown>>> {
  h.params = { lista: "medicamentos" };
  return (await listar({ context: { user } } as never)) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  fake.tabelas[MED] = [linha("med_1", "ZOLPIDEM TESTE"), linha("med_2", "ALFA TESTE"), linha("med_3", "ANTIGO TESTE", false)];
});

describe("quem pode ler GET /api/cadastros/medicamentos (middleware)", () => {
  it.each(ROLES)("%s lê a lista (sem mapa de permissões)", (role) => {
    expect(autorizarApi({ role }, "/api/cadastros/medicamentos", "GET")).toEqual({ permitido: true });
  });

  it.each(["socio", "operacional"] as const)("%s com TODAS as páginas em 'nenhum' ainda lê a lista (Cadastros é da seção config, fora do mapa)", (role) => {
    expect(autorizarApi({ role, permissoes: permissoesTudoNenhum() }, "/api/cadastros/medicamentos", "GET")).toEqual({ permitido: true });
  });

  it("a rota de Compras NÃO serve ao Follow-Up: o consultor leva 403 nela e lê esta", () => {
    expect(autorizarApi({ role: "consultor" }, "/api/compras/opcoes/medicamentos", "GET")).toMatchObject({ permitido: false, status: 403 });
    expect(autorizarApi({ role: "consultor" }, "/api/cadastros/medicamentos", "GET")).toEqual({ permitido: true });
  });

  it("quem não tem sessão leva 401, e escrever na lista segue só com o administrador", () => {
    expect(autorizarApi(null, "/api/cadastros/medicamentos", "GET")).toMatchObject({ permitido: false, status: 401 });
    for (const role of ["socio", "operacional", "consultor"] as const) {
      expect(autorizarApi({ role }, "/api/cadastros/medicamentos", "POST"), role).toMatchObject({ permitido: false, status: 403 });
    }
  });
});

describe("o que a resposta traz", () => {
  it.each(ROLES)("%s: só campos de medicamento (nada de chave PIX nem de dado financeiro), ativos primeiro", async (role) => {
    const r = await ler(conta(role));
    expect(r.map((i) => i.nome)).toEqual(["ALFA TESTE", "ZOLPIDEM TESTE", "ANTIGO TESTE"]);
    for (const item of r) {
      expect(Object.keys(item).sort()).toEqual(["ativo", "atualizadoPor", "createdAt", "id", "nome", "temperatura", "updatedAt"]);
    }
    expect(JSON.stringify(r)).not.toMatch(/pix/i);
  });

  it("o consultor lê a mesma lista que o administrador", async () => {
    expect(await ler(conta("consultor"))).toEqual(await ler(conta("administrador")));
  });

  it("o Follow-Up guarda só nome e ativo (ativos primeiro): sem id, temperatura, quem gravou nem datas", async () => {
    const guardado = medicamentosLidos(await ler(conta("consultor")));
    expect(guardado).toEqual([
      { nome: "ALFA TESTE", ativo: true },
      { nome: "ZOLPIDEM TESTE", ativo: true },
      { nome: "ANTIGO TESTE", ativo: false },
    ]);
  });
});
