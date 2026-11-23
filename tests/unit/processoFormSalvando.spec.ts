// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App, type Ref } from "vue";
import type { NewProcessoDTO, Processo, ProcessoFormPatchPayload } from "#shared/types/processo";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import { useConflitoEdicaoProcesso } from "../../app/composables/useConflitoEdicaoProcesso";
import { useProcessos } from "../../app/composables/useProcessos";
import { useTravaEnvio } from "../../app/composables/useTravaEnvio";
import { getErrorMessage } from "../../app/utils/errorMessages";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { CONSULTORES_FIXTURE } from "./helpers/consultoresFixtures";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Proteção contra envio repetido ao criar/editar processo. Componente real (ProcessoFormModal) com a prop `salvando` e,
// à parte, um "harness" que repete a cola de app/pages/processos.vue (useTravaEnvio + addProcesso/salvarEdicao reais;
// só o `fetch` é simulado, com resposta controlada pelo teste). A página em si não é montada em testes unitários.

const V1 = "2026-11-08T10:00:00.000001+00:00";

const processoEditavel = (): Processo =>
  montarProcesso(linhaCompleta({ transportadora_nacional_valor: null, updated_at: V1 }) as unknown as FollowUpRow);

let app: App | null = null;
let raiz: HTMLElement | null = null;

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const salvarBtn = () => $<HTMLButtonElement>("#btn-save-processo")!;
const regiao = () => $("#processo-salvando-anuncio")!;

async function esperar(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
  }
}

function montar(render: () => ReturnType<typeof h>, setup?: () => void): void {
  raiz = document.createElement("div");
  document.body.appendChild(raiz);
  app = createApp(defineComponent({ setup: () => { setup?.(); return render; } }));
  app.mount(raiz);
}

