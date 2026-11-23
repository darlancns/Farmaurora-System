// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import type { CadastrosFollowUp } from "#shared/types/Cadastro";
import type { Processo, ProcessoFormPatchPayload } from "#shared/types/processo";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { CADASTROS_FOLLOWUP_FIXTURE } from "./helpers/cadastrosFollowUpFixtures";
import { CONSULTORES_FIXTURE } from "./helpers/consultoresFixtures";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// ETAPA 3: o select de Fornecedor do formulário do Follow-Up vem do CADASTRO ("Nome - País", só ativos), com "Nacional" fixo e "Outro" como
// sempre. O valor que o processo já tem gravado e não é uma das opções (legado sem país, inativo) continua COMO ESTÁ GRAVADO, sem sufixo, e
// abrir + salvar NÃO manda o fornecedor (nada de PATCH falso). O servidor não valida contra o Cadastro nesta etapa. Dados fictícios (TESTE).

let app: App | null = null;
let raiz: HTMLElement | null = null;

afterEach(() => {
  app?.unmount();
  raiz?.remove();
  app = null;
  raiz = null;
  document.body.innerHTML = "";
});

const $ = <T extends Element = HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);
const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

interface Saida {
  update: Array<[string, ProcessoFormPatchPayload]>;
  submit: unknown[];
  unchanged: number;
}

function abrir(fornecedor: string | undefined | null, cadastros: () => Partial<CadastrosFollowUp> = () => CADASTROS_FOLLOWUP_FIXTURE, editando = true) {
  const saida: Saida = { update: [], submit: [], unchanged: 0 };
  const processo: Processo | null = editando ? montarProcesso(linhaCompleta({ fornecedor }) as unknown as FollowUpRow) : null;
  raiz = document.createElement("div");
  document.body.appendChild(raiz);
  app = createApp(
    defineComponent({
      render: () =>
        h(ProcessoFormModal, {
          editingProcesso: processo,
          consultores: CONSULTORES_FIXTURE,
          cadastros: cadastros(),
          onSubmit: (p: unknown) => saida.submit.push(p),
          onUpdate: (id: string, p: ProcessoFormPatchPayload) => saida.update.push([id, p]),
          onUnchanged: () => saida.unchanged++,
          onInvalid: () => undefined,
        }),
    }),
  );
  app.mount(raiz);
  return saida;
}

const botao = () => $<HTMLButtonElement>("#pf-fornecedor")!;
const selecionado = (): string => texto(botao());
const campoOutro = () => $<HTMLInputElement>("#pf-fornecedor-outro");

async function opcoes(): Promise<string[]> {
  botao().click();
  await nextTick();
  const lista = [...document.querySelectorAll<HTMLElement>("#pf-fornecedor-listbox [role='option']")].map((o) => texto(o));
  botao().click(); // fecha
  await nextTick();
  return lista;
}

async function escolher(rotulo: string): Promise<void> {
  botao().click();
  await nextTick();
  const alvo = [...document.querySelectorAll<HTMLElement>("#pf-fornecedor-listbox [role='option']")].find((o) => texto(o) === rotulo);
  if (!alvo) throw new Error(`opção não encontrada: ${rotulo}`);
  alvo.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await nextTick();
}

async function digitarOutro(valor: string): Promise<void> {
  const campo = campoOutro()!;
  campo.value = valor;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}

