import { createError } from "h3";
import { padroesAoEntregar } from "../../shared/utils/entregaPadroes";
import type { Processo, ProcessoPatchDTO } from "../../shared/types/processo";
import { MENSAGEM_VERSAO_AUSENTE, nomeTransportadoraEfetivo } from "./processoValidation";

/**
 * Regra do status Entregue num PATCH: SÓ quando o patch muda o status para "entregue" e a linha (`lido`) ainda não estava
 * Entregue (já Entregue = nada a fazer: editar um Entregue antigo, sem data, continua possível). Nesse caso:
 *  1. a Data de entrega é obrigatória, no corpo (`datas.dataEntrega`) ou já gravada; sem ela, 400 com a mensagem padrão de
 *     aba antiga ("Atualize a página (Ctrl+Shift+R)"): o formulário novo sempre a envia;
 *  2. os padrões (pagamento da transportadora e DIR) entram no MESMO patch, só no que está vazio (valor do corpo, senão o gravado).
 * Não olha o resto do patch: a validação dos valores e das combinações já foi feita pelo endpoint.
 *
 * `lido` é a linha como acabou de ser lida: quem grava a condiciona ao updated_at dessa leitura (atômico). `parcial` = o
 * formato por chave do PATCH (sem ele, `datas` ausente de uma chave a limpa, como em colunasDeDTO).
 */
export function aplicarEntregaNoPatch(patch: ProcessoPatchDTO, lido: Processo, parcial: boolean): ProcessoPatchDTO {
  if (patch.status !== "entregue" || lido.status === "entregue") return patch;

  const corpo = patch as Record<string, unknown>;
  const datas = patch.datas;
  let data: string | null | undefined;
  if (datas !== undefined && "dataEntrega" in datas) data = datas.dataEntrega?.trim() || null;
  else if (datas !== undefined && !parcial) data = null; // formato antigo: a chave ausente limpa a coluna
  else data = lido.datas.dataEntrega ?? null;
  if (!data) {
    throw createError({ statusCode: 400, statusMessage: MENSAGEM_VERSAO_AUSENTE });
  }

  const nome = nomeTransportadoraEfetivo(corpo, lido.transportadoraNacional?.nome, parcial);
  const padroes = padroesAoEntregar({
    modalEnvio: ("modalEnvio" in patch ? patch.modalEnvio : lido.modalEnvio) ?? undefined,
    transportadoraNacional: nome ? { nome } : undefined,
    pagamentoTransportadora:
      ("pagamentoTransportadora" in patch ? patch.pagamentoTransportadora : lido.pagamentoTransportadora) ?? undefined,
    dirProtocolo: ("dirProtocolo" in patch ? patch.dirProtocolo : lido.dirProtocolo) ?? undefined,
  });
  return { ...patch, ...padroes };
}
