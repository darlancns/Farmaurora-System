// Registro do parser (modelo Processo) → LINHA da tabela follow_up, com TODAS as
// colunas (a função carga_follow_up usa jsonb_populate_recordset, que NÃO aplica
// defaults: coluna ausente viraria NULL e quebraria as NOT NULL).
//
// Espelha server/utils/processoMappers.ts#colunasDeDTO — a paridade é garantida por
// tests/unit/followUpParser.spec.ts. Puro: sem rede, sem escrita.

export const COLUNAS_FOLLOW_UP = [
  "id",
  "paciente",
  "ordem",
  "pasta",
  "empresa",
  "consultor",
  "responsavel_operacional",
  "despachante",
  "fornecedor",
  "transportadora_nacional_nome",
  "transportadora_nacional_cotacao",
  "transportadora_nacional_valor",
  "modal_envio",
  "companhia_aerea",
  "numero_awb",
  "codigo_rastreio",
  "medicamentos",
  "status",
  "status_outro",
  "data_compra_po",
  "data_embarque",
  "abertura_thread",
  "data_chegada_brasil",
  "registro_radar",
  "registro_duimp",
  "registro_lpco",
  "previsao_entrega",
  "suposta_estimativa",
  "local_entrega",
  "numero_processo",
  "pendencias",
  "status_pagamento",
  "alerta_fornecedor_resolvido",
  "atualizacoes",
  "created_at",
  "updated_at",
];

/** id determinístico na ordem do documento: `proc_<ms>_<índice base36>` (created_at igual → ordena por id). */
export function idCarga(ms, indice) {
  return `proc_${ms}_${indice.toString(36).padStart(6, "0")}`;
}

export function registroParaLinha(rec, { id, agora }) {
  const d = rec.datas ?? {};
  const t = rec.transportadoraNacional;
  return {
    id,
    paciente: rec.paciente,
    ordem: rec.ordem ?? null,
    pasta: rec.pasta,
    empresa: rec.empresa,
    consultor: rec.consultor,
    responsavel_operacional: rec.responsavelOperacional ?? null,
    despachante: rec.despachante ?? null,
    fornecedor: rec.fornecedor ?? null,
    transportadora_nacional_nome: t?.nome ?? null,
    transportadora_nacional_cotacao: t?.cotacao ?? null,
    transportadora_nacional_valor: t?.valor ?? null,
    modal_envio: rec.modalEnvio ?? null,
    companhia_aerea: rec.companhiaAerea ?? null,
    numero_awb: rec.numeroAwb ?? null,
    codigo_rastreio: rec.codigoRastreio ?? null,
    medicamentos: rec.medicamentos ?? [],
    status: rec.status,
    status_outro: rec.status === "outro" ? rec.statusOutro?.trim() || null : null,
    data_compra_po: d.dataCompraPO ?? null,
    data_embarque: d.dataEmbarque ?? null,
    abertura_thread: d.aberturaThread ?? null,
    data_chegada_brasil: d.dataChegadaBrasil ?? null,
    registro_radar: d.registroRadar ?? null,
    registro_duimp: d.registroDuimp ?? null,
    registro_lpco: d.registroLpco ?? null,
    previsao_entrega: d.previsaoEntrega ?? null,
    suposta_estimativa: d.supostaEstimativa ?? null,
    local_entrega: rec.localEntrega ?? null,
    numero_processo: rec.numeroProcesso ?? null,
    pendencias: rec.pendencias ?? [],
    status_pagamento: rec.statusPagamento ?? null,
    alerta_fornecedor_resolvido: false, // "começa sem valor"
    atualizacoes: rec.atualizacoes ?? [],
    created_at: agora,
    updated_at: agora,
  };
}
