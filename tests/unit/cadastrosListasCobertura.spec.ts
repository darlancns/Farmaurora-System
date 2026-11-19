import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LISTA_CADASTRO_ROTULO,
  LISTA_CADASTRO_TEXTOS,
  LISTAS_CADASTRO,
  TABELA_CADASTRO,
} from "../../shared/constants/cadastros";
import type { ListaCadastro } from "../../shared/types/Cadastro";
import type { AuthUser } from "../../shared/types/auth";
import { FakeSupabase } from "./helpers/fakeSupabase";

// COBERTURA das listas dos Cadastros. Os `Record<ListaCadastro, …>` o compilador confere, mas `LISTAS_CADASTRO` é um array simples:
// esquecer um nome ali compila, e a rota /api/cadastros/<lista> passa a responder 404 (listaDaRota confere contra o array). Estes
// testes amarram o array aos Records e provam que CADA lista atravessa a API inteira (GET, POST e PATCH), com handlers e store
// REAIS sobre o Supabase em memória.
//
// Para acrescentar uma lista: o `Record` CORPO_NOVO abaixo falha na compilação até ganhar a entrada dela.

const h = vi.hoisted(() => ({ body: {} as unknown, params: {} as Record<string, string | undefined> }));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return {
    ...real,
    readBody: vi.fn(async () => h.body),
    getRouterParam: vi.fn((_event: unknown, nome: string) => h.params[nome]),
  };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { default: listar } = await import("../../server/api/cadastros/[lista]/index.get");
const { default: criar } = await import("../../server/api/cadastros/[lista]/index.post");
const { default: alterar } = await import("../../server/api/cadastros/[lista]/[id].patch");

const admin: AuthUser = { id: "u_adm", email: "adm@x.com", role: "administrador", nome: "Cris Admin", isAdmin: true };

async function chamar<R>(handler: (e: never) => Promise<R>, params: Record<string, string>, body?: unknown): Promise<R> {
  h.body = body;
  h.params = params;
  return handler({ context: { user: admin } } as never);
}

// Um corpo de criação VÁLIDO para cada lista (Record: lista nova sem entrada não compila).
const CORPO_NOVO: Record<ListaCadastro, Record<string, unknown>> = {
  fornecedores: { nome: "TESTE Fornecedor", prazoAlertaDias: 3, semAlerta: false },
  despachantes: { nome: "TESTE Despachante" },
  transportadoras: { nome: "TESTE Transportadora" },
  "cias-aereas": { nome: "TESTE Cia" },
  consultores: { nome: "TESTE Consultor" },
  temperaturas: { nome: "TESTE TEMP" },
  medicamentos: { nome: "teste medicamento", temperatura: "TESTE TEMP" },
};

// O que a lista precisa já existir no banco para criar um item (o medicamento exige uma temperatura ATIVA).
const PREPARAR: Partial<Record<ListaCadastro, () => void>> = {
  medicamentos: () =>
    fake.semear(TABELA_CADASTRO.temperaturas, [
      {
        id: "temp_pre",
        nome: "TESTE TEMP",
        nome_chave: "teste temp",
        ativo: true,
        atualizado_por: null,
        created_at: "2026-11-01T00:00:00.000Z",
        updated_at: "2026-11-01T00:00:00.000Z",
      },
    ]),
};

const PREFIXO_ID: Record<ListaCadastro, string> = {
  fornecedores: "forn_",
  despachantes: "desp_",
  transportadoras: "transp_",
  "cias-aereas": "cia_",
  consultores: "cons_",
  temperaturas: "temp_",
  medicamentos: "med_",
};

beforeEach(() => {
  for (const tabela of Object.values(TABELA_CADASTRO)) fake.tabelas[tabela] = [];
  fake.chamadas.length = 0;
});

describe("LISTAS_CADASTRO × os Records das listas", () => {
  it("toda lista tem um corpo de criação e um prefixo de id neste spec (lista nova sem entrada reprova aqui)", () => {
    for (const lista of LISTAS_CADASTRO) {
      expect(CORPO_NOVO[lista], lista).toBeDefined();
      expect(PREFIXO_ID[lista], lista).toMatch(/_$/);
    }
  });

  it("o array tem exatamente as listas de TABELA_CADASTRO, sem repetir (esquecer uma deixaria a rota em 404)", () => {
    expect([...LISTAS_CADASTRO].sort()).toEqual(Object.keys(TABELA_CADASTRO).sort());
    expect(new Set(LISTAS_CADASTRO).size).toBe(LISTAS_CADASTRO.length);
  });

  it("toda lista tem rótulo, os três textos do painel e uma tabela cadastro_*", () => {
    for (const lista of LISTAS_CADASTRO) {
      expect(LISTA_CADASTRO_ROTULO[lista], lista).toMatch(/\S/);
      const t = LISTA_CADASTRO_TEXTOS[lista];
      expect(t.tituloNovo, lista).toMatch(/^Nov[oa] /);
      expect(t.tituloEditar, lista).toMatch(/^Editar /);
      expect(t.criado, lista).toMatch(/ criad[oa]\.$/);
      expect(TABELA_CADASTRO[lista], lista).toMatch(/^cadastro_[a-z_]+$/);
    }
    expect(new Set(Object.values(TABELA_CADASTRO)).size).toBe(LISTAS_CADASTRO.length);
  });
});

describe("cada lista atravessa a API (GET, POST, PATCH): nenhuma responde 404 de 'lista desconhecida'", () => {
  for (const lista of [...LISTAS_CADASTRO]) {
    it(`${lista}: lista vazia, cria, aparece na lista, desativa`, async () => {
      PREPARAR[lista]?.();
      expect(await chamar(listar, { lista }), "GET vazio").toEqual([]);

      const criado = (await chamar(criar, { lista }, CORPO_NOVO[lista])) as { id: string; nome: string; ativo: boolean };
      expect(criado.id.startsWith(PREFIXO_ID[lista]), "prefixo do id").toBe(true);
      expect(criado.ativo).toBe(true);
      expect(fake.linhas(TABELA_CADASTRO[lista]), "gravou na tabela da lista").toHaveLength(1);

      const lida = (await chamar(listar, { lista })) as Array<{ id: string }>;
      expect(lida.map((i) => i.id)).toEqual([criado.id]);

      const alterado = (await chamar(alterar, { lista, id: criado.id }, { ativo: false })) as { ativo: boolean };
      expect(alterado.ativo).toBe(false);
    });
  }

  it("uma lista que não existe continua em 404", async () => {
    await expect(chamar(listar, { lista: "bancos" })).rejects.toMatchObject({ statusCode: 404 });
  });
});
