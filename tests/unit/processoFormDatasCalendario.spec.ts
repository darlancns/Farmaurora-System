// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Processo } from "#shared/types/processo";
import ProcessoFormDatas from "../../app/components/processos/ProcessoFormDatas.vue";
import { useProcessoForm } from "../../app/composables/useProcessoForm";
import { buildDatas, validarProcessoForm } from "../../app/utils/processoFormPayload";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { formCompleto, linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Item 4 — as 9 datas do processo vêm do AppDatePicker, agora com ANO AUTOMÁTICO (digitável + calendário).
// Regressão: o patch diferencial leva só a data alterada, valor novo sai "DD/MM/AAAA", valor antigo "DD/MM" só muda
// se for editado, e limpar uma data persiste como vazio sem tocar nas outras 8 (componente → composable → PATCH
// real → "banco" em memória). A digitação em si é coberta em appDatePickerAnoAutomatico.spec.ts.

vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-07",
}));

const h3 = vi.hoisted(() => ({ body: {} as unknown }));
const fake = new FakeSupabase();
vi.mock("h3", async (importOriginal) => {
  const real = await importOriginal<typeof import("h3")>();
  return { ...real, readBody: vi.fn(async () => h3.body), getRouterParam: vi.fn(() => "proc_1") };
});
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));
const { default: handler } = await import("../../server/api/processos/[id].patch");

const IDS = [
  ["pf-data-po", "dataCompraPO", "data_compra_po", "01/09"],
  ["pf-data-embarque", "dataEmbarque", "data_embarque", "05/09"],
  ["pf-thread", "aberturaThread", "abertura_thread", "06/09"],
  ["pf-chegada", "dataChegadaBrasil", "data_chegada_brasil", "10/09"],
  ["pf-radar", "registroRadar", "registro_radar", "11/09"],
  ["pf-duimp", "registroDuimp", "registro_duimp", "12/09"],
  ["pf-lpco", "registroLpco", "registro_lpco", "13/09"],
  ["pf-previsao", "previsaoEntrega", "previsao_entrega", "20/09"],
  ["pf-suposta-estimativa", "supostaEstimativa", "suposta_estimativa", "fim de setembro"],
] as const;

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];
const row = () => fake.linhas("follow_up").find((r) => r.id === "proc_1")!;
const evento = { context: { user: null } } as unknown as Parameters<typeof handler>[0];

// Formulário real (composable) + ProcessoFormDatas ligados como em ProcessoFormModal.vue.
function abrirFormulario(extra: Record<string, unknown> = {}) {
  const processo: Processo = montarProcesso(linhaCompleta(extra) as unknown as FollowUpRow);
  const f = useProcessoForm(() => processo);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () => h(ProcessoFormDatas, { values: f.form, "onUpdate:field": f.onDataFieldChange }),
    }),
  );
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return { f, el };
}

// O campo digitável é um <input>; o texto antigo com anotação continua sendo o botão de antes.
const campo = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLButtonElement;
const dia = (iso: string) => document.querySelector<HTMLButtonElement>(`[data-iso="${iso}"]`);
const acao = (nome: string) => document.querySelector<HTMLButtonElement>(`[data-acao="${nome}"]`);

async function abrir(id: string): Promise<void> {
  (document.getElementById(`${id}-abrir-calendario`) ?? campo(id)).click();
  await nextTick();
  await nextTick();
}

async function salvar(f: ReturnType<typeof useProcessoForm>): Promise<void> {
  const r = f.validarEdicao();
  if (!r.valido) throw new Error(r.erro);
  if (!r.patch) return;
  h3.body = JSON.parse(JSON.stringify(r.patch)); // como na rede
  await handler(evento);
}

beforeEach(() => {
  fake.tabelas.follow_up = [linhaCompleta()];
});

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
});

