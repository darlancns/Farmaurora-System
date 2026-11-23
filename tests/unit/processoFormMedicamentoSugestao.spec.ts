// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import type { CadastrosFollowUp } from "#shared/types/Cadastro";
import type { Medicamento, NewProcessoDTO, Processo, ProcessoFormPatchPayload } from "#shared/types/processo";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import { instalarPrimeiraMaiuscula } from "../../app/utils/primeiraMaiuscula";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { CADASTROS_FOLLOWUP_FIXTURE } from "./helpers/cadastrosFollowUpFixtures";
import { CONSULTORES_FIXTURE } from "./helpers/consultoresFixtures";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// ETAPA 6: o nome do medicamento do formulário do Follow-Up é TEXTO LIVRE com SUGESTÃO do Cadastro de Medicamentos (só ativos, filtro no cliente).
// Guarda só o nome (sem vínculo por id), continua em MAIÚSCULAS no valor (cursor preservado), sem "Pedir cadastro" nem "Fora do Cadastro". O valor
// gravado (minúsculas, fora do Cadastro, inativo) aparece como está e salvar sem mexer NÃO gera PATCH. Sem o Cadastro, é só texto. Dados fictícios (TESTE).

let app: App | null = null;
let raiz: HTMLElement | null = null;
let desinstalar: (() => void) | null = null;

