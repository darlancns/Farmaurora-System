// Parser PURO do CSV exportado da aba "2026 DIR FARMAURORA" (planilha DIR): sem rede, sem
// disco, sem Nuxt. Usado pelo script de importação (scripts/migration/dry-run-dir.mjs e
// carga-dir.mjs) e coberto por tests/unit/dirParser.spec.ts.
//
// Datas civis são "YYYY-MM-DD" (texto), validadas com parseDataISO (calendário puro, sem
// `new Date("YYYY-MM-DD")`), então nada aqui depende do fuso da máquina.
//
// As mensagens de erro/aviso NUNCA incluem nome de paciente: só PO, coluna e valor de campo
// de lista. O relatório do dry-run se apoia nisso. (As entradas da lista "FECHAMENTOS RESTANTES"
// guardam o texto cru — que é nome de paciente — só para casar com a coluna PACIENTE; quem imprime
// relatório usa apenas `linha`, PO e desfecho, nunca `texto`.)

import { VENDEDOR_CANONICO } from "../constants/dir.ts";
import type { NewDirDTO, StatusDir } from "../types/dir";
import { parseDataISO } from "./dataBrasilia.ts";
import { NUMERO_PO_REGEX_PARTES as PO_RE } from "./numeroPo.ts";

export type CodigoAvisoDir =
  | "PO_REPETIDO"
  | "NUMERO_PO_REPETIDO"
  | "PO_MES_DIVERGENTE"
  | "ENTREGA_ANTES_EMISSAO"
  | "EMISSAO_FUTURA"
  | "ENTREGA_FUTURA"
  | "STATUS_VAZIO"
  | "STATUS_GRAFIA"
  | "BOOLEANO_VAZIO"
  | "PLACEHOLDER_TRACOS"
  | "DATA_VAZIA"
  | "RESPONSAVEL_VAZIO"
  | "RESPONSAVEL_DESCONHECIDO"
  | "VENDEDOR_LITERAL"
  | "OPERACAO_VAZIA"
  | "FECHAMENTO_RESTANTE_DUPLICADA"
  | "FORNECEDOR_PELA_ORIGEM"
  | "FORNECEDOR_SEM_REAL";

// ── Fornecedor "Care Pharma" ───────────────────────────────────────────────────────────────────────
// Na planilha, "Care Pharma" aparece como intermediário e o fornecedor real fica na coluna ORIGEM. A coluna ORIGEM
// deixou de existir na DIR (não é gravada), mas o parser a lê para UMA regra: Fornecedor "Care Pharma" com Origem
// preenchida e diferente → o fornecedor carregado é o valor da Origem. Qualquer outro caso, vale o Fornecedor.
//   - Care Pharma + Origem preenchida e diferente  → "pela_origem" (fornecedor = Origem)
//   - Care Pharma + Origem vazia ou Care Pharma     → "sem_real" (fica Care Pharma; sai no relatório do dry-run)
//   - qualquer outro Fornecedor (com ou sem Origem) → "normal" (fica o Fornecedor)
export const FORNECEDOR_CARE_PHARMA = "Care Pharma";

export type SituacaoFornecedorDir = "normal" | "pela_origem" | "sem_real";