describe("ProcessoFormDatas com o calendário", () => {
  it("são 9 campos, com os MESMOS ids de antes, na mesma ordem: digitáveis (o texto antigo segue como botão)", () => {
    const { el } = abrirFormulario();
    const ids = Array.from(el.querySelectorAll<HTMLElement>("input[id^='pf-'], button[id^='pf-'][aria-haspopup]"))
      .map((e) => e.id)
      .filter((id) => !id.endsWith("-abrir-calendario"));
    // As 9 de texto + MS Anexado em e Prazo da ANVISA (logo depois do Registro Lpco).
    const nove = IDS.map((i) => i[0] as string);
    expect(ids).toEqual([...nove.slice(0, 7), "pf-ms-anexado", "pf-prazo-anvisa", ...nove.slice(7)]);
    for (const [id, , , valor] of IDS) {
      const c = campo(id);
      if (id === "pf-suposta-estimativa") {
        expect(c.tagName, id).toBe("BUTTON"); // "fim de setembro": texto antigo, mostrado como está
        expect(c.textContent).toContain(valor);
      } else {
        expect(c.tagName, id).toBe("INPUT");
        expect((c as HTMLInputElement).value, id).toBe(valor); // "DD/MM" antigo aparece como está
        expect(c.getAttribute("inputmode"), id).toBe("numeric");
        expect(document.getElementById(`${id}-abrir-calendario`), id).not.toBeNull();
      }
      expect(el.querySelector(`label[for='${id}']`), id).not.toBeNull();
    }
  });

  it("a caixa mantém o tamanho e a fonte dos campos de texto de antes (INPUT_DATA_CLASS)", () => {
    abrirFormulario();
    const classes = campo("pf-data-po").closest("[data-campo-digitavel]")!.className;
    for (const c of ["font-mono", "min-h-11", "text-[16px]", "lg:text-[12.5px]", "px-2.5", "w-full", "border-hairline"]) {
      expect(classes, c).toContain(c);
    }
  });

  it("o texto livre que já existe aparece como está (com o pontinho de atenção); a data limpa não tem marca", () => {
    abrirFormulario();
    expect(campo("pf-suposta-estimativa").hasAttribute("data-texto-antigo")).toBe(true);
    expect(campo("pf-suposta-estimativa").textContent).toContain("fim de setembro");
    expect(campo("pf-data-po").hasAttribute("data-texto-antigo")).toBe(false);
  });
});

describe("payload e patch diferencial", () => {
  it("o payload das datas é o mesmo de antes (texto aparado; vazio vira undefined)", () => {
    const form = { ...formCompleto(), dataEmbarque: "  20/09 ", registroRadar: "", supostaEstimativa: "ASD - agd. decisão" };
    expect(buildDatas(form)).toEqual({
      dataCompraPO: "01/09",
      dataEmbarque: "20/09",
      aberturaThread: "06/09",
      dataChegadaBrasil: "10/09",
      registroRadar: undefined,
      registroDuimp: "12/09",
      registroLpco: "13/09",
      previsaoEntrega: "20/09",
      supostaEstimativa: "ASD - agd. decisão",
    });
    const r = validarProcessoForm(form, [], [], "");
    expect(r.valido && r.payload.datas).toEqual(buildDatas(form));
  });

  it("escolher uma data no calendário leva SÓ essa data no patch", async () => {
    const { f } = abrirFormulario();
    await abrir("pf-previsao");
    dia("2026-09-25")!.click();
    await nextTick();

    expect(f.form.previsaoEntrega).toBe("25/09/2026"); // valor novo: sempre com o ano
    const r = f.validarEdicao();
    expect(r).toEqual({ valido: true, patch: { datas: { previsaoEntrega: "25/09/2026" }, parcial: true } });
  });

  it("data de outro ano vai com o ano (DD/MM/AAAA)", async () => {
    const { f } = abrirFormulario();
    await abrir("pf-data-embarque");
    acao("mes-seguinte")!.click(); // setembro → outubro
    acao("mes-seguinte")!.click();
    acao("mes-seguinte")!.click();
    acao("mes-seguinte")!.click(); // → janeiro/2027
    await nextTick();
    dia("2027-01-15")!.click();
    await nextTick();
    expect(f.form.dataEmbarque).toBe("15/01/2027");
  });

  it("abrir e fechar o calendário sem escolher não altera nada (patch vazio)", async () => {
    const { f } = abrirFormulario();
    await abrir("pf-data-po");
    document.getElementById("pf-data-po-calendario-camada")!.click();
    await nextTick();
    expect(f.validarEdicao()).toEqual({ valido: true, patch: null });
  });

  it("escolher a MESMA data que já estava gravada não altera nada", async () => {
    const { f } = abrirFormulario();
    await abrir("pf-data-po");
    dia("2026-09-01")!.click();
    await nextTick();
    expect(f.form.dataCompraPO).toBe("01/09");
    expect(f.validarEdicao()).toEqual({ valido: true, patch: null });
  });
});

