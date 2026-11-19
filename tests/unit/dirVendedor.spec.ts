// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import * as constantesDir from "#shared/constants/dir";
import DirFormModal from "../../app/components/dir/DirFormModal.vue";
import { useDirForm } from "../../app/composables/useDirForm";
import { CONSULTOR_ERRO as VENDEDOR_DIR_ERRO } from "../../shared/utils/consultorRegra";
import { novoDir, novoDirDTO } from "./helpers/dirFixtures";
import { FakeSupabase } from "./helpers/fakeSupabase";
import {
  CONSULTORES_FIXTURE,
  CONSULTORES_ATIVOS_FIXTURE,
  CONSULTOR_INATIVO_FIXTURE,
  TABELA_CONSULTORES,
  linhaConsultor,
  semearConsultores,
} from "./helpers/consultoresFixtures";

// O campo Consultor (vendedor) da DIR lê os consultores ATIVOS do Cadastro (lista "consultores"): regra pura, formulário,
// servidor (dirStore e handlers) e o select do modal. Valor antigo fora da lista (consultor desativado, "A ser definido",
// "Braulio (3RB)"…) continua editável e nunca é apagado; só um valor NOVO precisa ser de um consultor ativo.
// Fixtures sintéticas: só nomes de consultor e pacientes "TESTE" — nada de dado real.

vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-18",
}));

const h3 = vi.hoisted(() => ({ body: {} as unknown, params: {} as Record<string, string | undefined> }));
const fake = new FakeSupabase();
semearConsultores(fake);

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return {
    ...real,
    readBody: vi.fn(async () => h3.body),
    getRouterParam: vi.fn((_event: unknown, nome: string) => h3.params[nome]),
  };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { createDir, patchDir } = await import("../../server/utils/dirStore");
const { DirRegraError } = await import("../../server/utils/dirValidation");
const { default: postDir } = await import("../../server/api/dir/index.post");
const { default: patchDirHandler } = await import("../../server/api/dir/[id].patch");

const T = "dir";
const ATIVOS = [...CONSULTORES_ATIVOS_FIXTURE]; // André Vitório, Mateus Morais, Paulo Braga
const INATIVO = CONSULTOR_INATIVO_FIXTURE; // "Junior"
const A_DEFINIR = "A ser definido";
const LITERAL = "Braulio (3RB)";

// ── Formulário (useDirForm.validar) ─────────────────────────────────────────────────────────────────────

describe("useDirForm — consultor", () => {
  function pronto(dir: ReturnType<typeof novoDir> | null, ativos: readonly string[] | null = ATIVOS) {
    const f = useDirForm(() => dir, ativos ? () => ativos : undefined); // null = a lista não foi passada
    f.form.po = "PO26-11-0001";
    f.form.paciente = "PACIENTE TESTE";
    return f;
  }

  it("não existe mais o campo 'Outro' do consultor: `outros` não tem `vendedor`", () => {
    const f = pronto(null);
    expect("vendedor" in f.outros).toBe(false);
    expect(Object.keys(f.outros).sort()).toEqual(["banco", "despachante", "fornecedor", "observacao", "receita", "responsavel", "temperatura"]);
  });

  it("criação: vazio → 'Informe o consultor.'; consultor ativo vai no payload", () => {
    const f = pronto(null);
    expect(f.validar()).toEqual({ valido: false, erro: "Informe o consultor." });
    f.form.vendedor = "Paulo Braga";
    const r = f.validar();
    expect(r.valido && r.payload.vendedor).toBe("Paulo Braga");
    expect(r.valido && r.atualizacao.vendedor).toBe("Paulo Braga");
  });

  it("criação: consultor fora da lista ativa (inativo, literal, 'A ser definido') é recusado", () => {
    for (const valor of [INATIVO, LITERAL, A_DEFINIR]) {
      const f = pronto(null);
      f.form.vendedor = valor;
      expect(f.validar(), valor).toEqual({ valido: false, erro: VENDEDOR_DIR_ERRO });
    }
  });

  it("edição: o valor antigo (inativo, 'A ser definido', 'Braulio (3RB)') carrega no campo e passa ao salvar outro campo", () => {
    for (const antigo of [INATIVO, A_DEFINIR, LITERAL]) {
      const f = pronto(novoDir({ vendedor: antigo }));
      expect(f.form.vendedor).toBe(antigo);
      f.form.paciente = "PACIENTE TESTE EDITADO";
      const r = f.validar();
      expect(r.valido && r.atualizacao.vendedor, antigo).toBe(antigo);
    }
  });

  it("edição: trocar por outro valor fora da lista é recusado; trocar por um ativo passa", () => {
    const f = pronto(novoDir({ vendedor: INATIVO }));
    f.form.vendedor = LITERAL;
    expect(f.validar()).toEqual({ valido: false, erro: VENDEDOR_DIR_ERRO });
    f.form.vendedor = "André Vitório";
    const r = f.validar();
    expect(r.valido && r.atualizacao.vendedor).toBe("André Vitório");
  });

  it("edição: voltar para um consultor INATIVO que não era o valor do registro é recusado", () => {
    const f = pronto(novoDir({ vendedor: "Mateus Morais" }));
    f.form.vendedor = INATIVO;
    expect(f.validar()).toEqual({ valido: false, erro: VENDEDOR_DIR_ERRO });
  });

  it("sem a lista (não carregou), só se exige o campo preenchido: o servidor confere", () => {
    const f = pronto(null, null);
    f.form.vendedor = "Qualquer Teste";
    const r = f.validar();
    expect(r.valido && r.payload.vendedor).toBe("Qualquer Teste");
  });
});

