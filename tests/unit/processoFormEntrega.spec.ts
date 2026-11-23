// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App, type Ref } from "vue";
import type { NewProcessoDTO, Processo, ProcessoFormPatchPayload } from "#shared/types/processo";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import { useConflitoEdicaoProcesso } from "../../app/composables/useConflitoEdicaoProcesso";
import { useProcessos } from "../../app/composables/useProcessos";
import { useTravaEnvio } from "../../app/composables/useTravaEnvio";
import { precisaConfirmarEntrega } from "../../app/utils/processoFormPayload";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Caminho 3 da regra Entregue: o SALVAR do formulário abre o modal "Confirme a data de entrega" quando o status passa a Entregue
// (edição de um processo que não era Entregue) ou ao criar já Entregue. Escolher o status no select NÃO abre nada. Confirmar
// preenche dataEntrega e só então envia; Cancelar volta ao formulário intacto; já era Entregue: nunca abre. "Hoje" = 17/11/2026.

vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-17",
}));

const processo = (extra: Record<string, unknown> = {}): Processo =>
  montarProcesso(linhaCompleta({ transportadora_nacional_valor: null, ...extra }) as unknown as FollowUpRow);

let app: App | null = null;
let raiz: HTMLElement | null = null;

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const salvarBtn = () => $<HTMLButtonElement>("#btn-save-processo")!;
const modal = () => $("#entrega-modal");
const confirmarBtn = () => $<HTMLButtonElement>("#btn-entrega-confirmar")!;

async function esperar(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
  }
}

function enviarSubmit(): void {
  $("#processo-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function digitar(id: string, valor: string): void {
  const campo = $<HTMLInputElement>(`#${id}`)!;
  campo.value = valor;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

async function escolher(selectId: string, rotulo: string): Promise<void> {
  $<HTMLButtonElement>(`#${selectId}`)!.click();
  await nextTick();
  [...document.querySelectorAll<HTMLElement>(`#${selectId}-listbox [role='option']`)]
    .find((o) => texto(o) === rotulo)!
    .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await nextTick();
}

function esc(): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
}

beforeEach(() => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  );
});
afterEach(() => {
  app?.unmount();
  raiz?.remove();
  app = null;
  raiz = null;
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useProcessos().processos.value = [];
});

// ── Componente real: o que ele emite ─────────────────────────────────────────────────────────────────────
interface Saida {
  submit: NewProcessoDTO[];
  update: Array<[string, ProcessoFormPatchPayload]>;
  invalid: string[];
  unchanged: number;
  close: number;
}
let saida: Saida;

function abrir(editando: Processo | null): void {
  saida = { submit: [], update: [], invalid: [], unchanged: 0, close: 0 };
  raiz = document.createElement("div");
  document.body.appendChild(raiz);
  app = createApp(
    defineComponent({
      setup: () => () =>
        h(ProcessoFormModal, {
          editingProcesso: editando,
          onSubmit: (p: NewProcessoDTO) => saida.submit.push(p),
          onUpdate: (id: string, p: ProcessoFormPatchPayload) => saida.update.push([id, p]),
          onInvalid: (m: string) => saida.invalid.push(m),
          onUnchanged: () => saida.unchanged++,
          onClose: () => saida.close++,
        }),
    }),
  );
  app.mount(raiz);
}

describe("precisaConfirmarEntrega (regra pura)", () => {
  it("só na transição para Entregue: o original não era entregue (ou não existe: criação)", () => {
    expect(precisaConfirmarEntrega("liberado", "entregue")).toBe(true);
    expect(precisaConfirmarEntrega("em_transito", "entregue")).toBe(true);
    expect(precisaConfirmarEntrega(null, "entregue")).toBe(true);
    expect(precisaConfirmarEntrega(undefined, "entregue")).toBe(true);
    expect(precisaConfirmarEntrega("entregue", "entregue")).toBe(false);
    expect(precisaConfirmarEntrega("liberado", "desembaraco")).toBe(false);
    expect(precisaConfirmarEntrega(null, "em_transito")).toBe(false);
    expect(precisaConfirmarEntrega("entregue", "liberado")).toBe(false);
  });
});