async function salvar(): Promise<void> {
  $("#processo-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
}

describe("as opções do select de Fornecedor", () => {
  it("'Selecione', os ATIVOS do Cadastro em 'Nome - País', 'Nacional' e 'Outro' (nesta ordem); nenhum inativo", async () => {
    abrir(undefined, () => CADASTROS_FOLLOWUP_FIXTURE, false);
    await nextTick();
    expect(await opcoes()).toEqual([
      "Selecione",
      "Beldimed - Bélgica",
      "Can Pharma - China",
      "Pharyx - China",
      "Poros - Turquia",
      "Speciality - Índia",
      "Venecza - Itália",
      "Nacional",
      "Outro",
    ]);
  });

  it("não sobra nada da lista antiga fixa: um fornecedor novo no Cadastro aparece, um desativado some", async () => {
    abrir(undefined, () => ({
      fornecedores: [
        { nome: "TESTE Novo", pais: "Chile", ativo: true, prazoAlertaDias: 5, semAlerta: false },
        { nome: "Poros", pais: "Turquia", ativo: false, prazoAlertaDias: 3, semAlerta: false },
      ],
    }), false);
    await nextTick();
    expect(await opcoes()).toEqual(["Selecione", "TESTE Novo - Chile", "Nacional", "Outro"]);
  });

  it("sem país no Cadastro, o rótulo é só o nome", async () => {
    abrir(undefined, () => ({ fornecedores: [{ nome: "TESTE Sem País", pais: "", ativo: true, prazoAlertaDias: null, semAlerta: true }] }), false);
    await nextTick();
    expect((await opcoes())[1]).toBe("TESTE Sem País");
  });
});

describe("valor GRAVADO: aparece como está, sem sufixo, e salvar sem mexer não gera PATCH do fornecedor", () => {
  it("gravado igual a uma opção ('Poros - Turquia'): fica selecionado, sem o campo 'Qual fornecedor?'", async () => {
    const s = abrir("Poros - Turquia");
    await nextTick();
    expect(selecionado()).toBe("Poros - Turquia");
    expect(campoOutro()).toBeNull();
    await salvar();
    expect(s.update).toEqual([]);
    expect(s.unchanged).toBe(1);
  });

  it.each(["Can Pharma", "Venecza"])("legado SEM país '%s' (existe no Cadastro): aparece COMO GRAVADO, sem sufixo e sem cair no 'Outro'", async (legado) => {
    const s = abrir(legado);
    await nextTick();
    expect(selecionado()).toBe(legado);
    expect(campoOutro()).toBeNull();
    const lista = await opcoes();
    expect(lista).toContain(legado); // a opção extra com o texto gravado
    expect(lista.filter((o) => o === legado)).toHaveLength(1);
    expect(lista.some((o) => /inativo|fora d[oa] (lista|cadastro)/i.test(o))).toBe(false);
    await salvar();
    expect(s.update).toEqual([]); // nenhum PATCH falso de "mudou o fornecedor"
    expect(s.unchanged).toBe(1);
  });

  it("legado sem país: trocar por um do Cadastro manda SÓ o novo fornecedor", async () => {
    const s = abrir("Can Pharma");
    await nextTick();
    await escolher("Poros - Turquia");
    await salvar();
    expect(s.update).toHaveLength(1);
    expect(s.update[0]![1]).toMatchObject({ fornecedor: "Poros - Turquia" });
    expect(Object.keys(s.update[0]![1]).filter((k) => !["fornecedor", "parcial", "versao"].includes(k))).toEqual([]);
  });

  it("de um do Cadastro para o legado (a opção extra continua escolhível): volta ao texto gravado e não gera PATCH", async () => {
    const s = abrir("Can Pharma");
    await nextTick();
    await escolher("Beldimed - Bélgica");
    await escolher("Can Pharma");
    expect(selecionado()).toBe("Can Pharma");
    await salvar();
    expect(s.update).toEqual([]);
    expect(s.unchanged).toBe(1);
  });

  it("fornecedor INATIVO no Cadastro: '(inativo)' no rótulo, fica selecionado e não gera PATCH", async () => {
    const s = abrir("TESTE Antigo - Peru");
    await nextTick();
    expect(selecionado()).toBe("TESTE Antigo - Peru (inativo)");
    expect(campoOutro()).toBeNull();
    await salvar();
    expect(s.update).toEqual([]);
    expect(s.unchanged).toBe(1);
  });

  it("texto que NÃO está no Cadastro ('Upharm'): segue no 'Outro', como hoje, e não gera PATCH", async () => {
    const s = abrir("Upharm");
    await nextTick();
    expect(selecionado()).toBe("Outro");
    expect(campoOutro()!.value).toBe("Upharm");
    await salvar();
    expect(s.update).toEqual([]);
    expect(s.unchanged).toBe(1);
  });

  it("processo sem fornecedor: 'Selecione' e nada no 'Outro'", async () => {
    abrir(undefined);
    await nextTick();
    expect(selecionado()).toBe("Selecione");
    expect(campoOutro()).toBeNull();
  });
});

describe("'Nacional' (fixo) e 'Outro' (texto livre)", () => {
  it("gravado 'Nacional': fica selecionado como opção fixa, sem 'Outro', e não gera PATCH", async () => {
    const s = abrir("Nacional");
    await nextTick();
    expect(selecionado()).toBe("Nacional");
    expect(campoOutro()).toBeNull();
    await salvar();
    expect(s.update).toEqual([]);
    expect(s.unchanged).toBe(1);
  });

  it("escolher 'Nacional' manda fornecedor 'Nacional'", async () => {
    const s = abrir("Poros - Turquia");
    await nextTick();
    await escolher("Nacional");
    await salvar();
    expect(s.update[0]![1]).toMatchObject({ fornecedor: "Nacional" });
  });

  it("'Outro' continua pedindo o texto e grava o texto digitado (nunca a palavra 'Outro')", async () => {
    const s = abrir("Poros - Turquia");
    await nextTick();
    await escolher("Outro");
    expect(campoOutro()).not.toBeNull();
    await digitarOutro("TESTE Fornecedor Livre");
    await salvar();
    expect(s.update[0]![1]).toMatchObject({ fornecedor: "TESTE Fornecedor Livre" });
  });
});

describe("a lista do Cadastro chega DEPOIS de o formulário abrir", () => {
  it("o valor gravado que caiu no 'Outro' por a lista ainda estar vazia volta a ser a opção, sem PATCH falso", async () => {
    const lista = ref<Partial<CadastrosFollowUp>>({ fornecedores: [] });
    const s = abrir("Can Pharma", () => lista.value);
    await nextTick();
    expect(selecionado()).toBe("Outro"); // ainda sem lista
    expect(campoOutro()!.value).toBe("Can Pharma");

    lista.value = CADASTROS_FOLLOWUP_FIXTURE;
    await nextTick();
    await nextTick();
    expect(selecionado()).toBe("Can Pharma");
    expect(campoOutro()).toBeNull();
    await salvar();
    expect(s.update).toEqual([]);
    expect(s.unchanged).toBe(1);
  });

  it("se a pessoa já mexeu no campo antes da lista chegar, o que ela escolheu NÃO é desfeito", async () => {
    const lista = ref<Partial<CadastrosFollowUp>>({ fornecedores: [] });
    const s = abrir("Can Pharma", () => lista.value);
    await nextTick();
    await digitarOutro("TESTE Outro Digitado");
    lista.value = CADASTROS_FOLLOWUP_FIXTURE;
    await nextTick();
    await nextTick();
    expect(selecionado()).toBe("Outro");
    expect(campoOutro()!.value).toBe("TESTE Outro Digitado");
    await salvar();
    expect(s.update[0]![1]).toMatchObject({ fornecedor: "TESTE Outro Digitado" });
  });
});