// ── Servidor: dirStore ──────────────────────────────────────────────────────────────────────────────────

function semear(id: string, vendedor: string): void {
  fake.tabelas[T] = [
    ...(fake.tabelas[T] ?? []),
    { id, po: "PO26-11-0001", paciente: "PACIENTE TESTE", vendedor, banco: "XP", updated_at: "2026-11-01T00:00:00.000Z" },
  ];
}
const linha = (id: string) => fake.linhas(T).find((r) => r.id === id)!;
const leuCadastro = () => fake.chamadas.some((c) => c.tabela === TABELA_CONSULTORES);

async function erroRegra(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(DirRegraError);
    expect((e as InstanceType<typeof DirRegraError>).statusCode).toBe(400);
    return (e as Error).message;
  }
  throw new Error("esperava DirRegraError");
}

beforeEach(() => {
  fake.tabelas[T] = [];
  semearConsultores(fake);
  fake.chamadas.length = 0;
});

describe("dirStore.createDir — o consultor precisa ser ATIVO no Cadastro", () => {
  it("consultor ativo: grava", async () => {
    await createDir(novoDirDTO({ vendedor: "Paulo Braga" }), "Rebeca");
    expect(fake.linhas(T)).toHaveLength(1);
    expect(fake.linhas(T)[0]).toMatchObject({ vendedor: "Paulo Braga" });
  });

  it("consultor INATIVO, literal ('Braulio (3RB)') e 'A ser definido': 400, nada é gravado", async () => {
    for (const valor of [INATIVO, LITERAL, A_DEFINIR]) {
      expect(await erroRegra(createDir(novoDirDTO({ vendedor: valor }), "Rebeca")), valor).toBe(VENDEDOR_DIR_ERRO);
    }
    expect(fake.linhas(T)).toHaveLength(0);
  });

  it("consultor reativado volta a poder ser escolhido; consultor desativado deixa de poder", async () => {
    fake.tabelas[TABELA_CONSULTORES] = [linhaConsultor("Mateus Morais", false), linhaConsultor(INATIVO, true)];
    expect(await erroRegra(createDir(novoDirDTO({ vendedor: "Mateus Morais" }), "Rebeca"))).toBe(VENDEDOR_DIR_ERRO);
    await createDir(novoDirDTO({ vendedor: INATIVO }), "Rebeca");
    expect(fake.linhas(T)).toHaveLength(1);
  });

  it("Cadastro vazio: nenhum valor novo é aceito (400)", async () => {
    fake.tabelas[TABELA_CONSULTORES] = [];
    expect(await erroRegra(createDir(novoDirDTO({ vendedor: "Mateus Morais" }), "Rebeca"))).toBe(VENDEDOR_DIR_ERRO);
  });

  it("falha ao ler o Cadastro: o erro sobe (não é 400 de regra) e nada é gravado", async () => {
    fake.falhar(TABELA_CONSULTORES, "select", "banco fora");
    await expect(createDir(novoDirDTO(), "Rebeca")).rejects.toThrow();
    expect(fake.linhas(T)).toHaveLength(0);
  });
});

