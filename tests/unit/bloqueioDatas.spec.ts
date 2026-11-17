// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";
import type { Processo } from "#shared/types/processo";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import PatientForm from "../../app/components/prestacao/PatientForm.vue";
import { criarBloqueioDatas, type CampoDataBloqueavel } from "../../app/composables/useBloqueioDatas";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Decisão da Cris: com algum campo de data em erro ("Data inexistente"/"incompleta"), o Salvar (e o Enter) NÃO
// envia nada — o campo mostra "Corrija ou limpe a data" e recebe o foco. Limpar ou corrigir libera na hora.
// Vale no Follow-Up (Novo e Editar) e na /prestacao.

vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-17",
}));

let app: App | null = null;
let raiz: HTMLElement | null = null;

afterEach(() => {
  app?.unmount();
  raiz?.remove();
  app = null;
  raiz = null;
  document.body.innerHTML = "";
});

async function esperar(): Promise<void> {
  for (let i = 0; i < 4; i++) await nextTick();
}

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Digita no campo de data e sai dele (o ano/erro é decidido ao sair). */
async function digitar(id: string, valor: string): Promise<void> {
  const campo = $<HTMLInputElement>(`#${id}`)!;
  campo.focus();
  campo.dispatchEvent(new FocusEvent("focus"));
  campo.value = valor;
  campo.dispatchEvent(new Event("input"));
  campo.dispatchEvent(new FocusEvent("blur"));
  await esperar();
}

function enviar(seletorForm: string): void {
  $(seletorForm)!.dispatchEvent(new Event("submit", { cancelable: true }));
}

describe("criarBloqueioDatas (registro puro)", () => {
  function campo(erro: boolean, el: Element | null = null) {
    const c = { temErro: () => erro, avisarBloqueio: vi.fn(), focar: vi.fn(), elemento: () => el };
    return c as CampoDataBloqueavel & { avisarBloqueio: ReturnType<typeof vi.fn>; focar: ReturnType<typeof vi.fn> };
  }

  it("sem campo com erro: liberado, ninguém é avisado", () => {
    const b = criarBloqueioDatas();
    const a = campo(false);
    b.registrar(a);
    expect(b.liberado()).toBe(true);
    expect(a.avisarBloqueio).not.toHaveBeenCalled();
  });

  it("com erro: bloqueia, avisa todos os com erro e foca o PRIMEIRO na ordem da tela", () => {
    const pai = document.createElement("div");
    const e1 = pai.appendChild(document.createElement("div"));
    const e2 = pai.appendChild(document.createElement("div"));
    const b = criarBloqueioDatas();
    const segundo = campo(true, e2);
    const primeiro = campo(true, e1);
    const ok = campo(false, e1);
    b.registrar(segundo); // registrado antes, mas vem depois na tela
    b.registrar(primeiro);
    b.registrar(ok);
    expect(b.liberado()).toBe(false);
    expect(primeiro.avisarBloqueio).toHaveBeenCalled();
    expect(segundo.avisarBloqueio).toHaveBeenCalled();
    expect(ok.avisarBloqueio).not.toHaveBeenCalled();
    expect(primeiro.focar).toHaveBeenCalledTimes(1);
    expect(segundo.focar).not.toHaveBeenCalled();
  });

  it("campo removido (desmontado) não bloqueia mais", () => {
    const b = criarBloqueioDatas();
    const sair = b.registrar(campo(true));
    sair();
    expect(b.liberado()).toBe(true);
  });
});

