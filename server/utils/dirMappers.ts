import type { ChecklistChaveDir, Dir, DirPatchDTO, StatusDir } from "../../shared/types/dir";

// Mapeadores puros linha (Supabase, tabela `dir`) ↔ modelo Dir — sem Supabase/rede e SEM
// imports de runtime (o script scripts/migration/carga-dir.mjs importa este arquivo direto).
// Testáveis isoladamente (ver tests/unit/dirMappers.spec.ts).
//
// Convenção: no modelo, texto/data vazios são "" (nunca undefined); no banco são NULL.
// Na escrita, "" (ou só espaços) vira NULL; na leitura, NULL vira "".

export interface DirRow {
  id: string;
  po: string;
  paciente: string;
  conferido: boolean;
  vendedor: string;
  responsavel: string | null;
  exigencia: boolean;
  data_emissao: string | null;
  data_cobranca_fornecedores: string | null;
  receita: string | null;
  medicamento: string | null;
  temperatura: string | null;
  fornecedor: string | null;
  origem: string | null;
  envio: string | null;
  awb: string | null;
  despachante: string | null;
  status: StatusDir | null;
  data_entrega: string | null;
  contrato_cambio: string | null;
  observacao: string | null;
  banco: string | null;
  data_pagamento: string | null;
  operacao_encerrada: boolean;
  dactes: boolean;
  dsi_dir_duimp: boolean;
  logger: boolean;
  fechamento: boolean;
  numerario: boolean;
  protocolo_assinado: boolean;
  swift: boolean;
  termometro: boolean;
  fechamento_restante: boolean;
  fechamento_restante_em: string | null;
  fechamento_restante_por: string | null;
  created_at: string;
  updated_at: string;
}

type ChaveTextoOpcional =
  | "responsavel"
  | "receita"
  | "medicamento"
  | "temperatura"
  | "fornecedor"
  | "origem"
  | "envio"
  | "awb"
  | "despachante"
  | "contratoCambio"
  | "observacao"
  | "banco";

type ChaveData = "dataEmissao" | "dataCobrancaFornecedores" | "dataEntrega" | "dataPagamento";

type ChaveBooleana = "conferido" | "exigencia" | "operacaoEncerrada" | "fechamentoRestante" | ChecklistChaveDir;

export const CAMPOS_TEXTO_OPCIONAL: ReadonlyArray<readonly [ChaveTextoOpcional, keyof DirRow]> = [
  ["responsavel", "responsavel"],
  ["receita", "receita"],
  ["medicamento", "medicamento"],
  ["temperatura", "temperatura"],
  ["fornecedor", "fornecedor"],
  ["origem", "origem"],
  ["envio", "envio"],
  ["awb", "awb"],
  ["despachante", "despachante"],
  ["contratoCambio", "contrato_cambio"],
  ["observacao", "observacao"],
  ["banco", "banco"],
];

export const CAMPOS_DATA: ReadonlyArray<readonly [ChaveData, keyof DirRow]> = [
  ["dataEmissao", "data_emissao"],
  ["dataCobrancaFornecedores", "data_cobranca_fornecedores"],
  ["dataEntrega", "data_entrega"],
  ["dataPagamento", "data_pagamento"],
];

export const CAMPOS_BOOLEANOS: ReadonlyArray<readonly [ChaveBooleana, keyof DirRow]> = [
  ["conferido", "conferido"],
  ["exigencia", "exigencia"],
  ["operacaoEncerrada", "operacao_encerrada"],
  ["dactes", "dactes"],
  ["dsiDirDuimp", "dsi_dir_duimp"],
  ["logger", "logger"],
  ["fechamento", "fechamento"],
  ["numerario", "numerario"],
  ["protocoloAssinado", "protocolo_assinado"],
  ["swift", "swift"],
  ["termometro", "termometro"],
  ["fechamentoRestante", "fechamento_restante"],
];

function vazioParaNull(valor: string | null | undefined): string | null {
  const v = valor?.trim();
  return v ? v : null;
}

// Quem/quando marcou o PO em "fechamento restante". Vem do servidor (usuário logado + agora) ou da
// carga inicial ("importação da planilha" + hora da carga) — nunca do corpo da requisição.
export interface MarcaFechamentoRestante {
  em: string; // instante ISO
  por: string;
}

// Colunas da tabela `dir` a partir das chaves do DTO PRESENTES em `src` (via `in`): o patch
// é seletivo e o create (que traz todas as chaves) grava tudo.
//
// fechamento_restante_em/_por: `fechamentoRestante: false` zera os dois (NULL); `true` com `marca`
// grava os dois; `true` SEM `marca` deixa os dois como estão (PO que já estava marcado não perde
// quem/quando marcou).
export function colunasDeDir(src: DirPatchDTO, marca?: MarcaFechamentoRestante): Record<string, unknown> {
  const col: Record<string, unknown> = {};

  if ("po" in src) col.po = src.po?.trim();
  if ("paciente" in src) col.paciente = src.paciente?.trim();
  if ("vendedor" in src) col.vendedor = src.vendedor?.trim();
  if ("status" in src) col.status = src.status ?? null;

  for (const [chave, coluna] of CAMPOS_TEXTO_OPCIONAL) {
    if (chave in src) col[coluna] = vazioParaNull(src[chave]);
  }
  for (const [chave, coluna] of CAMPOS_DATA) {
    if (chave in src) col[coluna] = vazioParaNull(src[chave]);
  }
  for (const [chave, coluna] of CAMPOS_BOOLEANOS) {
    if (chave in src) col[coluna] = src[chave] === true;
  }

  if ("fechamentoRestante" in src) {
    if (src.fechamentoRestante !== true) {
      col.fechamento_restante_em = null;
      col.fechamento_restante_por = null;
    } else if (marca) {
      col.fechamento_restante_em = marca.em;
      col.fechamento_restante_por = marca.por;
    }
  }

  return col;
}

// Linha do banco → objeto Dir (colunas NULL viram "").
export function montarDir(row: DirRow): Dir {
  return {
    id: row.id,
    po: row.po,
    paciente: row.paciente,
    vendedor: row.vendedor,
    status: row.status ?? null,
    responsavel: row.responsavel ?? "",
    receita: row.receita ?? "",
    medicamento: row.medicamento ?? "",
    temperatura: row.temperatura ?? "",
    fornecedor: row.fornecedor ?? "",
    origem: row.origem ?? "",
    envio: row.envio ?? "",
    awb: row.awb ?? "",
    despachante: row.despachante ?? "",
    contratoCambio: row.contrato_cambio ?? "",
    observacao: row.observacao ?? "",
    banco: row.banco ?? "",
    dataEmissao: row.data_emissao ?? "",
    dataCobrancaFornecedores: row.data_cobranca_fornecedores ?? "",
    dataEntrega: row.data_entrega ?? "",
    dataPagamento: row.data_pagamento ?? "",
    conferido: row.conferido === true,
    exigencia: row.exigencia === true,
    operacaoEncerrada: row.operacao_encerrada === true,
    dactes: row.dactes === true,
    dsiDirDuimp: row.dsi_dir_duimp === true,
    logger: row.logger === true,
    fechamento: row.fechamento === true,
    numerario: row.numerario === true,
    protocoloAssinado: row.protocolo_assinado === true,
    swift: row.swift === true,
    termometro: row.termometro === true,
    fechamentoRestante: row.fechamento_restante === true,
    fechamentoRestanteEm: row.fechamento_restante_em ?? "",
    fechamentoRestantePor: row.fechamento_restante_por ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