describe("dirStore.patchDir — valor antigo tolerado, valor novo só de consultor ativo", () => {
  it("o valor que o registro já tem (inativo, 'A ser definido', 'Braulio (3RB)') não impede salvar os outros campos e NÃO é apagado", async () => {
    for (const antigo of [INATIVO, A_DEFINIR, LITERAL]) {
      fake.tabelas[T] = [];
      semear("a", antigo);
      await patchDir("a", { vendedor: antigo, banco: "Sicoob" }, "Rebeca");
      expect(linha("a"), antigo).toMatchObject({ vendedor: antigo, banco: "Sicoob" });
    }
  });

  it("valor NOVO de consultor inativo ou fora da lista: 400, e o registro não muda", async () => {
    semear("a", "Mateus Morais");
    for (const novo of [INATIVO, LITERAL, A_DEFINIR]) {
      expect(await erroRegra(patchDir("a", { vendedor: novo }, "Rebeca")), novo).toBe(VENDEDOR_DIR_ERRO);
    }
    expect(linha("a")).toMatchObject({ vendedor: "Mateus Morais" });
  });

  it("trocar um valor antigo por OUTRO fora da lista é 400; por um consultor ativo grava", async () => {
    semear("a", INATIVO);
    expect(await erroRegra(patchDir("a", { vendedor: "Rodrigo" }, "Rebeca"))).toBe(VENDEDOR_DIR_ERRO);
    expect(linha("a")).toMatchObject({ vendedor: INATIVO });
    await patchDir("a", { vendedor: "André Vitório" }, "Rebeca");
    expect(linha("a")).toMatchObject({ vendedor: "André Vitório" });
  });

  it("consultor ativo no corpo: grava sem precisar ler o registro (só o cadastro e o UPDATE)", async () => {
    semear("a", "Mateus Morais");
    await patchDir("a", { vendedor: "Paulo Braga" }, "Rebeca");
    expect(linha("a")).toMatchObject({ vendedor: "Paulo Braga" });
    expect(fake.chamadas.filter((c) => c.tabela === T).map((c) => c.op)).toEqual(["update"]);
  });

  it("PATCH sem `vendedor` (toggles instantâneos, outros campos) NÃO consulta o Cadastro", async () => {
    semear("a", A_DEFINIR);
    await patchDir("a", { conferido: true }, "Rebeca");
    await patchDir("a", { banco: "XP" }, "Rebeca");
    expect(leuCadastro()).toBe(false);
    expect(linha("a")).toMatchObject({ vendedor: A_DEFINIR });
  });

  it("registro inexistente com consultor inválido → null (404 no endpoint)", async () => {
    expect(await patchDir("nao-existe", { vendedor: INATIVO }, "Rebeca")).toBeNull();
  });

  it("falha ao ler o Cadastro: o erro sobe e o registro não muda", async () => {
    semear("a", "Mateus Morais");
    fake.falhar(TABELA_CONSULTORES, "select", "banco fora");
    await expect(patchDir("a", { vendedor: "Paulo Braga" }, "Rebeca")).rejects.toThrow();
    expect(linha("a")).toMatchObject({ vendedor: "Mateus Morais" });
  });
});

// ── Servidor: handlers /api/dir ─────────────────────────────────────────────────────────────────────────

async function statusDe(p: Promise<unknown>): Promise<{ status: number; msg: string }> {
  try {
    await p;
  } catch (e) {
    const err = e as { statusCode?: number; statusMessage?: string };
    return { status: err.statusCode ?? 0, msg: err.statusMessage ?? "" };
  }
  return { status: 200, msg: "" };
}

describe("/api/dir — respostas HTTP", () => {
  const user = { id: "u1", email: "a@x.com", role: "administrador", nome: "Cris", isAdmin: true };

  it("POST com consultor INATIVO é 400 com a mensagem; com consultor ativo é 200", async () => {
    h3.body = novoDirDTO({ vendedor: INATIVO });
    const e = await statusDe(postDir({ context: { user } } as never));
    expect(e).toEqual({ status: 400, msg: VENDEDOR_DIR_ERRO });
    expect(fake.linhas(T)).toHaveLength(0);

    h3.body = novoDirDTO({ vendedor: "Mateus Morais" });
    expect((await statusDe(postDir({ context: { user } } as never))).status).toBe(200);
    expect(fake.linhas(T)).toHaveLength(1);
  });

  it("PATCH: valor novo inativo é 400; o mesmo valor antigo é 200; registro inexistente é 404", async () => {
    semear("a", A_DEFINIR);
    h3.params = { id: "a" };
    h3.body = { vendedor: INATIVO };
    expect(await statusDe(patchDirHandler({ context: { user } } as never))).toEqual({ status: 400, msg: VENDEDOR_DIR_ERRO });
    h3.body = { vendedor: A_DEFINIR, banco: "Sicoob" };
    expect((await statusDe(patchDirHandler({ context: { user } } as never))).status).toBe(200);
    expect(linha("a")).toMatchObject({ vendedor: A_DEFINIR, banco: "Sicoob" });
    h3.params = { id: "nao-existe" };
    h3.body = { vendedor: INATIVO };
    expect((await statusDe(patchDirHandler({ context: { user } } as never))).status).toBe(404);
  });
});

// ── Modal ───────────────────────────────────────────────────────────────────────────────────────────────

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

function montarModal(editingDir: ReturnType<typeof novoDir> | null, consultores = CONSULTORES_FIXTURE, readonly = false): void {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () => h(DirFormModal, { editingDir, contagemPorPo: new Map<string, number>(), consultores, readonly }),
    }),
  );
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
}

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
});