describe("de ponta a ponta com o servidor", () => {
  it("escolher uma data persiste e NÃO mexe nas outras 8", async () => {
    const { f } = abrirFormulario();
    await abrir("pf-data-embarque");
    dia("2026-09-22")!.click();
    await nextTick();
    await salvar(f);

    expect(row().data_embarque).toBe("22/09/2026");
    for (const [, , coluna, original] of IDS) {
      if (coluna !== "data_embarque") expect(row()[coluna], coluna).toBe(original);
    }
  });

  it("LIMPAR uma data persiste como vazio (NULL) e as outras 8 ficam como estavam", async () => {
    const { f } = abrirFormulario();
    await abrir("pf-lpco");
    acao("limpar")!.click();
    await nextTick();
    expect(f.form.registroLpco).toBe("");

    expect(f.validarEdicao()).toEqual({ valido: true, patch: { datas: { registroLpco: null }, parcial: true } });
    await salvar(f);

    expect(row().registro_lpco).toBeNull();
    for (const [, , coluna, original] of IDS) {
      if (coluna !== "registro_lpco") expect(row()[coluna], coluna).toBe(original);
    }
  });

  it("limpar cada uma das 9, uma por vez, nunca afeta as outras", async () => {
    for (const [id, , colunaAlvo] of IDS) {
      fake.tabelas.follow_up = [linhaCompleta()];
      const { f } = abrirFormulario();
      await abrir(id);
      acao("limpar")!.click();
      await nextTick();
      // a "suposta estimativa" é texto antigo: limpar pede confirmação
      document.querySelector<HTMLButtonElement>('[data-acao="confirmar"]')?.click();
      await nextTick();
      await salvar(f);

      expect(row()[colunaAlvo], colunaAlvo).toBeNull();
      for (const [, , coluna, original] of IDS) {
        if (coluna !== colunaAlvo) expect(row()[coluna], `${colunaAlvo} → ${coluna}`).toBe(original);
      }
      const ultimo = montados.pop()!;
      ultimo.unmount();
      ultimo.el.remove();
    }
  });

  it("texto antigo: salvar sem mexer mantém o texto; trocar exige confirmar e então persiste a data nova", async () => {
    fake.tabelas.follow_up = [linhaCompleta({ data_embarque: "26/10 (VCP)" })];
    const { f } = abrirFormulario({ data_embarque: "26/10 (VCP)" });
    expect(campo("pf-data-embarque").textContent).toContain("26/10 (VCP)");

    // sem mexer: nada vai
    expect(f.validarEdicao()).toEqual({ valido: true, patch: null });

    // escolher outra data: pede confirmação e só aplica depois
    await abrir("pf-data-embarque");
    expect(document.querySelector('[data-iso="2026-10-26"]')!.closest("[role=gridcell]")!.getAttribute("aria-selected")).toBe("true");
    dia("2026-10-30")!.click();
    await nextTick();
    expect(f.form.dataEmbarque).toBe("26/10 (VCP)");
    expect(document.getElementById("pf-data-embarque-calendario-confirmacao")!.textContent).toContain("«26/10 (VCP)»");
    acao("confirmar")!.click();
    await nextTick();
    expect(f.form.dataEmbarque).toBe("30/10/2026");
    expect(campo("pf-data-embarque").tagName).toBe("INPUT"); // trocado o texto antigo, o campo vira digitável

    await salvar(f);
    expect(row().data_embarque).toBe("30/10/2026");
  });

  it("texto antigo cancelado: o valor e o banco continuam como estavam", async () => {
    fake.tabelas.follow_up = [linhaCompleta({ data_embarque: "26/10 (VCP)" })];
    const { f } = abrirFormulario({ data_embarque: "26/10 (VCP)" });
    await abrir("pf-data-embarque");
    dia("2026-10-30")!.click();
    await nextTick();
    acao("cancelar")!.click();
    await nextTick();
    expect(f.validarEdicao()).toEqual({ valido: true, patch: null });
    expect(row().data_embarque).toBe("26/10 (VCP)");
  });
});
