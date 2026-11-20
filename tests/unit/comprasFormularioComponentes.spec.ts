// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { CamposCompraEditaveis, Compra } from "../../shared/types/compra";
import type { EstadoSalvamento } from "../../app/composables/useCompraEditor";
import CompraBlocoPaciente from "../../app/components/compras/CompraBlocoPaciente.vue";
import CompraFormulario from "../../app/components/compras/CompraFormulario.vue";
import CompraFormCabecalho from "../../app/components/compras/CompraFormCabecalho.vue";
import CompraFaixaConflito from "../../app/components/compras/CompraFaixaConflito.vue";

// Componentes REAIS no happy-dom: o cabeçalho (título, selo, pendências, texto do salvamento, Duplicar/Cancelar), o bloco "Paciente e
// processo", a faixa de conflito e o formulário que renderiza os blocos na ordem de BLOCOS_DA_COMPRA. Dados fictícios (TESTE).

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];
function montar(componente: ReturnType<typeof defineComponent>): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(componente);
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return el;
}
afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);
const qa = <T extends Element>(sel: string) => [...document.querySelectorAll<T>(sel)];

const compra = (extra: Partial<Compra> = {}): Compra => ({
  id: "cmp_13",
  anoMes: "2026-11",
  sequencia: 13,
  cancelada: false,
  paciente: "PACIENTE TESTE",
  processoNumero: "0000000-00.0000.0.00.0000/SP",
  medico: "Dr. Teste",
  localAplicacao: "",
  entrega: "",
  contatos: "",
  termoObservacao: "",
  despachante: "",
  isencaoPara: "",
  observacoes: "",
  vendedor: "Dani",
  responsavel: "Cris",
  compraParticular: false,
  localDeclarado: false,
  termoPosterior: false,
  courierSimples: false,
  isencao: false,
  recorrente: false,
  pagamentoAlvara: null,
  pagamentoMomento: null,
  documentos: null,
  pendencias: [],
  criadoPor: "Cris",
  atualizadoPor: "Cris",
  createdAt: "2026-11-19T12:00:00.000Z",
  updatedAt: "2026-11-19T12:00:00.000Z",
  ordens: [],
  ...extra,
});

const CONSULTORES = [{ nome: "André Vitório" }, { nome: "Dani" }, { nome: "Flávia" }];

// ── O bloco ────────────────────────────────────────────────────────────────────────────────────────────────

function bloco(c: Compra, desabilitado = false) {
  const mudancas: Array<Partial<CamposCompraEditaveis>> = [];
  montar(defineComponent({ render: () => h(CompraBlocoPaciente, { compra: c, desabilitado, consultores: CONSULTORES, onAlterar: (m: Partial<CamposCompraEditaveis>) => mudancas.push(m) }) }));
  return mudancas;
}

