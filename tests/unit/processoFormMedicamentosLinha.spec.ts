// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Medicamento, Processo, ProcessoFormPatchPayload } from "#shared/types/processo";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import { instalarPrimeiraMaiuscula } from "../../app/utils/primeiraMaiuscula";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Item 11 (Parte 2) — linha de cada medicamento: Qtd. / Medicamento / "+" / remover. A dosagem saiu do formulário, mas
// o que um item já tenha (dosagem, qualquer outra chave, caixa mista) volta EXATAMENTE como estava ao salvar a lista.
// Componente real (ProcessoFormModal) no happy-dom, com o plugin global de primeira maiúscula instalado como no app.

// Dados antigos, importados em caixa mista; o 3º item não tem quantidade.
const ITENS_ANTIGOS: Medicamento[] = [
  { nome: "Keytruda 100mg/4ml", quantidade: "3 caixas" },
  { nome: "Opdivo", quantidade: "2 Cx" },
  { nome: "Yervoy" },
];

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
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

interface Saida {
  atualizacoes: ProcessoFormPatchPayload[];
  semAlteracao: number;
}

function abrir(medicamentos: Medicamento[]): { el: HTMLElement; saida: Saida } {
  const processo: Processo = montarProcesso(linhaCompleta({ medicamentos }) as unknown as FollowUpRow);
  const saida: Saida = { atualizacoes: [], semAlteracao: 0 };
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () =>
        h(ProcessoFormModal, {
          editingProcesso: processo,
          onUpdate: (_id: string, patch: ProcessoFormPatchPayload) => saida.atualizacoes.push(patch),
          onUnchanged: () => (saida.semAlteracao += 1),
        }),
    }),
  );
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return { el, saida };
}

async function digitar(el: HTMLElement, id: string, valor: string): Promise<HTMLInputElement> {
  const campo = el.querySelector<HTMLInputElement>(`#${id}`)!;
  campo.value = valor;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  return campo;
}

