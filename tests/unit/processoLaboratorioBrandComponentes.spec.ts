// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Medicamento, NewProcessoDTO, Processo, ProcessoFormPatchPayload } from "#shared/types/processo";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import { CONSULTORES_FIXTURE } from "./helpers/consultoresFixtures";
import ProcessoPainel from "../../app/components/processos/ProcessoPainel.vue";
import ProcessoDetail from "../../app/components/processos/ProcessoDetail.vue";
import ProcessoKanbanCard from "../../app/components/processos/ProcessoKanbanCard.vue";
import ProcessoRow from "../../app/components/processos/ProcessoRow.vue";
import { instalarPrimeiraMaiuscula } from "../../app/utils/primeiraMaiuscula";
import { focaveis, itensMedicamentos } from "../../app/utils/processoPainel";
import { contarProcessosPorPasta } from "../../app/utils/remessaNaLinha";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";
import { capitalizarIniciais, normalizarLaboratorio } from "#shared/utils/laboratorio";
import { medicamentosCanonicos } from "../../server/utils/processoValidation";

// Laboratório e Brand por medicamento — formulário (Novo/Editar), painel lateral e detalhe da Lista. Componentes reais
// no happy-dom, com o plugin global de primeira maiúscula instalado como no app.

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];
let desinstalar: (() => void) | null = null;

beforeEach(() => {
  desinstalar = instalarPrimeiraMaiuscula(document);
});

