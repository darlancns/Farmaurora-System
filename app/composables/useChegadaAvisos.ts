import { useState } from "#app";
import type { ChegadaAvisoVisto, ChegadaPedidoDTO } from "#shared/types/chegadaAviso";
import type { Processo } from "#shared/types/processo";
import { chaveAvisoChegadaVisto } from "#shared/utils/avisoChegada";
import { ApiError, apiFetch } from "../utils/apiFetch";
import { useProcessos } from "./useProcessos";

// Depois de um 409 ("já foi atualizado"), a mensagem fica um instante na tela antes do item sair: o processo é
// recarregado só depois desta pausa.
export const ATRASO_RECARGA_APOS_409_MS = 4000;

// Ações do aviso "chegou?" do sino: o operacional responsável responde ("Sim, chegou" / "Ainda não") e o
// administrador dispensa pelo olhinho. Os dois lados mudam o estado local só DEPOIS da resposta do servidor
// (o item fica na tela, com a mensagem, se algo falhar). Erros sobem para quem chamou (o item mostra a mensagem).
export function useChegadaAvisos() {
  const { processos, recarregarProcesso } = useProcessos();

  // Dispensas do administrador logado, como chaves processoId|dataPrevista. `vistosCarregados` evita mostrar por um
  // instante avisos que ele já dispensou, antes da leitura chegar.
  const vistos = useState<string[]>("chegada-avisos-vistos", () => []);
  const vistosCarregados = useState<boolean>("chegada-avisos-vistos-carregados", () => false);

  async function fetchVistos(): Promise<void> {
    try {
      const lista = await apiFetch<ChegadaAvisoVisto[]>(
        "/api/chegada-avisos/vistos",
        undefined,
        "Falha ao carregar os avisos já vistos.",
      );
      vistos.value = lista.map((v) => chaveAvisoChegadaVisto(v.processoId, v.dataPrevista));
    } catch {
      // Sem a leitura, o administrador vê os avisos de novo (nada se perde); o próximo carregamento corrige.
    } finally {
      vistosCarregados.value = true;
    }
  }

  async function marcarVisto(aviso: { processoId: string; dataPrevista: string }): Promise<void> {
    await apiFetch<{ visto: true }>(
      "/api/chegada-avisos/visto",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processoId: aviso.processoId, dataPrevista: aviso.dataPrevista }),
      },
      "Erro ao marcar o aviso como visto.",
    );
    const chave = chaveAvisoChegadaVisto(aviso.processoId, aviso.dataPrevista);
    if (!vistos.value.includes(chave)) vistos.value = [...vistos.value, chave];
  }

  async function responder(processoId: string, pedido: ChegadaPedidoDTO): Promise<void> {
    try {
      const atualizado = await apiFetch<Processo>(
        `/api/processos/${processoId}/chegada`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pedido),
        },
        "Erro ao registrar a resposta.",
      );
      // O servidor devolve o processo já com o novo status/data e a atualização: o aviso deixa de ser devido.
      const indice = processos.value.findIndex((p) => p.id === processoId);
      if (indice !== -1) processos.value[indice] = atualizado;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setTimeout(() => {
          void recarregarProcesso(processoId).catch(() => {});
        }, ATRASO_RECARGA_APOS_409_MS);
      }
      throw e;
    }
  }

  const confirmarChegada = (processoId: string): Promise<void> => responder(processoId, { acao: "confirmar" });
  const adiarChegada = (processoId: string, novaData: string): Promise<void> =>
    responder(processoId, { acao: "adiar", novaData });

  return { vistos, vistosCarregados, fetchVistos, marcarVisto, confirmarChegada, adiarChegada };
}
