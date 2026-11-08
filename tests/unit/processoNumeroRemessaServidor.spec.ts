import { beforeEach, describe, expect, it, vi } from "vitest";
import { montarPatchDiferencial, validarProcessoForm } from "../../app/utils/processoFormPayload";
import { FakeSupabase } from "./helpers/fakeSupabase";
import {
  ATUALIZACOES,
  MEDICAMENTOS,
  VERSAO,
  editado,
  estadoCompleto,
  formCompleto,
  linhaCompleta,
} from "./helpers/processoEdicaoFixtures";

// Nº Remessa no servidor: POST e PATCH. Os handlers e o processosStore são os REAIS; só h3 e o Supabase (em
// memória) são simulados. O corpo passa por JSON.stringify/parse, como na rede.
//
// A coluna antiga `ordem` está CONGELADA: o código novo não a lê nem a grava; `ordem` vindo de abas antigas é
// ignorado sem erro.

const h = vi.hoisted(() => ({ body: {} as unknown }));
const fake = new FakeSupabase();

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => "proc_1") };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { default: patchHandler } = await import("../../server/api/processos/[id].patch");
const { default: postHandler } = await import("../../server/api/processos/index.post");

const T = "follow_up";
const MENSAGEM = "Nº Remessa inválido. Use um número inteiro maior ou igual a 1.";
const evento = { context: { user: null } } as unknown as Parameters<typeof patchHandler>[0];
const linha1 = () => fake.linhas(T).find((r) => r.id === "proc_1")!;

async function patch(corpo: unknown) {
  h.body = JSON.parse(JSON.stringify(corpo));
  return patchHandler(evento);
}

// Payload de criação como o formulário o monta (todos os campos) — com ajustes por teste.
function corpoPost(extra: Record<string, unknown> = {}, remover: string[] = []): Record<string, unknown> {
  const r = validarProcessoForm(formCompleto(), MEDICAMENTOS, [], "Poros - Turquia");
  if (!r.valido) throw new Error(r.erro);
  const corpo: Record<string, unknown> = { ...JSON.parse(JSON.stringify(r.payload)), atualizacoes: [], ...extra };
  for (const chave of remover) delete corpo[chave];
  return corpo;
}

async function post(corpo: Record<string, unknown>) {
  h.body = JSON.parse(JSON.stringify(corpo));
  return postHandler(evento);
}

async function statusErro(promessa: Promise<unknown>): Promise<{ statusCode: number; statusMessage: string } | null> {
  try {
    await promessa;
    return null;
  } catch (e) {
    const err = e as { statusCode: number; statusMessage: string };
    return { statusCode: err.statusCode, statusMessage: err.statusMessage };
  }
}

beforeEach(() => {
  fake.tabelas[T] = [linhaCompleta()]; // numero_remessa 2 e ordem "Ordem 2" (coluna congelada)
  fake.chamadas.length = 0;
});

describe("POST — Nº Remessa", () => {
  beforeEach(() => {
    fake.tabelas[T] = [];
  });

  it("sem numeroRemessa: grava 1 e devolve 1", async () => {
    const criado = await post(corpoPost({}, ["numeroRemessa"]));
    expect(fake.linhas(T)[0]!.numero_remessa).toBe(1);
    expect(criado.numeroRemessa).toBe(1);
  });

  it("valor válido: grava e devolve o número (aceita número ou texto numérico)", async () => {
    expect((await post(corpoPost({ numeroRemessa: 7 }))).numeroRemessa).toBe(7);
    expect((await post(corpoPost({ numeroRemessa: "12" }))).numeroRemessa).toBe(12);
    expect((await post(corpoPost({ numeroRemessa: 2147483647 }))).numeroRemessa).toBe(2147483647);
    expect(fake.linhas(T).map((r) => r.numero_remessa)).toEqual([7, 12, 2147483647]);
  });

  it("null, vazio e 0 viram 1", async () => {
    for (const vazio of [null, "", 0, "0"]) {
      fake.tabelas[T] = [];
      const criado = await post(corpoPost({ numeroRemessa: vazio }));
      expect(fake.linhas(T)[0]!.numero_remessa, String(vazio)).toBe(1);
      expect(criado.numeroRemessa).toBe(1);
    }
  });

  it.each([["abc"], [1.5], ["1.5"], [-3], ["-3"], [2147483648], ["2147483648"], [true], [{}], ["1e3"]])(
    "inválido %j: 400 com a mensagem, e nada é gravado",
    async (invalido) => {
      const erro = await statusErro(post(corpoPost({ numeroRemessa: invalido })));
      expect(erro).toEqual({ statusCode: 400, statusMessage: MENSAGEM });
      expect(fake.linhas(T)).toHaveLength(0);
    },
  );

  it("`ordem` de aba antiga é ignorada sem erro: não grava na coluna e não volta no retorno", async () => {
    const criado = await post(corpoPost({ ordem: "Ordem 9", numeroRemessa: 3 }));
    const gravada = fake.linhas(T)[0]!;
    expect("ordem" in gravada).toBe(false);
    expect(gravada.numero_remessa).toBe(3);
    expect("ordem" in criado).toBe(false);
  });

  it("aba antiga SÓ com `ordem` (sem numeroRemessa): aceita, grava 1 e não grava a coluna ordem", async () => {
    const criado = await post(corpoPost({ ordem: "Ordem 5" }, ["numeroRemessa"]));
    expect("ordem" in fake.linhas(T)[0]!).toBe(false);
    expect(fake.linhas(T)[0]!.numero_remessa).toBe(1);
    expect(criado.numeroRemessa).toBe(1);
  });

  it("o payload do formulário (novo processo) já leva numeroRemessa 1", () => {
    const r = validarProcessoForm({ ...formCompleto(), numeroRemessa: "1" }, MEDICAMENTOS, [], "");
    if (!r.valido) throw new Error(r.erro);
    expect(r.payload.numeroRemessa).toBe(1);
  });
});