beforeEach(() => {
  desinstalar = instalarPrimeiraMaiuscula(document); // o plugin global, como no app
});
afterEach(() => {
  desinstalar?.();
  app?.unmount();
  raiz?.remove();
  app = null;
  raiz = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

interface Saida {
  update: Array<[string, ProcessoFormPatchPayload]>;
  submit: NewProcessoDTO[];
  unchanged: number;
  fechou: number;
}

function abrir(
  itens: Medicamento[] | null,
  cadastros: () => Partial<CadastrosFollowUp> | undefined = () => CADASTROS_FOLLOWUP_FIXTURE,
): Saida {
  const saida: Saida = { update: [], submit: [], unchanged: 0, fechou: 0 };
  const processo: Processo | null = itens === null ? null : montarProcesso(linhaCompleta({ medicamentos: itens }) as unknown as FollowUpRow);
  raiz = document.createElement("div");
  document.body.appendChild(raiz);
  app = createApp(
    defineComponent({
      render: () => {
        const props: Record<string, unknown> = {
          editingProcesso: processo,
          consultores: CONSULTORES_FIXTURE,
          onSubmit: (p: NewProcessoDTO) => saida.submit.push(p),
          onUpdate: (id: string, p: ProcessoFormPatchPayload) => saida.update.push([id, p]),
          onUnchanged: () => saida.unchanged++,
          onInvalid: () => undefined,
          onClose: () => saida.fechou++,
        };
        const c = cadastros();
        if (c !== undefined) props.cadastros = c;
        return h(ProcessoFormModal, props);
      },
    }),
  );
  app.mount(raiz);
  return saida;
}

// A sugestão filtra no cliente com debounce 0: um tick de timer basta.
async function esperar(): Promise<void> {
  await nextTick();
  await new Promise((r) => setTimeout(r, 15));
  await nextTick();
}

const campo = (i = 0): HTMLInputElement => $<HTMLInputElement>(`#pf-medicamento-nome-${i}`)!;
const sugestoes = (i = 0): string[] => [...document.querySelectorAll<HTMLElement>(`#pf-medicamento-nome-${i}-listbox [role='option']`)].map(texto);
const listaAberta = (i = 0): boolean => $(`#pf-medicamento-nome-${i}-listbox`) !== null;

async function digitar(valor: string, i = 0): Promise<void> {
  const c = campo(i);
  c.focus();
  c.value = valor;
  c.dispatchEvent(new Event("input", { bubbles: true }));
  await esperar();
}

async function teclar(key: string, i = 0): Promise<KeyboardEvent> {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  campo(i).dispatchEvent(e);
  await nextTick();
  return e;
}

async function escolherSugestao(rotulo: string, i = 0): Promise<void> {
  const alvo = [...document.querySelectorAll<HTMLElement>(`#pf-medicamento-nome-${i}-listbox [role='option']`)].find((o) => texto(o) === rotulo);
  if (!alvo) throw new Error(`sugestão não encontrada: ${rotulo}`);
  alvo.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await nextTick();
}

async function salvar(): Promise<void> {
  $("#processo-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
}

// As chaves que um item de medicamento já tinha (a dosagem é preservada mesmo fora do formulário): NENHUMA chave nova (id, vínculo, temperatura).
const CHAVES_DE_SEMPRE = ["brand", "dosagem", "laboratorio", "nome", "quantidade"];
const semChavesNovas = (item: object): string[] => Object.keys(item).filter((k) => !CHAVES_DE_SEMPRE.includes(k));

describe("sugestão do Cadastro enquanto se digita", () => {
  it("digitar mostra os medicamentos ATIVOS do Cadastro que têm o texto (os que começam primeiro), em MAIÚSCULAS", async () => {
    abrir([{ nome: "", quantidade: "" }]);
    await esperar();
    await digitar("dipi");
    expect(campo().value).toBe("DIPI");
    expect(sugestoes()).toEqual(["DIPIRONA TESTE", "DIPIRONA TESTE GOTAS", "XAROPE DIPIRONA TESTE"]);
  });

  it("medicamento INATIVO do Cadastro nunca é sugerido", async () => {
    abrir([{ nome: "", quantidade: "" }]);
    await esperar();
    await digitar("antigo");
    expect(listaAberta()).toBe(false);
    await digitar("teste medicamento");
    expect(sugestoes()).toEqual([]);
    expect(listaAberta()).toBe(false);
  });

  it("escolher uma sugestão põe o nome do Cadastro no campo e no modelo, e SÓ o nome (nada de id, temperatura nem vínculo)", async () => {
    const s = abrir([{ nome: "", quantidade: "2 cx" }]);
    await esperar();
    await digitar("dipi");
    await escolherSugestao("DIPIRONA TESTE GOTAS");
    expect(campo().value).toBe("DIPIRONA TESTE GOTAS");
    await salvar();
    expect(s.update).toHaveLength(1);
    expect(s.update[0]![1].medicamentos).toHaveLength(1);
    expect(s.update[0]![1].medicamentos![0]).toMatchObject({ nome: "DIPIRONA TESTE GOTAS", quantidade: "2 cx" });
    expect(semChavesNovas(s.update[0]![1].medicamentos![0]!)).toEqual([]);
  });

  it("não há 'Pedir cadastro' nem 'Fora do Cadastro' (isso é do Compras)", async () => {
    abrir([{ nome: "", quantidade: "" }]);
    await esperar();
    await digitar("medicamento inventado");
    const tela = document.body.textContent ?? "";
    expect(tela).not.toContain("Pedir cadastro");
    expect(tela).not.toContain("Fora do Cadastro");
    expect(tela).not.toContain("Nome para o cadastro");
    expect(tela).not.toContain("Nada encontrado");
  });

  it("a sugestão não faz requisição nenhuma (a lista já está no cliente)", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    abrir([{ nome: "", quantidade: "" }]);
    await esperar();
    await digitar("dipi");
    await escolherSugestao("DIPIRONA TESTE");
    expect(f).not.toHaveBeenCalled();
  });
});

describe("digitação livre continua valendo", () => {
  it("texto que não está no Cadastro: sem lista, em MAIÚSCULAS, e é isso que vai no PATCH", async () => {
    const s = abrir([{ nome: "", quantidade: "" }]);
    await esperar();
    await digitar("medicamento inventado 10mg");
    expect(listaAberta()).toBe(false);
    expect(campo().value).toBe("MEDICAMENTO INVENTADO 10MG");
    await salvar();
    expect(s.update[0]![1].medicamentos![0]).toMatchObject({ nome: "MEDICAMENTO INVENTADO 10MG" });
    expect(semChavesNovas(s.update[0]![1].medicamentos![0]!)).toEqual([]);
  });

  it("digitar por cima de uma sugestão (ex.: acrescentar a dose depois do nome do Cadastro) fica como digitado", async () => {
    const s = abrir([{ nome: "", quantidade: "" }]);
    await esperar();
    await digitar("dipirona teste");
    await escolherSugestao("DIPIRONA TESTE");
    await digitar("DIPIRONA TESTE 500 mg");
    expect(campo().value).toBe("DIPIRONA TESTE 500 MG");
    await salvar();
    expect(s.update[0]![1].medicamentos![0]!.nome).toBe("DIPIRONA TESTE 500 MG");
  });

  it("criação: o texto livre vai no submit, em maiúsculas", async () => {
    const s = abrir(null);
    await esperar();
    const paciente = $<HTMLInputElement>("#pf-paciente")!;
    paciente.value = "maria";
    paciente.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    $<HTMLButtonElement>("#pf-consultor")!.click();
    await nextTick();
    [...document.querySelectorAll<HTMLElement>("#pf-consultor-listbox [role='option']")]
      .find((o) => texto(o) === "Dani")!
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await nextTick();
    await digitar("nivolumabe livre");
    await salvar();
    expect(s.submit).toHaveLength(1);
    expect(s.submit[0]!.medicamentos[0]!.nome).toBe("NIVOLUMABE LIVRE");
  });
});

describe("MAIÚSCULAS no valor, com o cursor onde estava", () => {
  it("minúsculas viram maiúsculas no campo e no modelo (valor, não só CSS)", async () => {
    const s = abrir([{ nome: "", quantidade: "" }]);
    await esperar();
    await digitar("keytruda 100mg");
    expect(campo().value).toBe("KEYTRUDA 100MG");
    await salvar();
    expect(s.update[0]![1].medicamentos![0]!.nome).toBe("KEYTRUDA 100MG");
  });

  it("editar no MEIO do texto não faz o cursor pular para o fim", async () => {
    abrir([{ nome: "", quantidade: "" }]);
    await esperar();
    const c = campo();
    c.focus();
    c.value = "keytruda";
    c.setSelectionRange(3, 3);
    c.dispatchEvent(new Event("input", { bubbles: true }));
    await esperar();
    expect(c.value).toBe("KEYTRUDA");
    expect(c.selectionStart).toBe(3);
    expect(c.selectionEnd).toBe(3);
  });
});

describe("valor GRAVADO: aparece como está e salvar sem mexer não gera PATCH", () => {
  it.each([
    ["em minúsculas / caixa mista", "Keytruda 100mg/4ml"],
    ["em minúsculas", "keytruda"],
    ["fora do Cadastro", "Medicamento Fora Do Cadastro"],
    ["igual ao de um INATIVO do Cadastro", "TESTE MEDICAMENTO ANTIGO"],
    ["igual ao de um ativo do Cadastro", "KEYTRUDA"],
  ])("gravado %s ('%s')", async (_nome, gravado) => {
    const s = abrir([{ nome: gravado, quantidade: "3 caixas" }]);
    await esperar();
    expect(campo().value).toBe(gravado); // como está gravado, sem maiúsculas à força nem sufixo
    expect(listaAberta()).toBe(false);
    campo().focus();
    campo().dispatchEvent(new Event("blur"));
    await esperar();
    expect(campo().value).toBe(gravado);
    await salvar();
    expect(s.update).toEqual([]);
    expect(s.unchanged).toBe(1);
  });

  it("depois de editar o campo, o texto inteiro passa a maiúsculas e vai no PATCH", async () => {
    const s = abrir([{ nome: "Keytruda 100mg", quantidade: "" }]);
    await esperar();
    await digitar("Keytruda 100mg x");
    expect(campo().value).toBe("KEYTRUDA 100MG X");
    await salvar();
    expect(s.update[0]![1].medicamentos![0]!.nome).toBe("KEYTRUDA 100MG X");
  });
});

describe("o Cadastro não carregou, falhou ou está vazio: o campo é só texto, sem erro nem tela vazia", () => {
  it.each([
    ["prop ausente", () => undefined],
    ["sem a lista de medicamentos", () => ({ fornecedores: [], despachantes: [], transportadoras: [] })],
    ["lista vazia", () => ({ medicamentos: [] })],
  ])("%s", async (_nome, cadastros) => {
    const s = abrir([{ nome: "", quantidade: "" }], cadastros as () => Partial<CadastrosFollowUp> | undefined);
    await esperar();
    await digitar("dipirona teste");
    expect(listaAberta()).toBe(false);
    expect(campo().value).toBe("DIPIRONA TESTE");
    expect(document.body.textContent).not.toMatch(/erro|falha|Carregando/i);
    await salvar();
    expect(s.update[0]![1].medicamentos![0]!.nome).toBe("DIPIRONA TESTE");
  });

  it("a lista chega DEPOIS de o formulário abrir: as sugestões passam a aparecer sem reabrir nem perder o que foi digitado", async () => {
    const lista = ref<Partial<CadastrosFollowUp>>({ medicamentos: [] });
    abrir([{ nome: "", quantidade: "" }], () => lista.value);
    await esperar();
    await digitar("dipi");
    expect(listaAberta()).toBe(false);
    lista.value = CADASTROS_FOLLOWUP_FIXTURE;
    await nextTick();
    await digitar("dipir");
    expect(campo().value).toBe("DIPIR");
    expect(sugestoes()).toEqual(["DIPIRONA TESTE", "DIPIRONA TESTE GOTAS", "XAROPE DIPIRONA TESTE"]);
  });
});

describe("várias linhas, adicionar e remover continuam como eram", () => {
  const TRES: Medicamento[] = [
    { nome: "A UM", quantidade: "1" },
    { nome: "A DOIS", quantidade: "2" },
    { nome: "A TRES", quantidade: "3" },
  ];

  it("escolher uma sugestão na 2ª linha muda só a 2ª", async () => {
    const s = abrir(TRES);
    await esperar();
    await digitar("keytr", 1);
    await escolherSugestao("KEYTRUDA", 1);
    await salvar();
    expect(s.update[0]![1].medicamentos!.map((m) => m.nome)).toEqual(["A UM", "KEYTRUDA", "A TRES"]);
  });

  it("cada linha tem a sua lista e a sua sugestão", async () => {
    abrir(TRES);
    await esperar();
    await digitar("opdi", 0);
    expect(listaAberta(0)).toBe(true);
    expect(listaAberta(1)).toBe(false);
    expect(sugestoes(0)).toEqual(["OPDIVO"]);
  });

  it("'+' acrescenta uma linha com o mesmo campo de sugestão; '✕' remove sem bagunçar as outras", async () => {
    const s = abrir([{ nome: "A UM", quantidade: "1" }]);
    await esperar();
    $<HTMLButtonElement>("#processo-form button[title='Adicionar medicamento']")!.click();
    await esperar();
    expect($("#pf-medicamento-nome-1")).not.toBeNull();
    await digitar("nivol", 1);
    await escolherSugestao("NIVOLUMABE", 1);
    $<HTMLButtonElement>("#processo-form button[title='Adicionar medicamento']")!.click();
    await esperar();
    await digitar("xxx livre", 2);
    [...document.querySelectorAll<HTMLButtonElement>("#processo-form button[title='Remover medicamento']")][0]!.click(); // remove a linha 1
    await esperar();
    expect(campo(0).value).toBe("A UM");
    expect(campo(1).value).toBe("XXX LIVRE");
    await salvar();
    expect(s.update[0]![1].medicamentos!.map((m) => m.nome)).toEqual(["A UM", "XXX LIVRE"]);
  });

  it("laboratório e brand de cada linha seguem independentes do nome sugerido", async () => {
    const s = abrir([{ nome: "", quantidade: "", laboratorio: "Msd", brand: "referencia" }]);
    await esperar();
    await digitar("keytr");
    await escolherSugestao("KEYTRUDA");
    await salvar();
    expect(s.update[0]![1].medicamentos).toHaveLength(1);
    expect(s.update[0]![1].medicamentos![0]).toMatchObject({ nome: "KEYTRUDA", laboratorio: "Msd", brand: "referencia" });
    expect(semChavesNovas(s.update[0]![1].medicamentos![0]!)).toEqual([]);
  });
});

describe("teclado: Enter, Esc e Tab", () => {
  it("ENTER sem sugestão destacada NÃO escolhe nada: a tecla segue (o formulário envia como sempre) e o texto digitado fica", async () => {
    abrir([{ nome: "", quantidade: "" }]);
    await esperar();
    await digitar("dipirona livre");
    await digitar("dipi");
    expect(listaAberta()).toBe(true);
    const e = await teclar("Enter");
    expect(e.defaultPrevented).toBe(false);
    expect(campo().value).toBe("DIPI");
    expect(listaAberta()).toBe(false);
  });

  it("setas + Enter escolhem a sugestão destacada (e engolem a tecla)", async () => {
    abrir([{ nome: "", quantidade: "" }]);
    await esperar();
    await digitar("dipi");
    await teclar("ArrowDown");
    await teclar("ArrowDown");
    const e = await teclar("Enter");
    expect(e.defaultPrevented).toBe(true);
    expect(campo().value).toBe("DIPIRONA TESTE GOTAS");
  });

  it("ESC com a lista de sugestões na tela fecha SÓ a lista: o formulário não fecha; o Esc seguinte (sem lista) fecha o formulário", async () => {
    const s = abrir([{ nome: "", quantidade: "" }]);
    await esperar();
    await digitar("dipi");
    expect(listaAberta()).toBe(true);
    await teclar("Escape");
    expect(listaAberta()).toBe(false);
    expect(s.fechou).toBe(0);
    await teclar("Escape");
    expect(s.fechou).toBe(1);
  });

  it("ESC num campo sem sugestão (texto livre) fecha o formulário, como sempre", async () => {
    const s = abrir([{ nome: "", quantidade: "" }]);
    await esperar();
    await digitar("medicamento inventado");
    await teclar("Escape");
    expect(s.fechou).toBe(1);
  });

  it("TAB sai do campo SEM escolher: o texto digitado e as sugestões não mexem no nome", async () => {
    const s = abrir([{ nome: "", quantidade: "" }]);
    await esperar();
    await digitar("dipirona livre 500");
    await digitar("dipi");
    await teclar("Tab");
    campo().dispatchEvent(new Event("blur"));
    await esperar();
    expect(campo().value).toBe("DIPI");
    await salvar();
    expect(s.update[0]![1].medicamentos![0]!.nome).toBe("DIPI");
  });
});
