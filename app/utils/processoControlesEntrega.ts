import { DIRS_PROTOCOLO_CONCLUIDOS, ROTULOS_DIR_PROTOCOLO, isDirProtocolo, isPagamentoTransportadora } from "#shared/constants/processos";
import type { Processo } from "#shared/types/processo";
import { controlesAplicaveis, dirValidoParaModal } from "#shared/utils/entregaPadroes";

// Controles do status Entregue (Pagamento da transportadora e DIR e Protocolo) já prontos para a TELA: o card, o painel, o
// detalhe da Lista e a busca usam esta função única, então o texto e a regra de quando aparecem nunca divergem.
// Regra: só com status Entregue, só se o controle SE APLICA ao envio/transportadora (controlesAplicaveis) e só com valor
// válido. Entregue antigo (sem valor) e qualquer outro status devolvem lista vazia. Testes: processoControlesEntrega.spec.ts.

export type ChaveControleEntrega = "pagamento" | "dir";
export type EstadoControleEntrega = "pendente" | "concluido";

export interface ControleEntrega {
  chave: ChaveControleEntrega;
  /** O que aparece: "AJC pendente", "Doctor pago", "Pegar DIR e Protocolo", "DIR no Drive"... Sempre com o nome (não depende da cor). */
  texto: string;
  estado: EstadoControleEntrega;
  /** Rótulo do campo, para leitor de tela e painel. */
  rotulo: string;
}

export type ProcessoControlesEntrega = Pick<
  Processo,
  "status" | "modalEnvio" | "transportadoraNacional" | "pagamentoTransportadora" | "dirProtocolo"
>;

export const ROTULO_PAGAMENTO_TRANSPORTADORA = "Pagamento da transportadora";
export const ROTULO_DIR_PROTOCOLO = "DIR e Protocolo";

/** Os controles a mostrar (0, 1 ou 2), na ordem Pagamento, DIR. */
export function controlesEntregaParaTela(processo: ProcessoControlesEntrega): ControleEntrega[] {
  if (processo.status !== "entregue") return [];
  const aplicaveis = controlesAplicaveis(processo);
  const lista: ControleEntrega[] = [];
  const pagamento = processo.pagamentoTransportadora;
  if (aplicaveis.pagamentoTransportadora && isPagamentoTransportadora(pagamento)) {
    lista.push({
      chave: "pagamento",
      texto: `${aplicaveis.pagamentoTransportadora} ${pagamento === "pago" ? "pago" : "pendente"}`,
      estado: pagamento === "pago" ? "concluido" : "pendente",
      rotulo: ROTULO_PAGAMENTO_TRANSPORTADORA,
    });
  }
  const dir = processo.dirProtocolo;
  // O valor também precisa valer para o envio (o Formal nunca mostra "DIR e Protocolo"; o servidor já recusa essa combinação).
  if (aplicaveis.dir && isDirProtocolo(dir) && dirValidoParaModal(processo.modalEnvio, dir)) {
    lista.push({
      chave: "dir",
      texto: ROTULOS_DIR_PROTOCOLO[dir],
      estado: DIRS_PROTOCOLO_CONCLUIDOS.includes(dir) ? "concluido" : "pendente",
      rotulo: ROTULO_DIR_PROTOCOLO,
    });
  }
  return lista;
}