describe("Follow-Up — Editar processo", () => {
  function montarEdicao() {
    const processo: Processo = montarProcesso(linhaCompleta() as unknown as FollowUpRow);
    const eventos = { update: [] as unknown[], unchanged: 0, invalid: [] as string[] };
    raiz = document.createElement("div");
    document.body.appendChild(raiz);
    app = createApp({
      render: () =>
        h(ProcessoFormModal, {
          editingProcesso: processo,
          onUpdate: (_id: string, patch: unknown) => eventos.update.push(patch),
          onUnchanged: () => eventos.unchanged++,
          onInvalid: (m: string) => eventos.invalid.push(m),
        }),
    });
    app.mount(raiz);
    return eventos;
  }

  it("Salvar com data inexistente: não envia, mostra 'Corrija ou limpe a data' e foca o campo", async () => {
    const eventos = montarEdicao();
    await esperar();
    await digitar("pf-chegada", "3104");
    expect(texto($("#pf-chegada-erro"))).toBe("Data inexistente");

    enviar("#processo-form");
    await esperar();
    expect(eventos.update).toEqual([]);
    expect(eventos.unchanged).toBe(0);
    expect(texto($("#pf-chegada-erro"))).toBe("Data inexistente · Corrija ou limpe a data");
    expect(document.activeElement?.id).toBe("pf-chegada");
  });

  it("LIMPAR o campo libera na hora: o aviso some e o Salvar envia", async () => {
    const eventos = montarEdicao();
    await esperar();
    await digitar("pf-chegada", "3104");
    enviar("#processo-form");
    await esperar();

    $<HTMLInputElement>("#pf-chegada")!.dispatchEvent(new FocusEvent("focus"));
    await esperar();
    $<HTMLButtonElement>("#pf-chegada-limpar")!.click();
    await esperar();
    expect($("#pf-chegada-erro")).toBeNull();

    enviar("#processo-form");
    await esperar();
    expect(eventos.update).toEqual([{ datas: { dataChegadaBrasil: null }, parcial: true }]);
  });

  it("CORRIGIR o campo também libera (o ano continua editável)", async () => {
    const eventos = montarEdicao();
    await esperar();
    await digitar("pf-chegada", "3104");
    enviar("#processo-form");
    await esperar();
    await digitar("pf-chegada", "30/04/2026");
    expect($("#pf-chegada-erro")).toBeNull();

    enviar("#processo-form");
    await esperar();
    expect(eventos.update).toEqual([{ datas: { dataChegadaBrasil: "30/04/2026" }, parcial: true }]);
  });

  it("dois campos com erro: os dois avisam e o foco vai ao primeiro da tela", async () => {
    montarEdicao();
    await esperar();
    await digitar("pf-lpco", "22");
    await digitar("pf-data-po", "3104");
    enviar("#processo-form");
    await esperar();
    expect(texto($("#pf-data-po-erro"))).toBe("Data inexistente · Corrija ou limpe a data");
    expect(texto($("#pf-lpco-erro"))).toBe("Data incompleta · Corrija ou limpe a data");
    expect(document.activeElement?.id).toBe("pf-data-po");
  });

  it("Enter no campo inválido: segura o envio e mostra o mesmo aviso", async () => {
    const eventos = montarEdicao();
    await esperar();
    const campo = $<HTMLInputElement>("#pf-chegada")!;
    campo.dispatchEvent(new FocusEvent("focus"));
    campo.value = "3104";
    campo.dispatchEvent(new Event("input"));
    const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    campo.dispatchEvent(enter);
    await esperar();
    expect(enter.defaultPrevented).toBe(true);
    expect(texto($("#pf-chegada-erro"))).toBe("Data inexistente · Corrija ou limpe a data");
    expect(eventos.update).toEqual([]);
  });
});

describe("Follow-Up — Novo processo", () => {
  it("com data em erro, nada é enviado (nem a validação dos outros campos roda)", async () => {
    const eventos = { submit: 0, invalid: [] as string[] };
    raiz = document.createElement("div");
    document.body.appendChild(raiz);
    app = createApp({
      render: () =>
        h(ProcessoFormModal, {
          editingProcesso: null,
          onSubmit: () => eventos.submit++,
          onInvalid: (m: string) => eventos.invalid.push(m),
        }),
    });
    app.mount(raiz);
    await esperar();
    await digitar("pf-previsao", "29022027");
    enviar("#processo-form");
    await esperar();
    expect(eventos).toEqual({ submit: 0, invalid: [] });
    expect(texto($("#pf-previsao-erro"))).toBe("Data inexistente · Corrija ou limpe a data");
    expect(document.activeElement?.id).toBe("pf-previsao");
  });
});

describe("/prestacao — Nova prestação", () => {
  function montarPrestacao() {
    const eventos = { submit: 0, invalid: [] as string[] };
    raiz = document.createElement("div");
    document.body.appendChild(raiz);
    app = createApp({
      render: () =>
        h(PatientForm, {
          editingPatient: null,
          onSubmit: () => eventos.submit++,
          onInvalid: (m: string) => eventos.invalid.push(m),
        }),
    });
    app.mount(raiz);
    return eventos;
  }

  it("data incompleta bloqueia; limpar libera (aí a validação normal do formulário roda)", async () => {
    const eventos = montarPrestacao();
    await esperar();
    await digitar("f-data", "22");
    enviar("#patient-form form");
    await esperar();
    expect(eventos).toEqual({ submit: 0, invalid: [] });
    expect(texto($("#f-data-erro"))).toBe("Data incompleta · Corrija ou limpe a data");
    expect(document.activeElement?.id).toBe("f-data");

    await digitar("f-data", "");
    expect($("#f-data-erro")).toBeNull();
    enviar("#patient-form form");
    await esperar();
    // Liberado: segue para a validação de sempre (aqui, falta o paciente).
    expect(eventos.invalid).toEqual(["Informe o nome do paciente."]);
  });
});