function salvar(el: HTMLElement): void {
  el.querySelector("#processo-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

describe("linha do medicamento: Qtd. / Medicamento / botões (✕ e depois +, como sempre)", () => {
  it("ordem dos campos e botões na última linha: Qtd., Medicamento, ✕ (remover), depois '+'", async () => {
    const { el } = abrir(ITENS_ANTIGOS);
    await nextTick();
    const qtd = el.querySelector("#pf-medicamento-quantidade-2")!;
    const nome = el.querySelector("#pf-medicamento-nome-2")!;
    const mais = el.querySelector("#processo-form button[title='Adicionar medicamento']")!;
    const remover = [...el.querySelectorAll("#processo-form button[title='Remover medicamento']")].at(-1)!;
    const depois = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(depois(qtd, nome)).toBe(true);
    expect(depois(nome, remover)).toBe(true);
    expect(depois(remover, mais)).toBe(true);
    // Os quatro estão na MESMA linha (o contêiner de cada item), e o "+" só existe no último.
    const linha = qtd.parentElement!.parentElement!;
    for (const filho of [nome, mais, remover]) expect(linha.contains(filho)).toBe(true);
    expect(el.querySelectorAll("#processo-form button[title='Adicionar medicamento']")).toHaveLength(1);
    expect(el.querySelectorAll("#processo-form button[title='Remover medicamento']")).toHaveLength(2); // o 1º item não remove
  });

  it("com 1 item só aparece o '+'; com 2 itens o 2º (último) tem ✕ e depois '+', e o 1º não tem botão", async () => {
    const um = abrir([{ nome: "A", quantidade: "1" }]);
    await nextTick();
    expect([...um.el.querySelectorAll<HTMLElement>("#processo-form button[title*='medicamento']")].map((b) => b.title)).toEqual([
      "Adicionar medicamento",
    ]);
    const dois = abrir([{ nome: "A", quantidade: "1" }, { nome: "B", quantidade: "2" }]);
    await nextTick();
    expect([...dois.el.querySelectorAll<HTMLElement>("#processo-form button[title*='medicamento']")].map((b) => b.title)).toEqual([
      "Remover medicamento",
      "Adicionar medicamento",
    ]);
    // O botão do 1º item não existe: a linha dele só tem Qtd. e Medicamento.
    const linha0 = dois.el.querySelector("#pf-medicamento-quantidade-0")!.parentElement!.parentElement!;
    expect(linha0.querySelectorAll("button")).toHaveLength(0);
  });

  it("a ordem entre os itens segue a lista (Qtd./Medicamento do 1º, depois do 2º...)", async () => {
    const { el } = abrir(ITENS_ANTIGOS);
    await nextTick();
    const ids = ["pf-medicamento-quantidade-0", "pf-medicamento-nome-0", "pf-medicamento-quantidade-1", "pf-medicamento-nome-1", "pf-medicamento-quantidade-2", "pf-medicamento-nome-2"];
    const naOrdemDoDom = [...el.querySelectorAll<HTMLElement>("#processo-form [id^='pf-medicamento-']")].map((n) => n.id);
    expect(naOrdemDoDom).toEqual(ids);
  });

  it("rótulos 'Qtd.' e 'Medicamento' (não mais 'Quantidade' e 'Nome') e nenhum campo de dosagem", async () => {
    const { el } = abrir(ITENS_ANTIGOS);
    await nextTick();
    for (let i = 0; i < ITENS_ANTIGOS.length; i++) {
      expect(texto(el.querySelector(`label[for='pf-medicamento-quantidade-${i}']`))).toBe("Qtd.");
      expect(texto(el.querySelector(`label[for='pf-medicamento-nome-${i}']`))).toBe("Medicamento");
    }
    expect(el.querySelector("[id*='dosagem']")).toBeNull();
    expect(el.querySelector("[for*='dosagem']")).toBeNull();
    // Só os rótulos do bloco de medicamentos (o "Nome" que existe no formulário é o da Transportadora nacional).
    const bloco = el.querySelector("#pf-medicamento-nome-0")!.closest("fieldset")!;
    expect([...bloco.querySelectorAll("label")].map(texto)).toEqual(["Qtd.", "Medicamento", "Qtd.", "Medicamento", "Qtd.", "Medicamento", "Local de entrega"]);
    const rotulosForm = [...el.querySelectorAll("#processo-form label")].map(texto);
    expect(rotulosForm).not.toContain("Dosagem");
    expect(rotulosForm).not.toContain("Quantidade");
  });

  it("a linha não tem classe order-* nem tabindex positivo", async () => {
    const { el } = abrir(ITENS_ANTIGOS);
    await nextTick();
    const ehOrder = (token: string) => /(^|[:!])-?order-/.test(token);
    const linhas = [...el.querySelectorAll("#pf-medicamento-quantidade-0, #pf-medicamento-quantidade-2")].map((n) => n.parentElement!.parentElement!);
    for (const linha of linhas) {
      for (const n of [linha, ...linha.querySelectorAll("*")]) {
        expect((n.getAttribute("class") ?? "").split(/\s+/).filter(ehOrder), n.tagName).toEqual([]);
        expect(Number(n.getAttribute("tabindex") ?? 0)).toBeLessThanOrEqual(0);
      }
    }
  });
});

describe("maiúsculas ao digitar (com o plugin de primeira maiúscula ativo)", () => {
  it("Medicamento e Qtd. viram MAIÚSCULAS no valor do campo e no modelo", async () => {
    const { el, saida } = abrir([{ nome: "", quantidade: "" }]);
    await nextTick();
    const nome = await digitar(el, "pf-medicamento-nome-0", "keytruda 100mg");
    const qtd = await digitar(el, "pf-medicamento-quantidade-0", "12 ampolas");
    expect(nome.value).toBe("KEYTRUDA 100MG");
    expect(qtd.value).toBe("12 AMPOLAS");
    // E é isso que vai no patch (modelo, não CSS).
    salvar(el);
    expect(saida.atualizacoes.at(-1)?.medicamentos).toEqual([{ nome: "KEYTRUDA 100MG", quantidade: "12 AMPOLAS" }]);
  });
});

describe("preservação dos itens existentes ao salvar", () => {
  it("abrir e salvar SEM editar: nada é enviado (item antigo em caixa mista continua como está)", async () => {
    const { el, saida } = abrir(ITENS_ANTIGOS);
    await nextTick();
    salvar(el);
    expect(saida.atualizacoes).toHaveLength(0);
    expect(saida.semAlteracao).toBe(1);
  });

  it("salvar mexendo em OUTRO campo (não nos medicamentos) não envia a lista", async () => {
    const { el, saida } = abrir(ITENS_ANTIGOS);
    await nextTick();
    await digitar(el, "pf-awb", "ZZ999999999BR");
    salvar(el);
    expect(saida.atualizacoes).toHaveLength(1);
    const patch = saida.atualizacoes[0]!;
    expect("medicamentos" in patch).toBe(false);
    expect(patch.numeroAwb).toBe("ZZ999999999BR");
  });

  it("editar o nome de UM item: a quantidade dele fica e os outros itens voltam intactos (caixa mista inclusive)", async () => {
    const { el, saida } = abrir(ITENS_ANTIGOS);
    await nextTick();
    await digitar(el, "pf-medicamento-nome-1", "nivolumabe");
    salvar(el);
    const patch = saida.atualizacoes[0]!;
    expect(patch.medicamentos).toEqual([
      { nome: "Keytruda 100mg/4ml", quantidade: "3 caixas" },
      { nome: "NIVOLUMABE", quantidade: "2 Cx" },
      { nome: "Yervoy" },
    ]);
    // Nenhum valor dos itens 0 e 2 foi trocado, nem ganhou chave nova (comparação pelo JSON que vai ao servidor).
    expect(JSON.stringify(patch.medicamentos![0])).toBe(JSON.stringify(ITENS_ANTIGOS[0]));
    expect(JSON.stringify(patch.medicamentos![2])).toBe(JSON.stringify(ITENS_ANTIGOS[2]));
    expect(patch.versao).toBeTruthy(); // lista alterada leva a versão (409 se outra pessoa gravou)
  });

  it("editar a Qtd. de um item mexe só nela (o nome e os outros itens ficam)", async () => {
    const { el, saida } = abrir(ITENS_ANTIGOS);
    await nextTick();
    await digitar(el, "pf-medicamento-quantidade-2", "5 cx");
    salvar(el);
    expect(saida.atualizacoes[0]!.medicamentos).toEqual([
      ITENS_ANTIGOS[0],
      ITENS_ANTIGOS[1],
      { nome: "Yervoy", quantidade: "5 CX" },
    ]);
  });

  it("um item COM dosagem (que o formulário não mostra) é preservado ao editar outro item", async () => {
    const itens: Medicamento[] = [
      { nome: "Keytruda", quantidade: "1 cx", dosagem: "100 mg/4 mL" },
      { nome: "Opdivo", quantidade: "2 cx" },
    ];
    const { el, saida } = abrir(itens);
    await nextTick();
    expect(el.querySelector("[id*='dosagem']")).toBeNull();
    await digitar(el, "pf-medicamento-nome-1", "nivolumabe");
    salvar(el);
    expect(saida.atualizacoes[0]!.medicamentos).toEqual([
      { nome: "Keytruda", quantidade: "1 cx", dosagem: "100 mg/4 mL" },
      { nome: "NIVOLUMABE", quantidade: "2 cx" },
    ]);
  });

  it("a dosagem também fica quando se edita o PRÓPRIO item que a tem (o formulário não a apaga nem a transforma)", async () => {
    const { el, saida } = abrir([{ nome: "Keytruda", quantidade: "1 cx", dosagem: "100 mg/4 mL" }]);
    await nextTick();
    await digitar(el, "pf-medicamento-quantidade-0", "2 cx");
    salvar(el);
    expect(saida.atualizacoes[0]!.medicamentos).toEqual([{ nome: "Keytruda", quantidade: "2 CX", dosagem: "100 mg/4 mL" }]);
  });

  it("outras chaves que o item tenha também voltam intactas", async () => {
    const itens = [
      { nome: "Keytruda", quantidade: "1 cx", marca: "MSD" },
      { nome: "Opdivo", quantidade: "2 cx" },
    ] as unknown as Medicamento[];
    const { el, saida } = abrir(itens);
    await nextTick();
    await digitar(el, "pf-medicamento-nome-1", "nivolumabe");
    salvar(el);
    expect(saida.atualizacoes[0]!.medicamentos![0]).toEqual({ nome: "Keytruda", quantidade: "1 cx", marca: "MSD" });
  });

  it("'+' acrescenta um item novo sem dosagem e sem mexer nos existentes", async () => {
    const { el, saida } = abrir(ITENS_ANTIGOS);
    await nextTick();
    // O "+" é o do ÚLTIMO item.
    el.querySelector<HTMLButtonElement>("#processo-form button[title='Adicionar medicamento']")!.click();
    await nextTick();
    await digitar(el, "pf-medicamento-nome-3", "zolgensma");
    salvar(el);
    const lista = saida.atualizacoes[0]!.medicamentos!;
    expect(lista).toHaveLength(4);
    expect(lista.slice(0, 3)).toEqual(ITENS_ANTIGOS);
    expect(JSON.stringify(lista[3])).toBe(JSON.stringify({ nome: "ZOLGENSMA" }));
    expect(el.querySelector("[id*='dosagem']")).toBeNull();
  });
});
