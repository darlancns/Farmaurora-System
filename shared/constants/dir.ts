import type { ChecklistChaveDir, StatusDir } from "../types/dir";

// Listas da DIR — PRÓPRIAS, independentes de Processos/Pagamentos (nomes curtos da
// planilha). No banco todas são `text` sem enum nem CHECK (só `status` tem CHECK); as
// listas só alimentam os selects, e todas aceitam "Outro" (texto livre digitável).

// Sentinela do select quando o usuário digita um valor fora da lista; o que se grava é o
// texto digitado, nunca a string "Outro".
export const OUTRO_DIR = "Outro";

export const STATUS_DIR_ORDER: StatusDir[] = ["on_going", "entregue", "cancelado", "falecimento"];

export const STATUS_DIR_LABELS: Record<StatusDir, string> = {
  on_going: "On going",
  entregue: "Entregue",
  cancelado: "Cancelada",
  falecimento: "Falecimento",
};

// Rótulo de status nulo na UI.
export const STATUS_DIR_VAZIO = "—";

export interface ItemChecklistDir {
  chave: ChecklistChaveDir;
  rotulo: string;
}

// Ordem da planilha (DACTES … TERMOMÊTRO). Chip "n/8" da lista conta estes 8 itens.
export const CHECKLIST_DIR: readonly ItemChecklistDir[] = [
  { chave: "dactes", rotulo: "DACTES" },
  { chave: "dsiDirDuimp", rotulo: "DSI/DIR/Duimp" },
  { chave: "logger", rotulo: "Logger" },
  { chave: "fechamento", rotulo: "Fechamento" },
  { chave: "numerario", rotulo: "Numerário" },
  { chave: "protocoloAssinado", rotulo: "Protocolo assinado" },
  { chave: "swift", rotulo: "Swift" },
  { chave: "termometro", rotulo: "Termômetro" },
];

// Responsável: "Re" da planilha é gravado como "Rebeca".
export const RESPONSAVEIS_DIR: string[] = ["Bruno", "Rebeca"];

// Mapeamento canônico do VENDEDOR da planilha. Fora dele (Braulio (3RB), Daniel Donato,
// ASD, Junior, Rodrigo) o valor é gravado LITERAL — "(3RB)" é informação, não se perde.
export const VENDEDOR_CANONICO: Readonly<Record<string, string>> = {
  Alessandra: "Alessandra",
  André: "André Vitório",
  Bolívar: "Bolívar",
  Dani: "Dani",
  Flávia: "Flávia",
  "Ga Megda": "Gabriela Megda",
  "Gabi Santana": "Gabriela Santana",
  Mateus: "Mateus Morais",
  Paulinho: "Paulinho",
  "Paulo Braga": "Paulo Braga",
  Vinicius: "Vinícius Alves",
};

export const FORNECEDORES_DIR: string[] = [
  "Bayiue (China)",
  "Beldimed",
  "Care Pharma",
  "Matsun",
  "Medimoon",
  "Mohri (Japão)",
  "Pharyx",
  "Poros",
  "Speciality",
  "Tosun (China)",
  "Upharm",
  "Venecza",
];

// O despachante de uma ordem Courier Simples (não há despachante).
export const DESPACHANTE_COURIER_NA = "COURIER I N/A";

export const DESPACHANTES_DIR: string[] = ["BRUNO / NILTON", DESPACHANTE_COURIER_NA, "SOUTH AMERICA", "STAR CUSTOMS"];

// Inclui as situações da cotação (Pendente, Cancelado, Não Cotado), que a planilha põe no mesmo campo.
export const BANCOS_DIR: string[] = [
  "Cancelado",
  "INTEX",
  "MIURA",
  "Não Cotado",
  "Pendente",
  "Rendimento",
  "Sicoob",
  "XP",
];

// Envio: NÃO há lista própria da DIR — as opções são as do Follow-Up (MODAIS_ENVIO, shared/constants/processos.ts;
// regras em shared/utils/dirEnvio.ts).

