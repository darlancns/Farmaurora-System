import type {
  BrandMedicamento,
  CampoProcessoLimpavel,
  ProcessoDatas,
  ConsultorProcesso,
  DespachanteProcesso,
  EmpresaProcesso,
  FornecedorProcesso,
  ModalEnvio,
  StatusPagamentoProcesso,
  StatusProcesso,
  StatusProcessoLegado,
} from "../types/processo";

// Lista canônica de consultores do Follow-Up (e das contas com cargo consultor).
// Inclui os 7 nomes do cadastro de paciente (shared/types/Patient.ts,
// ConsultorNome) + os que só existem no Follow-Up — Processo não importa nada de
// Patient, e Pacientes continua só com os 7 (shared/constants/consultores.ts).
// Ordem alfabética (pt-BR); espelha o enum `consultor_nome` do Postgres.
export const CONSULTORES_PROCESSO: ConsultorProcesso[] = [
  "Alessandra",
  "André Vitório",
  "Bolívar",
  "Bráulio",
  "Dani",
  "Flávia",
  "Gabriela Megda",
  "Gabriela Santana",
  "Mateus Morais",
  "Paulinho",
  "Paulo Braga",
  "Thiago Guedes",
  "Vinícius Alves",
];

export const EMPRESAS_PROCESSO: EmpresaProcesso[] = ["FARMAURORA", "MAINZFARMA"];

// ── Medicamento: Laboratório e Brand ──────────────────────────────────────────────────────────────
// Fonte única dos valores e rótulos do Brand: o formulário (opções do select), a validação do servidor e a
// exibição (painel e detalhe) usam estas constantes. O Record é exaustivo: um valor novo no tipo obriga o rótulo.
export const ROTULOS_BRAND_MEDICAMENTO: Record<BrandMedicamento, string> = {
  bioequivalente: "Bioequivalente",
  referencia: "Referência",
};

// Na ordem do select.
export const BRANDS_MEDICAMENTO: readonly BrandMedicamento[] = ["bioequivalente", "referencia"];

export function isBrandMedicamento(valor: unknown): valor is BrandMedicamento {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(ROTULOS_BRAND_MEDICAMENTO, valor);
}

// Máximo de caracteres do Laboratório (depois da normalização: pontas sem espaço, espaços repetidos viram um).
export const LIMITE_LABORATORIO = 120;
export const LABORATORIO_ERRO = `Laboratório: no máximo ${LIMITE_LABORATORIO} caracteres.`;
export const BRAND_ERRO = `Brand inválido. Opções: ${BRANDS_MEDICAMENTO.map((b) => ROTULOS_BRAND_MEDICAMENTO[b]).join(" ou ")}.`;

// Ordem alfabética (regra geral de ordenação dos selects de entidade/nome).
export const MODAL_AIR_CARGO = "Air Cargo" satisfies ModalEnvio;
export const MODAL_COURIER_FORMAL = "Courier Formal" satisfies ModalEnvio;
export const MODAL_COURIER_SIMPLES = "Courier Simples" satisfies ModalEnvio;
export const MODAIS_ENVIO: ModalEnvio[] = [MODAL_AIR_CARGO, MODAL_COURIER_FORMAL, MODAL_COURIER_SIMPLES];

// Air Cargo e Courier Formal exigem Despachante e Transportadora; Courier Simples esconde os dois. Qualquer outro
// valor (vazio, undefined, ou o legado "Courier" de registros migrados) cai no comportamento padrão de mostrar os
// campos — nunca esconde dado já preenchido por causa de um valor que não reconhecemos. Fonte única da regra: o
// formulário (showDespachanteTransportadora), a validação e o filtro "Cotações ASD" usam esta função.
export function precisaDespachanteTransportadora(modalEnvio: string | null | undefined): boolean {
  return modalEnvio !== MODAL_COURIER_SIMPLES;
}

const CIAS_COURIER: readonly string[] = ["DHL", "FedEx"];

// Cia. aérea depende do modal de envio (em ordem alfabética, como os demais selects). A cia continua OPCIONAL (pode
// ficar vazia). O valor guardado em `companhia_aerea` é exatamente um destes textos.
export const CIAS_AEREAS_POR_MODAL: Record<ModalEnvio, readonly string[]> = {
  [MODAL_AIR_CARGO]: ["Emirates", "Lufthansa", "Qatar", "Swiss", "Turkish"],
  [MODAL_COURIER_FORMAL]: CIAS_COURIER,
  [MODAL_COURIER_SIMPLES]: CIAS_COURIER,
};

// Todas as cias, sem repetir, em ordem alfabética (pt-BR): DHL, Emirates, FedEx, Lufthansa, Qatar, Swiss, Turkish. É a fonte
// única da lista para quem não depende do modal (o select "Cia aérea" da DIR).
export const CIAS_AEREAS_TODAS: readonly string[] = [...new Set(Object.values(CIAS_AEREAS_POR_MODAL).flat())].sort(
  (a, b) => a.localeCompare(b, "pt-BR"),
);

// Cias do modal; lista vazia se o modal for vazio ou desconhecido (inclui o legado "Courier"). O modal é
// comparado exatamente como vem.
export function ciasAereasDoModal(modal: string | null | undefined): readonly string[] {
  if (typeof modal !== "string" || !Object.prototype.hasOwnProperty.call(CIAS_AEREAS_POR_MODAL, modal)) return [];
  return CIAS_AEREAS_POR_MODAL[modal as ModalEnvio];
}