afterEach(() => {
  desinstalar?.();
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

function montar(render: () => ReturnType<typeof h>): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(defineComponent({ render }));
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return el;
}

interface Saida {
  criados: NewProcessoDTO[];
  atualizacoes: ProcessoFormPatchPayload[];
}

function abrirEdicao(medicamentos: unknown[]): { el: HTMLElement; saida: Saida } {
  const processo: Processo = montarProcesso(linhaCompleta({ medicamentos }) as unknown as FollowUpRow);
  const saida: Saida = { criados: [], atualizacoes: [] };
  const el = montar(() =>
    h(ProcessoFormModal, {
      editingProcesso: processo,
      onUpdate: (_id: string, patch: ProcessoFormPatchPayload) => saida.atualizacoes.push(patch),
    }),
  );
  return { el, saida };
}

function abrirNovo(): { el: HTMLElement; saida: Saida } {
  const saida: Saida = { criados: [], atualizacoes: [] };
  const el = montar(() => h(ProcessoFormModal, { onSubmit: (p: NewProcessoDTO) => saida.criados.push(p), consultores: CONSULTORES_FIXTURE }));
  return { el, saida };
}

async function digitar(el: HTMLElement, id: string, valor: string): Promise<HTMLInputElement> {
  const campo = el.querySelector<HTMLInputElement>(`#${id}`)!;
  campo.value = valor;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  return campo;
}

async function sair(campo: HTMLElement): Promise<void> {
  campo.dispatchEvent(new Event("blur"));
  await nextTick();
}

async function escolherBrand(el: HTMLElement, index: number, rotulo: string): Promise<void> {
  el.querySelector<HTMLButtonElement>(`#pf-medicamento-brand-${index}`)!.click();
  await nextTick();
  const opcao = [...el.querySelectorAll<HTMLElement>(`#pf-medicamento-brand-${index}-listbox [role='option']`)].find(
    (o) => texto(o) === rotulo,
  )!;
  expect(opcao, rotulo).toBeTruthy();
  opcao.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await nextTick();
}

function salvar(el: HTMLElement): void {
  el.querySelector("#processo-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

describe("formulário — linha Laboratório / Brand abaixo de cada medicamento", () => {
  it("ids novos e estáveis, rótulos associados (label/for) e os ids antigos intactos", async () => {
    const { el } = abrirEdicao([{ nome: "A" }, { nome: "B" }]);
    await nextTick();
    for (const i of [0, 1]) {
      expect(el.querySelector(`#pf-medicamento-quantidade-${i}`)).not.toBeNull();
      expect(el.querySelector(`#pf-medicamento-nome-${i}`)).not.toBeNull();
      expect(texto(el.querySelector(`label[for='pf-medicamento-laboratorio-${i}']`))).toBe("Laboratório");
      expect(texto(el.querySelector(`label[for='pf-medicamento-brand-${i}']`))).toBe("Brand");
      expect(el.querySelector(`#pf-medicamento-laboratorio-${i}`)!.tagName).toBe("INPUT");
      expect(el.querySelector(`#pf-medicamento-brand-${i}`)!.tagName).toBe("BUTTON"); // AppSelect
    }
    const lab = el.querySelector<HTMLInputElement>("#pf-medicamento-laboratorio-0")!;
    expect(lab.maxLength).toBe(120);
    expect(lab.hasAttribute("data-sem-maiuscula")).toBe(true);
    // Brand: "Selecione" quando vazio; opções Selecione / Bioequivalente / Referência.
    expect(texto(el.querySelector("#pf-medicamento-brand-0"))).toBe("Selecione");
    el.querySelector<HTMLButtonElement>("#pf-medicamento-brand-0")!.click();
    await nextTick();
    expect([...el.querySelectorAll("#pf-medicamento-brand-0-listbox [role='option']")].map(texto)).toEqual([
      "Selecione",
      "Bioequivalente",
      "Referência",
    ]);
  });

  it("Tab segue o DOM: Qtd, Medicamento, (✕), +, Laboratório, Brand, próximo medicamento...", async () => {
    const { el } = abrirEdicao([{ nome: "A" }, { nome: "B" }]);
    await nextTick();
    const fieldset = el.querySelector("#pf-medicamento-nome-0")!.closest("fieldset")!;
    const nomes = focaveis(fieldset as HTMLElement).map((n) => n.id || n.getAttribute("title"));
    expect(nomes).toEqual([
      "pf-medicamento-quantidade-0",
      "pf-medicamento-nome-0",
      "pf-medicamento-laboratorio-0",
      "pf-medicamento-brand-0",
      "pf-medicamento-quantidade-1",
      "pf-medicamento-nome-1",
      "Remover medicamento",
      "Adicionar medicamento",
      "pf-medicamento-laboratorio-1",
      "pf-medicamento-brand-1",
      "pf-local-entrega",
    ]);
  });

  it("a linha nova fica DENTRO do item (abaixo da linha Qtd. + Medicamento), sem order-*, sem float, sem largura fixa que force rolagem", async () => {
    const { el } = abrirEdicao([{ nome: "A" }]);
    await nextTick();
    const linha1 = el.querySelector("#pf-medicamento-quantidade-0")!.parentElement!.parentElement!;
    const extra = el.querySelector("#pf-medicamento-laboratorio-0")!.closest("[data-medicamento-extra]")!;
    expect(extra.previousElementSibling).toBe(linha1); // logo abaixo da linha do medicamento (e do "+")
    expect(extra.parentElement).toBe(linha1.parentElement); // mesmo item
    const classes = (extra.getAttribute("class") ?? "").split(/\s+/);
    expect(classes).toContain("grid-cols-1"); // celular: empilhados
    expect(classes).toContain("sm:grid-cols-[minmax(0,1fr)_11.5rem]"); // Laboratório flexível, Brand 11.5rem à direita
    for (const n of [extra, ...extra.querySelectorAll("*")]) {
      const tokens = (n.getAttribute("class") ?? "").split(/\s+/);
      expect(tokens.filter((t) => /(^|[:!])-?order-/.test(t) || /(^|:)float-/.test(t) || /(^|:)min-w-min$/.test(t))).toEqual([]);
      expect(tokens.filter((t) => /(^|:)w-\[/.test(t))).toEqual([]);
    }
  });

  it("'+' traz a linha do novo medicamento; remover o medicamento remove a linha toda", async () => {
    const { el } = abrirEdicao([{ nome: "A", laboratorio: "EMS", brand: "referencia" }, { nome: "B", laboratorio: "Teuto", brand: "" }]);
    await nextTick();
    el.querySelector<HTMLButtonElement>("#processo-form button[title='Adicionar medicamento']")!.click();
    await nextTick();
    expect(el.querySelector("#pf-medicamento-laboratorio-2")).not.toBeNull();
    expect(el.querySelector("#pf-medicamento-brand-2")).not.toBeNull();
    expect(el.querySelector<HTMLInputElement>("#pf-medicamento-laboratorio-2")!.value).toBe("");
    // Remove o item 1 (B): o C vira o índice 1 e não sobra linha órfã.
    el.querySelectorAll<HTMLButtonElement>("#processo-form button[title='Remover medicamento']")[0]!.click();
    await nextTick();
    expect(el.querySelectorAll("[data-medicamento-extra]")).toHaveLength(2);
    expect(el.querySelector("#pf-medicamento-laboratorio-2")).toBeNull();
    expect(el.querySelector<HTMLInputElement>("#pf-medicamento-laboratorio-0")!.value).toBe("EMS");
    expect(el.querySelector<HTMLInputElement>("#pf-medicamento-laboratorio-1")!.value).toBe("");
  });

  it("Laboratório ao sair do campo: normalização completa (trim, espaços, iniciais) e siglas intactas", async () => {
    const { el } = abrirEdicao([{ nome: "A" }]);
    await nextTick();
    const lab = await digitar(el, "pf-medicamento-laboratorio-0", "bristol-myers   squibb ");
    expect(lab.value).toBe("Bristol-Myers   Squibb "); // ao digitar: só as iniciais
    await sair(lab);
    expect(lab.value).toBe("Bristol-Myers Squibb");
    const sigla = await digitar(el, "pf-medicamento-laboratorio-0", "  EMS  ");
    await sair(sigla);
    expect(sigla.value).toBe("EMS");
  });

  it("o campo continua fora do plugin global de maiúscula (data-sem-maiuscula)", async () => {
    const { el } = abrirEdicao([{ nome: "A" }]);
    await nextTick();
    expect(el.querySelector("#pf-medicamento-laboratorio-0")!.hasAttribute("data-sem-maiuscula")).toBe(true);
  });

  it("Editar com vários medicamentos: patch leva a lista com laboratório normalizado e brand (um completo, um só laboratório, um vazio)", async () => {
    const { el, saida } = abrirEdicao([{ nome: "A", quantidade: "1" }, { nome: "B" }, { nome: "C", dosagem: "5mg" }]);
    await nextTick();
    const longo = "laboratório farmacêutico do estado de pernambuco governador miguel arraes lafepe";
    await digitar(el, "pf-medicamento-laboratorio-0", longo);
    // Sem blur: a normalização também acontece ao montar o payload.
    await escolherBrand(el, 0, "Referência");
    await digitar(el, "pf-medicamento-laboratorio-1", "teuto brasileiro");
    salvar(el);
    expect(saida.atualizacoes).toHaveLength(1);
    const patch = saida.atualizacoes[0]!;
    expect(patch.medicamentos).toEqual([
      {
        nome: "A",
        quantidade: "1",
        laboratorio: "Laboratório Farmacêutico Do Estado De Pernambuco Governador Miguel Arraes Lafepe",
        brand: "referencia",
      },
      { nome: "B", laboratorio: "Teuto Brasileiro", brand: "" },
      { nome: "C", dosagem: "5mg", laboratorio: "", brand: "" },
    ]);
    expect(patch.versao).toBeTruthy();
  });

  it("Editar: trocar só o Brand envia a lista; abrir e salvar sem mexer não envia nada", async () => {
    const itens = [{ nome: "A", laboratorio: "EMS", brand: "bioequivalente" }];
    const sem = abrirEdicao(itens);
    await nextTick();
    salvar(sem.el);
    expect(sem.saida.atualizacoes).toHaveLength(0);

    const com = abrirEdicao(itens);
    await nextTick();
    await escolherBrand(com.el, 0, "Selecione"); // limpar
    salvar(com.el);
    expect(com.saida.atualizacoes[0]!.medicamentos).toEqual([{ nome: "A", laboratorio: "EMS", brand: "" }]);
  });

  it("Novo processo: payload com laboratório e brand por item", async () => {
    const { el, saida } = abrirNovo();
    await nextTick();
    await digitar(el, "pf-paciente", "maria");
    el.querySelector<HTMLButtonElement>("#pf-consultor")!.click();
    await nextTick();
    [...el.querySelectorAll<HTMLElement>("#pf-consultor-listbox [role='option']")]
      .find((o) => texto(o) === "Dani")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await nextTick();
    await digitar(el, "pf-medicamento-nome-0", "keytruda");
    await digitar(el, "pf-medicamento-laboratorio-0", "msd");
    await escolherBrand(el, 0, "Bioequivalente");
    el.querySelector<HTMLButtonElement>("#processo-form button[title='Adicionar medicamento']")!.click();
    await nextTick();
    await digitar(el, "pf-medicamento-nome-1", "opdivo");
    salvar(el);
    expect(saida.criados).toHaveLength(1);
    expect(saida.criados[0]!.medicamentos).toEqual([
      { nome: "KEYTRUDA", laboratorio: "Msd", brand: "bioequivalente" },
      { nome: "OPDIVO", laboratorio: "", brand: "" },
    ]);
  });
});

function proc(medicamentos: Medicamento[]): Processo {
  return montarProcesso(linhaCompleta({ id: "p1", medicamentos }) as unknown as FollowUpRow);
}

const ITENS: Medicamento[] = [
  { nome: "KEYTRUDA", quantidade: "2", laboratorio: "MSD", brand: "referencia" },
  { nome: "OPDIVO", laboratorio: "Bristol-Myers Squibb", brand: "" },
  { nome: "YERVOY", laboratorio: "", brand: "bioequivalente" },
  { nome: "ZOLGENSMA", laboratorio: "", brand: "" },
];

describe("painel lateral — 'Laboratório · Brand' abaixo de cada medicamento, só com valor", () => {
  it("itensMedicamentos: os dois, só um, nenhum (sem '·' sobrando)", () => {
    expect(itensMedicamentos(ITENS).map((i) => i.extra)).toEqual(["MSD · Referência", "Bristol-Myers Squibb", "Bioequivalente", ""]);
  });

  it("componente: a linha extra só aparece nos itens com valor", async () => {
    const p = proc(ITENS);
    const el = montar(() => h(ProcessoPainel, { processo: p, contagemPasta: contarProcessosPorPasta([p]) }));
    await nextTick();
    expect(texto(el.querySelector("#painel-medicamento-extra-0"))).toBe("MSD · Referência");
    expect(texto(el.querySelector("#painel-medicamento-extra-1"))).toBe("Bristol-Myers Squibb");
    expect(texto(el.querySelector("#painel-medicamento-extra-2"))).toBe("Bioequivalente");
    expect(el.querySelector("#painel-medicamento-extra-3")).toBeNull();
    const bloco = el.querySelector("#painel-medicamentos");
    expect(bloco, "o bloco de medicamentos do cabeçalho existe").not.toBeNull();
    expect(texto(bloco)).not.toMatch(/·\s*$|^\s*·|· ·/);
  });

  it("processo antigo (itens sem os campos): nenhuma linha extra", async () => {
    const p = montarProcesso(linhaCompleta({ id: "p1", medicamentos: [{ nome: "A" }, { nome: "B", quantidade: "1" }] }) as unknown as FollowUpRow);
    const el = montar(() => h(ProcessoPainel, { processo: p, contagemPasta: contarProcessosPorPasta([p]) }));
    await nextTick();
    expect(el.querySelectorAll("[id^='painel-medicamento-extra-']")).toHaveLength(0);
  });
});

describe("detalhe da Lista (ProcessoDetail)", () => {
  it("com laboratório/brand: um medicamento por linha e, abaixo, só o que houver", async () => {
    const el = montar(() => h(ProcessoDetail, { processo: proc(ITENS) }));
    await nextTick();
    expect(texto(el.querySelector("#detalhe-medicamento-extra-p1-0"))).toBe("MSD · Referência");
    expect(texto(el.querySelector("#detalhe-medicamento-extra-p1-1"))).toBe("Bristol-Myers Squibb");
    expect(texto(el.querySelector("#detalhe-medicamento-extra-p1-2"))).toBe("Bioequivalente");
    expect(el.querySelector("#detalhe-medicamento-extra-p1-3")).toBeNull();
  });

  it("sem nenhum laboratório/brand: exatamente como antes (uma linha, ' e ')", async () => {
    const el = montar(() =>
      h(ProcessoDetail, { processo: proc([{ nome: "A", quantidade: "1", laboratorio: "", brand: "" }, { nome: "B", laboratorio: "", brand: "" }]) }),
    );
    await nextTick();
    expect(el.querySelector("[id^='detalhe-medicamento-extra-']")).toBeNull();
    const bloco = [...el.querySelectorAll("span")].find((s) => texto(s) === "Medicamentos:")!.parentElement!;
    expect(bloco.querySelector("ul")).toBeNull();
    expect(texto(bloco)).toBe("Medicamentos: A 1 e B");
  });
});

describe("card do Kanban e Lista NÃO mostram laboratório nem brand", () => {
  it("card", async () => {
    const el = montar(() => h(ProcessoKanbanCard, { processo: proc(ITENS) }));
    await nextTick();
    expect(texto(el)).not.toContain("MSD");
    expect(texto(el)).not.toContain("Referência");
    expect(texto(el)).not.toContain("Bioequivalente");
  });

  it("linha da Lista", async () => {
    const p = proc(ITENS);
    const el = montar(() => h(ProcessoRow, { processo: p, contagemPasta: contarProcessosPorPasta([p]) }));
    await nextTick();
    expect(texto(el)).not.toContain("Bristol");
    expect(texto(el)).not.toContain("Referência");
  });
});

// ── Laboratório AO DIGITAR: 1ª letra de cada palavra maiúscula, resto intacto, cursor no lugar ──────────────────────────
// Simula o navegador: o valor do campo já contém a edição e a seleção está onde a pessoa deixou; então dispara o input.
async function editarComCursor(
  campo: HTMLInputElement,
  valor: string,
  cursor: number,
  opcoes: { compondo?: boolean } = {},
): Promise<void> {
  campo.value = valor;
  campo.setSelectionRange(cursor, cursor);
  campo.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: opcoes.compondo ?? false }));
  await nextTick();
}

async function campoLaboratorio(): Promise<{ el: HTMLElement; lab: HTMLInputElement; saida: Saida }> {
  const { el, saida } = abrirEdicao([{ nome: "A" }]);
  await nextTick();
  return { el, lab: el.querySelector<HTMLInputElement>("#pf-medicamento-laboratorio-0")!, saida };
}

describe("Laboratório ao digitar (evento input)", () => {
  it("digitando no FIM, letra por letra: iniciais maiúsculas na hora, o espaço do fim NÃO some e o cursor fica no fim", async () => {
    const { lab } = await campoLaboratorio();
    const esperado = ["T", "Te", "Teu", "Teut", "Teuto", "Teuto ", "Teuto B", "Teuto Br"];
    for (const [i, letra] of [..."teuto br"].entries()) {
      const texto = lab.value + letra;
      await editarComCursor(lab, texto, texto.length);
      expect(lab.value).toBe(esperado[i]);
      expect(lab.selectionStart).toBe(texto.length);
      expect(lab.selectionEnd).toBe(texto.length);
    }
  });

  it("siglas com Caps Lock/Shift ficam exatamente como digitadas: EMS, MSD, GSK (o resto da palavra nunca é alterado)", async () => {
    const { lab } = await campoLaboratorio();
    for (const sigla of ["EMS", "MSD", "GSK"]) {
      for (let i = 1; i <= sigla.length; i++) await editarComCursor(lab, sigla.slice(0, i), i);
      expect(lab.value).toBe(sigla);
    }
    await editarComCursor(lab, "ems", 3);
    expect(lab.value).toBe("Ems");
    await editarComCursor(lab, "laboratório EMS sigma", 21);
    expect(lab.value).toBe("Laboratório EMS Sigma");
  });

  it("digitando no COMEÇO: o cursor não pula para o fim", async () => {
    const { lab } = await campoLaboratorio();
    await editarComCursor(lab, "Brasileiro", 10);
    await editarComCursor(lab, "teuto Brasileiro", 6); // "teuto " inserido antes, cursor depois do espaço
    expect(lab.value).toBe("Teuto Brasileiro");
    expect(lab.selectionStart).toBe(6);
    expect(lab.selectionEnd).toBe(6);
  });

  it("digitando no MEIO: a palavra nova ganha a inicial e o cursor fica onde estava", async () => {
    const { lab } = await campoLaboratorio();
    await editarComCursor(lab, "Teuto Brasileiro", 16);
    await editarComCursor(lab, "Teuto f Brasileiro", 7);
    expect(lab.value).toBe("Teuto F Brasileiro");
    expect(lab.selectionStart).toBe(7);
    await editarComCursor(lab, "Teuto Farma Brasileiro", 11);
    expect(lab.value).toBe("Teuto Farma Brasileiro");
    expect(lab.selectionStart).toBe(11);
  });

  it("COLAR texto (de uma vez) no meio: iniciais aplicadas, siglas intactas, cursor no fim do trecho colado", async () => {
    const { lab } = await campoLaboratorio();
    await editarComCursor(lab, "Teuto ", 6);
    const colado = "bristol-myers squibb EMS ";
    await editarComCursor(lab, "Teuto " + colado, 6 + colado.length);
    expect(lab.value).toBe("Teuto Bristol-Myers Squibb EMS ");
    expect(lab.selectionStart).toBe(6 + colado.length);
  });

  it("APAGAR: nada é recolocado nem mexido; o cursor fica no ponto apagado", async () => {
    const { lab } = await campoLaboratorio();
    await editarComCursor(lab, "Teuto Brasileiro", 16);
    await editarComCursor(lab, "Teuto Brasileir", 15); // backspace no fim
    expect(lab.value).toBe("Teuto Brasileir");
    expect(lab.selectionStart).toBe(15);
    await editarComCursor(lab, "TeutoBrasileir", 5); // apagou o espaço do meio: o "B" continua como estava
    expect(lab.value).toBe("TeutoBrasileir");
    expect(lab.selectionStart).toBe(5);
    await editarComCursor(lab, "", 0);
    expect(lab.value).toBe("");
  });

  it("ACENTO: digitado direto vira maiúscula; durante a composição (IME / acento morto) o valor não é tocado e a regra roda no fim", async () => {
    const { lab } = await campoLaboratorio();
    await editarComCursor(lab, "ácido", 5);
    expect(lab.value).toBe("Ácido");
    // Composição (teclado de celular compondo a palavra, IME): "Ácido e" ainda compondo → o valor NÃO é tocado (o "e"
    // continua minúsculo); ao terminar ("é"), a inicial entra.
    await editarComCursor(lab, "Ácido e", 7, { compondo: true });
    expect(lab.value).toBe("Ácido e");
    expect(lab.selectionStart).toBe(7);
    lab.value = "Ácido é";
    lab.setSelectionRange(7, 7);
    lab.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "é" }));
    await nextTick();
    expect(lab.value).toBe("Ácido É");
    expect(lab.selectionStart).toBe(7);
  });

  it("seleção (não só cursor) também é preservada", async () => {
    const { lab } = await campoLaboratorio();
    lab.value = "teuto brasileiro";
    lab.setSelectionRange(2, 9);
    lab.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await nextTick();
    expect(lab.value).toBe("Teuto Brasileiro");
    expect([lab.selectionStart, lab.selectionEnd]).toEqual([2, 9]);
  });
});

