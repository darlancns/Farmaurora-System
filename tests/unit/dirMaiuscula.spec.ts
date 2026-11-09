// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import DirFormModal from "../../app/components/dir/DirFormModal.vue";
import DirIncluirFechamento from "../../app/components/dir/DirIncluirFechamento.vue";
import plugin from "../../app/plugins/primeira-maiuscula.client";
import { campoRecebePrimeiraMaiuscula } from "../../app/utils/primeiraMaiuscula";
import { FILTROS_DIR_VAZIOS, aplicarFiltrosDir } from "../../app/utils/dirFiltros";
import { novoDir } from "./helpers/dirFixtures";

// A DIR dentro da regra global "todo campo de texto começa com letra maiúscula". Plugin REAL instalado no
// `document` do happy-dom e os componentes reais da DIR montados. Lista TODOS os campos de texto do formulário e das
// buscas e diz quais são capitalizados e quais ficam de fora (PO, AWB e contrato de câmbio: códigos/números).
vi.mock("#shared/utils/dataBrasilia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#shared/utils/dataBrasilia")>()),
  hojeBrasilia: () => "2026-11-07",
}));

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];

function montarComponente(render: () => ReturnType<typeof h>): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(defineComponent({ render }));
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return el;
}

function digitar(campo: HTMLInputElement, texto: string): void {
  campo.value = texto;
  campo.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

beforeAll(() => {
  (plugin as unknown as () => void)();
});

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
});

// Valores fora das listas: o formulário mostra "Outro" + o texto digitável em cada campo de lista.
const CAMPOS_LISTA_COM_OUTRO = [
  "vendedor",
  "responsavel",
  "receita",
  "temperatura",
  "fornecedor",
  "origem",
  "envio",
  "despachante",
  "banco",
  "observacao",
] as const;

function formulario(): HTMLElement {
  const dir = novoDir({
    vendedor: "x",
    responsavel: "x",
    receita: "x",
    temperatura: "x",
    fornecedor: "x",
    origem: "x",
    envio: "x",
    despachante: "x",
    banco: "x",
    observacao: "x",
  });
  return montarComponente(() => h(DirFormModal, { editingDir: dir, contagemPorPo: new Map<string, number>() }));
}

const camposDeTexto = () =>
  [...document.querySelectorAll<HTMLInputElement>("#dir-form input[type='text'], #dir-form input[type='search']")];

