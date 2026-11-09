import { BANCO_DIR_SEM_BANCO, CHECKLIST_DIR } from "#shared/constants/dir";
import type { ChecklistChaveDir, Dir, StatusDir } from "#shared/types/dir";
import { normalizeText } from "./search";

// Lógica pura da lista da DIR (filtros, abas, ordenação, contagens, lista "Fechamentos restantes") —
// sem Vue, testável isoladamente (tests/unit/dirFiltros.spec.ts).

export const STATUS_SEM_STATUS = "sem_status";
// "Qualquer item" do filtro de checklist pendente: os 8 itens MENOS o Termômetro, que é FALSO em
// todas as linhas da planilha e faria o filtro valer sempre.
export const CHECKLIST_QUALQUER = "qualquer";
// Valor do filtro de banco que casa com PO SEM banco (o chip "Sem banco" da faixa de bancos).
export const BANCO_FILTRO_SEM_BANCO = "__sem_banco__";

export type FiltroSimNao = "" | "sim" | "nao";

export interface FiltrosDir {
  busca: string;
  responsavel: string;
  vendedor: string;
  fornecedor: string;
  banco: string;
  status: "" | StatusDir | typeof STATUS_SEM_STATUS;
  exigencia: FiltroSimNao;
  conferido: FiltroSimNao;
  /**
   * Marcação "em fechamento restante" do PO (a marca crua, `fechamentoRestante`). Nas abas Em aberto e
   * Encerradas filtra por ela; na aba "Fechamentos restantes" não se aplica (a aba JÁ é a visão).
   */
  fechamentoRestante: FiltroSimNao;
  checklistPendente: "" | typeof CHECKLIST_QUALQUER | ChecklistChaveDir;
  /** "YYYY-MM" (mês da emissão; sem emissão, o mês do PO) ou "" (todos). */
  mes: string;
}

export const FILTROS_DIR_VAZIOS: FiltrosDir = {
  busca: "",
  responsavel: "",
  vendedor: "",
  fornecedor: "",
  banco: "",
  status: "",
  exigencia: "",
  conferido: "",
  fechamentoRestante: "",
  checklistPendente: "",
  mes: "",
};

const PO_RE = /^PO(\d{2})-(\d{2})-\d{4}$/;

/** Mês do registro: o da emissão ("YYYY-MM"); sem emissão, o do número do PO (PO26-03-… → 2026-03). */
export function mesDoRegistro(dir: Pick<Dir, "dataEmissao" | "po">): string {
  if (dir.dataEmissao.length >= 7) return dir.dataEmissao.slice(0, 7);
  const m = PO_RE.exec(dir.po);
  return m ? `20${m[1]}-${m[2]}` : "";
}

/** Itens do checklist marcados (0 a 8). */
export function contarChecklistMarcados(dir: Pick<Dir, ChecklistChaveDir>): number {
  return CHECKLIST_DIR.filter((item) => dir[item.chave]).length;
}

function simNaoConfere(valor: FiltroSimNao, atual: boolean): boolean {
  if (valor === "") return true;
  return valor === "sim" ? atual : !atual;
}

function checklistConfere(filtro: FiltrosDir["checklistPendente"], dir: Dir): boolean {
  if (filtro === "") return true;
  if (filtro === CHECKLIST_QUALQUER) {
    return CHECKLIST_DIR.some((item) => item.chave !== "termometro" && !dir[item.chave]);
  }
  return !dir[filtro];
}

function statusConfere(filtro: FiltrosDir["status"], dir: Dir): boolean {
  if (filtro === "") return true;
  if (filtro === STATUS_SEM_STATUS) return dir.status === null;
  return dir.status === filtro;
}