describe("consistência: mesma capitalização ao digitar, no blur, no payload e no servidor", () => {
  const ENTRADAS = ["  bristol-myers   squibb EMS  ", "teuto brasileiro ", "ems s.a.", "MSD", "GSK farma", "ácido farma", "S.A."];

  it.each(ENTRADAS)("%j", async (entrada) => {
    const { el, lab, saida } = await campoLaboratorio();
    // Ao digitar: só as iniciais (espaços como estão).
    await editarComCursor(lab, entrada, entrada.length);
    const aoVivo = lab.value;
    expect(aoVivo).toBe(capitalizarIniciais(entrada));
    expect(aoVivo.replace(/\s+/g, " ").trim()).toBe(normalizarLaboratorio(entrada)); // só difere nos espaços
    // Payload SEM blur (normaliza ao montar).
    salvar(el);
    const noPayload = saida.atualizacoes.at(-1)!.medicamentos![0]!.laboratorio;
    // Blur.
    await sair(lab);
    const noBlur = lab.value;
    // Servidor (a partir da entrada crua e a partir do payload).
    const noServidor = medicamentosCanonicos([{ nome: "A", laboratorio: entrada, brand: "" }])[0]!.laboratorio;
    const doPayloadNoServidor = medicamentosCanonicos([{ nome: "A", laboratorio: noPayload, brand: "" }])[0]!.laboratorio;
    expect(new Set([noPayload, noBlur, noServidor, doPayloadNoServidor, normalizarLaboratorio(entrada)]).size).toBe(1);
  });
});

