// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { TEMPERATURAS_DIR } from "../../shared/constants/dir";
import type { AuthUser } from "../../shared/types/auth";
import type { DirOpcoes } from "../../shared/types/dir";
import { autorizarApi, permissoesTudoNenhum, type NivelPermissao } from "../../shared/utils/permissoesPagina";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { novoDir } from "./helpers/dirFixtures";

// GET /api/dir/opcoes (as temperaturas ATIVAS do Cadastro) e o formulário da DIR usando a lista, com fallback nas 3 constantes.
// Dados fictícios (TESTE).

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

import opcoesGet from "../../server/api/dir/opcoes.get";
import DirFormModal from "../../app/components/dir/DirFormModal.vue";
import { useDirForm } from "../../app/composables/useDirForm";
import { useDirOpcoes } from "../../app/composables/useDirOpcoes";
import { useState } from "#app";

const SEIS = ["2°C a 8°C", "Ambiente", "Ambiente / 2°C a 8°C", "2°C a 8°C / Ambiente", "Ambiente / 2°C a 8°C no Brasil", "Abaixo de 30C"];

function linha(id: string, nome: string, ativo = true): Record<string, unknown> {
  return {
    id,
    nome,
    nome_chave: nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase(),
    ativo,
    atualizado_por: null,
    created_at: "2026-11-19T00:00:00.000Z",
    updated_at: "2026-11-19T00:00:00.000Z",
  };
}

function usuario(role: AuthUser["role"], dir?: NivelPermissao): AuthUser {
  return { id: `u_${role}`, email: `${role}@x.com`, role, nome: role, isAdmin: role === "administrador", ...(dir ? { permissoes: { ...permissoesTudoNenhum(), dir } } : {}) };
}

const chamar = (user: AuthUser | null | undefined): Promise<DirOpcoes> => (opcoesGet as unknown as (e: never) => Promise<DirOpcoes>)({ context: { user } } as never);
const statusDe = async (p: Promise<unknown>): Promise<number> => {
  try {
    await p;
    return 200;
  } catch (e) {
    return (e as { statusCode?: number }).statusCode ?? 500;
  }
};

beforeEach(() => {
  fake.tabelas.cadastro_temperaturas = [...SEIS.map((n, i) => linha(`t${i}`, n)), linha("tx", "Congelado TESTE", false)];
});

describe("GET /api/dir/opcoes", () => {
  it("devolve SÓ { temperaturas } com as ativas, em ordem alfabética pela chave do nome; a inativa não vem", async () => {
    const r = await chamar(usuario("operacional"));
    expect(Object.keys(r)).toEqual(["temperaturas"]);
    expect(r.temperaturas).toEqual(["2°C a 8°C", "2°C a 8°C / Ambiente", "Abaixo de 30C", "Ambiente", "Ambiente / 2°C a 8°C", "Ambiente / 2°C a 8°C no Brasil"]);
    expect(r.temperaturas).not.toContain("Congelado TESTE");
  });

  it("ordena sem diferença de acento nem de caixa (a chave do nome)", async () => {
    fake.tabelas.cadastro_temperaturas = [linha("a", "ámbar TESTE"), linha("b", "Zebra TESTE"), linha("c", "alfa TESTE")];
    expect((await chamar(usuario("administrador"))).temperaturas).toEqual(["alfa TESTE", "ámbar TESTE", "Zebra TESTE"]);
  });

  it("nada de PIX nem de outras colunas na resposta", async () => {
    fake.tabelas.cadastro_temperaturas = [{ ...linha("t", "Ambiente"), chave_pix: "SEGREDO" }];
    expect(JSON.stringify(await chamar(usuario("administrador")))).toBe('{"temperaturas":["Ambiente"]}');
  });

  it("não escreve em nada: só leituras", async () => {
    fake.chamadas.length = 0;
    await chamar(usuario("administrador"));
    expect(fake.chamadas.length).toBeGreaterThan(0);
    expect(fake.chamadas.every((c) => c.op === "select")).toBe(true);
  });

  const casos: Array<[string, AuthUser | null, number]> = [
    ["administrador", usuario("administrador"), 200],
    ["operacional sem mapa", usuario("operacional"), 200],
    ["operacional com dir = ver", usuario("operacional", "ver"), 200],
    ["operacional com dir = editar", usuario("operacional", "editar"), 200],
    ["operacional com dir = nenhum", usuario("operacional", "nenhum"), 403],
    ["sócio sem mapa (a DIR não é dele)", usuario("socio"), 403],
    ["sócio com dir = ver", usuario("socio", "ver"), 200],
    ["consultor", usuario("consultor"), 403],
    ["sem sessão", null, 401],
  ];
  it.each(casos)("o handler: %s → %i", async (_n, user, esperado) => {
    expect(await statusDe(chamar(user))).toBe(esperado);
  });

  it.each(casos)("o middleware (autorizarApi) concorda: %s", (_n, user, esperado) => {
    expect(autorizarApi(user, "/api/dir/opcoes", "GET").permitido).toBe(esperado === 200);
  });
});

