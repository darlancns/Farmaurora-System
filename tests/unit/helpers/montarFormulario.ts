import { createApp, defineComponent, h, nextTick, ref, type Ref } from "vue";
import type { Compra, MudancasCompra } from "../../../shared/types/compra";
import CompraFormulario from "../../../app/components/compras/CompraFormulario.vue";
import { useCompraEditor, type CompraEditor } from "../../../app/composables/useCompraEditor";
import type { AcoesCompra } from "../../../app/utils/comprasContexto";
import { OPCOES_VAZIAS, type OpcoesFormulario } from "../../../app/utils/comprasOpcoes";
import { compraDeTeste, compraVaziaDeTeste, itemDeTeste } from "./compraFixtures";

// O formulário REAL no happy-dom, ligado ao editor REAL (useCompraEditor, sem rede): cada `alterar` do formulário passa por ele (a cia
// some ao trocar o envio, o somente leitura bloqueia, etc.). Assim os testes seguem o que a pessoa vê depois de cada mudança.

export { compraDeTeste, compraVaziaDeTeste, itemDeTeste };

/** Uma compra pronta para o formulário: vazia, com UM medicamento vazio (como a "+ Nova compra" deixa). */
export const compraComUmMedicamento = (extra: Partial<Compra> = {}): Compra => compraVaziaDeTeste({ itens: [itemDeTeste(1, { medicamento: "" })], ...extra });

export interface FormularioMontado {
  editor: CompraEditor;
  /** O estado atual da compra no editor. */
  compra: () => Compra;
  mudancas: MudancasCompra[];
  desmontar: () => void;
  /** Troca a compra de fora (como carregar a versão salva ou abrir outra). */
  trocarCompra: (c: Compra) => Promise<void>;
  somenteLeitura: Ref<boolean>;
  opcoes: Ref<OpcoesFormulario>;
  pedidoDeFoco: Ref<number>;
}

export function montarFormulario(inicial: Compra, extra: { opcoes?: Partial<OpcoesFormulario>; podeEditar?: boolean; acoes?: AcoesCompra } = {}): FormularioMontado {
  const somenteLeitura = ref(extra.podeEditar === false);
  const opcoes = ref<OpcoesFormulario>({ ...OPCOES_VAZIAS, ...(extra.opcoes ?? {}) });
  const pedidoDeFoco = ref(0);
  const mudancas: MudancasCompra[] = [];
  const editor = useCompraEditor({
    somenteLeitura: () => somenteLeitura.value,
    api: { obter: async () => inicial, salvar: async () => inicial },
    debounceMs: 3_600_000, // nenhum autosave durante o teste
  });
  editor.definir(inicial);

  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () =>
        h(CompraFormulario, {
          compra: editor.compra.value as Compra,
          estado: "ocioso",
          salvoEm: null,
          podeEditar: !somenteLeitura.value,
          opcoes: opcoes.value,
          pedidoDeFocoMedicamento: pedidoDeFoco.value,
          ...(extra.acoes ? { acoes: extra.acoes } : {}),
          onAlterar: (m: MudancasCompra) => {
            mudancas.push(m);
            editor.alterar(m);
          },
        }),
    }),
  );
  app.mount(el);
  return {
    editor,
    compra: () => editor.compra.value as Compra,
    mudancas,
    somenteLeitura,
    opcoes,
    pedidoDeFoco,
    desmontar: () => {
      app.unmount();
      el.remove();
      editor.definir(null);
    },
    trocarCompra: async (c) => {
      editor.definir(c);
      await nextTick();
    },
  };
}

export const q = <T extends Element>(sel: string): T | null => document.querySelector<T>(sel);
export const qa = <T extends Element>(sel: string): T[] => [...document.querySelectorAll<T>(sel)];
export const texto = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

export async function digitar(sel: string, valor: string): Promise<void> {
  const campo = q<HTMLInputElement | HTMLTextAreaElement>(sel);
  if (!campo) throw new Error(`campo não encontrado: ${sel}`);
  campo.value = valor;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}

export async function marcar(sel: string, marcado: boolean): Promise<void> {
  const campo = q<HTMLInputElement>(sel);
  if (!campo) throw new Error(`campo não encontrado: ${sel}`);
  campo.checked = marcado;
  campo.dispatchEvent(new Event("change", { bubbles: true }));
  await nextTick();
}

export async function clicar(sel: string): Promise<void> {
  const el = q<HTMLElement>(sel);
  if (!el) throw new Error(`elemento não encontrado: ${sel}`);
  el.click();
  await nextTick();
}

/** O AppSelect escolhe no mousedown: abre o campo e escolhe a opção pelo texto. */
export async function escolherNoSelect(sel: string, rotulo: string): Promise<void> {
  await clicar(sel);
  const opcao = qa<HTMLElement>("[role=option]").find((o) => texto(o) === rotulo);
  if (!opcao) throw new Error(`opção não encontrada: ${rotulo} (há: ${qa("[role=option]").map((o) => texto(o)).join(" | ")})`);
  opcao.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await nextTick();
}

/** As ações do servidor simuladas (nada de rede). */
export function acoesFalsas(extra: Partial<AcoesCompra> = {}): AcoesCompra {
  return {
    buscarMedicamentos: async () => [],
    registrarTemperatura: async (nome) => ({ tipo: "criada", nome }),
    pedirPreCadastro: async () => ({ tipo: "pre-cadastro", id: "pre_teste_1" }),
    avisar: () => undefined,
    ...extra,
  };
}

/** Espera o que está no ar (debounce do combobox, promessas) e o próximo desenho. */
export async function esperar(ms = 0): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
  await nextTick();
}
