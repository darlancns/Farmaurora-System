// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import type { NewProcessoDTO, Processo, ProcessoFormPatchPayload } from "#shared/types/processo";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import { controleEntregaAplicavel } from "../../app/utils/processoFormPayload";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { CONSULTORES_FIXTURE } from "./helpers/consultoresFixtures";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Etapa 4: Pagamento da transportadora (pf-transp-pagamento) e DIR e Protocolo (pf-dir-protocolo) no formulário. Só com status
// Entregue e só quando o envio/transportadora os comportam; padrões ao ESCOLHER Entregue (campo vazio); mapeamento do DIR ao trocar
// Courier Simples <-> Formal; patch diferencial só com o que mudou e nunca com controle inaplicável. "Hoje" = 17/11/2026.

vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-17",
}));

const SIMPLES = "Courier Simples";
const FORMAL = "Courier Formal";

const processo = (extra: Record<string, unknown> = {}): Processo =>
  montarProcesso(
    linhaCompleta({ transportadora_nacional_valor: null, companhia_aerea: null, ...extra }) as unknown as FollowUpRow,
  );

let app: App | null = null;
let raiz: HTMLElement | null = null;
interface Saida {
  submit: NewProcessoDTO[];
  update: Array<[string, ProcessoFormPatchPayload]>;
}
let saida: Saida;

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const existe = (id: string) => $(`#${id}`) !== null;

async function esperar(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
  }
}

function abrir(editando: Processo | null): void {
  saida = { submit: [], update: [] };
  raiz = document.createElement("div");
  document.body.appendChild(raiz);
  app = createApp(
    defineComponent({
      setup: () => () =>
        h(ProcessoFormModal, {
          editingProcesso: editando,
          consultores: CONSULTORES_FIXTURE,
          onSubmit: (p: NewProcessoDTO) => saida.submit.push(p),
          onUpdate: (id: string, p: ProcessoFormPatchPayload) => saida.update.push([id, p]),
        }),
    }),
  );
  app.mount(raiz);
}

async function escolher(selectId: string, rotulo: string): Promise<void> {
  $<HTMLButtonElement>(`#${selectId}`)!.click();
  await nextTick();
  [...document.querySelectorAll<HTMLElement>(`#${selectId}-listbox [role='option']`)]
    .find((o) => texto(o) === rotulo)!
    .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await nextTick();
}

async function opcoes(selectId: string): Promise<string[]> {
  $<HTMLButtonElement>(`#${selectId}`)!.click();
  await nextTick();
  const lista = [...document.querySelectorAll<HTMLElement>(`#${selectId}-listbox [role='option']`)].map(texto);
  $<HTMLButtonElement>(`#${selectId}`)!.click(); // fecha
  await nextTick();
  return lista;
}

// O que vai pelo fio (o JSON descarta chaves `undefined`).
const nafio = (corpo: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(corpo)) as Record<string, unknown>;

