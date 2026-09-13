import type {
  AtualizacaoProcesso,
  ConsultorProcesso,
  EmpresaProcesso,
  Medicamento,
  NewProcessoDTO,
  Processo,
  ProcessoDatas,
  StatusPagamentoProcesso,
  StatusProcesso,
  TransportadoraNacional,
} from "../../shared/types/processo";
import { num } from "./storeKit";

// Mapeadores puros linha (Supabase, tabela `follow_up`) ↔ modelo Processo —
// sem Supabase/rede, testáveis isoladamente (ver tests/unit/processoMappers.spec.ts).
//
// Mapeamento:
//  - `Processo.datas` (objeto parcial de 9 campos) ↔ 9 colunas soltas
//    (`data_compra_po`, …). Na leitura, `datas` volta como objeto parcial com
//    só as chaves cujas colunas não são NULL (mantém o formato atual).
//  - `Processo.transportadoraNacional` (objeto opcional) ↔ 3 colunas soltas.
//    Se `transportadora_nacional_nome` é NULL, a chave some do objeto (não vira
//    `{}` nem `null`).
//  - `medicamentos` / `atualizacoes` ↔ colunas jsonb, shape direto.
//  - `pendencias` ↔ coluna text[] direto.
//  - Campo opcional ausente no DTO → NULL no banco; coluna NULL no banco →
//    chave OMITIDA no objeto retornado (consistente com os campos serem `?`).
//  - `alertaFornecedorResolvido` (coluna boolean NOT NULL default false): chave
//    omitida quando `false`, incluída como `true` quando `true`.

export interface FollowUpRow {
  id: string;
  paciente: string;
  ordem: string | null;
  pasta: string;
  empresa: EmpresaProcesso;
  consultor: ConsultorProcesso;
  responsavel_operacional: string | null;
  despachante: string | null;
  fornecedor: string | null;
  transportadora_nacional_nome: string | null;
  transportadora_nacional_cotacao: string | null;
  transportadora_nacional_valor: number | string | null;
  modal_envio: string | null;
  companhia_aerea: string | null;
  numero_awb: string | null;
  codigo_rastreio: string | null;
  medicamentos: Medicamento[] | null;
  status: StatusProcesso;
  data_compra_po: string | null;
  data_embarque: string | null;
  abertura_thread: string | null;
  data_chegada_brasil: string | null;
  registro_radar: string | null;
  registro_duimp: string | null;
  registro_lpco: string | null;
  previsao_entrega: string | null;
  suposta_estimativa: string | null;
  local_entrega: string | null;
  numero_processo: string | null;
  pendencias: string[] | null;
  status_pagamento: StatusPagamentoProcesso | null;
  alerta_fornecedor_resolvido: boolean | null;
  atualizacoes: AtualizacaoProcesso[] | null;
  created_at: string;
  updated_at: string;
}

// Colunas do follow_up a partir das chaves do DTO PRESENTES em `src`. Só inclui
// coluna cuja chave do DTO está em `src` (via `in`) — assim o patch é seletivo
// e o create (que traz todas as chaves relevantes) grava tudo.
export function colunasDeDTO(src: Partial<NewProcessoDTO>): Record<string, unknown> {
  const col: Record<string, unknown> = {};

  if ("paciente" in src) col.paciente = src.paciente;
  if ("pasta" in src) col.pasta = src.pasta;
  if ("empresa" in src) col.empresa = src.empresa;
  if ("consultor" in src) col.consultor = src.consultor;
  if ("status" in src) col.status = src.status;

  if ("ordem" in src) col.ordem = src.ordem ?? null;
  if ("responsavelOperacional" in src) col.responsavel_operacional = src.responsavelOperacional ?? null;
  if ("despachante" in src) col.despachante = src.despachante ?? null;
  if ("fornecedor" in src) col.fornecedor = src.fornecedor ?? null;
  if ("modalEnvio" in src) col.modal_envio = src.modalEnvio ?? null;
  if ("companhiaAerea" in src) col.companhia_aerea = src.companhiaAerea ?? null;
  if ("numeroAwb" in src) col.numero_awb = src.numeroAwb ?? null;
  if ("codigoRastreio" in src) col.codigo_rastreio = src.codigoRastreio ?? null;
  if ("localEntrega" in src) col.local_entrega = src.localEntrega ?? null;
  if ("numeroProcesso" in src) col.numero_processo = src.numeroProcesso ?? null;
  if ("statusPagamento" in src) col.status_pagamento = src.statusPagamento ?? null;
  if ("alertaFornecedorResolvido" in src) {
    col.alerta_fornecedor_resolvido = src.alertaFornecedorResolvido ?? false;
  }

  if ("medicamentos" in src) col.medicamentos = src.medicamentos ?? [];
  if ("pendencias" in src) col.pendencias = src.pendencias ?? [];
  if ("atualizacoes" in src) col.atualizacoes = src.atualizacoes ?? [];

  if ("datas" in src) {
    const d: ProcessoDatas = src.datas ?? {};
    col.data_compra_po = d.dataCompraPO ?? null;
    col.data_embarque = d.dataEmbarque ?? null;
    col.abertura_thread = d.aberturaThread ?? null;
    col.data_chegada_brasil = d.dataChegadaBrasil ?? null;
    col.registro_radar = d.registroRadar ?? null;
    col.registro_duimp = d.registroDuimp ?? null;
    col.registro_lpco = d.registroLpco ?? null;
    col.previsao_entrega = d.previsaoEntrega ?? null;
    col.suposta_estimativa = d.supostaEstimativa ?? null;
  }

  if ("transportadoraNacional" in src) {
    const t: TransportadoraNacional | undefined = src.transportadoraNacional;
    col.transportadora_nacional_nome = t?.nome ?? null;
    col.transportadora_nacional_cotacao = t?.cotacao ?? null;
    col.transportadora_nacional_valor = t?.valor ?? null;
  }

  return col;
}