function digitar(id: string, valor: string): void {
  const input = q<HTMLInputElement>(`#${id}`)!;
  input.value = valor;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("bloco 'Paciente e processo'", () => {
  it("é um fieldset com a legenda, e os 5 campos + 2 checkboxes com rótulo ligado ao campo (ids fixos)", () => {
    bloco(compra());
    expect(q("fieldset#compra-bloco-paciente")).not.toBeNull();
    expect(texto(q("legend"))).toBe("Paciente e processo");
    const rotulos = Object.fromEntries(qa<HTMLLabelElement>("label").map((l) => [l.htmlFor, texto(l)]));
    expect(rotulos).toMatchObject({
      "compra-paciente": "Paciente",
      "compra-processo": "Nº do processo",
      "compra-medico": "Médico(a)",
      "compra-vendedor": "Vendedor",
      "compra-responsavel": "Responsável",
      "compra-particular": "Compra particular (sem processo)",
      "compra-recorrente": "Recorrente",
    });
    for (const id of ["compra-paciente", "compra-processo", "compra-medico", "compra-responsavel"]) expect(q<HTMLInputElement>(`#${id}`)!.type).toBe("text");
    expect(q<HTMLInputElement>("#compra-particular")!.type).toBe("checkbox");
    expect(q<HTMLInputElement>("#compra-recorrente")!.type).toBe("checkbox");
  });

  it("mostra os valores da compra", () => {
    bloco(compra({ recorrente: true }));
    expect(q<HTMLInputElement>("#compra-paciente")!.value).toBe("PACIENTE TESTE");
    expect(q<HTMLInputElement>("#compra-processo")!.value).toBe("0000000-00.0000.0.00.0000/SP");
    expect(q<HTMLInputElement>("#compra-medico")!.value).toBe("Dr. Teste");
    expect(q<HTMLInputElement>("#compra-responsavel")!.value).toBe("Cris");
    expect(q<HTMLInputElement>("#compra-recorrente")!.checked).toBe(true);
    expect(texto(q("#compra-vendedor"))).toBe("Dani");
  });

  it("os campos de texto avisam a mudança (só o campo que mudou)", () => {
    const m = bloco(compra());
    digitar("compra-paciente", "NOVO PACIENTE TESTE");
    digitar("compra-processo", "123");
    digitar("compra-medico", "Dra. Teste");
    digitar("compra-responsavel", "Bruno");
    expect(m).toEqual([{ paciente: "NOVO PACIENTE TESTE" }, { processoNumero: "123" }, { medico: "Dra. Teste" }, { responsavel: "Bruno" }]);
  });

  it("'Recorrente' avisa true e false", () => {
    const m = bloco(compra());
    const cb = q<HTMLInputElement>("#compra-recorrente")!;
    cb.checked = true;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
    cb.checked = false;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
    expect(m).toEqual([{ recorrente: true }, { recorrente: false }]);
  });

  it("Compra particular marcada: o processo sai VAZIO no mesmo aviso; desmarcada só desliga a flag", () => {
    const m = bloco(compra());
    const cb = q<HTMLInputElement>("#compra-particular")!;
    cb.checked = true;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
    cb.checked = false;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
    expect(m).toEqual([{ compraParticular: true, processoNumero: "" }, { compraParticular: false }]);
  });

  it("com Compra particular, o campo do processo fica desabilitado e vazio (mesmo que haja texto guardado)", () => {
    bloco(compra({ compraParticular: true, processoNumero: "RESTO" }));
    const campo = q<HTMLInputElement>("#compra-processo")!;
    expect(campo.disabled).toBe(true);
    expect(campo.value).toBe("");
    expect(q<HTMLInputElement>("#compra-paciente")!.disabled).toBe(false);
  });

  it("o Vendedor oferece os consultores ativos e escolher avisa o nome", async () => {
    const m = bloco(compra({ vendedor: "" }));
    q<HTMLButtonElement>("#compra-vendedor")!.click();
    await nextTick();
    const opcoes = qa("[role=option]").map((o) => texto(o));
    expect(opcoes).toEqual(["Selecione", "André Vitório", "Dani", "Flávia"]);
    qa<HTMLElement>("[role=option]")[3]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true })); // o AppSelect escolhe no mousedown
    expect(m).toEqual([{ vendedor: "Flávia" }]);
  });

  it("um vendedor que não está na lista ativa (valor antigo) continua aparecendo selecionado", () => {
    bloco(compra({ vendedor: "Flavinha" }));
    expect(texto(q("#compra-vendedor"))).toBe("Flavinha");
  });

  it("DESABILITADO (sócio, mapa 'ver' ou compra cancelada): fieldset desabilitado, aria-disabled e todos os campos desabilitados", () => {
    bloco(compra(), true);
    const fs = q<HTMLFieldSetElement>("#compra-bloco-paciente")!;
    expect(fs.disabled).toBe(true);
    expect(fs.getAttribute("aria-disabled")).toBe("true");
    for (const id of ["compra-paciente", "compra-processo", "compra-medico", "compra-responsavel", "compra-particular", "compra-recorrente", "compra-vendedor"]) {
      expect(q<HTMLInputElement>(`#${id}`)!.disabled, id).toBe(true);
    }
  });

  it("habilitado: sem aria-disabled", () => {
    bloco(compra(), false);
    expect(q("#compra-bloco-paciente")!.getAttribute("aria-disabled")).toBeNull();
    expect(q<HTMLFieldSetElement>("#compra-bloco-paciente")!.disabled).toBe(false);
  });

  it("a ordem do DOM (que é a do Tab): paciente, processo, médico, vendedor, responsável, particular, recorrente", () => {
    bloco(compra());
    const ordem = qa<HTMLElement>("input, button").map((e) => e.id);
    expect(ordem).toEqual(["compra-paciente", "compra-processo", "compra-medico", "compra-vendedor", "compra-responsavel", "compra-particular", "compra-recorrente"]);
  });
});

// ── O cabeçalho ────────────────────────────────────────────────────────────────────────────────────────────