describe("PATCH — Nº Remessa", () => {
  it("ausente: não mexe na coluna", async () => {
    await patch({ parcial: true, localEntrega: "Outro lugar" });
    expect(linha1().numero_remessa).toBe(2);
  });

  it("valor válido: grava", async () => {
    const res = await patch({ parcial: true, numeroRemessa: 9 });
    expect(linha1().numero_remessa).toBe(9);
    expect(res.numeroRemessa).toBe(9);
    await patch({ parcial: true, numeroRemessa: "15" });
    expect(linha1().numero_remessa).toBe(15);
  });

  it("null e '' viram 1 (a coluna é NOT NULL: nunca recebe null)", async () => {
    await patch({ parcial: true, numeroRemessa: null });
    expect(linha1().numero_remessa).toBe(1);

    fake.tabelas[T] = [linhaCompleta()];
    await patch({ parcial: true, numeroRemessa: "" });
    expect(linha1().numero_remessa).toBe(1);
  });

  it.each([["abc"], [1.5], [-3], [2147483648], [true], [{}]])(
    "inválido %j: 400 com a mensagem, e a coluna não muda",
    async (invalido) => {
      const erro = await statusErro(patch({ parcial: true, numeroRemessa: invalido, localEntrega: "X" }));
      expect(erro).toEqual({ statusCode: 400, statusMessage: MENSAGEM });
      expect(linha1().numero_remessa).toBe(2);
      expect(linha1().local_entrega).toBe("Clínica X"); // nada do patch foi gravado
    },
  );

  it("`ordem` de aba antiga: ignorada sem erro e sem gravar (a coluna congelada fica como está)", async () => {
    const res = await patch({ parcial: true, ordem: "Ordem 9", localEntrega: "Clínica nova" });
    expect(linha1().ordem).toBe("Ordem 2");
    expect(linha1().numero_remessa).toBe(2);
    expect(linha1().local_entrega).toBe("Clínica nova"); // o resto do patch vale
    expect("ordem" in res).toBe(false);
  });

  it("`ordem: null` de aba antiga também é ignorada: a coluna não é zerada", async () => {
    await patch({ parcial: true, ordem: null, companhiaAerea: "Emirates" });
    expect(linha1().ordem).toBe("Ordem 2");
    expect(linha1().companhia_aerea).toBe("Emirates");
  });

  it("patch SÓ com `ordem` é aceito e não grava nada além do updated_at", async () => {
    const antes = { ...linha1() };
    await patch({ parcial: true, ordem: "Ordem 7" });
    const { updated_at: _a, ...depois } = linha1();
    const { updated_at: _b, ...antesSemData } = antes;
    expect(depois).toEqual(antesSemData);
  });

  it("`ordem` junto com numeroRemessa: vale só o numeroRemessa", async () => {
    await patch({ parcial: true, ordem: "Ordem 9", numeroRemessa: 4 });
    expect(linha1().numero_remessa).toBe(4);
    expect(linha1().ordem).toBe("Ordem 2");
  });

  it("caminho antigo sem `parcial` (aba velha reenviando campos): aceita e grava o Nº Remessa; ordem fica ignorada", async () => {
    await patch({ paciente: "Fulano", ordem: "Ordem 9", numeroRemessa: 6 });
    expect(linha1().numero_remessa).toBe(6);
    expect(linha1().ordem).toBe("Ordem 2");
  });

  it("caminho com versão e atualizações: aceita e grava o Nº Remessa; `ordem` ignorada", async () => {
    const res = await patch({ numeroRemessa: 8, ordem: "Ordem 9", atualizacoes: ATUALIZACOES, versao: VERSAO });
    expect(res.numeroRemessa).toBe(8);
    expect(linha1().numero_remessa).toBe(8);
    expect(linha1().ordem).toBe("Ordem 2");
  });

  it("caminho com versão e valor inválido: 400", async () => {
    const erro = await statusErro(patch({ numeroRemessa: "xx", atualizacoes: ATUALIZACOES, versao: VERSAO }));
    expect(erro).toEqual({ statusCode: 400, statusMessage: MENSAGEM });
    expect(linha1().numero_remessa).toBe(2);
  });

  it("o formulário de edição: só envia quando mudou; vazio vira 1", async () => {
    expect(montarPatchDiferencial(estadoCompleto(), estadoCompleto())).toBeNull();

    const mudou = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroRemessa = "5")));
    expect(mudou).toEqual({ numeroRemessa: 5, parcial: true });
    await patch(mudou);
    expect(linha1().numero_remessa).toBe(5);

    const vazio = montarPatchDiferencial(estadoCompleto(), editado((e) => (e.form.numeroRemessa = "")));
    expect(vazio).toEqual({ numeroRemessa: 1, parcial: true });
    await patch(vazio);
    expect(linha1().numero_remessa).toBe(1);
  });
});