export const RECEITAS_DIR: string[] = [
  "Original",
  "Transcrição - Amanda",
  "Transcrição - Cauã",
  "Transcrição - Ellen",
  "Transcrição - Quiroga",
  "Transcrição - Rayane",
  "Transcrição - Sarah",
];

export const TEMPERATURAS_DIR: string[] = ["2°C a 8°C", "Ambiente", "Ambiente / 2°C a 8°C no Brasil"];

// Observações da lista da DIR para compra recorrente e compra particular.
export const OBSERVACAO_DIR_RECORRENTE = "RECORRENTE";
export const OBSERVACAO_DIR_COMPRA_PARTICULAR = "COMPRA PARTICULAR";

export const OBSERVACOES_DIR: string[] = [
  "AGUARDANDO ALVARÁ CAIR",
  "AJUSTE DE QUANTIDADE NA PO",
  "CANCELAMENTO",
  "CNPJ ERRADO",
  OBSERVACAO_DIR_COMPRA_PARTICULAR,
  "EXIGÊNCIA",
  "FALECIMENTO",
  "MEDICAMENTO INDISPONÍVEL",
  OBSERVACAO_DIR_RECORRENTE,
  "TUDO OK",
];

// Mostrar mais de 50 em 50 (lista da página).
export const DIR_TAMANHO_PAGINA = 50;

// Texto gravado em fechamento_restante_por pela carga inicial (a lista da planilha).
export const FECHAMENTO_RESTANTE_POR_IMPORTACAO = "importação da planilha";

// Explicação do toggle "Em fechamento restante" desabilitado (e mensagem do 400 da API).
export const FECHAMENTO_RESTANTE_ENCERRADA = "Operação encerrada";
export const FECHAMENTO_RESTANTE_ENCERRADA_ERRO =
  "Operação encerrada: não é possível marcar o PO em fechamento restante.";

// ── Cores dos bancos (chip com ponto colorido + nome escrito) ───────────────
// Paleta aprovada na Parte B. A cor NUNCA é a única informação: o chip sempre escreve o nome do
// banco. Contraste texto/fundo >= 4,5:1 e ponto >= 3:1 sobre branco. Só da DIR — Pagamentos não tem
// (nem ganha) cor por banco.
export interface CorBancoDir {
  fundo: string;
  texto: string;
  ponto: string;
  // Banco ainda não definido (Não Cotado): borda tracejada em vez de fundo cheio.
  tracejado: boolean;
}

export const BANCO_DIR_SEM_BANCO = "Sem banco";

export const BANCO_DIR_COR_PADRAO: CorBancoDir = { fundo: "#F3F4F6", texto: "#4B5563", ponto: "#6B7280", tracejado: false };

export const BANCO_DIR_CORES: Readonly<Record<string, CorBancoDir>> = {
  XP: { fundo: "#FEF3C7", texto: "#78350F", ponto: "#D97706", tracejado: false },
  Rendimento: { fundo: "#DCFCE7", texto: "#14532D", ponto: "#16A34A", tracejado: false },
  Sicoob: { fundo: "#CCFBF1", texto: "#134E4A", ponto: "#0D9488", tracejado: false },
  INTEX: { fundo: "#DBEAFE", texto: "#1E3A8A", ponto: "#2563EB", tracejado: false },
  MIURA: { fundo: "#EDE9FE", texto: "#4C1D95", ponto: "#7C3AED", tracejado: false },
  Pendente: { fundo: "#F3F4F6", texto: "#374151", ponto: "#6B7280", tracejado: false },
  "Não Cotado": { fundo: "#FFFFFF", texto: "#4B5563", ponto: "#6B7280", tracejado: true },
  Cancelado: { fundo: "#FFE4E6", texto: "#881337", ponto: "#E11D48", tracejado: false },
};

/** Cor do banco; vazio ou fora do mapa (ex.: um "Outro" digitado) cai no cinza padrão. */
export function corDoBanco(banco: string): CorBancoDir {
  return BANCO_DIR_CORES[banco] ?? BANCO_DIR_COR_PADRAO;
}