describe("edição: Salvar abre o modal só na transição para Entregue", () => {
  it("escolher Entregue no select NÃO abre nada; o Salvar abre o modal e NADA é enviado ainda", async () => {
    abrir(processo({ status: "liberado" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    await esperar();
    expect(modal()).toBeNull(); // só escolher o status não abre

    enviarSubmit();
    await esperar();
    expect(modal()).not.toBeNull();
    expect(saida.update).toEqual([]);
    expect(saida.invalid).toEqual([]);
    expect(texto($("#entrega-titulo"))).toBe("Confirme a data de entrega");
    expect(texto($("#entrega-paciente"))).toBe("Fulano");
    expect(texto($("#entrega-pasta"))).toBe("Pasta 2026 - 1");
    expect($<HTMLInputElement>("#entrega-data")!.value).toBe("17/11/2026"); // hoje
  });

  it("Confirmar envia UM update com status Entregue e a dataEntrega (a escolhida), e fecha o modal", async () => {
    abrir(processo({ status: "liberado" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    enviarSubmit();
    await esperar();
    $<HTMLButtonElement>("#btn-entrega-ontem")!.click();
    await esperar();
    confirmarBtn().click();
    await esperar();

    expect(saida.update).toHaveLength(1);
    expect(saida.update[0]![0]).toBe("proc_1");
    expect(saida.update[0]![1]).toMatchObject({ status: "entregue", datas: { dataEntrega: "2026-11-16" }, parcial: true });
    expect(modal()).toBeNull();
  });

  it("Cancelar: o formulário fica intacto (status e o que foi digitado), nada é enviado e o foco volta ao Salvar", async () => {
    abrir(processo({ status: "liberado" }));
    await esperar();
    digitar("pf-awb", "ZZ999999999BR");
    await escolher("pf-status", "Entregue");
    enviarSubmit();
    await esperar();
    $<HTMLButtonElement>("#btn-entrega-cancelar")!.click();
    await esperar();

    expect(modal()).toBeNull();
    expect(saida.update).toEqual([]);
    expect(saida.unchanged).toBe(0);
    expect(saida.close).toBe(0); // o formulário continua aberto
    expect($<HTMLInputElement>("#pf-awb")!.value).toBe("ZZ999999999BR");
    expect(texto($("#pf-status"))).toContain("Entregue");
    expect(document.activeElement).toBe(salvarBtn());

    // e dá para salvar de novo: o modal volta a abrir
    enviarSubmit();
    await esperar();
    expect(modal()).not.toBeNull();
  });

  it("Esc fecha SÓ o modal da data (o formulário por baixo continua aberto) e o foco volta ao Salvar", async () => {
    abrir(processo({ status: "liberado" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    enviarSubmit();
    await esperar();
    expect(document.activeElement).toBe($("#entrega-data"));

    esc();
    await esperar();
    expect(modal()).toBeNull();
    expect(saida.close).toBe(0);
    expect(saida.update).toEqual([]);
    expect($("#processo-form")).not.toBeNull();
    expect(document.activeElement).toBe(salvarBtn());

    esc(); // sem o modal da data, o Esc volta a ser do formulário
    expect(saida.close).toBe(1);
  });

  it("o modal fica ACIMA do formulário: fora do <form> e do cartão, dentro do overlay, em z-950", async () => {
    abrir(processo({ status: "liberado" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    enviarSubmit();
    await esperar();

    const overlayEntrega = $<HTMLElement>("#entrega-modal-overlay")!;
    const overlayForm = $<HTMLElement>("#processo-form-modal-overlay")!;
    expect(overlayForm.contains(overlayEntrega)).toBe(true);
    expect($("#processo-form")!.contains(overlayEntrega)).toBe(false);
    expect(overlayEntrega.style.zIndex).toBe("950");
    expect(Number(overlayEntrega.style.zIndex)).toBeGreaterThan(900); // o do formulário (BaseModal, z-[900])
    expect(overlayEntrega.parentElement).toBe(overlayForm);
  });

  it("voltando a Entregue com data já gravada: o modal vem com ela; confirmar a MESMA data não a põe no patch", async () => {
    abrir(processo({ status: "liberado", data_entrega: "2026-11-03" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    enviarSubmit();
    await esperar();
    expect($<HTMLInputElement>("#entrega-data")!.value).toBe("03/11/2026");
    confirmarBtn().click();
    await esperar();
    expect(saida.update).toHaveLength(1);
    // a data não mudou (o servidor usa a gravada); o fixture é Air Cargo + AJC, então o padrão do pagamento da transportadora entra
    expect(saida.update[0]![1]).toEqual({ status: "entregue", pagamentoTransportadora: "pendente", parcial: true });
  });

  it("status original já Entregue: o Salvar NÃO abre o modal (com ou sem data de entrega gravada)", async () => {
    for (const extra of [{}, { data_entrega: "2026-11-03" }]) {
      abrir(processo({ status: "entregue", ...extra }));
      await esperar();
      digitar("pf-awb", "ZZ999999999BR");
      enviarSubmit();
      await esperar();
      expect(modal()).toBeNull();
      expect(saida.update).toHaveLength(1);
      expect(saida.update[0]![1]).toEqual({ numeroAwb: "ZZ999999999BR", parcial: true }); // sem dataEntrega no patch
      app!.unmount();
      raiz!.remove();
      app = null;
    }
  });

  it("outros status (e voltar a um status que não é Entregue) não abrem o modal", async () => {
    abrir(processo({ status: "entregue" }));
    await esperar();
    await escolher("pf-status", "Liberado");
    enviarSubmit();
    await esperar();
    expect(modal()).toBeNull();
    expect(saida.update).toHaveLength(1);
    expect(saida.update[0]![1]).toEqual({ status: "liberado", parcial: true });
  });

  it("mudou para Entregue e voltou antes de salvar: não abre", async () => {
    abrir(processo({ status: "liberado" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    await escolher("pf-status", "Liberado");
    digitar("pf-awb", "ZZ999999999BR");
    enviarSubmit();
    await esperar();
    expect(modal()).toBeNull();
    expect(saida.update[0]![1]).toEqual({ numeroAwb: "ZZ999999999BR", parcial: true });
  });

  it("erro de validação (sem consultor) aparece ANTES do modal: nada abre", async () => {
    abrir(processo({ status: "liberado" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    digitar("pf-paciente", "");
    enviarSubmit();
    await esperar();
    expect(saida.invalid).toEqual(["Informe o nome do paciente."]);
    expect(modal()).toBeNull();
    expect(saida.update).toEqual([]);
  });

  it("clique duplo no Salvar abre UM modal só; clique duplo no Confirmar emite UM update", async () => {
    abrir(processo({ status: "liberado" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    enviarSubmit();
    enviarSubmit(); // mesmo tick
    await esperar();
    enviarSubmit(); // Enter com o modal aberto
    await esperar();
    expect(document.querySelectorAll("#entrega-modal")).toHaveLength(1);

    confirmarBtn().click();
    confirmarBtn().click();
    $("#entrega-modal")?.dispatchEvent(new Event("submit", { cancelable: true }));
    await esperar();
    expect(saida.update).toHaveLength(1);
  });
});

describe("criação: Salvar já com status Entregue abre o modal", () => {
  async function preencherNovo(status: string): Promise<void> {
    digitar("pf-paciente", "maria");
    await nextTick();
    await escolher("pf-consultor", "Dani");
    await escolher("pf-status", status);
  }

  it("criar já Entregue: o Salvar abre o modal (data inicial hoje); Confirmar envia UM submit com datas.dataEntrega", async () => {
    abrir(null);
    await esperar();
    await preencherNovo("Entregue");
    enviarSubmit();
    await esperar();
    expect(modal()).not.toBeNull();
    expect(saida.submit).toEqual([]);
    expect($<HTMLInputElement>("#entrega-data")!.value).toBe("17/11/2026");
    expect(texto($("#entrega-paciente"))).toBe("Maria");

    confirmarBtn().click();
    await esperar();
    expect(saida.submit).toHaveLength(1);
    expect(saida.submit[0]).toMatchObject({ status: "entregue", datas: { dataEntrega: "2026-11-17" }, atualizacoes: [] });
  });

  it("criar Entregue e cancelar: nada é enviado e o formulário segue com o que foi digitado", async () => {
    abrir(null);
    await esperar();
    await preencherNovo("Entregue");
    enviarSubmit();
    await esperar();
    $<HTMLButtonElement>("#btn-entrega-cancelar")!.click();
    await esperar();
    expect(saida.submit).toEqual([]);
    expect($<HTMLInputElement>("#pf-paciente")!.value).toBe("Maria");
    expect(document.activeElement).toBe(salvarBtn());
  });

  it("criar com outro status: sem modal, submit direto e SEM dataEntrega", async () => {
    abrir(null);
    await esperar();
    await preencherNovo("Em trânsito");
    enviarSubmit();
    await esperar();
    expect(modal()).toBeNull();
    expect(saida.submit).toHaveLength(1);
    // a chave vai `undefined` no objeto e o JSON do POST a descarta: nada de dataEntrega no corpo
    expect(saida.submit[0]!.datas.dataEntrega).toBeUndefined();
    expect(JSON.parse(JSON.stringify(saida.submit[0]!.datas))).not.toHaveProperty("dataEntrega");
  });
});

// ── Cola da página: a trava de envio (useTravaEnvio) com o fluxo Salvar -> modal -> Confirmar ──────────────────────
describe("processos.vue — trava de envio com o modal da data", () => {
  interface Chamada {
    method: string;
    url: string;
    body: Record<string, unknown> | undefined;
    responder: (status: number, corpo: unknown) => void;
  }
  let chamadas: Chamada[] = [];
  let editando: Ref<Processo | null>;

  beforeEach(() => {
    chamadas = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (url: string, opts?: RequestInit) =>
          new Promise<Response>((resolve) => {
            chamadas.push({
              method: opts?.method ?? "GET",
              url,
              body: opts?.body ? (JSON.parse(String(opts.body)) as Record<string, unknown>) : undefined,
              responder: (status, corpo) =>
                resolve({ ok: status >= 200 && status < 300, status, json: async () => corpo } as Response),
            });
          }),
      ),
    );
  });

  // Mesma cola de processos.vue: handleUpdate dentro de executarEnvio; :salvando no formulário.
  function abrirPagina(inicial: Processo): void {
    editando = ref(inicial) as Ref<Processo | null>;
    useProcessos().processos.value = [inicial];
    raiz = document.createElement("div");
    document.body.appendChild(raiz);
    app = createApp(
      defineComponent({
        setup() {
          const { conflito, recarregando, salvar } = useConflitoEdicaoProcesso(editando);
          const { emAndamento: salvando, executar: executarEnvio } = useTravaEnvio();
          async function handleUpdate(id: string, payload: ProcessoFormPatchPayload): Promise<void> {
            await executarEnvio(async () => {
              await salvar(id, payload).catch(() => undefined);
            });
          }
          return () =>
            h(ProcessoFormModal, {
              editingProcesso: editando.value,
              conflito: conflito.value,
              recarregando: recarregando.value,
              salvando: salvando.value,
              onUpdate: handleUpdate,
            });
        },
      }),
    );
    app.mount(raiz);
  }

  it("Salvar duplo + Confirmar duplo (mesmo tick e com a resposta pendente) = UM PATCH, com status e dataEntrega", async () => {
    abrirPagina(processo({ status: "liberado" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    enviarSubmit();
    enviarSubmit();
    await esperar();
    expect(chamadas).toHaveLength(0); // nada enviado antes do Confirmar

    confirmarBtn().click();
    confirmarBtn().click();
    await esperar();
    enviarSubmit(); // Enter durante o salvamento
    await esperar();
    const patches = chamadas.filter((c) => c.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0]!.url).toBe("/api/processos/proc_1");
    expect(patches[0]!.body).toMatchObject({ status: "entregue", datas: { dataEntrega: "2026-11-17" }, parcial: true });
    expect(salvarBtn().disabled).toBe(true);

    patches[0]!.responder(200, { ...processo({ status: "entregue", data_entrega: "2026-11-17" }) });
    await esperar();
    expect(salvarBtn().disabled).toBe(false);
  });

  it("erro 400 do servidor (ex.: data futura): o formulário segue aberto e o botão volta a habilitar", async () => {
    abrirPagina(processo({ status: "liberado" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    enviarSubmit();
    await esperar();
    confirmarBtn().click();
    await esperar();
    chamadas[0]!.responder(400, { statusMessage: "Data de entrega: não pode ser uma data futura." });
    await esperar();
    expect($("#processo-form")).not.toBeNull();
    expect(modal()).toBeNull();
    expect(salvarBtn().disabled).toBe(false);
  });
});