function digitar(id: string, valor: string): void {
  const campo = $<HTMLInputElement>(`#${id}`)!;
  campo.value = valor;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

const salvar = () => $("#processo-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

async function salvarEConfirmarEntrega(): Promise<void> {
  salvar();
  await esperar();
  $<HTMLButtonElement>("#btn-entrega-confirmar")?.click();
  await esperar();
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
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("controleEntregaAplicavel (regra pura)", () => {
  it("DIR: só Courier Simples/Formal; pagamento: envio que mostra a transportadora E nome AJC/Doctor", () => {
    expect(controleEntregaAplicavel({ modalEnvio: SIMPLES, transportadoraNome: "" }, "dirProtocolo")).toBe(true);
    expect(controleEntregaAplicavel({ modalEnvio: FORMAL, transportadoraNome: "" }, "dirProtocolo")).toBe(true);
    expect(controleEntregaAplicavel({ modalEnvio: "Air Cargo", transportadoraNome: "AJC" }, "dirProtocolo")).toBe(false);
    expect(controleEntregaAplicavel({ modalEnvio: "Courier", transportadoraNome: "AJC" }, "dirProtocolo")).toBe(false);
    expect(controleEntregaAplicavel({ modalEnvio: "Air Cargo", transportadoraNome: "AJC" }, "pagamentoTransportadora")).toBe(true);
    expect(controleEntregaAplicavel({ modalEnvio: FORMAL, transportadoraNome: " doctor " }, "pagamentoTransportadora")).toBe(true);
    expect(controleEntregaAplicavel({ modalEnvio: SIMPLES, transportadoraNome: "AJC" }, "pagamentoTransportadora")).toBe(false); // oculta
    expect(controleEntregaAplicavel({ modalEnvio: "Air Cargo", transportadoraNome: "Braspress" }, "pagamentoTransportadora")).toBe(false);
    expect(controleEntregaAplicavel({ modalEnvio: "", transportadoraNome: "AJC" }, "pagamentoTransportadora")).toBe(true);
  });
});

describe("visibilidade dos selects", () => {
  it("status diferente de Entregue: nenhum select novo (nem em Courier Formal + AJC)", async () => {
    abrir(processo({ status: "liberado", modal_envio: FORMAL, transportadora_nacional_nome: "AJC", companhia_aerea: "DHL" }));
    await esperar();
    expect(existe("pf-transp-pagamento")).toBe(false);
    expect(existe("pf-dir-protocolo")).toBe(false);
  });

  it("Air Cargo + AJC, Entregue: só o Pagamento da transportadora", async () => {
    abrir(processo({ status: "entregue", modal_envio: "Air Cargo", transportadora_nacional_nome: "AJC" }));
    await esperar();
    expect(existe("pf-transp-pagamento")).toBe(true);
    expect(existe("pf-dir-protocolo")).toBe(false);
    expect(texto($("label[for='pf-transp-pagamento']"))).toBe("Pagamento");
    expect($("#pf-transp-pagamento")!.getAttribute("aria-label")).toBe("Pagamento da transportadora");
  });

  it("Courier Simples, Entregue: só o DIR e Protocolo (a transportadora fica oculta, mesmo com Doctor gravado: sem Pagamento)", async () => {
    abrir(processo({ status: "entregue", modal_envio: SIMPLES, transportadora_nacional_nome: "Doctor", companhia_aerea: "DHL" }));
    await esperar();
    expect(existe("pf-transp-pagamento")).toBe(false);
    expect(existe("pf-transp-nome")).toBe(false);
    expect(existe("pf-dir-protocolo")).toBe(true);
    expect(texto($("label[for='pf-dir-protocolo']"))).toBe("DIR e Protocolo");
    expect($("#pf-dir-protocolo")!.getAttribute("aria-label")).toBe("DIR e Protocolo");
  });

  it("Courier Formal + AJC, Entregue: os dois; o rótulo do DIR é só 'DIR'", async () => {
    abrir(processo({ status: "entregue", modal_envio: FORMAL, transportadora_nacional_nome: "AJC", companhia_aerea: "DHL" }));
    await esperar();
    expect(existe("pf-transp-pagamento")).toBe(true);
    expect(existe("pf-dir-protocolo")).toBe(true);
    expect(texto($("label[for='pf-dir-protocolo']"))).toBe("DIR");
  });

  it("outra transportadora, sem nome, envio vazio ou o legado 'Courier': nenhum select aplicável", async () => {
    abrir(processo({ status: "entregue", modal_envio: "Air Cargo", transportadora_nacional_nome: "Braspress" }));
    await esperar();
    expect(existe("pf-transp-pagamento")).toBe(false);
    app!.unmount();
    raiz!.remove();

    abrir(processo({ status: "entregue", modal_envio: "Courier", transportadora_nacional_nome: null, companhia_aerea: null }));
    await esperar();
    expect(existe("pf-transp-pagamento")).toBe(false);
    expect(existe("pf-dir-protocolo")).toBe(false);
  });

  it("o Pagamento aparece/some conforme o NOME digitado (AJC, Doctor, 'Ajc Transportes', outro)", async () => {
    abrir(processo({ status: "entregue", modal_envio: "Air Cargo", transportadora_nacional_nome: "Braspress" }));
    await esperar();
    expect(existe("pf-transp-pagamento")).toBe(false);
    digitar("pf-transp-nome", "Ajc Transportes");
    await esperar();
    expect(existe("pf-transp-pagamento")).toBe(true);
    expect(await opcoes("pf-transp-pagamento")).toEqual(["—", "AJC pendente", "AJC pago"]);
    digitar("pf-transp-nome", "doctor");
    await esperar();
    expect(await opcoes("pf-transp-pagamento")).toEqual(["—", "Doctor pendente", "Doctor pago"]);
    digitar("pf-transp-nome", "Outra");
    await esperar();
    expect(existe("pf-transp-pagamento")).toBe(false);
  });

  it("escolher o status no select mostra/esconde os selects na hora", async () => {
    abrir(processo({ status: "liberado", modal_envio: FORMAL, transportadora_nacional_nome: "AJC", companhia_aerea: "DHL" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    expect(existe("pf-transp-pagamento")).toBe(true);
    expect(existe("pf-dir-protocolo")).toBe(true);
    await escolher("pf-status", "Liberado");
    expect(existe("pf-transp-pagamento")).toBe(false);
    expect(existe("pf-dir-protocolo")).toBe(false);
  });

  it("trocar o envio muda a visibilidade (Air Cargo -> Courier Simples: some o Pagamento, entra o DIR)", async () => {
    abrir(processo({ status: "entregue", modal_envio: "Air Cargo", transportadora_nacional_nome: "AJC" }));
    await esperar();
    await escolher("pf-modal", SIMPLES);
    expect(existe("pf-transp-pagamento")).toBe(false);
    expect(existe("pf-dir-protocolo")).toBe(true);
  });
});

describe("opções", () => {
  it("Courier Simples: '—', 'Pegar DIR e Protocolo', 'DIR no Drive', 'DIR e Protocolo'", async () => {
    abrir(processo({ status: "entregue", modal_envio: SIMPLES, companhia_aerea: "DHL" }));
    await esperar();
    expect(await opcoes("pf-dir-protocolo")).toEqual(["—", "Pegar DIR e Protocolo", "DIR no Drive", "DIR e Protocolo"]);
  });

  it("Courier Formal: '—', 'Pegar DIR', 'DIR no Drive' (NÃO há 'DIR e Protocolo': o protocolo vem da AJC)", async () => {
    abrir(processo({ status: "entregue", modal_envio: FORMAL, companhia_aerea: "DHL" }));
    await esperar();
    const lista = await opcoes("pf-dir-protocolo");
    expect(lista).toEqual(["—", "Pegar DIR", "DIR no Drive"]);
    expect(lista).not.toContain("DIR e Protocolo");
  });

  it("Pagamento: '—', '<Nome> pendente', '<Nome> pago' (AJC e Doctor)", async () => {
    abrir(processo({ status: "entregue", modal_envio: "Air Cargo", transportadora_nacional_nome: "AJC" }));
    await esperar();
    expect(await opcoes("pf-transp-pagamento")).toEqual(["—", "AJC pendente", "AJC pago"]);
  });
});

describe("padrões ao escolher Entregue (só em campo vazio, nunca ao carregar)", () => {
  it("Courier Formal + AJC: pagamento 'AJC pendente' e DIR 'Pegar DIR'", async () => {
    abrir(processo({ status: "liberado", modal_envio: FORMAL, transportadora_nacional_nome: "AJC", companhia_aerea: "DHL" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    expect(texto($("#pf-transp-pagamento"))).toContain("AJC pendente");
    expect(texto($("#pf-dir-protocolo"))).toContain("Pegar DIR");
  });

  it("Courier Simples: DIR 'Pegar DIR e Protocolo'", async () => {
    abrir(processo({ status: "liberado", modal_envio: SIMPLES, companhia_aerea: "DHL" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    expect(texto($("#pf-dir-protocolo"))).toContain("Pegar DIR e Protocolo");
  });

  it("só campo vazio: valores já gravados não são trocados", async () => {
    abrir(
      processo({
        status: "liberado",
        modal_envio: FORMAL,
        transportadora_nacional_nome: "Doctor",
        companhia_aerea: "DHL",
        pagamento_transportadora: "pago",
        dir_protocolo: "dir_no_drive",
      }),
    );
    await esperar();
    await escolher("pf-status", "Entregue");
    expect(texto($("#pf-transp-pagamento"))).toContain("Doctor pago");
    expect(texto($("#pf-dir-protocolo"))).toContain("DIR no Drive");
  });

  it("Entregue ANTIGO (sem valores) carregado: os selects aparecem em branco ('—'), nada é preenchido", async () => {
    abrir(processo({ status: "entregue", modal_envio: FORMAL, transportadora_nacional_nome: "AJC", companhia_aerea: "DHL" }));
    await esperar();
    expect(texto($("#pf-transp-pagamento"))).toContain("—");
    expect(texto($("#pf-dir-protocolo"))).toContain("—");
    // salvar outra coisa não leva os controles
    digitar("pf-awb", "ZZ999999999BR");
    salvar();
    await esperar();
    expect(saida.update).toHaveLength(1);
    expect(saida.update[0]![1]).toEqual({ numeroAwb: "ZZ999999999BR", parcial: true });
  });

  it("sem envio/transportadora aplicáveis: nada é preenchido (Air Cargo + outra transportadora)", async () => {
    abrir(processo({ status: "liberado", modal_envio: "Air Cargo", transportadora_nacional_nome: "Braspress" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    expect(existe("pf-transp-pagamento")).toBe(false);
    expect(existe("pf-dir-protocolo")).toBe(false);
  });

  it("voltar a um status que não é Entregue desfaz os padrões que o formulário pôs (o patch não os leva)", async () => {
    abrir(processo({ status: "liberado", modal_envio: FORMAL, transportadora_nacional_nome: "AJC", companhia_aerea: "DHL" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    await escolher("pf-status", "Desembaraço");
    digitar("pf-awb", "ZZ999999999BR");
    salvar();
    await esperar();
    expect(saida.update[0]![1]).toEqual({ status: "desembaraco", numeroAwb: "ZZ999999999BR", parcial: true });
  });

  it("voltar a outro status NÃO desfaz o que a pessoa mexeu depois do padrão", async () => {
    abrir(processo({ status: "liberado", modal_envio: FORMAL, transportadora_nacional_nome: "AJC", companhia_aerea: "DHL" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    await escolher("pf-dir-protocolo", "DIR no Drive");
    await escolher("pf-status", "Desembaraço");
    await escolher("pf-status", "Entregue"); // de novo: só o vazio ganha padrão (o DIR já tem valor)
    expect(texto($("#pf-dir-protocolo"))).toContain("DIR no Drive");
  });

  it("no Salvar da transição: o que ficou vazio por troca posterior de envio ganha o padrão (o que a tela mostra = o que vai)", async () => {
    abrir(processo({ status: "liberado", modal_envio: "Air Cargo", transportadora_nacional_nome: "Braspress" }));
    await esperar();
    await escolher("pf-status", "Entregue"); // nada se aplica ainda
    await escolher("pf-modal", FORMAL);
    expect(texto($("#pf-dir-protocolo"))).toContain("—"); // a tela ainda não preencheu
    await salvarEConfirmarEntrega();
    expect(saida.update).toHaveLength(1);
    expect(saida.update[0]![1]).toMatchObject({ status: "entregue", modalEnvio: FORMAL, dirProtocolo: "pegar_dir" });
    expect(saida.update[0]![1]).not.toHaveProperty("pagamentoTransportadora");
  });
});

describe("trocar o envio Courier Simples <-> Formal mapeia o DIR salvo", () => {
  it("Simples -> Formal: dir_protocolo vira 'DIR no Drive'; o patch leva o envio e o DIR mapeado", async () => {
    abrir(processo({ status: "entregue", modal_envio: SIMPLES, companhia_aerea: "DHL", dir_protocolo: "dir_protocolo" }));
    await esperar();
    expect(texto($("#pf-dir-protocolo"))).toContain("DIR e Protocolo");
    await escolher("pf-modal", FORMAL);
    expect(texto($("#pf-dir-protocolo"))).toContain("DIR no Drive");
    salvar();
    await esperar();
    expect(saida.update[0]![1]).toEqual({ modalEnvio: FORMAL, dirProtocolo: "dir_no_drive", parcial: true });
  });

  it("Simples -> Formal: pegar_dir_protocolo vira 'Pegar DIR'; dir_no_drive fica igual", async () => {
    abrir(processo({ status: "entregue", modal_envio: SIMPLES, companhia_aerea: "DHL", dir_protocolo: "pegar_dir_protocolo" }));
    await esperar();
    await escolher("pf-modal", FORMAL);
    expect(texto($("#pf-dir-protocolo"))).toContain("Pegar DIR");
    app!.unmount();
    raiz!.remove();

    abrir(processo({ status: "entregue", modal_envio: SIMPLES, companhia_aerea: "DHL", dir_protocolo: "dir_no_drive" }));
    await esperar();
    await escolher("pf-modal", FORMAL);
    salvar();
    await esperar();
    expect(saida.update[0]![1]).toEqual({ modalEnvio: FORMAL, parcial: true }); // o DIR não mudou: não vai
  });

  it("Formal -> Simples: pegar_dir vira 'Pegar DIR e Protocolo'", async () => {
    abrir(processo({ status: "entregue", modal_envio: FORMAL, companhia_aerea: "DHL", dir_protocolo: "pegar_dir" }));
    await esperar();
    await escolher("pf-modal", SIMPLES);
    expect(texto($("#pf-dir-protocolo"))).toContain("Pegar DIR e Protocolo");
    salvar();
    await esperar();
    expect(saida.update[0]![1]).toMatchObject({ modalEnvio: SIMPLES, dirProtocolo: "pegar_dir_protocolo" });
  });

  it("mapeia mesmo fora de Entregue (o servidor confere a combinação ao mudar o envio): o patch leva o DIR mapeado", async () => {
    abrir(processo({ status: "liberado", modal_envio: SIMPLES, companhia_aerea: "DHL", dir_protocolo: "dir_protocolo" }));
    await esperar();
    await escolher("pf-modal", FORMAL);
    salvar();
    await esperar();
    expect(saida.update[0]![1]).toEqual({ modalEnvio: FORMAL, dirProtocolo: "dir_no_drive", parcial: true });
  });

  it("trocar AJC <-> Doctor mantém o valor do pagamento (só o rótulo muda) e nada vai no patch além do nome", async () => {
    abrir(processo({ status: "entregue", modal_envio: "Air Cargo", transportadora_nacional_nome: "AJC", pagamento_transportadora: "pago" }));
    await esperar();
    expect(texto($("#pf-transp-pagamento"))).toContain("AJC pago");
    digitar("pf-transp-nome", "Doctor");
    await esperar();
    expect(texto($("#pf-transp-pagamento"))).toContain("Doctor pago");
    salvar();
    await esperar();
    expect(saida.update[0]![1]).toEqual({ transportadoraNacional: { nome: "Doctor" }, parcial: true });
  });
});

describe("payload diferencial dos controles", () => {
  it("só o que mudou: escolher o DIR leva só o DIR; limpar ('—') leva null", async () => {
    abrir(processo({ status: "entregue", modal_envio: FORMAL, companhia_aerea: "DHL", dir_protocolo: "pegar_dir" }));
    await esperar();
    await escolher("pf-dir-protocolo", "DIR no Drive");
    salvar();
    await esperar();
    expect(saida.update[0]![1]).toEqual({ dirProtocolo: "dir_no_drive", parcial: true });

    await escolher("pf-dir-protocolo", "—");
    salvar();
    await esperar();
    expect(saida.update[1]![1]).toEqual({ dirProtocolo: null, parcial: true });
  });

  it("limpar o pagamento ('—') leva null; escolher 'pago' leva 'pago'", async () => {
    abrir(processo({ status: "entregue", modal_envio: "Air Cargo", transportadora_nacional_nome: "AJC", pagamento_transportadora: "pendente" }));
    await esperar();
    await escolher("pf-transp-pagamento", "AJC pago");
    salvar();
    await esperar();
    expect(saida.update[0]![1]).toEqual({ pagamentoTransportadora: "pago", parcial: true });
    await escolher("pf-transp-pagamento", "—");
    salvar();
    await esperar();
    expect(saida.update[1]![1]).toEqual({ pagamentoTransportadora: null, parcial: true });
  });

  it("não envia controle que não se aplica ao envio/transportadora atuais (o valor gravado só fica oculto)", async () => {
    // DIR gravado, envio trocado para Air Cargo: o DIR não vai
    abrir(processo({ status: "entregue", modal_envio: FORMAL, companhia_aerea: null, dir_protocolo: "pegar_dir", transportadora_nacional_nome: "AJC", pagamento_transportadora: "pago" }));
    await esperar();
    await escolher("pf-modal", "Air Cargo");
    salvar();
    await esperar();
    expect(saida.update[0]![1]).toEqual({ modalEnvio: "Air Cargo", parcial: true });
    app!.unmount();
    raiz!.remove();

    // pagamento gravado, transportadora trocada para outra: o pagamento não vai
    abrir(processo({ status: "entregue", modal_envio: "Air Cargo", transportadora_nacional_nome: "AJC", pagamento_transportadora: "pago" }));
    await esperar();
    digitar("pf-transp-nome", "Braspress");
    await esperar();
    salvar();
    await esperar();
    expect(saida.update[0]![1]).toEqual({ transportadoraNacional: { nome: "Braspress" }, parcial: true });
  });

  it("padrão posto na tela e depois INAPLICÁVEL (envio ou transportadora trocados): o valor mudado não vai (senão 400)", async () => {
    // Formal + AJC vazio -> escolhe Entregue (padrões: pagamento 'pendente' e DIR 'pegar_dir') -> troca para Air Cargo:
    // o DIR deixa de se aplicar (e mudou em relação ao gravado), o pagamento segue valendo.
    abrir(processo({ status: "liberado", modal_envio: FORMAL, transportadora_nacional_nome: "AJC", companhia_aerea: null }));
    await esperar();
    await escolher("pf-status", "Entregue");
    await escolher("pf-modal", "Air Cargo");
    await salvarEConfirmarEntrega();
    expect(saida.update).toHaveLength(1);
    const corpo = nafio(saida.update[0]![1]);
    expect(corpo).toMatchObject({ status: "entregue", modalEnvio: "Air Cargo", pagamentoTransportadora: "pendente" });
    expect(corpo).not.toHaveProperty("dirProtocolo");
    app!.unmount();
    raiz!.remove();

    // Air Cargo + AJC -> Entregue (pagamento 'pendente') -> transportadora vira outra: o pagamento não vai.
    abrir(processo({ status: "liberado", modal_envio: "Air Cargo", transportadora_nacional_nome: "AJC" }));
    await esperar();
    await escolher("pf-status", "Entregue");
    digitar("pf-transp-nome", "Braspress");
    await esperar();
    await salvarEConfirmarEntrega();
    expect(nafio(saida.update[0]![1])).not.toHaveProperty("pagamentoTransportadora");
  });

  it("edição sem mexer nos controles: nenhuma chave de controle no patch", async () => {
    abrir(processo({ status: "entregue", modal_envio: FORMAL, companhia_aerea: "DHL", dir_protocolo: "pegar_dir", transportadora_nacional_nome: "AJC", pagamento_transportadora: "pendente" }));
    await esperar();
    digitar("pf-awb", "ZZ999999999BR");
    salvar();
    await esperar();
    expect(saida.update[0]![1]).toEqual({ numeroAwb: "ZZ999999999BR", parcial: true });
  });
});

describe("criação", () => {
  async function preencherNovo(envio: string, status: string, transportadora = ""): Promise<void> {
    digitar("pf-paciente", "maria");
    await nextTick();
    await escolher("pf-consultor", "Dani");
    await escolher("pf-modal", envio);
    if (envio !== SIMPLES) await escolher("pf-despachante", "Marcelo Lima"); // Air Cargo e Formal exigem o Despachante
    if (transportadora) {
      digitar("pf-transp-nome", transportadora);
      await nextTick();
    }
    await escolher("pf-status", status);
  }

  it("Courier Simples já Entregue: o payload leva o DIR padrão e NÃO leva o pagamento (transportadora oculta)", async () => {
    abrir(null);
    await esperar();
    await preencherNovo(SIMPLES, "Entregue");
    await salvarEConfirmarEntrega();
    expect(saida.submit).toHaveLength(1);
    expect(saida.submit[0]).toMatchObject({ status: "entregue", dirProtocolo: "pegar_dir_protocolo" });
    expect(nafio(saida.submit[0])).not.toHaveProperty("pagamentoTransportadora");
  });

  it("Air Cargo + AJC já Entregue: leva o pagamento 'pendente' e não leva DIR", async () => {
    abrir(null);
    await esperar();
    await preencherNovo("Air Cargo", "Entregue", "AJC");
    await salvarEConfirmarEntrega();
    expect(saida.submit[0]).toMatchObject({ status: "entregue", pagamentoTransportadora: "pendente" });
    expect(nafio(saida.submit[0])).not.toHaveProperty("dirProtocolo");
  });

  it("outro status: nenhum controle no payload; Entregue sem aplicáveis também não", async () => {
    abrir(null);
    await esperar();
    await preencherNovo(SIMPLES, "Em trânsito");
    salvar();
    await esperar();
    expect(nafio(saida.submit[0])).not.toHaveProperty("dirProtocolo");
    expect(nafio(saida.submit[0])).not.toHaveProperty("pagamentoTransportadora");
  });
});

describe("ordem no DOM e regras do formulário (incidente da Etapa D)", () => {
  it("DIR vem DEPOIS do Despachante no fieldset 'Envio e desembaraço'; Pagamento no fieldset 'Transportadora nacional'", async () => {
    abrir(processo({ status: "entregue", modal_envio: FORMAL, transportadora_nacional_nome: "AJC", companhia_aerea: "DHL" }));
    await esperar();
    const fieldsets = [...document.querySelectorAll<HTMLElement>("#processo-form fieldset")];
    const envio = fieldsets.find((f) => texto(f.querySelector("legend")) === "Envio e desembaraço")!;
    const transp = fieldsets.find((f) => texto(f.querySelector("legend")) === "Transportadora nacional")!;
    expect(envio.contains($("#pf-dir-protocolo"))).toBe(true);
    expect(transp.contains($("#pf-transp-pagamento"))).toBe(true);
    const ordem = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(ordem($("#pf-despachante")!, $("#pf-dir-protocolo")!)).toBe(true);
    expect(ordem($("#pf-awb")!, $("#pf-dir-protocolo")!)).toBe(true);
    expect(ordem($("#pf-transp-valor")!, $("#pf-transp-pagamento")!)).toBe(true);
  });

  it("continuam 5 fieldsets; as células novas são filhas da grade do bloco, sem col-span, largura própria nem min-w", async () => {
    abrir(processo({ status: "entregue", modal_envio: FORMAL, transportadora_nacional_nome: "AJC", companhia_aerea: "DHL" }));
    await esperar();
    expect(document.querySelectorAll("#processo-form fieldset")).toHaveLength(5);
    for (const id of ["pf-dir-protocolo", "pf-transp-pagamento"]) {
      const celula = $(`label[for='${id}']`)!.parentElement!; // a célula da grade (rótulo + select)
      const tokens = (celula.getAttribute("class") ?? "").split(/\s+/).filter((c) => !c.includes("[&"));
      expect(tokens.filter((c) => /col-span|(^|:)w-|min-w|order-/.test(c)), id).toEqual([]);
      expect(celula.parentElement!.parentElement!.tagName, id).toBe("FIELDSET"); // célula > grade > fieldset
    }
    expect($("#processo-form > div")!.className).toContain("lg:contents");
  });

  it("no Courier Simples (sem Despachante) o DIR é o item logo depois do Nº AWB na grade; no Formal vem depois do Despachante", async () => {
    abrir(processo({ status: "entregue", modal_envio: SIMPLES, companhia_aerea: "DHL" }));
    await esperar();
    const grade = $("#pf-awb")!.closest("fieldset")!.querySelector("div.grid")!;
    const filhos = [...grade.children].map((c) => c.querySelector("[id]")?.id);
    expect(filhos).toEqual(["pf-modal", "pf-cia-aerea", "pf-awb", "pf-dir-protocolo"]);
    app!.unmount();
    raiz!.remove();

    abrir(processo({ status: "entregue", modal_envio: FORMAL, companhia_aerea: "DHL" }));
    await esperar();
    const grade2 = $("#pf-awb")!.closest("fieldset")!.querySelector("div.grid")!;
    expect([...grade2.children].map((c) => c.querySelector("[id]")?.id)).toEqual([
      "pf-modal",
      "pf-cia-aerea",
      "pf-awb",
      "pf-despachante",
      "pf-dir-protocolo",
    ]);
  });
});

// Correção de layout: Pagamento na linha dos 4 campos da Transportadora e DIR na linha do AWB/Despachante (Courier Formal), só
// em lg+. O happy-dom não calcula layout: aqui ficam as CLASSES da grade (a geometria foi conferida no navegador, Playwright).
describe("layout das grades (lg+): Pagamento na linha da Transportadora e DIR na linha do AWB/Despachante", () => {
  const classes = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  const gradeTransp = () => $("#pf-transp-nome")!.closest("fieldset")!.querySelector("div.grid")!;
  const gradeEnvio = () => $("#pf-awb")!.closest("fieldset")!.querySelector("div.grid")!;
  const AJC = { transportadora_nacional_nome: "AJC", companhia_aerea: "DHL" };

  it("Transportadora: com o Pagamento visível a grade ganha lg:grid-cols-4 (e só isso a mais)", async () => {
    abrir(processo({ status: "entregue", modal_envio: "Air Cargo", transportadora_nacional_nome: "AJC" }));
    await esperar();
    expect(classes(gradeTransp())).toEqual(["grid", "grid-cols-2", "gap-2.5", "sm:grid-cols-3", "lg:grid-cols-4"]);
  });

  it("Transportadora: SEM o Pagamento (outro status, outra transportadora, Entregue antigo sem controle visível) as classes são EXATAMENTE as de antes", async () => {
    const de_antes = ["grid", "grid-cols-2", "gap-2.5", "sm:grid-cols-3"];
    abrir(processo({ status: "liberado", modal_envio: "Air Cargo", transportadora_nacional_nome: "AJC" }));
    await esperar();
    expect(classes(gradeTransp())).toEqual(de_antes);
    app!.unmount();
    raiz!.remove();
    abrir(processo({ status: "entregue", modal_envio: "Air Cargo", transportadora_nacional_nome: "Braspress" }));
    await esperar();
    expect(classes(gradeTransp())).toEqual(de_antes);
  });

  it("Transportadora: o Pagamento é o 4º filho da grade, depois de Nome, Cotação e Valor, sem classe de largura/col-span", async () => {
    abrir(processo({ status: "entregue", modal_envio: "Air Cargo", transportadora_nacional_nome: "AJC" }));
    await esperar();
    expect([...gradeTransp().children].map((c) => c.querySelector("[id]")?.id)).toEqual([
      "pf-transp-nome",
      "pf-transp-cotacao",
      "pf-transp-valor",
      "pf-transp-pagamento",
    ]);
  });

  it("Envio e desembaraço, Courier Formal + Entregue: a grade vira de 6 colunas, com os spans no CONTÊINER (Envio e Cia. 3 cada; AWB, Despachante e DIR 2 cada)", async () => {
    abrir(processo({ status: "entregue", modal_envio: FORMAL, ...AJC }));
    await esperar();
    expect(classes(gradeEnvio())).toEqual([
      "grid",
      "grid-cols-2",
      "gap-2.5",
      "lg:grid-cols-6",
      "lg:[&>*:nth-child(-n+2)]:col-span-3",
      "lg:[&>*:nth-child(n+3)]:col-span-2",
    ]);
    // 5 filhos nesta ordem: os 2 primeiros (3 colunas) e os 3 seguintes (2 colunas) => linha 1: Envio|Cia.; linha 2: AWB|Despachante|DIR
    expect([...gradeEnvio().children].map((c) => c.querySelector("[id]")?.id)).toEqual(["pf-modal", "pf-cia-aerea", "pf-awb", "pf-despachante", "pf-dir-protocolo"]);
    // nenhuma célula carrega col-span próprio além dos que já existiam (Envio e Despachante abaixo de sm: col-span-2 sm:col-span-1)
    for (const id of ["pf-cia-aerea", "pf-awb", "pf-dir-protocolo"]) {
      expect(classes($(`label[for='${id}']`)!.parentElement).filter((c) => /col-span|(^|:)w-|min-w|order-/.test(c) && !c.includes("[&")), id).toEqual([]);
    }
  });

  it("Envio e desembaraço: em TODOS os outros casos a grade é a de sempre (2 colunas): Formal sem DIR, Air Cargo, Courier Simples (DIR à direita do AWB)", async () => {
    const de_sempre = ["grid", "grid-cols-2", "gap-2.5"];
    const casos: Array<Record<string, unknown>> = [
      { status: "liberado", modal_envio: FORMAL, ...AJC }, // Formal, mas não Entregue: sem DIR
      { status: "entregue", modal_envio: "Air Cargo", transportadora_nacional_nome: "AJC" },
      { status: "liberado", modal_envio: "Air Cargo", transportadora_nacional_nome: "AJC" },
      { status: "entregue", modal_envio: SIMPLES, companhia_aerea: "DHL" }, // Simples com DIR: NÃO muda
      { status: "liberado", modal_envio: SIMPLES, companhia_aerea: "DHL" },
    ];
    for (const caso of casos) {
      abrir(processo(caso));
      await esperar();
      expect(classes(gradeEnvio()), JSON.stringify(caso)).toEqual(de_sempre);
      app!.unmount();
      raiz!.remove();
    }
  });

  it("trocar o status/envio na tela liga e desliga as classes da grade na hora", async () => {
    abrir(processo({ status: "liberado", modal_envio: FORMAL, ...AJC }));
    await esperar();
    expect(classes(gradeEnvio())).not.toContain("lg:grid-cols-6");
    expect(classes(gradeTransp())).not.toContain("lg:grid-cols-4");
    await escolher("pf-status", "Entregue");
    expect(classes(gradeEnvio())).toContain("lg:grid-cols-6");
    expect(classes(gradeTransp())).toContain("lg:grid-cols-4");
    await escolher("pf-modal", "Courier Simples"); // sem Despachante nem Transportadora: volta à grade de sempre
    expect(classes(gradeEnvio())).toEqual(["grid", "grid-cols-2", "gap-2.5"]);
  });
});