interface PropsCab {
  estado?: EstadoSalvamento;
  salvoEm?: Date | null;
  podeEditar?: boolean;
  cancelada?: boolean;
  pendencias?: number;
  status?: "rascunho" | "pronta" | "parcial" | "encaminhada" | "cancelada";
}
function cabecalho(p: PropsCab = {}) {
  const ev: string[] = [];
  montar(
    defineComponent({
      render: () =>
        h(CompraFormCabecalho, {
          anoMes: "2026-11",
          sequencia: 13,
          status: p.status ?? "rascunho",
          pendencias: p.pendencias ?? 0,
          cancelada: p.cancelada ?? false,
          podeEditar: p.podeEditar ?? true,
          estado: p.estado ?? "ocioso",
          salvoEm: p.salvoEm ?? null,
          onDuplicar: () => ev.push("duplicar"),
          onCancelar: () => ev.push("cancelar"),
          onTentarDeNovo: () => ev.push("de-novo"),
        }),
    }),
  );
  return ev;
}

describe("cabeçalho do formulário", () => {
  it("'Compra 13 - Novembro/2026', o selo e 'N pendências'", () => {
    cabecalho({ status: "pronta", pendencias: 2 });
    expect(texto(q("#compra-titulo"))).toBe("Compra 13 - Novembro/2026");
    expect(q("[data-status]")!.getAttribute("data-status")).toBe("pronta");
    expect(texto(q("#compra-pendencias"))).toBe("2 pendências");
  });

  it("sem pendências não escreve nada", () => {
    cabecalho({ pendencias: 0 });
    expect(q("#compra-pendencias")).toBeNull();
  });

  it("'Salvando…' (um só caractere) enquanto salva ou espera o relógio", () => {
    cabecalho({ estado: "salvando" });
    expect(texto(q("#compra-salvamento"))).toBe("Salvando…");
    document.body.innerHTML = "";
    cabecalho({ estado: "pendente" });
    expect(texto(q("#compra-salvamento"))).toBe("Salvando…");
  });

  it("'Salvo automaticamente às 16:22' com a hora de BRASÍLIA", () => {
    cabecalho({ estado: "salvo", salvoEm: new Date("2026-11-19T19:22:30Z") });
    expect(texto(q("#compra-salvamento"))).toBe("Salvo automaticamente às 16:22");
  });

  it("erro: o botão 'Não foi possível salvar. Tentar de novo' avisa", () => {
    const ev = cabecalho({ estado: "erro" });
    const b = q<HTMLButtonElement>("#compra-salvamento-erro")!;
    expect(b.tagName).toBe("BUTTON");
    expect(texto(b)).toBe("Não foi possível salvar. Tentar de novo");
    b.click();
    expect(ev).toEqual(["de-novo"]);
    expect(q("#compra-salvamento")).toBeNull();
  });

  it("ocioso não escreve texto de salvamento", () => {
    cabecalho({ estado: "ocioso" });
    expect(q("#compra-salvamento")).toBeNull();
    expect(q("#compra-salvamento-erro")).toBeNull();
  });

  it("Duplicar e Cancelar: só para quem edita; clicar avisa", () => {
    const ev = cabecalho();
    expect(texto(q("#btn-duplicar-compra"))).toBe("Duplicar compra");
    expect(texto(q("#btn-cancelar-compra"))).toBe("Cancelar compra");
    q<HTMLButtonElement>("#btn-duplicar-compra")!.click();
    q<HTMLButtonElement>("#btn-cancelar-compra")!.click();
    expect(ev).toEqual(["duplicar", "cancelar"]);
  });

  it("quem só lê (sócio, mapa 'ver') não vê Duplicar nem Cancelar", () => {
    cabecalho({ podeEditar: false });
    expect(q("#btn-duplicar-compra")).toBeNull();
    expect(q("#btn-cancelar-compra")).toBeNull();
  });

  it("compra cancelada: sem Duplicar e sem Cancelar, mesmo para quem edita", () => {
    cabecalho({ podeEditar: true, cancelada: true, status: "cancelada" });
    expect(q("#btn-duplicar-compra")).toBeNull();
    expect(q("#btn-cancelar-compra")).toBeNull();
  });
});

