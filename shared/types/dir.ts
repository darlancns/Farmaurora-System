// Contratos da página DIR (planilha "DIR 2º Semestre 2026", 1 linha por PO).
// Tipo independente de Processo/Pagamento/Patient: a DIR tem tabela, listas e rotas próprias.

// Único campo com enum fechado (CHECK no banco). Nulo = sem status ("—" na UI).
export type StatusDir = "on_going" | "entregue" | "cancelado" | "falecimento";

// Itens do checklist, 1 coluna boolean cada (ver supabase/migrations/*_dir.sql).
export type ChecklistChaveDir =
  | "dactes"
  | "dsiDirDuimp"
  | "logger"
  | "fechamento"
  | "numerario"
  | "protocoloAssinado"
  | "swift"
  | "termometro";

export type ChecklistDir = Record<ChecklistChaveDir, boolean>;

// Convenção do modelo: texto vazio = "" (nunca undefined/null); datas civis são
// "YYYY-MM-DD" ou "" (vazio). O servidor grava "" como NULL e lê NULL como "".
export interface Dir extends ChecklistDir {
  id: string;
  po: string; // PO26-MM-NNNN — NÃO é único (ex.: ordem 1 e ordem 2 do mesmo PO)
  paciente: string;
  conferido: boolean; // coluna CHECK da planilha
  vendedor: string; // nome canônico, ou o literal da planilha (ex.: "Braulio (3RB)", "ASD")
  responsavel: string;
  exigencia: boolean;
  dataEmissao: string;
  dataCobrancaFornecedores: string;
  receita: string;
  medicamento: string;
  temperatura: string;
  fornecedor: string;
  origem: string;
  envio: string;
  awb: string; // texto bruto, ex.: "Lufthansa: 020-46388355"
  despachante: string;
  status: StatusDir | null;
  dataEntrega: string;
  contratoCambio: string;
  observacao: string;
  banco: string;
  dataPagamento: string;
  operacaoEncerrada: boolean; // FECHAMENTO DE OPERAÇÃO: true = "Operação Encerrada"
  // Lista "Fechamentos restantes" = visão dos POs com fechamentoRestante E sem operação encerrada.
  // A marca não é apagada ao encerrar (reabrir devolve o PO à lista). Não se marca PO encerrado (400).
  fechamentoRestante: boolean;
  // Quem/quando marcou — preenchidos SÓ pelo servidor ("" enquanto desmarcado). _Em é um instante ISO.
  fechamentoRestanteEm: string;
  fechamentoRestantePor: string;
  createdAt: string;
  updatedAt: string;
}

export type NewDirDTO = Omit<Dir, "id" | "createdAt" | "updatedAt" | "fechamentoRestanteEm" | "fechamentoRestantePor">;

// Patch seletivo: só as chaves presentes são gravadas.
export type DirPatchDTO = Partial<NewDirDTO>;