// A cia vale para o modal? Vazia (null, undefined, "" ou só espaços) é sempre válida. Preenchida: precisa
// ser exatamente uma das cias do modal (compara após trim; sensível a maiúsculas e minúsculas).
export function ciaAereaValidaParaModal(modal: string | null | undefined, cia: string | null | undefined): boolean {
  const texto = typeof cia === "string" ? cia.trim() : "";
  if (texto === "") return true;
  return ciasAereasDoModal(modal).includes(texto);
}

// Ordem alfabética.
export const DESPACHANTES_PROCESSO: DespachanteProcesso[] = ["Andreza Faconi", "Bruno Lopes", "Marcelo Lima"];

// Ordem alfabética, com "Outro" sempre por último (fora da ordem alfabética,
// é o padrão esperado desse tipo de campo).
export const FORNECEDORES_PROCESSO: FornecedorProcesso[] = [
  "Beldimed - Bélgica",
  "Pharyx - China",
  "Poros - Turquia",
  "Speciality - Índia",
  "Outro",
];

// Ordem alfabética.
export const RESPONSAVEIS_PROCESSO: string[] = ["Bruno", "Rebeca"];

export const STATUS_PAGAMENTO_PROCESSO: StatusPagamentoProcesso[] = ["pago", "pendente"];

// Os 5 status, na ordem do fluxo (é também a ordem das colunas do Kanban e das opções dos selects).
export const STATUS_PROCESSO_ORDER: StatusProcesso[] = [
  "elaboracao_fornecedores",
  "em_transito",
  "desembaraco",
  "liberado",
  "entregue",
];

export const STATUS_PROCESSO_LABELS: Record<StatusProcesso, string> = {
  elaboracao_fornecedores: "Na origem",
  em_transito: "Em trânsito",
  desembaraco: "Desembaraço",
  liberado: "Liberado",
  entregue: "Entregue",
};

// Status que saíram do app mas continuam no enum do Postgres (valor de enum não se remove). Ver
// normalizarStatusProcesso: é para qual dos 5 cada um vai na LEITURA, até os dados serem ajustados.
export const STATUS_PROCESSO_LEGADO_PARA: Record<StatusProcessoLegado, StatusProcesso> = {
  aguardando_inicio: "elaboracao_fornecedores",
  liberado_parcial: "desembaraco",
  outro: "desembaraco",
};

export function isStatusProcesso(valor: unknown): valor is StatusProcesso {
  return typeof valor === "string" && (STATUS_PROCESSO_ORDER as readonly string[]).includes(valor);
}

export function isStatusProcessoLegado(valor: unknown): valor is StatusProcessoLegado {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(STATUS_PROCESSO_LEGADO_PARA, valor);
}

/**
 * Status como o app o enxerga: um dos 5. Legado vira o equivalente (aguardando_inicio → Na origem; liberado_parcial e
 * outro → Desembaraço). Qualquer outra coisa (não deveria existir: a coluna é um enum) cai em "Na origem", o começo do
 * fluxo, para nenhuma tela quebrar num Record<StatusProcesso, …>. O servidor aplica isto ao montar o Processo
 * (server/utils/processoMappers.ts, montarProcesso); a tela usa de novo só como defesa.
 */
export function normalizarStatusProcesso(valor: unknown): StatusProcesso {
  if (isStatusProcesso(valor)) return valor;
  if (isStatusProcessoLegado(valor)) return STATUS_PROCESSO_LEGADO_PARA[valor];
  return "elaboracao_fornecedores";
}

// Mensagem do 400 quando alguém tenta GRAVAR um status que saiu (aba antiga, script).
export function mensagemStatusLegado(valor: string): string {
  return `O status "${valor}" não é mais usado. Escolha um destes: ${STATUS_PROCESSO_ORDER.map(
    (s) => STATUS_PROCESSO_LABELS[s],
  ).join(", ")}.`;
}

// Limites das atualizações (timeline) de um processo. Escolhidos com folga sobre a produção
// (medido em 2026-11-06, só SELECT): maior texto = 296 caracteres, maior data = 5, mais itens num
// processo = 16 (82 processos, 128 itens) — ou seja, nunca rejeitam um dado já existente.
export const LIMITE_ATUALIZACAO_TEXTO = 2000;
export const LIMITE_ATUALIZACAO_DATA = 40;
export const LIMITE_ATUALIZACOES_POR_PROCESSO = 200;

// Campos opcionais do formulário de processo que podem ser ESVAZIADOS na edição (viram null no PATCH).
// Fora desta lista ficam o que o formulário não controla ou que é obrigatório: atualizações, alertas
// resolvidos, medicamentos, pendências, datas (objeto próprio), paciente/empresa/consultor/status e a pasta (opcional,
// mas esvaziada vira "" e não null).
export const CAMPOS_PROCESSO_LIMPAVEIS: readonly CampoProcessoLimpavel[] = [
  "numeroPo",
  "responsavelOperacional",
  "despachante",
  "fornecedor",
  "transportadoraNacional",
  "modalEnvio",
  "companhiaAerea",
  "numeroAwb",
  "localEntrega",
  "numeroProcesso",
  "statusPagamento",
];

// Datas do processo guardadas como DATA COMPLETA (colunas `date`, valor "AAAA-MM-DD"), com o rótulo da tela. As outras 9
// datas são texto livre. Vazio vira NULL no banco; qualquer outro valor que não seja uma data ISO real é recusado (400).
export const DATAS_ISO_PROCESSO: ReadonlyArray<{ chave: keyof ProcessoDatas; rotulo: string }> = [
  { chave: "msAnexadoEm", rotulo: "MS Anexado em" },
  { chave: "prazoAnvisa", rotulo: "Prazo da ANVISA" },
];
