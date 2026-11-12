import { onMounted, reactive, ref, type Ref } from "vue";
import type { Processo, StatusProcesso } from "#shared/types/processo";
import { alvoDeMovimentoValido } from "../utils/processoKanban";

// Arrastar e soltar NATIVO (HTML5 DnD, sem biblioteca) do Kanban do Follow-Up.
//
// - Card `draggable` só com mouse/caneta (hover + ponteiro fino). Em toque o arrastar fica DESLIGADO (o DnD do
//   navegador é instável em toque): o caminho no celular é o menu "Mover para…".
// - Coluna alvo destacada sem piscar: cada coluna conta os dragenter/dragleave dos seus filhos (o dragleave dispara
//   ao passar de um card para outro dentro da mesma coluna); só sai do destaque quando a conta volta a zero.
// - Rolagem horizontal automática do quadro quando o ponteiro chega perto das bordas.
// - Soltar na MESMA coluna (ou num lugar inválido) não faz nada. Soltar numa coluna válida chama `aoSoltar`, que pede
//   a confirmação (o arrastar em si nunca grava nada).

/** Distância da borda do quadro (px) em que a rolagem automática começa, e quanto rola a cada dragover. */
export const MARGEM_ROLAGEM_PX = 64;
export const PASSO_ROLAGEM_PX = 24;

/** Quanto rolar o quadro na horizontal para o ponteiro em `x` (negativo = para a esquerda; 0 = nada). Pura. */
export function deslocamentoAutoRolagem(x: number, esquerda: number, direita: number): number {
  if (x < esquerda + MARGEM_ROLAGEM_PX) return -PASSO_ROLAGEM_PX;
  if (x > direita - MARGEM_ROLAGEM_PX) return PASSO_ROLAGEM_PX;
  return 0;
}

export interface OpcoesArrastarKanban {
  /** Processos visíveis no quadro (para achar o arrastado e conferir a coluna de origem). */
  processos: () => readonly Processo[];
  /** Quadro com rolagem horizontal (para a rolagem automática nas bordas). */
  quadro: Ref<HTMLElement | null>;
  /** O processo pode ser arrastado agora? (ex.: não enquanto está "movendo") */
  podeArrastar: (processo: Processo) => boolean;
  /** Soltou numa coluna válida (diferente da de origem): quem chama pede a confirmação. */
  aoSoltar: (processo: Processo, destino: StatusProcesso) => void;
}

const TIPO_DADO = "text/plain";

export function useArrastarKanban(opcoes: OpcoesArrastarKanban) {
  // Só no cliente, depois de montar (o SSR não sabe o tipo de ponteiro): sem divergência de hidratação.
  const habilitado = ref(false);
  const arrastandoId = ref("");
  const contagem = reactive<Partial<Record<StatusProcesso, number>>>({});
  const colunaAlvo = ref<StatusProcesso | "">("");

  onMounted(() => {
    habilitado.value =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  });

  function arrastado(): Processo | undefined {
    return opcoes.processos().find((p) => p.id === arrastandoId.value);
  }

  function limpar(): void {
    arrastandoId.value = "";
    colunaAlvo.value = "";
    for (const chave of Object.keys(contagem) as StatusProcesso[]) delete contagem[chave];
  }

  function onDragStart(event: DragEvent, processo: Processo): void {
    if (!habilitado.value || !opcoes.podeArrastar(processo)) {
      event.preventDefault();
      return;
    }
    arrastandoId.value = processo.id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(TIPO_DADO, processo.id);
    }
  }

  function onDragEnd(): void {
    limpar();
  }

  /** A coluna é um alvo válido para o card que está sendo arrastado? (destaque e drop) */
  function ehAlvo(status: StatusProcesso): boolean {
    const p = arrastado();
    return !!p && alvoDeMovimentoValido(p, status);
  }

  function onDragEnter(event: DragEvent, status: StatusProcesso): void {
    if (!arrastandoId.value) return;
    event.preventDefault();
    contagem[status] = (contagem[status] ?? 0) + 1;
    colunaAlvo.value = status;
  }

  function onDragOver(event: DragEvent, status: StatusProcesso): void {
    if (!arrastandoId.value) return;
    event.preventDefault(); // permite o drop
    if (event.dataTransfer) event.dataTransfer.dropEffect = ehAlvo(status) ? "move" : "none";
    const quadro = opcoes.quadro.value;
    if (quadro) {
      const r = quadro.getBoundingClientRect();
      const dx = deslocamentoAutoRolagem(event.clientX, r.left, r.right);
      if (dx !== 0) quadro.scrollLeft += dx;
    }
  }

  function onDragLeave(status: StatusProcesso): void {
    if (!arrastandoId.value) return;
    const resto = Math.max(0, (contagem[status] ?? 0) - 1);
    contagem[status] = resto;
    if (resto === 0 && colunaAlvo.value === status) colunaAlvo.value = "";
  }

  function onDrop(event: DragEvent, status: StatusProcesso): void {
    event.preventDefault();
    const id = event.dataTransfer?.getData(TIPO_DADO) || arrastandoId.value;
    const processo = opcoes.processos().find((p) => p.id === id);
    limpar();
    if (!processo || !alvoDeMovimentoValido(processo, status)) return; // mesma coluna: nada
    opcoes.aoSoltar(processo, status);
  }

  /** Destaque da coluna: o card está em cima dela e ela é um destino válido. */
  function destacada(status: StatusProcesso): boolean {
    return colunaAlvo.value === status && ehAlvo(status);
  }

  return {
    habilitado,
    arrastandoId,
    colunaAlvo,
    destacada,
    onDragStart,
    onDragEnd,
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
  };
}
