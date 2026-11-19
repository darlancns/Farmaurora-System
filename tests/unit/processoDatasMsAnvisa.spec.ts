// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h as hv, nextTick } from "vue";
import ProcessoFormDatas from "../../app/components/processos/ProcessoFormDatas.vue";
import { useProcessoForm } from "../../app/composables/useProcessoForm";
import { buildDatas, validarProcessoForm } from "../../app/utils/processoFormPayload";
import { camposDatas } from "../../app/utils/processoPainel";
import { colunasDeDTO, montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { semearConsultores } from "./helpers/consultoresFixtures";
import { formCompleto, linhaCompleta } from "./helpers/processoEdicaoFixtures";

// MS Anexado em / Prazo da ANVISA: duas datas COMPLETAS (colunas `date`, "AAAA-MM-DD") no bloco Datas.
// - vazio NUNCA vai como "" ao banco (Postgres `date` recusa): sempre NULL, no insert e no update;
// - o servidor só aceita AAAA-MM-DD real e responde 400 com mensagem clara (nunca 500 do banco);
// - o formulário usa o campo com ano automático em formato "iso" (mostra DD/MM/AAAA, grava AAAA-MM-DD);
// - painel e detalhe mostram com o ano (DD/MM/AAAA).
// Handlers e processosStore REAIS; só h3 e o Supabase (em memória) são simulados.

vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-17",
}));

const h = vi.hoisted(() => ({ body: {} as unknown }));
const fake = new FakeSupabase();
// O servidor confere o consultor contra os ativos do Cadastro (cadastro_consultores).
semearConsultores(fake);

vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h.body), getRouterParam: vi.fn(() => "proc_1") };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { default: patchHandler } = await import("../../server/api/processos/[id].patch");
const { default: postHandler } = await import("../../server/api/processos/index.post");
const { erroDatasIso } = await import("../../server/utils/processoValidation");

const T = "follow_up";
const evento = { context: { user: null } } as unknown as Parameters<typeof patchHandler>[0];
const linha1 = () => fake.linhas(T).find((r) => r.id === "proc_1")!;

function corpoPost(datasExtra: Record<string, unknown> = {}): Record<string, unknown> {
  const r = validarProcessoForm(formCompleto(), [{ nome: "X", laboratorio: "", brand: "" }], [], "Poros - Turquia");
  if (!r.valido) throw new Error(r.erro);
  const corpo = JSON.parse(JSON.stringify(r.payload)) as Record<string, unknown>;
  return { ...corpo, atualizacoes: [], datas: { ...(corpo.datas as object), ...datasExtra } };
}