export function aplicarFiltrosDir(lista: readonly Dir[], filtros: FiltrosDir): Dir[] {
  const busca = normalizeText(filtros.busca);
  return lista.filter((dir) => {
    if (busca) {
      const alvo = normalizeText([dir.paciente, dir.po, dir.medicamento, dir.awb].join(" "));
      if (!alvo.includes(busca)) return false;
    }
    if (filtros.responsavel && dir.responsavel !== filtros.responsavel) return false;
    if (filtros.vendedor && dir.vendedor !== filtros.vendedor) return false;
    if (filtros.fornecedor && dir.fornecedor !== filtros.fornecedor) return false;
    if (filtros.banco === BANCO_FILTRO_SEM_BANCO) {
      if (dir.banco !== "") return false;
    } else if (filtros.banco && dir.banco !== filtros.banco) {
      return false;
    }
    if (!statusConfere(filtros.status, dir)) return false;
    if (!simNaoConfere(filtros.exigencia, dir.exigencia)) return false;
    if (!simNaoConfere(filtros.conferido, dir.conferido)) return false;
    if (!simNaoConfere(filtros.fechamentoRestante, dir.fechamentoRestante)) return false;
    if (!checklistConfere(filtros.checklistPendente, dir)) return false;
    if (filtros.mes && mesDoRegistro(dir) !== filtros.mes) return false;
    return true;
  });
}

/** Quantos filtros (fora a busca) estão ativos — número da bolinha do ícone de filtros no mobile. */
export function contarFiltrosAtivos(filtros: FiltrosDir): number {
  const { busca: _busca, ...demais } = filtros;
  return Object.values(demais).filter((v) => v !== "").length;
}

/** Abas pela operação: "Em aberto" (não encerrada) e "Encerradas". */
export function separarAbasDir(lista: readonly Dir[]): { emAberto: Dir[]; encerradas: Dir[] } {
  return {
    emAberto: lista.filter((d) => !d.operacaoEncerrada),
    encerradas: lista.filter((d) => d.operacaoEncerrada),
  };
}

// ── Lista "Fechamentos restantes" ───────────────────────────────────────────

/**
 * O PO está na lista "Fechamentos restantes"? = marcado E com a operação em andamento. A saída é
 * AUTOMÁTICA ao encerrar a operação, mas a marca NÃO é apagada: reabrir a operação devolve o PO à lista.
 */
export function estaNaListaFechamentosRestantes(dir: Pick<Dir, "fechamentoRestante" | "operacaoEncerrada">): boolean {
  return dir.fechamentoRestante && !dir.operacaoEncerrada;
}

/** A visão (aba "Fechamentos restantes"): só os POs que estão na lista. */
export function visaoFechamentosRestantes(lista: readonly Dir[]): Dir[] {
  return lista.filter(estaNaListaFechamentosRestantes);
}

/** Nome do paciente SEM o sufixo numérico "(N)" do fim ("(3RB)", "(Ordem 1)" e afins ficam no nome). */
export function nomeBasePaciente(paciente: string): string {
  return paciente.replace(/\s*\(\d+\)\s*$/, "").trim();
}

/** O "(N)" do fim do nome, como está escrito ("(5)"), ou "" quando não há. Não é um campo de ordem. */
export function sufixoOrdemPaciente(paciente: string): string {
  const m = /\((\d+)\)\s*$/.exec(paciente);
  return m ? `(${m[1]})` : "";
}

export interface GrupoPacienteDir {
  /** Chave estável do grupo: nome base sem acento/caixa. */
  chave: string;
  /** Nome base como escrito no primeiro PO do grupo. */
  nome: string;
  /** POs do paciente, em ordem crescente de PO (a ordem dos pedidos). */
  registros: Dir[];
}

