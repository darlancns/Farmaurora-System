import type { Medicamento } from "#shared/types/processo";
import type { EstadoEdicao, ProcessoFormState } from "../../../app/utils/processoFormPayload";

// Fixtures da edição de processo: uma linha COMPLETA de `follow_up` (todos os opcionais preenchidos e
// coisas que o formulário não controla) e o formulário equivalente (o que o "Editar processo" carrega).

export const VERSAO = "2026-11-05T10:00:00.123456+00:00";
export const ATUALIZACOES = [{ data: "01/09", texto: "Antiga" }];
export const MEDICAMENTOS: Medicamento[] = [{ nome: "DROGA", dosagem: "10MG", quantidade: "2" }];

export function linhaCompleta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "proc_1",
    paciente: "Fulano",
    ordem: "Ordem 2",
    pasta: "2026 - 1",
    empresa: "FARMAURORA",
    consultor: "Dani",
    responsavel_operacional: "Bruno",
    despachante: "Marcelo Lima",
    fornecedor: "Poros - Turquia",
    transportadora_nacional_nome: "AJC",
    transportadora_nacional_cotacao: "COT-9",
    transportadora_nacional_valor: 1500,
    modal_envio: "Air Cargo",
    companhia_aerea: "LATAM Cargo",
    numero_awb: "957-12345678",
    medicamentos: MEDICAMENTOS.map((m) => ({ ...m })),
    status: "em_transito",
    status_outro: null,
    data_compra_po: "01/09",
    data_embarque: "05/09",
    abertura_thread: "06/09",
    data_chegada_brasil: "10/09",
    registro_radar: "11/09",
    registro_duimp: "12/09",
    registro_lpco: "13/09",
    previsao_entrega: "20/09",
    suposta_estimativa: "fim de setembro",
    local_entrega: "Clínica X",
    numero_processo: "123456",
    pendencias: ["Enviar laudo"],
    status_pagamento: "pendente",
    alerta_fornecedor_resolvido: true,
    alerta_mandado_resolvido: true,
    atualizacoes: ATUALIZACOES.map((a) => ({ ...a })),
    created_at: "2026-01-01T00:00:00.000000+00:00",
    updated_at: VERSAO,
    ...extra,
  };
}

// Formulário preenchido igual à linha acima.
export function formCompleto(): ProcessoFormState {
  return {
    paciente: "Fulano",
    ordem: "2",
    pasta: "2026 - 1",
    empresa: "FARMAURORA",
    consultor: "Dani",
    responsavelOperacional: "Bruno",
    despachante: "Marcelo Lima",
    transportadoraNome: "AJC",
    transportadoraCotacao: "COT-9",
    transportadoraValor: "1500",
    modalEnvio: "Air Cargo",
    companhiaAerea: "LATAM Cargo",
    numeroAwb: "957-12345678",
    status: "em_transito",
    statusOutro: "",
    dataCompraPO: "01/09",
    dataEmbarque: "05/09",
    aberturaThread: "06/09",
    dataChegadaBrasil: "10/09",
    registroRadar: "11/09",
    registroDuimp: "12/09",
    registroLpco: "13/09",
    previsaoEntrega: "20/09",
    supostaEstimativa: "fim de setembro",
    localEntrega: "Clínica X",
    numeroProcesso: "123456",
    statusPagamento: "pendente",
  };
}

export function estadoCompleto(): EstadoEdicao {
  return {
    form: formCompleto(),
    medicamentos: MEDICAMENTOS.map((m) => ({ ...m })),
    pendencias: ["Enviar laudo"],
    fornecedor: "Poros - Turquia",
  };
}

// Cópia do estado com `mudar` aplicado ao formulário/listas — "o que o usuário fez na tela".
export function editado(mudar: (e: EstadoEdicao) => void): EstadoEdicao {
  const e = estadoCompleto();
  mudar(e);
  return e;
}