async function chamar(handler: typeof patchHandler, corpo: unknown) {
  h.body = JSON.parse(JSON.stringify(corpo)); // como na rede: `undefined` some
  return handler(evento);
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
  fake.tabelas[T] = [linhaCompleta()];
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("mapeadores", () => {
  it("leitura: colunas date viram datas.msAnexadoEm / datas.prazoAnvisa; NULL ou ausente = chave omitida", () => {
    const p = montarProcesso(linhaCompleta({ ms_anexado_em: "2026-11-10", prazo_anvisa: "2026-11-25" }) as unknown as FollowUpRow);
    expect(p.datas).toMatchObject({ msAnexadoEm: "2026-11-10", prazoAnvisa: "2026-11-25" });
    const vazio = montarProcesso(linhaCompleta() as unknown as FollowUpRow);
    expect("msAnexadoEm" in vazio.datas).toBe(false);
    const { ms_anexado_em: _a, prazo_anvisa: _b, ...semColunas } = linhaCompleta();
    expect("prazoAnvisa" in montarProcesso(semColunas as unknown as FollowUpRow).datas).toBe(false); // linha antiga
  });

  it("gravação: vazio, só espaços, null ou ausente viram NULL — nunca \"\"", () => {
    expect(colunasDeDTO({ datas: { msAnexadoEm: "", prazoAnvisa: "   " } })).toMatchObject({ ms_anexado_em: null, prazo_anvisa: null });
    expect(colunasDeDTO({ datas: {} })).toMatchObject({ ms_anexado_em: null, prazo_anvisa: null });
    expect(colunasDeDTO({ datas: { prazoAnvisa: "" } }, { parcial: true })).toEqual({ prazo_anvisa: null });
    expect(colunasDeDTO({ datas: { prazoAnvisa: null } }, { parcial: true })).toEqual({ prazo_anvisa: null });
    expect(colunasDeDTO({ datas: { prazoAnvisa: "2026-11-25" } }, { parcial: true })).toEqual({ prazo_anvisa: "2026-11-25" });
    // as datas de texto continuam como sempre (texto vazio do formulário nem chega: vira undefined antes)
    expect(colunasDeDTO({ datas: { dataEmbarque: "10/10" } }, { parcial: true })).toEqual({ data_embarque: "10/10" });
  });
});

describe("validação (erroDatasIso)", () => {
  it.each([undefined, null, "", "  ", "2026-11-25", "2028-02-29"])("aceita %j", (valor) => {
    expect(erroDatasIso({ datas: { prazoAnvisa: valor } })).toBeNull();
  });

  it.each([
    ["25/11/2026", 'Prazo da ANVISA: data inválida ("25/11/2026"). Use AAAA-MM-DD.'],
    ["2026-02-30", 'Prazo da ANVISA: data inválida ("2026-02-30"). Use AAAA-MM-DD.'],
    ["2027-02-29", 'Prazo da ANVISA: data inválida ("2027-02-29"). Use AAAA-MM-DD.'],
    [20261125, "Prazo da ANVISA: data inválida. Use AAAA-MM-DD."],
  ])("recusa %j", (valor, msg) => {
    expect(erroDatasIso({ datas: { prazoAnvisa: valor } })).toBe(msg);
  });

  it("nomeia o campo: MS Anexado em", () => {
    expect(erroDatasIso({ datas: { msAnexadoEm: "ontem" } })).toContain("MS Anexado em");
  });
});

describe("POST /api/processos", () => {
  it("processo novo sem as duas datas: colunas NULL (não \"\")", async () => {
    await chamar(postHandler, corpoPost());
    const criado = fake.linhas(T).find((r) => r.id !== "proc_1")!;
    expect(criado.ms_anexado_em).toBeNull();
    expect(criado.prazo_anvisa).toBeNull();
  });

  it("com as duas datas: grava AAAA-MM-DD", async () => {
    await chamar(postHandler, corpoPost({ msAnexadoEm: "2026-11-10", prazoAnvisa: "2026-11-25" }));
    const criado = fake.linhas(T).find((r) => r.id !== "proc_1")!;
    expect(criado).toMatchObject({ ms_anexado_em: "2026-11-10", prazo_anvisa: "2026-11-25" });
  });

  it("data inválida: 400 com mensagem clara e nada gravado", async () => {
    const e = await erroDe(chamar(postHandler, corpoPost({ prazoAnvisa: "25/11/2026" })));
    expect(e).toEqual({ status: 400, msg: 'Prazo da ANVISA: data inválida ("25/11/2026"). Use AAAA-MM-DD.' });
    expect(fake.linhas(T)).toHaveLength(1);
  });
});

describe("PATCH /api/processos/:id", () => {
  it("preenche, troca e limpa (limpar = NULL)", async () => {
    await chamar(patchHandler, { datas: { msAnexadoEm: "2026-11-10" }, parcial: true });
    expect(linha1().ms_anexado_em).toBe("2026-11-10");
    await chamar(patchHandler, { datas: { msAnexadoEm: null }, parcial: true });
    expect(linha1().ms_anexado_em).toBeNull();
    await chamar(patchHandler, { datas: { prazoAnvisa: "" }, parcial: true });
    expect(linha1().prazo_anvisa).toBeNull();
    // as outras datas não mudam
    expect(linha1().data_embarque).toBe("05/09");
  });

  it("data que não existe: 400, linha intacta", async () => {
    const e = await erroDe(chamar(patchHandler, { datas: { msAnexadoEm: "2026-02-30" }, parcial: true }));
    expect(e.status).toBe(400);
    expect(e.msg).toContain("MS Anexado em");
    expect(linha1().ms_anexado_em).toBeNull();
  });
});

describe("formulário", () => {
  function abrir(extra: Record<string, unknown> = {}) {
    const processo = montarProcesso(linhaCompleta(extra) as unknown as FollowUpRow);
    const f = useProcessoForm(() => processo);
    const el = document.createElement("div");
    document.body.appendChild(el);
    createApp(
      defineComponent({ render: () => hv(ProcessoFormDatas, { values: f.form, "onUpdate:field": f.onDataFieldChange }) }),
    ).mount(el);
    return { f, el };
  }
  const campo = (id: string) => document.getElementById(id) as HTMLInputElement;
  async function digitar(id: string, valor: string): Promise<void> {
    const c = campo(id);
    c.dispatchEvent(new FocusEvent("focus"));
    c.value = valor;
    c.dispatchEvent(new Event("input"));
    c.dispatchEvent(new FocusEvent("blur"));
    await nextTick();
    await nextTick();
  }

  it("os dois campos vêm logo depois do Registro Lpco; o MS começa uma linha da grade (lado a lado com o Prazo)", () => {
    const { el } = abrir();
    const ids = Array.from(el.querySelectorAll<HTMLElement>("label[for]")).map((l) => l.getAttribute("for"));
    expect(ids.slice(6, 10)).toEqual(["pf-lpco", "pf-ms-anexado", "pf-prazo-anvisa", "pf-previsao"]);
    expect(el.querySelector("label[for='pf-ms-anexado']")!.textContent).toBe("MS Anexado em");
    expect(el.querySelector("label[for='pf-prazo-anvisa']")!.textContent).toBe("Prazo da ANVISA");
    const celulaMs = campo("pf-ms-anexado").closest("[data-campo-digitavel]")!.parentElement!.parentElement!;
    expect(celulaMs.className).toContain("col-start-1");
    expect(celulaMs.className).toContain("sm:col-start-auto");
    expect(celulaMs.className).toContain("lg:col-start-1");
  });

  it("valor gravado AAAA-MM-DD aparece como DD/MM/AAAA", () => {
    abrir({ ms_anexado_em: "2026-11-10", prazo_anvisa: "2026-11-25" });
    expect(campo("pf-ms-anexado").value).toBe("10/11/2026");
    expect(campo("pf-prazo-anvisa").value).toBe("25/11/2026");
  });

  it("digitar dia/mês: Prazo completa para o futuro, MS para o mais próximo; o patch leva só o que mudou, em ISO", async () => {
    const { f } = abrir();
    await digitar("pf-prazo-anvisa", "1011"); // hoje 17/11/2026, "futuro": 10/11 já passou -> 2027
    await digitar("pf-ms-anexado", "1011"); // "proximo": 10/11/2026
    expect(campo("pf-prazo-anvisa").value).toBe("10/11/2027");
    expect(f.form.prazoAnvisa).toBe("2027-11-10");
    expect(f.form.msAnexadoEm).toBe("2026-11-10");
    expect(f.validarEdicao()).toEqual({
      valido: true,
      patch: { datas: { msAnexadoEm: "2026-11-10", prazoAnvisa: "2027-11-10" }, parcial: true },
    });
  });

  it("limpar um valor gravado vai como null no patch", async () => {
    const { f } = abrir({ prazo_anvisa: "2026-11-25" });
    await digitar("pf-prazo-anvisa", "");
    expect(f.validarEdicao()).toEqual({ valido: true, patch: { datas: { prazoAnvisa: null }, parcial: true } });
  });

  it("buildDatas (criação): vazio = undefined (o servidor grava NULL)", () => {
    const form = { ...formCompleto(), msAnexadoEm: "", prazoAnvisa: "2026-11-25" };
    expect(buildDatas(form)).toMatchObject({ msAnexadoEm: undefined, prazoAnvisa: "2026-11-25" });
  });
});

describe("exibição (painel e detalhe usam camposDatas)", () => {
  it("datas ISO com o ano; as de texto como estão", () => {
    const c = camposDatas({ datas: { msAnexadoEm: "2026-11-10", prazoAnvisa: "2026-11-25", registroLpco: "09/10 - agd." } });
    expect(c.find((x) => x.id === "ms-anexado")?.valor).toBe("10/11/2026");
    expect(c.find((x) => x.id === "prazo-anvisa")?.valor).toBe("25/11/2026");
    expect(c.find((x) => x.id === "registro-lpco")?.valor).toBe("09/10 - agd.");
  });
});