describe("faixa de conflito", () => {
  it("o texto e as DUAS saídas, que avisam", () => {
    const ev: string[] = [];
    montar(defineComponent({ render: () => h(CompraFaixaConflito, { onCarregar: () => ev.push("carregar"), onManter: () => ev.push("manter") }) }));
    expect(texto(q("#compra-faixa-conflito"))).toContain("Esta compra foi alterada por outra pessoa.");
    expect(q("#compra-faixa-conflito")!.getAttribute("role")).toBe("alert");
    expect(texto(q("#btn-conflito-carregar"))).toBe("Carregar a versão salva");
    expect(texto(q("#btn-conflito-manter"))).toBe("Manter as minhas e salvar por cima");
    q<HTMLButtonElement>("#btn-conflito-carregar")!.click();
    q<HTMLButtonElement>("#btn-conflito-manter")!.click();
    expect(ev).toEqual(["carregar", "manter"]);
  });
});

// ── O formulário inteiro ──────────────────────────────────────────────────────────────────────────────────────

function formulario(c: Compra, p: { estado?: EstadoSalvamento; podeEditar?: boolean } = {}) {
  const ev: string[] = [];
  montar(
    defineComponent({
      render: () =>
        h(CompraFormulario, {
          compra: c,
          estado: p.estado ?? "ocioso",
          salvoEm: null,
          podeEditar: p.podeEditar ?? true,
          consultores: CONSULTORES,
          onAlterar: (m: Partial<CamposCompraEditaveis>) => ev.push(`alterar:${JSON.stringify(m)}`),
          onCarregarVersaoSalva: () => ev.push("carregar"),
          onManterMinhas: () => ev.push("manter"),
          onDuplicar: () => ev.push("duplicar"),
          onCancelar: () => ev.push("cancelar"),
        }),
    }),
  );
  return ev;
}

describe("CompraFormulario", () => {
  it("renderiza o cabeçalho e o bloco do paciente; só ele (os outros são da etapa 6b), com a área marcada logo abaixo", () => {
    formulario(compra());
    expect(texto(q("#compra-titulo"))).toBe("Compra 13 - Novembro/2026");
    expect(qa("fieldset")).toHaveLength(1);
    const demais = q("#compra-demais-blocos")!;
    expect(demais.getAttribute("data-etapa")).toBe("6b");
    expect(demais.children).toHaveLength(0);
    // O bloco vem antes da área reservada.
    expect(q("#compra-bloco-paciente")!.compareDocumentPosition(demais) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("o estado e as pendências do cabeçalho vêm da checagem ao vivo (compra incompleta: rascunho com pendências)", () => {
    formulario(compra());
    expect(q("[data-status]")!.getAttribute("data-status")).toBe("rascunho");
    expect(texto(q("#compra-pendencias"))).toMatch(/^\d+ pendências?$/);
  });

  it("os avisos do bloco chegam ao formulário", () => {
    const ev = formulario(compra());
    digitar("compra-paciente", "OUTRO TESTE");
    expect(ev).toEqual([`alterar:${JSON.stringify({ paciente: "OUTRO TESTE" })}`]);
  });

  it("compra cancelada: faixa 'Compra cancelada', campos desabilitados e sem Duplicar", () => {
    formulario(compra({ cancelada: true }));
    expect(texto(q("#compra-faixa-cancelada"))).toBe("Compra cancelada");
    expect(q<HTMLFieldSetElement>("#compra-bloco-paciente")!.disabled).toBe(true);
    expect(q<HTMLInputElement>("#compra-paciente")!.disabled).toBe(true);
    expect(q("#btn-duplicar-compra")).toBeNull();
    expect(q("[data-status]")!.getAttribute("data-status")).toBe("cancelada");
  });

  it("somente leitura (sem permissão): campos desabilitados, sem botões de escrita e sem a faixa de cancelada", () => {
    formulario(compra(), { podeEditar: false });
    expect(q<HTMLFieldSetElement>("#compra-bloco-paciente")!.disabled).toBe(true);
    expect(q("#btn-duplicar-compra")).toBeNull();
    expect(q("#btn-cancelar-compra")).toBeNull();
    expect(q("#compra-faixa-cancelada")).toBeNull();
  });

  it("só no 409 a faixa de conflito aparece, e as duas saídas chegam ao formulário", () => {
    formulario(compra());
    expect(q("#compra-faixa-conflito")).toBeNull();
    document.body.innerHTML = "";
    const ev = formulario(compra(), { estado: "conflito" });
    q<HTMLButtonElement>("#btn-conflito-carregar")!.click();
    q<HTMLButtonElement>("#btn-conflito-manter")!.click();
    expect(ev).toEqual(["carregar", "manter"]);
  });
});