describe("DirFormModal — inventário dos campos de texto", () => {
  it("só PO, AWB e contrato de câmbio ficam de fora da regra; todos os outros recebem a 1ª maiúscula", () => {
    formulario();
    const excluidos = camposDeTexto()
      .filter((c) => !campoRecebePrimeiraMaiuscula(c))
      .map((c) => c.id)
      .sort();
    const capitalizados = camposDeTexto()
      .filter((c) => campoRecebePrimeiraMaiuscula(c))
      .map((c) => c.id)
      .sort();

    expect(excluidos).toEqual(["df-awb", "df-contrato", "df-po"]);
    expect(capitalizados).toEqual(
      ["df-medicamento", "df-paciente", ...CAMPOS_LISTA_COM_OUTRO.map((c) => `df-${c}-outro`)].sort(),
    );
  });

  it("PO, AWB e contrato levam data-sem-maiuscula no próprio campo", () => {
    formulario();
    for (const id of ["df-po", "df-awb", "df-contrato"]) {
      expect(document.getElementById(id)!.hasAttribute("data-sem-maiuscula"), id).toBe(true);
    }
  });

  it("paciente e medicamento: a 1ª letra vira maiúscula e o resto fica como digitado", async () => {
    formulario();
    const paciente = document.getElementById("df-paciente") as HTMLInputElement;
    const medicamento = document.getElementById("df-medicamento") as HTMLInputElement;
    digitar(paciente, "maria da Silva");
    digitar(medicamento, "keytruda 100mg");
    await nextTick();
    expect(paciente.value).toBe("Maria da Silva");
    expect(medicamento.value).toBe("Keytruda 100mg");
  });

  it.each(CAMPOS_LISTA_COM_OUTRO)("texto do 'Outro' de %s: 1ª letra maiúscula", async (campo) => {
    formulario();
    const entrada = document.getElementById(`df-${campo}-outro`) as HTMLInputElement;
    digitar(entrada, "bradesco");
    await nextTick();
    expect(entrada.value).toBe("Bradesco");
  });

  it("PO: nenhuma regra do plugin (data-sem-maiuscula); só a própria — tudo em maiúsculas (onPoInput)", async () => {
    formulario();
    const po = document.getElementById("df-po") as HTMLInputElement;
    digitar(po, "po26-10-0471");
    await nextTick();
    expect(po.value).toBe("PO26-10-0471");
  });

  it("AWB e contrato de câmbio: ficam exatamente como digitados", async () => {
    formulario();
    const awb = document.getElementById("df-awb") as HTMLInputElement;
    const contrato = document.getElementById("df-contrato") as HTMLInputElement;
    digitar(awb, "lufthansa: 020-46388355");
    digitar(contrato, "abc-123/x");
    await nextTick();
    expect(awb.value).toBe("lufthansa: 020-46388355");
    expect(contrato.value).toBe("abc-123/x");
  });

  it("as datas são botões (não entram na regra) e as caixas de marcar também não", () => {
    formulario();
    for (const id of ["df-data-emissao", "df-data-cobranca", "df-data-entrega", "df-data-pagamento"]) {
      expect(campoRecebePrimeiraMaiuscula(document.getElementById(id)), id).toBe(false);
    }
    for (const caixa of document.querySelectorAll("#dir-form input[type='checkbox']")) {
      expect(campoRecebePrimeiraMaiuscula(caixa)).toBe(false);
    }
  });
});

describe("buscas da DIR", () => {
  const lista = [
    novoDir({ id: "a", po: "PO26-10-0471", paciente: "JOÃO ÁVILA", medicamento: "KEYTRUDA", awb: "Lufthansa: 020-46388355" }),
    novoDir({ id: "b", po: "PO26-10-0472", paciente: "MARIA SOUZA", medicamento: "OPDIVO", awb: "" }),
  ];

  it("a busca da lista começa com maiúscula e continua achando ignorando caixa: 'Po26' acha 'PO26-10-0471'", () => {
    const achados = aplicarFiltrosDir(lista, { ...FILTROS_DIR_VAZIOS, busca: "Po26" }).map((d) => d.po);
    expect(achados).toEqual(["PO26-10-0471", "PO26-10-0472"]);
    expect(aplicarFiltrosDir(lista, { ...FILTROS_DIR_VAZIOS, busca: "Po26-10-0471" }).map((d) => d.po)).toEqual([
      "PO26-10-0471",
    ]);
    expect(aplicarFiltrosDir(lista, { ...FILTROS_DIR_VAZIOS, busca: "Lufthansa" }).map((d) => d.po)).toEqual(["PO26-10-0471"]);
    expect(aplicarFiltrosDir(lista, { ...FILTROS_DIR_VAZIOS, busca: "Joao avila" }).map((d) => d.po)).toEqual(["PO26-10-0471"]);
  });

  it("'incluir fechamento' (type=search): recebe a regra e 'Po26' acha o PO", async () => {
    const el = montarComponente(() => h(DirIncluirFechamento, { registros: lista }));
    const busca = el.ownerDocument.getElementById("dir-incluir-busca") as HTMLInputElement;
    expect(campoRecebePrimeiraMaiuscula(busca)).toBe(true);

    digitar(busca, "po26");
    await nextTick();
    expect(busca.value).toBe("Po26");
    expect(document.getElementById("dir-incluir-item-a")).not.toBeNull();
    expect(document.getElementById("dir-incluir-item-b")).not.toBeNull();
  });
});
