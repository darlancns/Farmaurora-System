import { reactive, ref } from "vue";
import { STATUS_PROCESSO_LABELS } from "#shared/constants/processos";
import type { Processo, StatusProcesso } from "#shared/types/processo";
import { ApiError } from "../utils/apiFetch";
import { getErrorMessage } from "../utils/errorMessages";
import { createFilaPorChave } from "../utils/filaPorChave";
import { alvoDeMovimentoValido, colunaDoProcesso, textoConfirmacaoMover } from "../utils/processoKanban";

export const MENSAGEM_MOVER_CONFLITO = "Este processo foi alterado por outra pessoa. Confira e tente de novo.";

export interface PedidoMover {
  processo: Processo;
  de: StatusProcesso;
  para: StatusProcesso;
  mensagem: string;
}

export interface DependenciasMover {
  podeEditar: () => boolean;
  /** Processo atual do store (para mandar a versão mais recente que a tela tem). */
  obter: (id: string) => Processo | undefined;
  mover: (id: string, status: StatusProcesso, versao: string) => Promise<Processo>;
  recarregar: (id: string) => Promise<void>;
  toast: (texto: string) => void;
}

/**
 * Fluxo ÚNICO de mudança de coluna no Kanban (arrastar e menu "Mover para…"):
 *  1. `pedir(processo, para)` abre a confirmação (nada é gravado ainda; soltar na mesma coluna é ignorado);
 *  2. `confirmar()` fecha a confirmação, TRAVA o card (`movendo`, por id) e chama POST /mover com
 *     { status, versao = updatedAt do processo na tela } — sem atualização otimista. Por processo, as chamadas são
 *     serializadas (filaPorChave);
 *  3. sucesso: o store já tem o processo novo (o card muda de coluna) + toast "Processo movido para {Y}";
 *     409: recarrega o processo + toast de conflito; outra falha: toast com a mensagem e o card fica onde estava.
 *  `anuncio` é o texto para a região aria-live (leitor de tela).
 */
export function useMoverProcesso(deps: DependenciasMover) {
  const pedido = ref<PedidoMover | null>(null);
  const movendo = reactive(new Set<string>());
  const anuncio = ref("");
  const fila = createFilaPorChave();

  function pedir(processo: Processo, para: StatusProcesso): void {
    if (!deps.podeEditar() || movendo.has(processo.id)) return;
    if (!alvoDeMovimentoValido(processo, para)) return;
    const de = colunaDoProcesso(processo);
    pedido.value = { processo, de, para, mensagem: textoConfirmacaoMover(processo.paciente, de, para) };
  }

  function cancelar(): void {
    pedido.value = null;
  }

  function confirmar(): Promise<void> {
    const atual = pedido.value;
    pedido.value = null;
    if (!atual || !deps.podeEditar()) return Promise.resolve();
    const { processo, para } = atual;
    const id = processo.id;
    const rotulo = STATUS_PROCESSO_LABELS[para];
    movendo.add(id);
    anuncio.value = `Movendo ${processo.paciente} para ${rotulo}…`;

    return fila.enfileirar(id, async () => {
      // A versão é a do processo como a tela o tem AGORA (o store pode ter sido recarregado depois do pedido).
      const versao = (deps.obter(id) ?? processo).updatedAt;
      try {
        await deps.mover(id, para, versao);
        deps.toast(`Processo movido para ${rotulo}`);
        anuncio.value = `${processo.paciente} movido para ${rotulo}.`;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          try {
            await deps.recarregar(id);
          } catch {
            // sem rede: o aviso abaixo já pede para conferir
          }
          deps.toast(MENSAGEM_MOVER_CONFLITO);
          anuncio.value = MENSAGEM_MOVER_CONFLITO;
        } else {
          const msg = getErrorMessage(e, "Erro ao mover processo");
          deps.toast(msg);
          anuncio.value = `Não foi possível mover ${processo.paciente}. ${msg}`;
        }
      } finally {
        movendo.delete(id);
      }
    });
  }

  return { pedido, movendo, anuncio, pedir, cancelar, confirmar };
}