function enviarSubmit(): void {
  $("#processo-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function digitar(id: string, valor: string): void {
  const campo = $<HTMLInputElement>(`#${id}`)!;
  campo.value = valor;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

async function escolherConsultor(nome: string): Promise<void> {
  $<HTMLButtonElement>("#pf-consultor")!.click();
  await nextTick();
  [...document.querySelectorAll<HTMLElement>("#pf-consultor-listbox [role='option']")]
    .find((o) => texto(o) === nome)!
    .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await nextTick();
}

async function preencherNovo(): Promise<void> {
  digitar("pf-paciente", "maria");
  await nextTick();
  await escolherConsultor("Dani");
}

afterEach(() => {
  app?.unmount();
  raiz?.remove();
  app = null;
  raiz = null;
  vi.unstubAllGlobals();
  useProcessos().processos.value = [];
});

// ── Componente: a prop `salvando` ──────────────────────────────────────────────────────────────────────────
describe("ProcessoFormModal — prop salvando", () => {
  interface Saida {
    submit: NewProcessoDTO[];
    update: Array<[string, ProcessoFormPatchPayload]>;
    invalid: string[];
    unchanged: number;
    close: number;
  }
  let saida: Saida;
  const salvando = ref(false);

  function abrir(editando: Processo | null): void {
    saida = { submit: [], update: [], invalid: [], unchanged: 0, close: 0 };
    salvando.value = false;
    montar(() =>
      h(ProcessoFormModal, {
        editingProcesso: editando,
        consultores: CONSULTORES_FIXTURE,
        salvando: salvando.value,
        onSubmit: (p: NewProcessoDTO) => saida.submit.push(p),
        onUpdate: (id: string, p: ProcessoFormPatchPayload) => saida.update.push([id, p]),
        onInvalid: (m: string) => saida.invalid.push(m),
        onUnchanged: () => saida.unchanged++,
        onClose: () => saida.close++,
      }),
    );
  }

  it("normal: botão habilitado, aria-busy=false, região viva montada e vazia", async () => {
    abrir(null);
    await esperar();
    const b = salvarBtn();
    expect(b.disabled).toBe(false);
    expect(b.getAttribute("aria-busy")).toBe("false");
    expect(regiao()).not.toBeNull();
    expect(texto(regiao())).toBe("");
  });

  it("salvando: botão desabilitado, aria-busy=true e a região diz 'Salvando…'; volta ao normal depois", async () => {
    abrir(null);
    await esperar();
    salvando.value = true;
    await esperar();
    expect(salvarBtn().disabled).toBe(true);
    expect(salvarBtn().getAttribute("aria-busy")).toBe("true");
    expect(texto(regiao())).toBe("Salvando…");
    salvando.value = false;
    await esperar();
    expect(salvarBtn().disabled).toBe(false);
    expect(salvarBtn().getAttribute("aria-busy")).toBe("false");
    expect(texto(regiao())).toBe("");
  });

  it("a LARGURA não muda: texto, aria-label, classes de tamanho e filhos do botão idênticos (sem spinner)", async () => {
    for (const editando of [null, processoEditavel()]) {
      abrir(editando);
      await esperar();
      const antes = {
        html: salvarBtn().innerHTML,
        aria: salvarBtn().getAttribute("aria-label"),
        classes: salvarBtn().getAttribute("class"),
      };
      salvando.value = true;
      await esperar();
      expect(salvarBtn().innerHTML, "mesmo conteúdo (texto curto e completo)").toBe(antes.html);
      expect(salvarBtn().getAttribute("aria-label")).toBe(antes.aria);
      expect(salvarBtn().getAttribute("class"), "as classes são estáticas: nada de largura nova ao salvar").toBe(antes.classes);
      expect(salvarBtn().querySelector("svg, [class*='animate-']")).toBeNull();
      app?.unmount();
      raiz?.remove();
    }
  });

  it("estilo do botão desabilitado: opacidade e cursor (sem classe de largura nova)", async () => {
    abrir(null);
    await esperar();
    const cls = (salvarBtn().getAttribute("class") ?? "").split(/\s+/);
    expect(cls).toContain("disabled:opacity-60");
    expect(cls).toContain("disabled:cursor-not-allowed");
    expect(cls.filter((c) => /(^|:)w-|min-w-/.test(c))).toEqual([]);
  });

  it("Enter/submit durante o salvamento é ignorado (criar e editar): nada é emitido, nem aviso de erro", async () => {
    abrir(null);
    await esperar();
    await preencherNovo();
    salvando.value = true;
    await esperar();
    enviarSubmit();
    enviarSubmit();
    await esperar();
    expect(saida.submit).toEqual([]);
    expect(saida.invalid).toEqual([]);
    salvando.value = false;
    await esperar();
    enviarSubmit();
    await esperar();
    expect(saida.submit).toHaveLength(1);
    app?.unmount();
    raiz?.remove();

    abrir(processoEditavel());
    await esperar();
    digitar("pf-awb", "ZZ999999999BR");
    await nextTick();
    salvando.value = true;
    await esperar();
    enviarSubmit();
    await esperar();
    expect(saida.update).toEqual([]);
    expect(saida.unchanged).toBe(0);
    salvando.value = false;
    await esperar();
    enviarSubmit();
    await esperar();
    expect(saida.update).toHaveLength(1);
  });

  it("fechar (X e Cancelar) NÃO é bloqueado durante o salvamento", async () => {
    abrir(null);
    await esperar();
    salvando.value = true;
    await esperar();
    $<HTMLButtonElement>("#btn-close-processo-form")!.click();
    $<HTMLButtonElement>("#btn-cancel-processo")!.click();
    expect(saida.close).toBe(2);
  });

  it("a região fica fora do cabeçalho e do <form>, é sr-only e tem ancestral posicionado (overlay fixed)", async () => {
    abrir(null);
    await esperar();
    const r = regiao();
    expect(r.getAttribute("role")).toBe("status");
    expect(r.getAttribute("aria-live")).toBe("polite");
    expect(r.getAttribute("class")).toContain("sr-only");
    expect($("#processo-form")!.contains(r)).toBe(false);
    const cabecalho = $("#btn-close-processo-form")!.parentElement!;
    expect(cabecalho.contains(r)).toBe(false);
    expect(cabecalho.lastElementChild).toBe($("#btn-close-processo-form"));
    expect(r.closest("[data-overlay='modal']")!.getAttribute("class")).toContain("fixed");
  });
});

// ── Cola da página: trava + criar/editar reais ─────────────────────────────────────────────────────────────
interface Chamada {
  method: string;
  url: string;
  body: Record<string, unknown> | undefined;
  responder: (status: number, corpo: unknown) => void;
}

describe("processos.vue — trava de envio (useTravaEnvio + addProcesso/salvarEdicao)", () => {
  let chamadas: Chamada[] = [];
  let toasts: string[] = [];
  let fechou = 0;
  let editando: Ref<Processo | null>;

  const respostaHttp = (status: number, corpo: unknown): Response =>
    ({ ok: status >= 200 && status < 300, status, json: async () => corpo }) as Response;

  beforeEach(() => {
    chamadas = [];
    toasts = [];
    fechou = 0;
    // Cada chamada fica PENDENTE até o teste responder (resposta atrasada).
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (url: string, opts?: RequestInit) =>
          new Promise<Response>((resolve) => {
            chamadas.push({
              method: opts?.method ?? "GET",
              url,
              body: opts?.body ? (JSON.parse(String(opts.body)) as Record<string, unknown>) : undefined,
              responder: (status, corpo) => resolve(respostaHttp(status, corpo)),
            });
          }),
      ),
    );
  });

  // Mesma cola de processos.vue: handleSubmit/handleUpdate dentro de executarEnvio; :salvando no modal.
  function abrirPagina(editandoInicial: Processo | null): void {
    editando = ref(editandoInicial) as Ref<Processo | null>;
    if (editandoInicial) useProcessos().processos.value = [editandoInicial];
    raiz = document.createElement("div");
    document.body.appendChild(raiz);
    app = createApp(
      defineComponent({
        setup() {
          const { addProcesso } = useProcessos();
          const { conflito, recarregando, salvar } = useConflitoEdicaoProcesso(editando);
          const { emAndamento: salvando, executar: executarEnvio } = useTravaEnvio();
          async function handleSubmit(payload: NewProcessoDTO): Promise<void> {
            await executarEnvio(async () => {
              try {
                await addProcesso(payload);
                toasts.push("Processo adicionado");
                fechou++;
              } catch (e) {
                toasts.push(getErrorMessage(e, "Erro ao adicionar processo"));
              }
            });
          }
          async function handleUpdate(id: string, payload: ProcessoFormPatchPayload): Promise<void> {
            await executarEnvio(async () => {
              try {
                const resultado = await salvar(id, payload);
                if (resultado.tipo === "conflito") return;
                toasts.push("Processo atualizado");
                fechou++;
              } catch (e) {
                toasts.push(getErrorMessage(e, "Erro ao atualizar processo"));
              }
            });
          }
          return () =>
            h(ProcessoFormModal, {
              editingProcesso: editando.value,
              consultores: CONSULTORES_FIXTURE,
              conflito: conflito.value,
              recarregando: recarregando.value,
              salvando: salvando.value,
              onSubmit: handleSubmit,
              onUpdate: handleUpdate,
            });
        },
      }),
    );
    app.mount(raiz);
  }

  const posts = () => chamadas.filter((c) => c.method === "POST");
  const patches = () => chamadas.filter((c) => c.method === "PATCH");

  it("criar: dois submits no MESMO tick geram UMA chamada; o botão fica desabilitado até a resposta", async () => {
    abrirPagina(null);
    await esperar();
    await preencherNovo();

    enviarSubmit();
    enviarSubmit(); // mesmo tick: antes de o Vue re-renderizar
    await esperar();
    expect(posts()).toHaveLength(1);
    expect(salvarBtn().disabled).toBe(true);
    expect(texto(regiao())).toBe("Salvando…");

    enviarSubmit(); // Enter durante o salvamento (já re-renderizado: a prop barra no modal)
    salvarBtn().click(); // clique em botão desabilitado nem dispara o submit
    await esperar();
    expect(posts()).toHaveLength(1);

    posts()[0]!.responder(200, { ...processoEditavel(), id: "proc_novo" });
    await esperar();
    expect(fechou).toBe(1);
    expect(toasts).toEqual(["Processo adicionado"]);
    expect(salvarBtn().disabled).toBe(false);
    expect(texto(regiao())).toBe("");
  });

  it("criar com erro 500: reabilita o botão, mostra o erro e um novo envio faz uma 2ª chamada", async () => {
    abrirPagina(null);
    await esperar();
    await preencherNovo();

    enviarSubmit();
    await esperar();
    expect(salvarBtn().disabled).toBe(true);
    posts()[0]!.responder(500, { statusMessage: "Falha no servidor." });
    await esperar();
    expect(fechou).toBe(0);
    expect(toasts).toHaveLength(1);
    expect(salvarBtn().disabled).toBe(false);
    expect(salvarBtn().getAttribute("aria-busy")).toBe("false");

    enviarSubmit();
    await esperar();
    expect(posts()).toHaveLength(2);
    posts()[1]!.responder(200, { ...processoEditavel(), id: "proc_novo" });
    await esperar();
    expect(fechou).toBe(1);
  });

  it("editar: dois submits no mesmo tick geram UM PATCH (o 2º, que daria 409 espúrio, nem é enviado)", async () => {
    abrirPagina(processoEditavel());
    await esperar();
    const campo = [...document.querySelectorAll<HTMLInputElement>("#processo-form input")].find((i) => i.value === "Enviar laudo")!;
    campo.value = "Enviar laudo e receita";
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();

    enviarSubmit();
    enviarSubmit();
    await esperar();
    expect(patches()).toHaveLength(1);
    expect(patches()[0]!.body).toMatchObject({ versao: V1 });

    patches()[0]!.responder(200, processoEditavel());
    await esperar();
    expect(fechou).toBe(1);
    expect(toasts).toEqual(["Processo atualizado"]);
    expect($("#processo-conflito-aviso")).toBeNull(); // nenhum aviso de conflito
  });

  it("editar com 409 (conflito de verdade): libera a trava, mostra o aviso e deixa salvar de novo", async () => {
    abrirPagina(processoEditavel());
    await esperar();
    const campo = [...document.querySelectorAll<HTMLInputElement>("#processo-form input")].find((i) => i.value === "Enviar laudo")!;
    campo.value = "Outra";
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();

    enviarSubmit();
    await esperar();
    expect(salvarBtn().disabled).toBe(true);
    patches()[0]!.responder(409, { statusMessage: "Este processo foi alterado por outra pessoa." });
    await esperar();
    expect($("#processo-conflito-aviso")).not.toBeNull();
    expect(fechou).toBe(0);
    expect(salvarBtn().disabled).toBe(false);

    enviarSubmit();
    await esperar();
    expect(patches()).toHaveLength(2);
  });
});
