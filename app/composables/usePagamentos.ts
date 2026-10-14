import { useState } from "#app";
import type {
  AtualizarCotacaoDTO,
  AtualizarLancamentoBancoDTO,
  BancoCambio,
  EmpresaPagamento,
  GrupoPagamento,
  LancamentoBanco,
  LoteBanco,
  NovoGrupoPagamentoDTO,
  NovoLancamentoBancoDTO,
  StatusItemGrupo,
  TipoGrupoPagamento,
} from "#shared/types/Pagamento";
import { apiFetch, deleteTolerant } from "../utils/apiFetch";
import { criarFilaPorChave, criarGuardaSequencia } from "../utils/respostaMaisRecente";

interface BancoPayload {
  lotes: LoteBanco[];
  lancamentos: LancamentoBanco[];
}

function tipoPath(tipo: TipoGrupoPagamento): "despachante" | "transportadora" {
  return tipo === "DESPACHANTE" ? "despachante" : "transportadora";
}

// ── Corrida de respostas do Banco ───────────────────────────────────────────
// Toda resposta de /api/pagamentos/banco* e /cotacao devolve o payload INTEIRO
// (lotes + lançamentos) e substitui o estado. Se uma resposta mais antiga chega
// depois de uma mais nova, o estado volta no tempo (ex.: lote "sem banco" depois
// de o banco ter sido escolhido). Por isso:
//  1. contador de sequência GLOBAL (módulo, compartilhado entre todas as
//     chamadas de usePagamentos): cada requisição recebe um número ao ser
//     disparada, e a resposta só é aplicada se nenhuma mais nova já foi aplicada;
//  2. fila POR LOTE para os PATCHes de cotação: autosave de taxas e escolha do
//     banco do mesmo lote nunca ficam em voo ao mesmo tempo, então a escolha só
//     sai depois que o salvamento anterior terminou (o servidor também recusa
//     edição de lote já cotado, 409 — a ordem importa).
// Estado de módulo: só é usado no cliente (nenhuma dessas chamadas roda no SSR).
const guardaBanco = criarGuardaSequencia();
const filaCotacao = criarFilaPorChave();