/** Agrupa por paciente (nome sem "(N)"); grupos em ordem alfabética, POs do grupo em ordem crescente. */
export function agruparPorPaciente(lista: readonly Dir[]): GrupoPacienteDir[] {
  const porChave = new Map<string, Dir[]>();
  for (const dir of lista) {
    const chave = normalizeText(nomeBasePaciente(dir.paciente));
    porChave.set(chave, [...(porChave.get(chave) ?? []), dir]);
  }
  const grupos: GrupoPacienteDir[] = [];
  for (const [chave, itens] of porChave) {
    const registros = [...itens].sort((a, b) => (a.po === b.po ? a.id.localeCompare(b.id) : a.po < b.po ? -1 : 1));
    grupos.push({ chave, nome: nomeBasePaciente(registros[0]?.paciente ?? ""), registros });
  }
  return grupos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** "97 POs · 93 pacientes". */
export function resumoFechamentosRestantes(lista: readonly Dir[]): { pos: number; pacientes: number } {
  return { pos: lista.length, pacientes: new Set(lista.map((d) => normalizeText(nomeBasePaciente(d.paciente)))).size };
}

export interface ContagemBancoDir {
  /** Valor do banco no PO ("" = sem banco). */
  banco: string;
  /** Nome para o chip ("Sem banco" quando vazio). */
  rotulo: string;
  /** Valor para `FiltrosDir.banco` ao clicar no chip (BANCO_FILTRO_SEM_BANCO quando vazio). */
  valorFiltro: string;
  quantidade: number;
}

/** Contagem por banco (faixa de chips), da maior para a menor; empate em ordem alfabética. */
export function contarPorBanco(lista: readonly Pick<Dir, "banco">[]): ContagemBancoDir[] {
  const mapa = new Map<string, number>();
  for (const { banco } of lista) mapa.set(banco, (mapa.get(banco) ?? 0) + 1);
  return [...mapa]
    .map(([banco, quantidade]) => ({
      banco,
      rotulo: banco || BANCO_DIR_SEM_BANCO,
      valorFiltro: banco || BANCO_FILTRO_SEM_BANCO,
      quantidade,
    }))
    .sort((a, b) => b.quantidade - a.quantidade || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** Trecho seguro para id de elemento ("Não Cotado" → "nao-cotado"); texto sem letras/números → `vazio`. */
export function slugId(texto: string, vazio = "item"): string {
  return normalizeText(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || vazio;
}

/** Id do chip/linha de um banco ("Não Cotado" → "nao-cotado"; vazio → "sem-banco"). */
export function slugBanco(banco: string): string {
  return slugId(banco, "sem-banco");
}

/** "97 POs · 93 pacientes" (singular quando for 1). */
export function textoResumoFechamentos(resumo: { pos: number; pacientes: number }): string {
  const pos = `${resumo.pos} ${resumo.pos === 1 ? "PO" : "POs"}`;
  const pacientes = `${resumo.pacientes} ${resumo.pacientes === 1 ? "paciente" : "pacientes"}`;
  return `${pos} · ${pacientes}`;
}

/**
 * POs candidatos a entrar na lista: operação em andamento e ainda não marcados, que casam com a busca
 * (paciente ou PO). Sem busca devolve vazio (a tela pede para digitar); `limite` corta o excesso.
 */
export function candidatosAFechamentoRestante(
  lista: readonly Dir[],
  busca: string,
  limite = 30,
): { itens: Dir[]; total: number } {
  const termo = normalizeText(busca);
  if (!termo) return { itens: [], total: 0 };
  const achados = ordenarPorPoDesc(
    lista.filter(
      (d) =>
        !d.operacaoEncerrada &&
        !d.fechamentoRestante &&
        normalizeText(`${d.paciente} ${d.po}`).includes(termo),
    ),
  );
  return { itens: achados.slice(0, limite), total: achados.length };
}

/** PO decrescente (texto PO26-MM-NNNN ordena certo); empate pelo id, para a ordem ser estável. */
export function ordenarPorPoDesc(lista: readonly Dir[]): Dir[] {
  return [...lista].sort((a, b) => (a.po === b.po ? a.id.localeCompare(b.id) : a.po < b.po ? 1 : -1));
}

/** Quantos registros existem por PO (para avisar PO repetido). */
export function contarPorPo(lista: readonly Pick<Dir, "po">[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const { po } of lista) mapa.set(po, (mapa.get(po) ?? 0) + 1);
  return mapa;
}

type CampoDistinto = "responsavel" | "vendedor" | "fornecedor" | "banco";

/** Valores distintos (não vazios) presentes nos dados, em ordem alfabética pt-BR. */
export function valoresDistintos(lista: readonly Dir[], campo: CampoDistinto): string[] {
  const valores = new Set<string>();
  for (const dir of lista) if (dir[campo] !== "") valores.add(dir[campo]);
  return [...valores].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Meses ("YYYY-MM") presentes nos dados, do mais recente ao mais antigo. */
export function mesesDisponiveis(lista: readonly Dir[]): string[] {
  const meses = new Set<string>();
  for (const dir of lista) {
    const mes = mesDoRegistro(dir);
    if (mes !== "") meses.add(mes);
  }
  return [...meses].sort().reverse();
}
