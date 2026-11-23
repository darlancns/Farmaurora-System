// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import type { CadastrosFollowUp } from "#shared/types/Cadastro";
import type { NewProcessoDTO, Processo, ProcessoFormPatchPayload } from "#shared/types/processo";
import ProcessoFormModal from "../../app/components/processos/ProcessoFormModal.vue";
import { montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { CADASTROS_FOLLOWUP_FIXTURE } from "./helpers/cadastrosFollowUpFixtures";
import { CONSULTORES_FIXTURE } from "./helpers/consultoresFixtures";
import { linhaCompleta } from "./helpers/processoEdicaoFixtures";

// ETAPA 5: Despachante e Transportadora nacional do formulário do Follow-Up pelo CADASTRO: SELECT dos ATIVOS, sem "Outro", e o valor gravado fora
// da lista (nome de pessoa antigo, transportadora que não está no Cadastro) aparece COMO ESTÁ GRAVADO, sem sufixo, sem apagar e sem PATCH falso.
// O valor segue sendo o TEXTO do nome (entregaPadroes.ts casa AJC/Doctor por ele). O servidor não valida contra o Cadastro. Dados fictícios (TESTE).

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
  submit: NewProcessoDTO[];
  invalid: string[];
  unchanged: number;
}

function abrir(extra: Record<string, unknown> | null, cadastros: () => Partial<CadastrosFollowUp> = () => CADASTROS_FOLLOWUP_FIXTURE): Saida {
  const saida: Saida = { update: [], submit: [], invalid: [], unchanged: 0 };
  const processo: Processo | null = extra === null ? null : montarProcesso(linhaCompleta(extra) as unknown as FollowUpRow);
  raiz = document.createElement("div");
  document.body.appendChild(raiz);
  app = createApp(
    defineComponent({
      render: () =>
        h(ProcessoFormModal, {
          editingProcesso: processo,
          consultores: CONSULTORES_FIXTURE,
          cadastros: cadastros(),
          onSubmit: (p: NewProcessoDTO) => saida.submit.push(p),
          onUpdate: (id: string, p: ProcessoFormPatchPayload) => saida.update.push([id, p]),
          onUnchanged: () => saida.unchanged++,
          onInvalid: (m: string) => saida.invalid.push(m),
        }),
    }),
  );
  app.mount(raiz);
  return saida;
}

const selecionado = (id: string): string => texto($(`#${id}`));

async function opcoes(id: string): Promise<string[]> {
  $<HTMLButtonElement>(`#${id}`)!.click();
  await nextTick();
  const lista = [...document.querySelectorAll<HTMLElement>(`#${id}-listbox [role='option']`)].map((o) => texto(o));
  $<HTMLButtonElement>(`#${id}`)!.click(); // fecha
  await nextTick();
  return lista;
}

async function escolher(id: string, rotulo: string): Promise<void> {
  $<HTMLButtonElement>(`#${id}`)!.click();
  await nextTick();
  const alvo = [...document.querySelectorAll<HTMLElement>(`#${id}-listbox [role='option']`)].find((o) => texto(o) === rotulo);
  if (!alvo) throw new Error(`opção não encontrada em #${id}: ${rotulo}`);
  alvo.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await nextTick();
}

