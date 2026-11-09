import {
  BANCO_DIR_SEM_BANCO,
  BANCOS_DIR,
  CHECKLIST_DIR,
  DESPACHANTES_DIR,
  ENVIOS_DIR,
  FORNECEDORES_DIR,
  OBSERVACOES_DIR,
  ORIGENS_DIR,
  OUTRO_DIR,
  RECEITAS_DIR,
  RESPONSAVEIS_DIR,
  STATUS_DIR_LABELS,
  STATUS_DIR_ORDER,
  STATUS_DIR_VAZIO,
  TEMPERATURAS_DIR,
  VENDEDORES_DIR,
} from "#shared/constants/dir";
import type { Dir, StatusDir } from "#shared/types/dir";
import type { AppSelectOption } from "../types/appSelect";
import {
  BANCO_FILTRO_SEM_BANCO,
  CHECKLIST_QUALQUER,
  STATUS_SEM_STATUS,
  mesesDisponiveis,
  valoresDistintos,
  type FiltroSimNao,
  type FiltrosDir,
} from "./dirFiltros";

// Opções dos selects da DIR (formulário e filtros).

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** Select de formulário: "Selecione" + lista + "Outro" (texto livre digitável, ver useOutroSentinel). */
function opcoesComOutro(lista: readonly string[]): AppSelectOption<string>[] {
  return [
    { value: "", label: "Selecione" },
    ...lista.map((nome) => ({ value: nome, label: nome })),
    { value: OUTRO_DIR, label: OUTRO_DIR },
  ];
}

export const VENDEDOR_DIR_OPTIONS = opcoesComOutro(VENDEDORES_DIR);
export const RESPONSAVEL_DIR_OPTIONS = opcoesComOutro(RESPONSAVEIS_DIR);
export const FORNECEDOR_DIR_OPTIONS = opcoesComOutro(FORNECEDORES_DIR);
export const ORIGEM_DIR_OPTIONS = opcoesComOutro(ORIGENS_DIR);
export const DESPACHANTE_DIR_OPTIONS = opcoesComOutro(DESPACHANTES_DIR);
export const BANCO_DIR_OPTIONS = opcoesComOutro(BANCOS_DIR);
export const ENVIO_DIR_OPTIONS = opcoesComOutro(ENVIOS_DIR);
export const RECEITA_DIR_OPTIONS = opcoesComOutro(RECEITAS_DIR);
export const TEMPERATURA_DIR_OPTIONS = opcoesComOutro(TEMPERATURAS_DIR);
export const OBSERVACAO_DIR_OPTIONS = opcoesComOutro(OBSERVACOES_DIR);

/** Status do formulário: "" = sem status ("—"). */
export const STATUS_DIR_OPTIONS: AppSelectOption<StatusDir | "">[] = [
  { value: "", label: STATUS_DIR_VAZIO },
  ...STATUS_DIR_ORDER.map((status) => ({ value: status, label: STATUS_DIR_LABELS[status] })),
];

export const STATUS_DIR_FILTER_OPTIONS: AppSelectOption<string>[] = [
  { value: "", label: "Todos os status" },
  ...STATUS_DIR_ORDER.map((status) => ({ value: status, label: STATUS_DIR_LABELS[status] })),
  { value: STATUS_SEM_STATUS, label: `Sem status (${STATUS_DIR_VAZIO})` },
];

export const opcoesSimNao = (todos: string, sim: string, nao: string): AppSelectOption<FiltroSimNao>[] => [
  { value: "", label: todos },
  { value: "sim", label: sim },
  { value: "nao", label: nao },
];

export const EXIGENCIA_FILTER_OPTIONS = opcoesSimNao("Exigência: todas", "Com exigência", "Sem exigência");
export const CONFERIDO_FILTER_OPTIONS = opcoesSimNao("Conferido: todos", "Conferidos", "Não conferidos");
export const FECHAMENTO_RESTANTE_FILTER_OPTIONS = opcoesSimNao(
  "Fechamento restante: todos",
  "Em fechamento restante",
  "Fora do fechamento restante",
);

