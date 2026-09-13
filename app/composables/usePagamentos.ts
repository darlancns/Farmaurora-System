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

interface BancoPayload {
  lotes: LoteBanco[];
  lancamentos: LancamentoBanco[];
}

function tipoPath(tipo: TipoGrupoPagamento): "despachante" | "transportadora" {
  return tipo === "DESPACHANTE" ? "despachante" : "transportadora";
}

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

  async function fetchBanco(): Promise<void> {
    applyBancoPayload(
      await apiFetch<BancoPayload>("/api/pagamentos/banco", undefined, "Falha ao carregar pagamentos do banco.")
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
    applyBancoPayload(
      await apiFetch<BancoPayload>(
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
    applyBancoPayload(
      await apiFetch<BancoPayload>(`/api/pagamentos/banco/lancamento/${id}`, { method: "DELETE" }, "Erro ao excluir lançamento.")
    );
  }

  async function patchCotacao(loteId: string, patch: AtualizarCotacaoDTO): Promise<void> {
    applyBancoPayload(
      await apiFetch<BancoPayload>(
        "/api/pagamentos/cotacao",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loteId, ...patch }),
        },
        "Erro ao atualizar cotação."
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
    criarGrupo,
    atualizarStatusItem,
    editarItemGrupo,
    excluirItemGrupo,
    pagarGrupo,
  };
}
