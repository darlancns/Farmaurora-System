import { reactive, ref } from "vue";
import { STATUS_PROCESSO_LABELS } from "#shared/constants/processos";
import type { Processo, StatusProcesso } from "#shared/types/processo";
import { hojeBrasilia, parseDataISO } from "#shared/utils/dataBrasilia";
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
  // "confirmar" = o ConfirmDialog "Mover processo" de sempre; "entrega" = destino Entregue: a página abre o modal "Confirme a
  // data de entrega" no lugar dele (ProcessoEntregaModal) e `confirmar(dataEntrega)` leva a data ao servidor.
  tipo: "confirmar" | "entrega";
  // Só no tipo "entrega" ("AAAA-MM-DD"): a data de entrega já gravada (voltando a Entregue) ou hoje de Brasília.
  dataInicial?: string;
}

export interface DependenciasMover {
  podeEditar: () => boolean;
  /** Processo atual do store (para mandar a versão mais recente que a tela tem). */
  obter: (id: string) => Processo | undefined;
  mover: (id: string, status: StatusProcesso, versao: string, dataEntrega?: string) => Promise<Processo>;
  recarregar: (id: string) => Promise<void>;
  toast: (texto: string) => void;
}

/**
 * Fluxo ÚNICO de mudança de coluna no Kanban (arrastar e menu "Mover para…"):
 *  1. `pedir(processo, para)` abre a confirmação (nada é gravado ainda; soltar na mesma coluna é ignorado). Para Entregue o
 *     pedido é do tipo "entrega" (a página mostra o modal da data de entrega, com a data inicial); os outros destinos
 *     seguem com o ConfirmDialog;
 *  2. `confirmar(dataEntrega?)` fecha a confirmação, TRAVA o card (`movendo`, por id) e chama POST /mover com
 *     { status, versao = updatedAt do processo na tela, dataEntrega (só ao entregar) } — sem atualização otimista. Zerar
 *     `pedido` é síncrono: um 2º clique não envia de novo. Por processo, as chamadas são serializadas (filaPorChave);
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
    const mensagem = textoConfirmacaoMover(processo.paciente, de, para);
    if (para === "entregue") {
      const gravada = processo.datas?.dataEntrega?.trim() ?? "";
      const dataInicial = parseDataISO(gravada) ? gravada : hojeBrasilia();
      pedido.value = { processo, de, para, mensagem, tipo: "entrega", dataInicial };
      return;
    }
    pedido.value = { processo, de, para, mensagem, tipo: "confirmar" };
  }

  function cancelar(): void {
    const atual = pedido.value;
    pedido.value = null;
    // Nada a reverter (não há atualização otimista, o card nunca saiu do lugar): só o aviso para leitor de tela.
    if (atual?.tipo === "entrega") anuncio.value = `Entrega de ${atual.processo.paciente} cancelada.`;
  }

  function confirmar(dataEntrega?: string): Promise<void> {
    const atual = pedido.value;
    // Entrega sem data não segue (o modal só confirma com data válida): o pedido continua aberto.
    if (atual?.tipo === "entrega" && !(typeof dataEntrega === "string" && dataEntrega.trim() !== "")) {
      return Promise.resolve();
    }
    pedido.value = null;
    if (!atual || !deps.podeEditar()) return Promise.resolve();
    const { processo, para } = atual;
    const dataDaEntrega = atual.tipo === "entrega" ? dataEntrega!.trim() : undefined;
    const id = processo.id;
    const rotulo = STATUS_PROCESSO_LABELS[para];
    movendo.add(id);
    anuncio.value = `Movendo ${processo.paciente} para ${rotulo}…`;

    return fila.enfileirar(id, async () => {
      // A versão é a do processo como a tela o tem AGORA (o store pode ter sido recarregado depois do pedido).
      const versao = (deps.obter(id) ?? processo).updatedAt;
      try {
        // A data só vai ao entregar (os outros destinos chamam como sempre, com 3 argumentos).
        if (dataDaEntrega !== undefined) await deps.mover(id, para, versao, dataDaEntrega);
        else await deps.mover(id, para, versao);
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