export const CHECKLIST_PENDENTE_FILTER_OPTIONS: AppSelectOption<string>[] = [
  { value: "", label: "Checklist: todos" },
  { value: CHECKLIST_QUALQUER, label: "Qualquer item pendente (exceto Termômetro)" },
  ...CHECKLIST_DIR.map((item) => ({ value: item.chave, label: `${item.rotulo} pendente` })),
];

/** Opções de um filtro por valor ("Todos os …" + valores presentes nos dados). */
export function opcoesDeFiltro(todos: string, valores: readonly string[]): AppSelectOption<string>[] {
  return [{ value: "", label: todos }, ...valores.map((v) => ({ value: v, label: v }))];
}

/** "2026-10" → "Outubro/2026". */
export function rotuloMes(mes: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return mes;
  return `${MESES[Number(m[2]) - 1] ?? m[2]}/${m[1]}`;
}

export function opcoesDeMes(meses: readonly string[]): AppSelectOption<string>[] {
  return [{ value: "", label: "Todos os meses" }, ...meses.map((mes) => ({ value: mes, label: rotuloMes(mes) }))];
}

/** Classes do selo de status da lista/cartão. */
export const STATUS_DIR_BADGE_CLASS: Record<StatusDir, string> = {
  on_going: "bg-blue-100 text-blue-800",
  entregue: "bg-green-100 text-green-800",
  cancelado: "bg-red-100 text-red-800",
  falecimento: "bg-slate-200 text-slate-700",
};

export const STATUS_DIR_VAZIO_BADGE_CLASS = "bg-gray-100 text-gray-500";

/** Um select de filtro da DIR (o mesmo em lg+ inline e no painel abaixo de lg). */
export interface CampoFiltroDir {
  chave: Exclude<keyof FiltrosDir, "busca">;
  id: string;
  opcoes: AppSelectOption<string>[];
}

/** Campos de filtro, na ordem de exibição. Responsável/vendedor/fornecedor/banco/mês vêm dos dados. */
export function montarCamposFiltroDir(lista: readonly Dir[]): CampoFiltroDir[] {
  return [
    { chave: "responsavel", id: "filtro-dir-responsavel", opcoes: opcoesDeFiltro("Todos os responsáveis", valoresDistintos(lista, "responsavel")) },
    { chave: "vendedor", id: "filtro-dir-vendedor", opcoes: opcoesDeFiltro("Todos os vendedores", valoresDistintos(lista, "vendedor")) },
    { chave: "fornecedor", id: "filtro-dir-fornecedor", opcoes: opcoesDeFiltro("Todos os fornecedores", valoresDistintos(lista, "fornecedor")) },
    {
      chave: "banco",
      id: "filtro-dir-banco",
      opcoes: [
        ...opcoesDeFiltro("Todos os bancos", valoresDistintos(lista, "banco")),
        { value: BANCO_FILTRO_SEM_BANCO, label: BANCO_DIR_SEM_BANCO },
      ],
    },
    { chave: "status", id: "filtro-dir-status", opcoes: STATUS_DIR_FILTER_OPTIONS },
    { chave: "exigencia", id: "filtro-dir-exigencia", opcoes: EXIGENCIA_FILTER_OPTIONS },
    { chave: "conferido", id: "filtro-dir-conferido", opcoes: CONFERIDO_FILTER_OPTIONS },
    { chave: "fechamentoRestante", id: "filtro-dir-fechamento-restante", opcoes: FECHAMENTO_RESTANTE_FILTER_OPTIONS },
    { chave: "checklistPendente", id: "filtro-dir-checklist", opcoes: CHECKLIST_PENDENTE_FILTER_OPTIONS },
    { chave: "mes", id: "filtro-dir-mes", opcoes: opcoesDeMes(mesesDisponiveis(lista)) },
  ];
}