describe("useDirOpcoes — fallback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useState<DirOpcoes | null>("dir-opcoes", () => null).value = null;
  });

  it("antes de carregar e quando a leitura falha: as 3 constantes", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const o = useDirOpcoes();
    expect(o.temperaturas.value).toEqual(TEMPERATURAS_DIR);
    expect(await o.carregarOpcoes()).toBe(false);
    expect(o.temperaturas.value).toEqual(TEMPERATURAS_DIR);
  });

  it("falha de rede (fetch lança): não lança e continua nas constantes", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("sem rede");
    });
    const o = useDirOpcoes();
    expect(await o.carregarOpcoes()).toBe(false);
    expect(o.temperaturas.value).toEqual(TEMPERATURAS_DIR);
  });

  it("carregou: usa a lista do Cadastro, e só lê uma vez", async () => {
    const f = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => ({ temperaturas: SEIS }) }));
    vi.stubGlobal("fetch", f);
    const o = useDirOpcoes();
    expect(await o.carregarOpcoes()).toBe(true);
    expect(o.temperaturas.value).toEqual(SEIS);
    await o.carregarOpcoes();
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0]![0]).toBe("/api/dir/opcoes");
  });

  it("lista vazia do servidor: volta ao fallback (o select nunca fica sem opções)", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, json: async () => ({ temperaturas: [] }) }));
    const o = useDirOpcoes();
    await o.carregarOpcoes();
    expect(o.temperaturas.value).toEqual(TEMPERATURAS_DIR);
  });
});

describe("useDirForm — temperatura dinâmica", () => {
  it("valor que está na lista do Cadastro abre selecionado (não como Outro)", () => {
    const f = useDirForm(() => novoDir({ temperatura: "Abaixo de 30C" }), undefined, () => SEIS);
    expect(f.outros.temperatura.state.select).toBe("Abaixo de 30C");
    expect(f.outros.temperatura.build()).toBe("Abaixo de 30C");
  });

  it("valor fora da lista continua abrindo como 'Outro' com o texto, e salva o mesmo texto", () => {
    const f = useDirForm(() => novoDir({ temperatura: "Congelado TESTE" }), undefined, () => SEIS);
    expect(f.outros.temperatura.state.select).toBe("Outro");
    expect(f.outros.temperatura.state.outroTexto).toBe("Congelado TESTE");
    expect(f.outros.temperatura.build()).toBe("Congelado TESTE");
  });

  it("sem a lista (padrão), valem as 3 constantes: 'Abaixo de 30C' abre como Outro, 'Ambiente' como item", () => {
    expect(useDirForm(() => novoDir({ temperatura: "Abaixo de 30C" })).outros.temperatura.state.select).toBe("Outro");
    expect(useDirForm(() => novoDir({ temperatura: "Ambiente" })).outros.temperatura.state.select).toBe("Ambiente");
  });

  it("a lista chega DEPOIS de abrir: quem abriu como Outro com um texto que agora está na lista passa a mostrar o item", async () => {
    const lista = ref<readonly string[]>(TEMPERATURAS_DIR);
    const f = useDirForm(() => novoDir({ temperatura: "Abaixo de 30C" }), undefined, () => lista.value);
    expect(f.outros.temperatura.state.select).toBe("Outro");
    lista.value = SEIS;
    await nextTick();
    expect(f.outros.temperatura.state.select).toBe("Abaixo de 30C");
    expect(f.outros.temperatura.state.outroTexto).toBe("");
  });

  it("a lista chega depois, mas o texto digitado é de verdade fora da lista: continua Outro", async () => {
    const lista = ref<readonly string[]>(TEMPERATURAS_DIR);
    const f = useDirForm(() => novoDir({ temperatura: "Congelado TESTE" }), undefined, () => lista.value);
    lista.value = SEIS;
    await nextTick();
    expect(f.outros.temperatura.state.select).toBe("Outro");
    expect(f.outros.temperatura.state.outroTexto).toBe("Congelado TESTE");
  });
});

describe("DirFormModal — o select de temperatura", () => {
  const montados: Array<() => void> = [];
  afterEach(() => {
    while (montados.length) montados.pop()!();
    document.body.innerHTML = "";
  });

  function abrir(props: Record<string, unknown>): void {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const app = createApp(defineComponent({ render: () => h(DirFormModal, { contagemPorPo: new Map<string, number>(), ...props }) }));
    app.mount(el);
    montados.push(() => app.unmount());
  }

  it("com a lista do Cadastro: um valor só dela (Abaixo de 30C) aparece selecionado, sem campo 'Outro'", () => {
    abrir({ editingDir: novoDir({ temperatura: "Abaixo de 30C" }), temperaturas: SEIS });
    expect((document.getElementById("df-temperatura")?.textContent ?? "")).toContain("Abaixo de 30C");
    expect(document.getElementById("df-temperatura-outro")).toBeNull();
  });

  it("sem a prop (fallback): o mesmo valor abre como 'Outro' com o texto digitável", () => {
    abrir({ editingDir: novoDir({ temperatura: "Abaixo de 30C" }) });
    const outro = document.getElementById("df-temperatura-outro") as HTMLInputElement | null;
    expect(outro).not.toBeNull();
    expect(outro!.value).toBe("Abaixo de 30C");
  });

  it("valor fora da lista do Cadastro continua abrindo como 'Outro'", () => {
    abrir({ editingDir: novoDir({ temperatura: "Congelado TESTE" }), temperaturas: SEIS });
    expect((document.getElementById("df-temperatura-outro") as HTMLInputElement).value).toBe("Congelado TESTE");
  });
});