// Linha do banco → objeto Processo (colunas NULL viram chaves omitidas).
export function montarProcesso(row: FollowUpRow): Processo {
  const datas: ProcessoDatas = {};
  if (row.data_compra_po != null) datas.dataCompraPO = row.data_compra_po;
  if (row.data_embarque != null) datas.dataEmbarque = row.data_embarque;
  if (row.abertura_thread != null) datas.aberturaThread = row.abertura_thread;
  if (row.data_chegada_brasil != null) datas.dataChegadaBrasil = row.data_chegada_brasil;
  if (row.registro_radar != null) datas.registroRadar = row.registro_radar;
  if (row.registro_duimp != null) datas.registroDuimp = row.registro_duimp;
  if (row.registro_lpco != null) datas.registroLpco = row.registro_lpco;
  if (row.previsao_entrega != null) datas.previsaoEntrega = row.previsao_entrega;
  if (row.suposta_estimativa != null) datas.supostaEstimativa = row.suposta_estimativa;

  const processo: Processo = {
    id: row.id,
    paciente: row.paciente,
    pasta: row.pasta,
    empresa: row.empresa,
    consultor: row.consultor,
    medicamentos: (row.medicamentos ?? []).map((m) => ({ ...m })),
    status: row.status,
    datas,
    pendencias: row.pendencias ?? [],
    atualizacoes: (row.atualizacoes ?? []).map((a) => ({ ...a })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.ordem != null) processo.ordem = row.ordem;
  if (row.responsavel_operacional != null) processo.responsavelOperacional = row.responsavel_operacional;
  if (row.despachante != null) processo.despachante = row.despachante;
  if (row.fornecedor != null) processo.fornecedor = row.fornecedor;
  if (row.modal_envio != null) processo.modalEnvio = row.modal_envio;
  if (row.companhia_aerea != null) processo.companhiaAerea = row.companhia_aerea;
  if (row.numero_awb != null) processo.numeroAwb = row.numero_awb;
  if (row.codigo_rastreio != null) processo.codigoRastreio = row.codigo_rastreio;
  if (row.local_entrega != null) processo.localEntrega = row.local_entrega;
  if (row.numero_processo != null) processo.numeroProcesso = row.numero_processo;
  if (row.status_pagamento != null) processo.statusPagamento = row.status_pagamento;
  if (row.alerta_fornecedor_resolvido === true) processo.alertaFornecedorResolvido = true;

  if (row.transportadora_nacional_nome != null) {
    const tn: TransportadoraNacional = { nome: row.transportadora_nacional_nome };
    if (row.transportadora_nacional_cotacao != null) tn.cotacao = row.transportadora_nacional_cotacao;
    if (row.transportadora_nacional_valor != null) tn.valor = num(row.transportadora_nacional_valor);
    processo.transportadoraNacional = tn;
  }

  return processo;
}