const botao = () => document.getElementById("df-vendedor") as HTMLButtonElement;
const textoBotao = () => (botao().textContent ?? "").replace(/\s+/g, " ").trim();

async function opcoesAbertas(): Promise<string[]> {
  botao().click();
  await nextTick();
  return [...document.querySelectorAll("#df-vendedor-listbox [role='option']")].map((li) => (li.textContent ?? "").trim());
}

describe("DirFormModal — select Consultor", () => {
  it('é um select simples (df-vendedor) com os consultores ativos e SEM "Outro": não existe o campo de texto df-vendedor-outro', async () => {
    montarModal(null);
    await nextTick();
    expect(botao()).not.toBeNull();
    expect(document.getElementById("df-vendedor-outro")).toBeNull();
    expect(document.querySelector("label[for='df-vendedor']")!.textContent).toBe("Consultor");
    expect(textoBotao()).toBe("Selecione");
    expect(await opcoesAbertas()).toEqual(["Selecione", ...ATIVOS]);
  });

  it("registro com consultor ativo: vem selecionado e sem opção extra", async () => {
    montarModal(novoDir({ vendedor: "Mateus Morais" }));
    await nextTick();
    expect(textoBotao()).toBe("Mateus Morais");
    expect(await opcoesAbertas()).toEqual(["Selecione", ...ATIVOS]);
  });

  it('registro com consultor INATIVO do Cadastro: aparece "<valor> (inativo)"; valor que o Cadastro não conhece ("A ser definido", "Braulio (3RB)") aparece como está; sempre selecionado, nunca vazio', async () => {
    for (const [antigo, rotulo] of [
      [INATIVO, `${INATIVO} (inativo)`],
      [A_DEFINIR, A_DEFINIR],
      [LITERAL, LITERAL],
    ] as const) {
      montarModal(novoDir({ vendedor: antigo }));
      await nextTick();
      expect(textoBotao(), antigo).toBe(rotulo);
      expect(await opcoesAbertas(), antigo).toEqual(["Selecione", ...ATIVOS, rotulo]);
      expect(document.getElementById("df-vendedor-outro")).toBeNull();
      montados.pop()!.unmount();
      document.body.innerHTML = "";
    }
  });

  it("consultor INATIVO do Cadastro não aparece como opção de um registro que tem outro valor", async () => {
    montarModal(novoDir({ vendedor: "Mateus Morais" }));
    await nextTick();
    expect(await opcoesAbertas()).not.toContain(INATIVO);
    expect(await opcoesAbertas()).not.toContain(`${INATIVO} (inativo)`);
  });

  it("somente leitura: o select aparece desabilitado e mostra o valor", async () => {
    montarModal(novoDir({ vendedor: "Paulo Braga" }), CONSULTORES_FIXTURE, true);
    await nextTick();
    expect(botao().disabled).toBe(true);
    expect(textoBotao()).toBe("Paulo Braga");
  });
});

// ── Estrutura: a DIR não tem mais lista própria de consultores ──────────────────────────────────────────

describe("a DIR não tem mais lista própria de consultores", () => {
  it("shared/constants/dir.ts NÃO exporta VENDEDORES_DIR (a fonte é o Cadastro); o mapeamento canônico da carga continua", () => {
    expect("VENDEDORES_DIR" in constantesDir).toBe(false);
    expect("VENDEDOR_CANONICO" in constantesDir).toBe(true);
  });

  it("nenhum arquivo de app/server importa VENDEDORES_DIR ou VENDEDOR_DIR_OPTIONS", () => {
    for (const arquivo of ["app/composables/useDirForm.ts", "app/utils/dirOptions.ts", "app/components/dir/DirFormModal.vue", "server/utils/dirStore.ts"]) {
      const texto = readFileSync(join(process.cwd(), arquivo), "utf-8");
      expect(texto, arquivo).not.toMatch(/VENDEDORES_DIR|VENDEDOR_DIR_OPTIONS/);
    }
  });

  it("a página da DIR carrega só a lista de consultores (useConsultores) e entrega ao modal", () => {
    const pagina = readFileSync(join(process.cwd(), "app/pages/dir.vue"), "utf-8");
    expect(pagina).toContain("useConsultores()");
    expect(pagina).toContain("carregarConsultores()");
    expect(pagina).toContain(':consultores="consultores"');
  });

  it("o servidor da DIR lê os consultores pelo util único (fora do store dos Cadastros) e só as colunas nome e ativo", () => {
    const util = readFileSync(join(process.cwd(), "server/utils/consultoresCadastro.ts"), "utf-8");
    expect(util).toContain('.select("nome, ativo").eq("ativo", true)');
    expect(util).not.toMatch(/chave_pix/);
    const store = readFileSync(join(process.cwd(), "server/utils/dirStore.ts"), "utf-8");
    expect(store).toContain('from "./consultoresCadastro"');
  });
});