// Mesma chave dos nomes da planilha: sem diferença de caixa, de acento e de espaços repetidos.
function chaveFornecedor(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function resolverFornecedorDaPlanilha(
  fornecedor: string,
  origem: string,
): { fornecedor: string; situacao: SituacaoFornecedorDir } {
  const chaveCare = chaveFornecedor(FORNECEDOR_CARE_PHARMA);
  if (chaveFornecedor(fornecedor) !== chaveCare) return { fornecedor, situacao: "normal" };
  const origemLimpa = origem.trim();
  if (origemLimpa === "" || chaveFornecedor(origemLimpa) === chaveCare) return { fornecedor, situacao: "sem_real" };
  return { fornecedor: origemLimpa, situacao: "pela_origem" };
}

export interface AvisoDir {
  codigo: CodigoAvisoDir;
  mensagem: string;
}

export interface LinhaDir {
  /** Linha da planilha (cabeçalho = 1, primeiro dado = 2). */
  linha: number;
  /** Linha "casca" (sem PO e sem paciente): só checkboxes pré-preenchidos, descartada. */
  ignorada: boolean;
  registro: NewDirDTO | null;
  erros: string[];
  avisos: AvisoDir[];
}

/**
 * Desfecho do mapeamento texto da lista → PO:
 *  - "unico":           texto idêntico ao PACIENTE de EXATAMENTE 1 PO → marca esse PO;
 *  - "unico_em_aberto": texto idêntico a vários POs e só 1 deles tem FECHAMENTO falso e operação em
 *                       andamento → marca esse;
 *  - "ambigua":         vários POs e nenhum ou mais de um candidato em aberto com FECHAMENTO falso →
 *                       NÃO marca nada (decisão humana);
 *  - "nao_encontrada":  nenhum PO com esse texto → NÃO marca nada.
 */
export type DesfechoFechamentoRestante = "unico" | "unico_em_aberto" | "ambigua" | "nao_encontrada";

export interface CandidatoFechamentoRestante {
  linha: number;
  po: string;
}

/** Uma entrada da coluna FECHAMENTOS RESTANTES (lista manual da planilha). */
export interface EntradaFechamentoRestante {
  /** Linha da planilha onde a entrada está (a lista vive nas linhas 2–98). */
  linha: number;
  /** Texto cru da célula (= nome de paciente): NUNCA imprimir em relatório/log. */
  texto: string;
  desfecho: DesfechoFechamentoRestante;
  /** PO marcado (só em "unico" e "unico_em_aberto"). */
  po: string | null;
  linhaPo: number | null;
  /** POs cujo PACIENTE é idêntico ao texto. */
  candidatos: CandidatoFechamentoRestante[];
  /** Dentre os candidatos, os com FECHAMENTO falso e operação em andamento. */
  candidatosEmAberto: CandidatoFechamentoRestante[];
}

export interface ResultadoDir {
  linhas: LinhaDir[];
  /** A coluna FECHAMENTOS RESTANTES existe no CSV? (opcional: sem ela não há entradas.) */
  temColunaFechamentosRestantes: boolean;
  /** Entradas da lista com o desfecho do mapeamento. Os POs mapeados já saem com `fechamentoRestante`. */
  fechamentosRestantes: EntradaFechamentoRestante[];
  /** Colunas obrigatórias que não existem no cabeçalho (qualquer uma impede a importação). */
  colunasAusentes: string[];
  /** Colunas do CSV que o parser não conhece nem ignora de propósito. */
  colunasExtras: string[];
}

export interface OpcoesParseDir {
  /** "Hoje" em Brasília (YYYY-MM-DD) para os avisos de data futura. Sem ele, não há aviso. */
  hoje?: string;
}

type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

const TAMANHO_MAXIMO_CAMPO = 300;

const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

// Cabeçalho (normalizado: espaços colapsados, maiúsculas) → chave interna.
const COLUNAS = {
  check: "CHECK",
  paciente: "PACIENTE",
  po: "PO",
  vendedor: "VENDEDOR",
  responsavel: "RESPONSÁVEL",
  exigencia: "EXIGÊNCIA",
  emissao: "DATA DE EMISSÃO",
  cobranca: "DATA DE COBRANÇA AOS FORNECEDORES",
  receita: "RECEITA",
  medicamento: "MEDICAMENTO",
  temperatura: "TEMPERATURA",
  fornecedor: "FORNECEDOR",
  origem: "ORIGEM",
  envio: "ENVIO",
  awb: "AWB",
  despachante: "DESPACHANTE",
  status: "STATUS",
  contrato: "CONTRATO DE CÂMBIO",
  observacao: "OBSERVAÇÃO",
  banco: "BANCO",
  pagamento: "DATA DE PAGAMENTO",
  operacao: "FECHAMENTO DE OPERAÇÃO",
  dactes: "DACTES",
  dsi: "DSI/DIR/DUIMP",
  logger: "LOGGER",
  fechamento: "FECHAMENTO",
  numerario: "NUMERÁRIO",
  protocolo: "PROTOCOLO ASSINADO",
  swift: "SWIFT",
  termometro: "TERMOMÊTRO",
} as const;

type ChaveColuna = keyof typeof COLUNAS;

// Lista manual de pacientes (linhas 2–98, sem relação com o PO da linha). NÃO é um atributo da linha:
// cada entrada é mapeada para um PO pelo texto (ver mapearFechamentosRestantes) e vira a marca
// `fechamentoRestante` desse PO. Coluna opcional.
const COLUNA_FECHAMENTOS_RESTANTES = "FECHAMENTOS RESTANTES";

// ── CSV ────────────────────────────────────────────────────────────────────

/** CSV (RFC 4180): campos entre aspas com vírgula/quebra de linha/aspas duplicadas, BOM, CRLF. */
export function parseCsv(texto: string): string[][] {
  const s = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let entreAspas = false;

  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (entreAspas) {
      if (c === '"') {
        if (s.charAt(i + 1) === '"') {
          campo += '"';
          i++;
        } else {
          entreAspas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreAspas = true;
    } else if (c === ",") {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s.charAt(i + 1) === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

// ── Normalização de campos ─────────────────────────────────────────────────

/** Aparar + colapsar espaços; célula só com traços ("-----") é placeholder e vira "". */
export function limparTexto(valor: string): string {
  return valor.replace(/\s+/g, " ").trim();
}

export function ehPlaceholderTracos(valor: string): boolean {
  const v = valor.trim();
  return v !== "" && /^[-–—_\s]+$/.test(v);
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

function montarISO(ano: number, mes: number, dia: number): Resultado<string> {
  const iso = `${String(ano).padStart(4, "0")}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
  return parseDataISO(iso) ? { ok: true, valor: iso } : { ok: false, erro: `data inexistente (${doisDigitos(dia)}/${doisDigitos(mes)}/${ano})` };
}

function diaDaSemana(iso: string): string {
  const d = parseDataISO(iso);
  if (!d) return "";
  return DIAS_SEMANA[new Date(Date.UTC(d.ano, d.mes - 1, d.dia)).getUTCDay()] ?? "";
}

/** "05.01.26-segunda-feira" → "2026-01-05". O dia da semana é conferido e descartado. */
export function parseDataPlanilha(valor: string): Resultado<string> {
  const m = /^(\d{2})\.(\d{2})\.(\d{2})-(.+)$/.exec(valor.trim());
  if (!m) return { ok: false, erro: `formato de data não reconhecido ("${valor.trim()}")` };
  const r = montarISO(2000 + Number(m[3]), Number(m[2]), Number(m[1]));
  if (!r.ok) return r;
  const esperado = diaDaSemana(r.valor);
  const informado = (m[4] ?? "").trim().toLowerCase();
  if (informado !== esperado) {
    return { ok: false, erro: `dia da semana "${informado}" não confere com a data (esperado "${esperado}")` };
  }
  return r;
}

/** "10/02/2026" (dd/mm/aaaa) → "2026-02-10". */
export function parseDataPagamento(valor: string): Resultado<string> {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor.trim());
  if (!m) return { ok: false, erro: `formato de data de pagamento não reconhecido ("${valor.trim()}")` };
  return montarISO(Number(m[3]), Number(m[2]), Number(m[1]));
}

/** Data dentro do STATUS: "28.01.26", "19/8/26" ou "19/8/2026". */
export function parseDataEntrega(valor: string): Resultado<string> {
  const v = valor.trim();
  const ponto = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(v);
  if (ponto) return montarISO(2000 + Number(ponto[3]), Number(ponto[2]), Number(ponto[1]));
  const barra = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v);
  if (barra) {
    const ano = (barra[3] ?? "").length === 2 ? 2000 + Number(barra[3]) : Number(barra[3]);
    return montarISO(ano, Number(barra[2]), Number(barra[1]));
  }
  return { ok: false, erro: `data de entrega não reconhecida ("${v}")` };
}

export interface StatusParseado {
  status: StatusDir | null;
  dataEntrega: string;
  /** true quando a grafia fugiu do padrão ("Entrega 30.03.26" sem o "gue", CANCELADO) — só para aviso. */
  grafiaIrregular: boolean;
}

/**
 * STATUS da planilha → status (enum) + data de entrega.
 * "Entregue dd.mm.aa" / "Entregue: d/m/aa" / "Entrega dd.mm.aa" → entregue + data; "On going";
 * CANCELADA/CANCELADO → cancelado; FALECIMENTO; vazio ou só traços → status nulo.
 */
export function parseStatusDir(valor: string): Resultado<StatusParseado> {
  const v = limparTexto(valor);
  if (v === "" || ehPlaceholderTracos(v)) {
    return { ok: true, valor: { status: null, dataEntrega: "", grafiaIrregular: false } };
  }
  if (/^on going$/i.test(v)) return { ok: true, valor: { status: "on_going", dataEntrega: "", grafiaIrregular: false } };
  if (/^cancelad[ao]$/i.test(v)) {
    return { ok: true, valor: { status: "cancelado", dataEntrega: "", grafiaIrregular: !/^cancelada$/i.test(v) } };
  }
  if (/^falecimento$/i.test(v)) return { ok: true, valor: { status: "falecimento", dataEntrega: "", grafiaIrregular: false } };

  const m = /^(entregue|entrega)\s*:?\s*(.*)$/i.exec(v);
  if (m) {
    const grafiaIrregular = (m[1] ?? "").toLowerCase() === "entrega";
    const resto = (m[2] ?? "").trim();
    if (resto === "") return { ok: true, valor: { status: "entregue", dataEntrega: "", grafiaIrregular } };
    const data = parseDataEntrega(resto);
    if (!data.ok) return { ok: false, erro: `STATUS: ${data.erro}` };
    return { ok: true, valor: { status: "entregue", dataEntrega: data.valor, grafiaIrregular } };
  }
  return { ok: false, erro: `STATUS não reconhecido ("${v}")` };
}

/** TRUE/VERDADEIRO → true, FALSE/FALSO → false, vazio → null; qualquer outra coisa é erro. */
export function parseBooleanoPlanilha(valor: string): Resultado<boolean | null> {
  const v = valor.trim().toUpperCase();
  if (v === "") return { ok: true, valor: null };
  if (v === "TRUE" || v === "VERDADEIRO") return { ok: true, valor: true };
  if (v === "FALSE" || v === "FALSO") return { ok: true, valor: false };
  return { ok: false, erro: `booleano inválido ("${valor.trim()}")` };
}

/** Nome canônico do vendedor; fora do mapeamento, devolve o literal (literal = true). */
export function normalizarVendedor(valor: string): { nome: string; literal: boolean } {
  const v = limparTexto(valor);
  const canonico = VENDEDOR_CANONICO[v];
  return canonico ? { nome: canonico, literal: false } : { nome: v, literal: true };
}

/** "Re" → "Rebeca"; Bruno/Rebeca ficam; qualquer outro valor passa literal (com aviso). */
export function normalizarResponsavel(valor: string): { nome: string; conhecido: boolean } {
  const v = limparTexto(valor);
  if (v === "Re") return { nome: "Rebeca", conhecido: true };
  return { nome: v, conhecido: v === "Bruno" || v === "Rebeca" };
}

// ── Linha → registro ───────────────────────────────────────────────────────

function indiceDasColunas(cabecalho: string[]): {
  indices: Partial<Record<ChaveColuna, number>>;
  extras: string[];
  restantes: number;
} {
  const normalizados = cabecalho.map((h) => h.normalize("NFC").replace(/\s+/g, " ").trim().toUpperCase());
  const indices: Partial<Record<ChaveColuna, number>> = {};
  const conhecidos = new Set<string>([COLUNA_FECHAMENTOS_RESTANTES]);
  for (const chave of Object.keys(COLUNAS) as ChaveColuna[]) {
    const nome = COLUNAS[chave].normalize("NFC");
    conhecidos.add(nome);
    const i = normalizados.indexOf(nome);
    if (i !== -1) indices[chave] = i;
  }
  const extras = cabecalho.filter((_, i) => !conhecidos.has(normalizados[i] ?? "") && (normalizados[i] ?? "") !== "");
  return { indices, extras, restantes: normalizados.indexOf(COLUNA_FECHAMENTOS_RESTANTES) };
}

function parseLinha(
  linha: number,
  celulas: string[],
  indices: Partial<Record<ChaveColuna, number>>,
  opcoes: OpcoesParseDir,
): LinhaDir {
  const bruto = (chave: ChaveColuna): string => {
    const i = indices[chave];
    return i === undefined ? "" : (celulas[i] ?? "");
  };
  const todasVazias = celulas.every((c) => c.trim() === "");
  const po = limparTexto(bruto("po"));
  const paciente = limparTexto(bruto("paciente"));

  // Casca: sem PO e sem paciente (só os checkboxes pré-preenchidos com FALSE/FALSO).
  if (todasVazias || (po === "" && paciente === "")) {
    return { linha, ignorada: true, registro: null, erros: [], avisos: [] };
  }

  const erros: string[] = [];
  const avisos: AvisoDir[] = [];
  const aviso = (codigo: CodigoAvisoDir, mensagem: string): void => {
    avisos.push({ codigo, mensagem });
  };

  const texto = (chave: ChaveColuna): string => {
    const original = bruto(chave);
    if (ehPlaceholderTracos(original)) {
      aviso("PLACEHOLDER_TRACOS", `${COLUNAS[chave]}: célula só com traços tratada como vazia`);
      return "";
    }
    const v = limparTexto(original);
    if (v.length > TAMANHO_MAXIMO_CAMPO) erros.push(`${COLUNAS[chave]}: texto com mais de ${TAMANHO_MAXIMO_CAMPO} caracteres`);
    return v;
  };

  const booleano = (chave: ChaveColuna): boolean => {
    const r = parseBooleanoPlanilha(bruto(chave));
    if (!r.ok) {
      erros.push(`${COLUNAS[chave]}: ${r.erro}`);
      return false;
    }
    if (r.valor === null) {
      aviso("BOOLEANO_VAZIO", `${COLUNAS[chave]}: vazio, gravado como falso`);
      return false;
    }
    return r.valor;
  };

  const dataPlanilha = (chave: ChaveColuna): string => {
    if (bruto(chave).trim() === "") {
      aviso("DATA_VAZIA", `${COLUNAS[chave]}: sem data`);
      return "";
    }
    const r = parseDataPlanilha(bruto(chave));
    if (!r.ok) {
      erros.push(`${COLUNAS[chave]}: ${r.erro}`);
      return "";
    }
    return r.valor;
  };

  // PO e paciente
  if (po === "") erros.push("PO vazio");
  else if (!PO_RE.test(po)) erros.push(`PO fora do padrão PO26-MM-NNNN ("${po}")`);
  if (paciente === "") erros.push("PACIENTE vazio");
  else if (paciente.length > TAMANHO_MAXIMO_CAMPO) erros.push(`PACIENTE: texto com mais de ${TAMANHO_MAXIMO_CAMPO} caracteres`);

  // Vendedor e responsável
  const vend = normalizarVendedor(bruto("vendedor"));
  if (vend.nome === "") erros.push("VENDEDOR vazio");
  else if (vend.literal) aviso("VENDEDOR_LITERAL", `VENDEDOR sem mapeamento canônico, gravado literal ("${vend.nome}")`);

  let responsavel = "";
  if (limparTexto(bruto("responsavel")) === "") {
    aviso("RESPONSAVEL_VAZIO", "RESPONSÁVEL vazio");
  } else {
    const resp = normalizarResponsavel(bruto("responsavel"));
    responsavel = resp.nome;
    if (!resp.conhecido) aviso("RESPONSAVEL_DESCONHECIDO", `RESPONSÁVEL fora de Bruno/Rebeca ("${resp.nome}")`);
  }

  // Datas
  const dataEmissao = dataPlanilha("emissao");
  const dataCobrancaFornecedores = dataPlanilha("cobranca");
  let dataPagamento = "";
  if (bruto("pagamento").trim() !== "") {
    const r = parseDataPagamento(bruto("pagamento"));
    if (r.ok) dataPagamento = r.valor;
    else erros.push(`${COLUNAS.pagamento}: ${r.erro}`);
  }

  // Status + data de entrega
  let status: StatusDir | null = null;
  let dataEntrega = "";
  const st = parseStatusDir(bruto("status"));
  if (!st.ok) {
    erros.push(st.erro);
  } else {
    status = st.valor.status;
    dataEntrega = st.valor.dataEntrega;
    if (status === null) aviso("STATUS_VAZIO", "STATUS vazio ou só traços: status nulo");
    if (st.valor.grafiaIrregular) aviso("STATUS_GRAFIA", `STATUS com grafia fora do padrão ("${limparTexto(bruto("status"))}")`);
  }

  // Operação (FECHAMENTO DE OPERAÇÃO)
  let operacaoEncerrada = false;
  const op = limparTexto(bruto("operacao"));
  if (op === "") aviso("OPERACAO_VAZIA", "FECHAMENTO DE OPERAÇÃO vazio, gravado como em andamento");
  else if (/^opera[cç][aã]o encerrada$/i.test(op)) operacaoEncerrada = true;
  else if (!/^em andamento$/i.test(op)) erros.push(`FECHAMENTO DE OPERAÇÃO inválido ("${op}")`);

  // Avisos de data
  const ms = PO_RE.exec(po);
  if (ms && dataEmissao !== "") {
    const mesEmissao = dataEmissao.slice(5, 7);
    if (ms[2] !== mesEmissao) aviso("PO_MES_DIVERGENTE", `mês do PO (${ms[2]}) difere do mês da emissão (${mesEmissao})`);
  }
  if (dataEntrega !== "" && dataEmissao !== "" && dataEntrega < dataEmissao) {
    aviso("ENTREGA_ANTES_EMISSAO", `data de entrega (${dataEntrega}) anterior à emissão (${dataEmissao})`);
  }
  if (opcoes.hoje) {
    if (dataEmissao !== "" && dataEmissao > opcoes.hoje) aviso("EMISSAO_FUTURA", `emissão no futuro (${dataEmissao})`);
    if (dataEntrega !== "" && dataEntrega > opcoes.hoje) aviso("ENTREGA_FUTURA", `entrega no futuro (${dataEntrega})`);
  }

  // Fornecedor (+ regra do Care Pharma, que lê a ORIGEM da planilha; a Origem em si não é gravada).
  const fornecedorPlanilha = texto("fornecedor");
  const origemPlanilha = texto("origem");
  const resolvido = resolverFornecedorDaPlanilha(fornecedorPlanilha, origemPlanilha);
  if (resolvido.situacao === "pela_origem") {
    aviso("FORNECEDOR_PELA_ORIGEM", `FORNECEDOR "${FORNECEDOR_CARE_PHARMA}" trocado pela ORIGEM ("${resolvido.fornecedor}")`);
  } else if (resolvido.situacao === "sem_real") {
    aviso("FORNECEDOR_SEM_REAL", `FORNECEDOR "${FORNECEDOR_CARE_PHARMA}" sem fornecedor real (ORIGEM vazia ou igual)`);
  }

  const registro: NewDirDTO = {
    po,
    paciente,
    conferido: booleano("check"),
    vendedor: vend.nome,
    responsavel,
    exigencia: booleano("exigencia"),
    dataEmissao,
    dataCobrancaFornecedores,
    receita: texto("receita"),
    medicamento: texto("medicamento"),
    temperatura: texto("temperatura"),
    fornecedor: resolvido.fornecedor,
    envio: texto("envio"),
    awb: texto("awb"),
    despachante: texto("despachante"),
    status,
    dataEntrega,
    contratoCambio: texto("contrato"),
    observacao: texto("observacao"),
    banco: texto("banco"),
    dataPagamento,
    operacaoEncerrada,
    fechamentoRestante: false, // vira true em parseDirCsv, pelo mapeamento da lista FECHAMENTOS RESTANTES
    dactes: booleano("dactes"),
    dsiDirDuimp: booleano("dsi"),
    logger: booleano("logger"),
    fechamento: booleano("fechamento"),
    numerario: booleano("numerario"),
    protocoloAssinado: booleano("protocolo"),
    swift: booleano("swift"),
    termometro: booleano("termometro"),
  };

  return { linha, ignorada: false, registro: erros.length === 0 ? registro : null, erros, avisos };
}

/** Interpreta o CSV inteiro. Não grava nada; devolve registros, erros e avisos por linha. */
export function parseDirCsv(texto: string, opcoes: OpcoesParseDir = {}): ResultadoDir {
  const tabela = parseCsv(texto);
  const cabecalho = tabela[0] ?? [];
  const { indices, extras, restantes } = indiceDasColunas(cabecalho);
  const colunasAusentes = (Object.keys(COLUNAS) as ChaveColuna[]).filter((c) => indices[c] === undefined).map((c) => COLUNAS[c]);

  const linhas: LinhaDir[] = tabela.slice(1).map((celulas, i) => parseLinha(i + 2, celulas, indices, opcoes));

  // PO repetido (mesmo PO em mais de uma linha) e número NNNN repetido com mês diferente.
  const porPo = new Map<string, LinhaDir[]>();
  const porNumero = new Map<string, LinhaDir[]>();
  for (const l of linhas) {
    if (!l.registro) continue;
    const po = l.registro.po;
    porPo.set(po, [...(porPo.get(po) ?? []), l]);
    const numero = po.slice(-4);
    porNumero.set(numero, [...(porNumero.get(numero) ?? []), l]);
  }
  for (const [po, grupo] of porPo) {
    if (grupo.length < 2) continue;
    const linhasTxt = grupo.map((l) => l.linha).join(", ");
    for (const l of grupo) l.avisos.push({ codigo: "PO_REPETIDO", mensagem: `${po} aparece em mais de uma linha (${linhasTxt})` });
  }
  for (const [numero, grupo] of porNumero) {
    const distintos = new Set(grupo.map((l) => l.registro?.po));
    if (distintos.size < 2) continue;
    const pos = [...distintos].join(", ");
    for (const l of grupo) {
      l.avisos.push({ codigo: "NUMERO_PO_REPETIDO", mensagem: `número ${numero} repetido em POs de meses diferentes (${pos})` });
    }
  }

  const fechamentosRestantes = mapearFechamentosRestantes(tabela, restantes, linhas);

  return {
    linhas,
    temColunaFechamentosRestantes: restantes !== -1,
    fechamentosRestantes,
    colunasAusentes,
    colunasExtras: extras,
  };
}

// Chave de comparação do texto da lista com a coluna PACIENTE: espaços colapsados, sem diferença de
// caixa (a planilha tem nomes em minúsculas).
function chaveTexto(valor: string): string {
  return limparTexto(valor).normalize("NFC").toUpperCase();
}

/**
 * Lê a coluna FECHAMENTOS RESTANTES e mapeia cada entrada para um PO (e já marca `fechamentoRestante`
 * nos POs mapeados). Regra — NUNCA se escolhe um PO "por conta própria":
 *  a) texto idêntico ao PACIENTE de EXATAMENTE 1 PO → marca esse PO;
 *  b) texto idêntico a vários POs → marca o ÚNICO com FECHAMENTO falso e operação em andamento;
 *  c) mais de um (ou nenhum) candidato em (b) → ambígua: não marca nada;
 *  d) nenhum PO com esse texto → não encontrada: não marca nada.
 * Só POs sem erro (com registro) podem ser alvo. Célula vazia ou só de traços não é entrada.
 */
function mapearFechamentosRestantes(tabela: string[][], indice: number, linhas: LinhaDir[]): EntradaFechamentoRestante[] {
  if (indice === -1) return [];

  const porTexto = new Map<string, LinhaDir[]>();
  for (const l of linhas) {
    if (!l.registro) continue;
    const chave = chaveTexto(l.registro.paciente);
    porTexto.set(chave, [...(porTexto.get(chave) ?? []), l]);
  }

  const entradas: EntradaFechamentoRestante[] = [];
  const marcadas = new Map<LinhaDir, number>(); // PO já marcado -> linha da lista que o marcou

  tabela.slice(1).forEach((celulas, i) => {
    const cru = celulas[indice] ?? "";
    if (cru.trim() === "" || ehPlaceholderTracos(cru)) return;

    const linha = i + 2;
    const candidatosLinhas = porTexto.get(chaveTexto(cru)) ?? [];
    const comoCandidato = (l: LinhaDir): CandidatoFechamentoRestante => ({ linha: l.linha, po: l.registro?.po ?? "" });
    const emAberto = candidatosLinhas.filter((l) => l.registro && !l.registro.fechamento && !l.registro.operacaoEncerrada);

    let desfecho: DesfechoFechamentoRestante;
    let alvo: LinhaDir | null = null;
    if (candidatosLinhas.length === 0) {
      desfecho = "nao_encontrada";
    } else if (candidatosLinhas.length === 1) {
      desfecho = "unico";
      alvo = candidatosLinhas[0] ?? null;
    } else if (emAberto.length === 1) {
      desfecho = "unico_em_aberto";
      alvo = emAberto[0] ?? null;
    } else {
      desfecho = "ambigua";
    }

    if (alvo?.registro) {
      const anterior = marcadas.get(alvo);
      if (anterior !== undefined) {
        alvo.avisos.push({
          codigo: "FECHAMENTO_RESTANTE_DUPLICADA",
          mensagem: `${alvo.registro.po} já foi marcado pela entrada da linha ${anterior} da lista (repetida na linha ${linha})`,
        });
      }
      marcadas.set(alvo, anterior ?? linha);
      alvo.registro.fechamentoRestante = true;
    }

    entradas.push({
      linha,
      texto: cru,
      desfecho,
      po: alvo?.registro?.po ?? null,
      linhaPo: alvo?.linha ?? null,
      candidatos: candidatosLinhas.map(comoCandidato),
      candidatosEmAberto: emAberto.map(comoCandidato),
    });
  });

  return entradas;
}