async function salvar(): Promise<void> {
  $("#processo-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
}

// ── Transportadora nacional ────────────────────────────────────────────────────────────────────────────────
describe("Transportadora nacional: select do Cadastro", () => {
  it("'Selecione' + as ATIVAS do Cadastro, SEM 'Outro' e sem inativas", async () => {
    abrir({ transportadora_nacional_nome: "AJC" });
    await nextTick();
    expect(await opcoes("pf-transp-nome")).toEqual(["Selecione", "AJC", "Doctor", "TESTE Transportadora Beta"]);
  });

  it("não é mais um campo de texto: é o botão do select", async () => {
    abrir({});
    await nextTick();
    expect($("#pf-transp-nome")!.tagName).toBe("BUTTON");
    expect($("#pf-transp-nome")!.getAttribute("role") ?? "combobox").toBeTruthy();
  });

  it("gravada igual a uma ativa ('AJC'): fica selecionada e salvar sem mexer não gera PATCH", async () => {
    const s = abrir({ transportadora_nacional_nome: "AJC" });
    await nextTick();
    expect(selecionado("pf-transp-nome")).toBe("AJC");
    await salvar();
    expect(s.update).toEqual([]);
    expect(s.unchanged).toBe(1);
  });

  it("gravada que casa por chave mas não é EXATA ('ajc'): aparece como está (não fica em branco) e não gera PATCH", async () => {
    const s = abrir({ transportadora_nacional_nome: "ajc" });
    await nextTick();
    expect(selecionado("pf-transp-nome")).toBe("ajc");
    expect(await opcoes("pf-transp-nome")).toContain("ajc");
    await salvar();
    expect(s.update).toEqual([]);
    expect(s.unchanged).toBe(1);
  });

  it("gravada que NÃO está no Cadastro ('Braspress'): aparece COMO ESTÁ GRAVADA, sem sufixo, e não gera PATCH", async () => {
    const s = abrir({ transportadora_nacional_nome: "Braspress" });
    await nextTick();
    expect(selecionado("pf-transp-nome")).toBe("Braspress");
    const lista = await opcoes("pf-transp-nome");
    expect(lista).toEqual(["Selecione", "AJC", "Doctor", "TESTE Transportadora Beta", "Braspress"]);
    expect(lista.some((o) => /inativo|fora d[oa] (lista|cadastro)/i.test(o))).toBe(false);
    await salvar();
    expect(s.update).toEqual([]);
    expect(s.unchanged).toBe(1);
  });

  it("gravada INATIVA no Cadastro: '(inativo)' no rótulo, selecionada, sem PATCH", async () => {
    const s = abrir({ transportadora_nacional_nome: "TESTE Transportadora Antiga" });
    await nextTick();
    expect(selecionado("pf-transp-nome")).toBe("TESTE Transportadora Antiga (inativo)");
    await salvar();
    expect(s.update).toEqual([]);
    expect(s.unchanged).toBe(1);
  });

  it("trocar a gravada por uma do Cadastro manda SÓ o nome (cotação e valor ficam como estão); voltar à gravada não gera PATCH", async () => {
    const s = abrir({ transportadora_nacional_nome: "Braspress" });
    await nextTick();
    await escolher("pf-transp-nome", "Doctor");
    await salvar();
    expect(s.update).toHaveLength(1);
    expect(s.update[0]![1]).toEqual({ transportadoraNacional: { nome: "Doctor" }, parcial: true });
    app!.unmount();
    raiz!.remove();

    const s2 = abrir({ transportadora_nacional_nome: "Braspress" });
    await nextTick();
    await escolher("pf-transp-nome", "Doctor");
    await escolher("pf-transp-nome", "Braspress");
    await salvar();
    expect(s2.update).toEqual([]);
    expect(s2.unchanged).toBe(1);
  });

  it("'Selecione' esvazia a transportadora, como apagar o texto antes: sem cotação nem valor o servidor limpa o bloco (nome null)", async () => {
    const s = abrir({ transportadora_nacional_nome: "AJC", transportadora_nacional_cotacao: null, transportadora_nacional_valor: null });
    await nextTick();
    await escolher("pf-transp-nome", "Selecione");
    await salvar();
    expect(JSON.parse(JSON.stringify(s.update[0]![1]))).toEqual({ transportadoraNacional: null, parcial: true });
  });

  it("'Selecione' com cotação ou valor preenchidos: a regra de sempre pede o nome ou a limpeza deles (nada é enviado)", async () => {
    const s = abrir({ transportadora_nacional_nome: "AJC" }); // a fixture tem cotação 'COT-9' e valor 1500
    await nextTick();
    await escolher("pf-transp-nome", "Selecione");
    await salvar();
    expect(s.invalid).toContain("Informe o nome da transportadora ou limpe a cotação e o valor.");
    expect(s.update).toEqual([]);
  });

  it("o valor é o TEXTO do nome: escolher 'AJC' faz o Pagamento da transportadora (AJC/Doctor) aparecer quando Entregue", async () => {
    abrir({ status: "entregue", transportadora_nacional_nome: "Braspress", data_entrega: "2026-11-20" });
    await nextTick();
    expect($("#pf-transp-pagamento")).toBeNull();
    await escolher("pf-transp-nome", "AJC");
    await nextTick();
    expect($("#pf-transp-pagamento")).not.toBeNull();
  });

  it("a lista do Cadastro ainda VAZIA (carregando): a gravada já aparece como está; quando a lista chega, continua igual e sem PATCH", async () => {
    const lista = ref<Partial<CadastrosFollowUp>>({ transportadoras: [], despachantes: [], fornecedores: [] });
    const s = abrir({ transportadora_nacional_nome: "AJC" }, () => lista.value);
    await nextTick();
    expect(selecionado("pf-transp-nome")).toBe("AJC");
    expect(await opcoes("pf-transp-nome")).toEqual(["Selecione", "AJC"]);
    lista.value = CADASTROS_FOLLOWUP_FIXTURE;
    await nextTick();
    expect(selecionado("pf-transp-nome")).toBe("AJC");
    expect(await opcoes("pf-transp-nome")).toEqual(["Selecione", "AJC", "Doctor", "TESTE Transportadora Beta"]);
    await salvar();
    expect(s.update).toEqual([]);
    expect(s.unchanged).toBe(1);
  });
});

// ── Despachante ────────────────────────────────────────────────────────────────────────────────────────────
describe("Despachante: a EMPRESA do Cadastro (STAR CUSTOMS, SOUTH AMERICA)", () => {
  it("'Selecione' + as ATIVAS do Cadastro, sem 'Outro', sem inativas e sem os nomes de pessoa de antes", async () => {
    abrir({ despachante: "STAR CUSTOMS" });
    await nextTick();
    expect(await opcoes("pf-despachante")).toEqual(["Selecione", "STAR CUSTOMS", "SOUTH AMERICA"]);
  });

  it.each(["Andreza Faconi", "Marcelo Lima", "Bruno Lopes"])(
    "processo gravado com '%s' (nome de pessoa, antes do Cadastro): aparece COMO ESTÁ GRAVADO, sem sufixo, e salvar sem mexer não gera PATCH",
    async (pessoa) => {
      const s = abrir({ despachante: pessoa });
      await nextTick();
      expect(selecionado("pf-despachante")).toBe(pessoa);
      const lista = await opcoes("pf-despachante");
      expect(lista).toEqual(["Selecione", "STAR CUSTOMS", "SOUTH AMERICA", pessoa]);
      await salvar();
      expect(s.update).toEqual([]);
      expect(s.unchanged).toBe(1);
    },
  );

  it("trocar a pessoa gravada pela empresa do Cadastro manda SÓ o despachante; voltar à gravada não gera PATCH", async () => {
    const s = abrir({ despachante: "Andreza Faconi" });
    await nextTick();
    await escolher("pf-despachante", "STAR CUSTOMS");
    await salvar();
    expect(s.update[0]![1]).toEqual({ despachante: "STAR CUSTOMS", parcial: true });
    app!.unmount();
    raiz!.remove();

    const s2 = abrir({ despachante: "Andreza Faconi" });
    await nextTick();
    await escolher("pf-despachante", "SOUTH AMERICA");
    await escolher("pf-despachante", "Andreza Faconi");
    await salvar();
    expect(s2.update).toEqual([]);
    expect(s2.unchanged).toBe(1);
  });

  it("despachante INATIVO no Cadastro: '(inativo)' no rótulo, selecionado, sem PATCH", async () => {
    const s = abrir({ despachante: "TESTE Despachante Antigo" });
    await nextTick();
    expect(selecionado("pf-despachante")).toBe("TESTE Despachante Antigo (inativo)");
    await salvar();
    expect(s.update).toEqual([]);
    expect(s.unchanged).toBe(1);
  });

  it("Courier Simples (sem despachante): o gravado fica oculto e intacto, e nada vai no PATCH", async () => {
    const s = abrir({ modal_envio: "Courier Simples", despachante: "Andreza Faconi", companhia_aerea: "DHL" });
    await nextTick();
    expect($("#pf-despachante")).toBeNull();
    await salvar();
    expect(s.update).toEqual([]);
    expect(s.unchanged).toBe(1);
  });

  it("criação: Air Cargo exige o Despachante (a regra de sempre) e aceita o do Cadastro", async () => {
    const s = abrir(null);
    await nextTick();
    const campo = $<HTMLInputElement>("#pf-paciente")!;
    campo.value = "maria";
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    await escolher("pf-consultor", "Dani");
    await escolher("pf-modal", "Air Cargo");
    await salvar();
    expect(s.invalid).toContain("Despachante é obrigatório para o envio selecionado.");
    expect(s.submit).toEqual([]);

    await escolher("pf-despachante", "STAR CUSTOMS");
    await salvar();
    expect(s.invalid.filter((m) => m.startsWith("Despachante"))).toHaveLength(1); // nenhum erro novo de despachante
  });

  it("a lista do Cadastro ainda VAZIA: o gravado já aparece e, quando ela chega, ganha as empresas sem mudar nada", async () => {
    const lista = ref<Partial<CadastrosFollowUp>>({ despachantes: [], transportadoras: [], fornecedores: [] });
    const s = abrir({ despachante: "Marcelo Lima" }, () => lista.value);
    await nextTick();
    expect(await opcoes("pf-despachante")).toEqual(["Selecione", "Marcelo Lima"]);
    lista.value = CADASTROS_FOLLOWUP_FIXTURE;
    await nextTick();
    expect(selecionado("pf-despachante")).toBe("Marcelo Lima");
    expect(await opcoes("pf-despachante")).toEqual(["Selecione", "STAR CUSTOMS", "SOUTH AMERICA", "Marcelo Lima"]);
    await salvar();
    expect(s.update).toEqual([]);
    expect(s.unchanged).toBe(1);
  });
});
