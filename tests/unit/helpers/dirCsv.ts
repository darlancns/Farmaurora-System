// Construtor de CSV 100% SINTÉTICO no formato da aba "2026 DIR FARMAURORA" (nomes e dados inventados —
// nunca colar linha real da planilha). Usado pelos specs do parser.

export const CABECALHO = [
  "CHECK",
  "PACIENTE",
  "PO",
  "VENDEDOR",
  "RESPONSÁVEL",
  "EXIGÊNCIA",
  "DATA DE EMISSÃO",
  '"DATA DE COBRANÇA\nAOS FORNECEDORES"',
  "RECEITA",
  "MEDICAMENTO",
  "TEMPERATURA",
  "FORNECEDOR",
  "ORIGEM",
  "ENVIO",
  "AWB",
  "DESPACHANTE",
  "STATUS",
  "CONTRATO DE CÂMBIO",
  "OBSERVAÇÃO",
  "BANCO",
  "DATA DE PAGAMENTO",
  '"FECHAMENTO \nDE OPERAÇÃO"',
  "DACTES",
  "DSI/DIR/Duimp",
  "LOGGER",
  "FECHAMENTO",
  "NUMERÁRIO",
  '"PROTOCOLO \nASSINADO"',
  "SWIFT",
  "TERMOMÊTRO",
  "FECHAMENTOS RESTANTES",
].join(",");

export const COLUNAS_VALORES = [
  "check",
  "paciente",
  "po",
  "vendedor",
  "responsavel",
  "exigencia",
  "emissao",
  "cobranca",
  "receita",
  "medicamento",
  "temperatura",
  "fornecedor",
  "origem",
  "envio",
  "awb",
  "despachante",
  "status",
  "contrato",
  "observacao",
  "banco",
  "pagamento",
  "operacao",
  "dactes",
  "dsi",
  "logger",
  "fechamento",
  "numerario",
  "protocolo",
  "swift",
  "termometro",
  "restantes",
] as const;

export type Campo = (typeof COLUNAS_VALORES)[number];

export const BASE: Record<Campo, string> = {
  check: "TRUE",
  paciente: "PACIENTE TESTE UM",
  po: "PO26-01-0001",
  vendedor: "Mateus",
  responsavel: "Re",
  exigencia: "FALSE",
  emissao: "05.01.26-segunda-feira",
  cobranca: "08.01.26-quinta-feira",
  receita: "Original",
  medicamento: "MEDICAMENTO X",
  temperatura: "Ambiente",
  fornecedor: "Care Pharma",
  origem: "Tosun (China)",
  envio: "Air Cargo",
  awb: "Lufthansa: 020-00000000",
  despachante: "BRUNO / NILTON",
  status: "Entregue 28.01.26",
  contrato: "7845379",
  observacao: "TUDO OK",
  banco: "Rendimento",
  pagamento: "10/02/2026",
  operacao: "Operação Encerrada",
  dactes: "VERDADEIRO",
  dsi: "VERDADEIRO",
  logger: "VERDADEIRO",
  fechamento: "VERDADEIRO",
  numerario: "VERDADEIRO",
  protocolo: "VERDADEIRO",
  swift: "FALSO",
  termometro: "FALSO",
  restantes: "",
};

function celula(valor: string): string {
  return /[",\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

export function linhaCsv(sobrescrever: Partial<Record<Campo, string>> = {}): string {
  const valores = { ...BASE, ...sobrescrever };
  return COLUNAS_VALORES.map((c) => celula(valores[c])).join(",");
}

// Linha "casca": só os checkboxes pré-preenchidos.
export const CASCA = linhaCsv({
  check: "FALSE", paciente: "", po: "", vendedor: "", responsavel: "", emissao: "", cobranca: "", receita: "",
  medicamento: "", temperatura: "", fornecedor: "", origem: "", envio: "", awb: "", despachante: "", status: "",
  contrato: "", observacao: "", banco: "", pagamento: "", operacao: "", dactes: "FALSO", dsi: "FALSO", logger: "FALSO",
  fechamento: "FALSO", numerario: "FALSO", protocolo: "FALSO", swift: "FALSO", termometro: "FALSO",
});

export function csv(...linhas: string[]): string {
  return [CABECALHO, ...linhas].join("\n") + "\n";
}

/** PO ainda em aberto: operação em andamento e FECHAMENTO falso (candidato da regra (b) da lista). */
export const EM_ABERTO: Partial<Record<Campo, string>> = {
  operacao: "Em andamento",
  fechamento: "FALSO",
  status: "On going",
  pagamento: "",
};
