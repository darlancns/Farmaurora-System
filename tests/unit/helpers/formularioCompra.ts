import { createApp, defineComponent, h, nextTick, ref, type Ref } from "vue";
import type { Compra, MudancasCompra } from "../../../shared/types/compra";
import { courierSimplesDasOrdens } from "../../../shared/utils/compraForm";
import CompraFormulario from "../../../app/components/compras/CompraFormulario.vue";
import { OPCOES_VAZIAS, type OpcoesFormulario } from "../../../app/utils/comprasBlocos";
import type { AcoesCompra } from "../../../app/utils/comprasContexto";

// O formulário REAL no happy-dom, ligado a um estado como o do editor: cada `alterar` vira a nova compra (e o Courier Simples é
// derivado das ordens, como em useCompraEditor). Assim os testes seguem o que a pessoa vê depois de cada mudança.

export const compraTeste = (extra: Partial<Compra> = {}): Compra => ({
  id: "cmp_1",
  anoMes: "2026-11",
  sequencia: 1,
  cancelada: false,
  paciente: "",
  processoNumero: "",
  medico: "",
  localAplicacao: "",
  entrega: "",
  contatos: "",
  termoObservacao: "",
  despachante: "",
  isencaoPara: "",
  observacoes: "",
  vendedor: "",
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

export interface FormularioMontado {
  compra: Ref<Compra>;
  mudancas: MudancasCompra[];
  desmontar: () => void;
  /** Troca a compra de fora (como carregar a versão salva ou abrir outra). */
  trocarCompra: (c: Compra) => Promise<void>;
  /** Liga/desliga o somente leitura. */
  somenteLeitura: Ref<boolean>;
  opcoes: Ref<OpcoesFormulario>;
}

export function montarFormulario(inicial: Compra, extra: { opcoes?: Partial<OpcoesFormulario>; podeEditar?: boolean; acoes?: AcoesCompra } = {}): FormularioMontado {
  const compra = ref(inicial) as Ref<Compra>;
  const mudancas: MudancasCompra[] = [];
  const somenteLeitura = ref(extra.podeEditar === false);
  const opcoes = ref<OpcoesFormulario>({ ...OPCOES_VAZIAS, ...(extra.opcoes ?? {}) });
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(
    defineComponent({
      render: () =>
        h(CompraFormulario, {
          compra: compra.value,
          estado: "ocioso",
          salvoEm: null,
          podeEditar: !somenteLeitura.value,
          opcoes: opcoes.value,
          ...(extra.acoes ? { acoes: extra.acoes } : {}),
          onAlterar: (m: MudancasCompra) => {
            mudancas.push(m);
            const nova = { ...compra.value, ...m };
            if (m.ordens) nova.courierSimples = courierSimplesDasOrdens(nova.ordens);
            compra.value = nova;
          },
        }),
    }),
  );
  app.mount(el);
  return {
    compra,
    mudancas,
    somenteLeitura,
    opcoes,
    desmontar: () => {
      app.unmount();
      el.remove();
    },
    trocarCompra: async (c) => {
      compra.value = c;
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