export function usePagamentos() {
  const empresaSelecionada = useState<EmpresaPagamento>("pagamentos-empresa", () => "FARMAURORA");
  const dataSelecionada = useState<string>("pagamentos-data", () => new Date().toISOString().slice(0, 10));

  const lotesBanco = useState<LoteBanco[]>("pagamentos-lotes", () => []);
  const lancamentosBanco = useState<LancamentoBanco[]>("pagamentos-lancamentos", () => []);
  const gruposDespachante = useState<GrupoPagamento[]>("pagamentos-despachante", () => []);
  const gruposTransportadora = useState<GrupoPagamento[]>("pagamentos-transportadora", () => []);
  const grupoPix = useState<Record<TipoGrupoPagamento, Record<string, string>>>(
    "pagamentos-grupo-pix",
    () => ({ DESPACHANTE: {}, TRANSPORTADORA: {} })
  );
  const loading = useState<boolean>("pagamentos-loading", () => false);
  const error = useState<string | null>("pagamentos-error", () => null);

  function applyBancoPayload(payload: BancoPayload): void {
    lotesBanco.value = payload.lotes;
    lancamentosBanco.value = payload.lancamentos;
  }

  // Dispara a requisição e aplica o payload só se nenhuma resposta mais nova (de
  // uma requisição disparada depois) já foi aplicada. Ver "Corrida de respostas".
  async function aplicarBanco(requisicao: () => Promise<BancoPayload>): Promise<void> {
    const token = guardaBanco.proximo();
    const payload = await requisicao();
    if (!guardaBanco.podeAplicar(token)) return;
    applyBancoPayload(payload);
  }

  async function fetchBanco(): Promise<void> {
    await aplicarBanco(() =>
      apiFetch<BancoPayload>("/api/pagamentos/banco", undefined, "Falha ao carregar pagamentos do banco.")
    );
  }

  async function fetchGrupos(tipo: TipoGrupoPagamento): Promise<void> {
    const grupos = await apiFetch<GrupoPagamento[]>(
      `/api/pagamentos/${tipoPath(tipo)}`,
      undefined,
      "Falha ao carregar pagamentos."
    );
    if (tipo === "DESPACHANTE") gruposDespachante.value = grupos;
    else gruposTransportadora.value = grupos;
  }

  function pixPath(tipo: TipoGrupoPagamento): string {
    return tipo === "DESPACHANTE" ? "despachante-pix" : "transportadora-pix";
  }

  async function fetchGrupoPix(): Promise<void> {
    const [d, t] = await Promise.all([
      apiFetch<Record<string, string>>("/api/pagamentos/despachante-pix", undefined, "Falha ao carregar chaves PIX."),
      apiFetch<Record<string, string>>(
        "/api/pagamentos/transportadora-pix",
        undefined,
        "Falha ao carregar chaves PIX."
      ),
    ]);
    grupoPix.value = { DESPACHANTE: d, TRANSPORTADORA: t };
  }

  async function salvarGrupoPix(
    tipo: TipoGrupoPagamento,
    nome: string,
    chavePix: string
  ): Promise<void> {
    const atualizado = await apiFetch<Record<string, string>>(
      `/api/pagamentos/${pixPath(tipo)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, chavePix }),
      },
      "Erro ao salvar a chave PIX."
    );
    grupoPix.value = { ...grupoPix.value, [tipo]: atualizado };
  }

  async function fetchAll(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await Promise.all([
        fetchBanco(),
        fetchGrupos("DESPACHANTE"),
        fetchGrupos("TRANSPORTADORA"),
        fetchGrupoPix(),
      ]);
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Erro desconhecido.";
    } finally {
      loading.value = false;
    }
  }

  async function criarLancamentoBanco(input: NovoLancamentoBancoDTO): Promise<void> {
    await apiFetch(
      "/api/pagamentos/banco",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      "Erro ao criar lançamento."
    );
    await fetchBanco();
  }

  async function editarLancamentoBanco(id: string, patch: AtualizarLancamentoBancoDTO): Promise<void> {
    await aplicarBanco(() =>
      apiFetch<BancoPayload>(
        `/api/pagamentos/banco/lancamento/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
        "Erro ao editar lançamento."
      )
    );
  }

  async function excluirLancamentoBanco(id: string): Promise<void> {
    await aplicarBanco(() =>
      apiFetch<BancoPayload>(`/api/pagamentos/banco/lancamento/${id}`, { method: "DELETE" }, "Erro ao excluir lançamento.")
    );
  }

  // PATCHes de cotação do MESMO lote saem em fila (um por vez, na ordem em que
  // foram pedidos); lotes diferentes não esperam um pelo outro.
  function patchCotacao(loteId: string, patch: AtualizarCotacaoDTO): Promise<void> {
    return filaCotacao.enfileirar(loteId, () =>
      aplicarBanco(() =>
        apiFetch<BancoPayload>(
          "/api/pagamentos/cotacao",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ loteId, ...patch }),
          },
          "Erro ao atualizar cotação."
        )
      )
    );
  }

  function salvarTaxasCotacao(
    loteId: string,
    opcoes: AtualizarCotacaoDTO["opcoes"]
  ): Promise<void> {
    return patchCotacao(loteId, { opcoes });
  }

  // Escolhe o banco. Opcionalmente grava as taxas do rascunho na mesma requisição,
  // pra não exigir um "Salvar taxas" antes.
  function escolherBanco(
    loteId: string,
    banco: BancoCambio,
    opcoes?: AtualizarCotacaoDTO["opcoes"]
  ): Promise<void> {
    return patchCotacao(loteId, opcoes ? { opcoes, bancoEscolhido: banco } : { bancoEscolhido: banco });
  }

  // Fechamento POR ORDEM do Rendimento: além de escolher o banco, envia a taxa de
  // cada lançamento pendente do lote (o servidor exige todas preenchidas).
  function escolherBancoRendimento(
    loteId: string,
    opcoes: AtualizarCotacaoDTO["opcoes"],
    taxasRendimento: NonNullable<AtualizarCotacaoDTO["taxasRendimento"]>
  ): Promise<void> {
    return patchCotacao(loteId, { opcoes, bancoEscolhido: "RENDIMENTO", taxasRendimento });
  }

  async function fecharLoteBanco(loteId: string): Promise<void> {
    await apiFetch(`/api/pagamentos/banco/${loteId}`, { method: "PATCH" }, "Erro ao marcar o lote como pago.");
    await fetchBanco();
  }

  async function editarLancamentoRealizado(id: string, cliente: string, pagoEm: string): Promise<void> {
    await aplicarBanco(() =>
      apiFetch<BancoPayload>(
        `/api/pagamentos/banco/lancamento/${id}/realizado`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cliente, pagoEm }),
        },
        "Erro ao editar o pagamento realizado."
      )
    );
  }

  async function criarGrupo(tipo: TipoGrupoPagamento, input: Omit<NovoGrupoPagamentoDTO, "tipo">): Promise<void> {
    await apiFetch(
      `/api/pagamentos/${tipoPath(tipo)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
      "Erro ao adicionar pagamento."
    );
    await fetchGrupos(tipo);
  }

  async function atualizarStatusItem(
    tipo: TipoGrupoPagamento,
    grupoId: string,
    index: number,
    status: StatusItemGrupo
  ): Promise<void> {
    await apiFetch(
      `/api/pagamentos/${tipoPath(tipo)}/${grupoId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, status }),
      },
      "Erro ao atualizar status."
    );
    await fetchGrupos(tipo);
  }

  async function editarItemGrupo(
    tipo: TipoGrupoPagamento,
    grupoId: string,
    index: number,
    paciente: string,
    valor: number
  ): Promise<void> {
    await apiFetch(
      `/api/pagamentos/${tipoPath(tipo)}/${grupoId}/item`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, paciente, valor }),
      },
      "Erro ao editar o pagamento."
    );
    await fetchGrupos(tipo);
  }

  async function excluirItemGrupo(
    tipo: TipoGrupoPagamento,
    grupoId: string,
    index: number
  ): Promise<void> {
    await apiFetch(
      `/api/pagamentos/${tipoPath(tipo)}/${grupoId}/item?index=${index}`,
      { method: "DELETE" },
      "Erro ao excluir o pagamento."
    );
    await fetchGrupos(tipo);
  }

  async function pagarGrupo(tipo: TipoGrupoPagamento, grupoId: string): Promise<void> {
    await apiFetch(`/api/pagamentos/${tipoPath(tipo)}/${grupoId}/pagar`, { method: "PATCH" }, "Erro ao marcar o grupo como pago.");
    await fetchGrupos(tipo);
  }

  async function editarGrupoRealizado(
    tipo: TipoGrupoPagamento,
    grupoId: string,
    nomeGrupo: string,
    pagoEm: string
  ): Promise<void> {
    await apiFetch(
      `/api/pagamentos/${tipoPath(tipo)}/${grupoId}/realizado`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomeGrupo, pagoEm }),
      },
      "Erro ao editar o pagamento realizado."
    );
    await fetchGrupos(tipo);
  }

  return {
    empresaSelecionada,
    dataSelecionada,
    lotesBanco,
    lancamentosBanco,
    gruposDespachante,
    gruposTransportadora,
    grupoPix,
    loading,
    error,
    fetchAll,
    fetchBanco,
    fetchGrupos,
    fetchGrupoPix,
    salvarGrupoPix,
    criarLancamentoBanco,
    editarLancamentoBanco,
    excluirLancamentoBanco,
    salvarTaxasCotacao,
    escolherBanco,
    escolherBancoRendimento,
    fecharLoteBanco,
    editarLancamentoRealizado,
    criarGrupo,
    atualizarStatusItem,
    editarItemGrupo,
    excluirItemGrupo,
    pagarGrupo,
    editarGrupoRealizado,
  };
}
