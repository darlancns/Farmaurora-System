import {
  COMPRA_ANO_MES_RE,
  COMPRA_BUSCA_MAX,
  COMPRA_ID_RE,
  COMPRA_LINHA_MAX,
  COMPRA_MAX_ITENS,
  COMPRA_MAX_ORDENS,
  COMPRA_MAX_PENDENCIAS,
  COMPRA_MEDICAMENTO_MAX,
  COMPRA_MEDICAMENTOS_LIMITE_MAX,
  COMPRA_MEDICAMENTOS_LIMITE_PADRAO,
  COMPRA_MOMENTOS_PAGAMENTO,
  COMPRA_REFERENCIA_ID_RE,
  COMPRA_TEXTO_LONGO_MAX,
  COMPRA_VALOR_MAX,
} from "../constants/compra";
import type { BrandMedicamento } from "../types/processo";
import type { CamposCompraEditaveis, CompraEstado, ItemCompraEstado } from "../types/compra";
import type { MomentoPagamentoResumo } from "../types/compraResumo";
import { chaveCadastro } from "./cadastroNome";
import { validarNovoCadastro } from "./cadastroValidacao";
import { NUMERO_REMESSA_ERRO } from "./numeroRemessa";

// Validação PURA do salvamento da Compra: o servidor (handlers) a usa e o formulário poderá usar as mesmas regras. Devolve o
// estado já LIMPO (texto aparado, só as chaves conhecidas) ou a mensagem do 400. O servidor não confia no cliente.
//
// RASCUNHO PARCIAL É VÁLIDO: campo vazio passa. Aqui só se confere a FORMA (tipos, tetos, número de ordens); o que depende dos Cadastros
// e das constantes compartilhadas com o Follow-Up (consultor, despachante, fornecedor, envio, cia por modal, empresa, brand, medicamento) é
// conferido pelo servidor com 422 (server/utils/comprasCatalogo.ts).
//
// SEMÂNTICA DO CORPO (documentada também em comprasStore.ts → salvarCompra):
//  - `atualizadoEm` (a versão que o cliente viu) é obrigatório;
//  - campo da compra AUSENTE = não muda; `itens` AUSENTE = não mexe nos itens; `itens` PRESENTE = o estado COMPLETO (o que não vier é
//    apagado) e a posição é a ordem do array;
//  - dentro de um item, campo ausente = vazio (o item é o estado inteiro dele);
//  - chave desconhecida (na compra ou no item) é 400: `medicamentoCadastroNome` e `preCadastroStatus` são só leitura e não entram.
//
// Tetos: linhas 300 caracteres (o medicamento também), observações 2000, numeroOrdens de 1 a 10, até 30 itens, até 50 pendências (300 cada,
// 2000 no total).

export type ResultadoCompra<T> = { ok: true; valor: T } | { ok: false; erro: string };

const falha = <T>(erro: string): ResultadoCompra<T> => ({ ok: false, erro });
const ok = <T>(valor: T): ResultadoCompra<T> => ({ ok: true, valor });

function objeto(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function chavesDesconhecidas(o: Record<string, unknown>, permitidas: readonly string[], onde: string): string | null {
  const fora = Object.keys(o).find((k) => !permitidas.includes(k));
  return fora ? `Campo desconhecido${onde}: ${fora}.` : null;
}

/** Texto: só string (nada de número, null ou objeto), aparado, com o teto. */
function texto(v: unknown, rotulo: string, max: number): ResultadoCompra<string> {
  if (typeof v !== "string") return falha(`${rotulo}: informe um texto.`);
  const t = v.trim();
  if (t.length > max) return falha(`${rotulo} pode ter no máximo ${max} caracteres.`);
  return ok(t);
}

function booleano(v: unknown, rotulo: string): ResultadoCompra<boolean> {
  return typeof v === "boolean" ? ok(v) : falha(`${rotulo}: informe verdadeiro ou falso.`);
}

function booleanoOuNulo(v: unknown, rotulo: string): ResultadoCompra<boolean | null> {
  return v === null || typeof v === "boolean" ? ok(v) : falha(`${rotulo}: informe verdadeiro, falso ou nulo.`);
}

/** Dinheiro: número finito de 0 até o teto da coluna, com no máximo 2 casas; null é vazio. */
export function validarDinheiroCompra(v: unknown, rotulo: string): ResultadoCompra<number | null> {
  if (v === null || v === undefined) return ok(null);
  if (typeof v !== "number" || !Number.isFinite(v)) return falha(`${rotulo}: informe um número.`);
  if (v < 0) return falha(`${rotulo} não pode ser negativo.`);
  if (v > COMPRA_VALOR_MAX) return falha(`${rotulo} é grande demais.`);
  if (Math.abs(v * 100 - Math.round(v * 100)) > 1e-6) return falha(`${rotulo} deve ter no máximo 2 casas decimais.`);
  return ok(Math.round(v * 100) / 100);
}

/** "Ordens": um inteiro de 1 a COMPRA_MAX_ORDENS (a mesma mensagem do Nº Ordem do Follow-Up). */
export function validarNumeroOrdens(v: unknown): ResultadoCompra<number> {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > COMPRA_MAX_ORDENS) return falha(NUMERO_REMESSA_ERRO);
  return ok(v);
}

// ── Campos da compra ──────────────────────────────────────────────────────────────────────────────────────────

type CampoTextoCompra = Extract<
  keyof CamposCompraEditaveis,
  | "fornecedor"
  | "envio"
  | "cia"
  | "empresa"
  | "paciente"
  | "processoNumero"
  | "medico"
  | "localAplicacao"
  | "entrega"
  | "contatos"
  | "termoObservacao"
  | "despachante"
  | "observacoes"
  | "consultor"
  | "responsavel"
>;

/** Campos de texto da compra: rótulo (para a mensagem) e teto. */
export const CAMPOS_TEXTO_COMPRA: Record<CampoTextoCompra, { rotulo: string; max: number }> = {
  fornecedor: { rotulo: "Fornecedor", max: COMPRA_LINHA_MAX },
  envio: { rotulo: "Envio", max: COMPRA_LINHA_MAX },
  cia: { rotulo: "Cia. aérea", max: COMPRA_LINHA_MAX },
  empresa: { rotulo: "Empresa", max: COMPRA_LINHA_MAX },
  paciente: { rotulo: "Paciente", max: COMPRA_LINHA_MAX },
  processoNumero: { rotulo: "Número do processo", max: COMPRA_LINHA_MAX },
  medico: { rotulo: "Médico", max: COMPRA_LINHA_MAX },
  localAplicacao: { rotulo: "Local de aplicação", max: COMPRA_LINHA_MAX },
  entrega: { rotulo: "Entrega", max: COMPRA_LINHA_MAX },
  contatos: { rotulo: "Contatos", max: COMPRA_LINHA_MAX },
  termoObservacao: { rotulo: "Observação do termo", max: COMPRA_TEXTO_LONGO_MAX },
  despachante: { rotulo: "Despachante", max: COMPRA_LINHA_MAX },
  observacoes: { rotulo: "Observações", max: COMPRA_TEXTO_LONGO_MAX },
  consultor: { rotulo: "Consultor", max: COMPRA_LINHA_MAX },
  responsavel: { rotulo: "Responsável", max: COMPRA_LINHA_MAX },
};

const CAMPOS_BOOLEANOS_COMPRA = {
  compraParticular: "Compra particular",
  termoPosterior: "Termo de pagamento posterior",
  isencao: "Isenção",
  recorrente: "Recorrente",
} as const;

const CAMPOS_BOOLEANOS_OU_NULO_COMPRA = {
  pagamentoAlvara: "Alvará na conta",
  documentos: "Documentos",
} as const;

const CAMPOS_DINHEIRO_COMPRA = {
  frete: "Frete",
  freteReal: "Valor real do frete",
} as const;

const CHAVES_DA_COMPRA: readonly string[] = [
  "atualizadoEm",
  ...Object.keys(CAMPOS_TEXTO_COMPRA),
  ...Object.keys(CAMPOS_BOOLEANOS_COMPRA),
  ...Object.keys(CAMPOS_BOOLEANOS_OU_NULO_COMPRA),
  ...Object.keys(CAMPOS_DINHEIRO_COMPRA),
  "numeroOrdens",
  "pagamentoMomento",
  "pendencias",
  "itens",
];

function validarPendencias(v: unknown): ResultadoCompra<string[]> {
  if (!Array.isArray(v)) return falha("Pendências: informe uma lista de textos.");
  if (v.length > COMPRA_MAX_PENDENCIAS) return falha(`Pendências: no máximo ${COMPRA_MAX_PENDENCIAS}.`);
  const itens: string[] = [];
  for (const [i, bruto] of v.entries()) {
    const t = texto(bruto, `Pendência ${i + 1}`, COMPRA_LINHA_MAX);
    if (!t.ok) return t;
    itens.push(t.valor);
  }
  if (itens.join(", ").length > COMPRA_TEXTO_LONGO_MAX) return falha(`As pendências juntas podem ter no máximo ${COMPRA_TEXTO_LONGO_MAX} caracteres.`);
  return ok(itens);
}

// ── Itens ─────────────────────────────────────────────────────────────────────────────────────────────────────

const CHAVES_DO_ITEM = [
  "id",
  "medicamento",
  "medicamentoCadastroId",
  "preCadastroId",
  "laboratorio",
  "brand",
  "quantidade",
  "temperatura",
  "valorUnitario",
  "valorReal",
] as const;

function idDoCorpo(v: unknown, rotulo: string): ResultadoCompra<string> {
  if (typeof v !== "string" || !COMPRA_ID_RE.test(v)) return falha(`${rotulo}: identificador inválido (de 6 a 64 letras, números, "_" ou "-").`);
  return ok(v);
}

function referenciaOpcional(v: unknown, rotulo: string): ResultadoCompra<string | null> {
  if (v === undefined || v === null) return ok(null);
  if (typeof v !== "string" || !COMPRA_REFERENCIA_ID_RE.test(v)) return falha(`${rotulo}: identificador inválido.`);
  return ok(v);
}

function validarItem(bruto: unknown, onde: string): ResultadoCompra<ItemCompraEstado> {
  const o = objeto(bruto);
  if (!o) return falha(`${onde}: dados inválidos.`);
  const desconhecida = chavesDesconhecidas(o, CHAVES_DO_ITEM, ` (${onde})`);
  if (desconhecida) return falha(desconhecida);

  const id = idDoCorpo(o.id, `${onde}: id`);
  if (!id.ok) return id;

  const linha = (campo: "medicamento" | "laboratorio" | "brand" | "quantidade" | "temperatura", rotulo: string, max: number): ResultadoCompra<string> =>
    o[campo] === undefined ? ok("") : texto(o[campo], `${onde}: ${rotulo}`, max);
  const medicamento = linha("medicamento", "medicamento", COMPRA_MEDICAMENTO_MAX);
  if (!medicamento.ok) return medicamento;
  const laboratorio = linha("laboratorio", "laboratório", COMPRA_LINHA_MAX);
  if (!laboratorio.ok) return laboratorio;
  // Só a FORMA (texto): se é "bioequivalente", "referencia" ou vazio, quem confere é o servidor (422).
  const brand = linha("brand", "brand", COMPRA_LINHA_MAX);
  if (!brand.ok) return brand;
  const quantidade = linha("quantidade", "quantidade", COMPRA_LINHA_MAX);
  if (!quantidade.ok) return quantidade;
  const temperatura = linha("temperatura", "temperatura", COMPRA_LINHA_MAX);
  if (!temperatura.ok) return temperatura;

  const medicamentoCadastroId = referenciaOpcional(o.medicamentoCadastroId, `${onde}: medicamento do Cadastro`);
  if (!medicamentoCadastroId.ok) return medicamentoCadastroId;
  const preCadastroId = referenciaOpcional(o.preCadastroId, `${onde}: pré-cadastro`);
  if (!preCadastroId.ok) return preCadastroId;
  if (medicamentoCadastroId.valor !== null && preCadastroId.valor !== null) {
    return falha(`${onde}: o medicamento é do Cadastro OU do pré-cadastro, não os dois.`);
  }

  const valorUnitario = validarDinheiroCompra(o.valorUnitario, `${onde}: valor unitário`);
  if (!valorUnitario.ok) return valorUnitario;
  const valorReal = validarDinheiroCompra(o.valorReal, `${onde}: valor real`);
  if (!valorReal.ok) return valorReal;

  return ok({
    id: id.valor,
    medicamento: medicamento.valor,
    medicamentoCadastroId: medicamentoCadastroId.valor,
    preCadastroId: preCadastroId.valor,
    laboratorio: laboratorio.valor,
    brand: brand.valor as BrandMedicamento | "",
    quantidade: quantidade.valor,
    temperatura: temperatura.valor,
    valorUnitario: valorUnitario.valor,
    valorReal: valorReal.valor,
  });
}

function validarItens(v: unknown): ResultadoCompra<ItemCompraEstado[]> {
  if (!Array.isArray(v)) return falha("Medicamentos: informe uma lista (itens).");
  if (v.length > COMPRA_MAX_ITENS) return falha(`No máximo ${COMPRA_MAX_ITENS} medicamentos por compra.`);
  const itens: ItemCompraEstado[] = [];
  for (const [i, bruto] of v.entries()) {
    const item = validarItem(bruto, `Medicamento ${i + 1}`);
    if (!item.ok) return item;
    itens.push(item.valor);
  }
  // Ids repetidos no mesmo corpo (duas linhas com o mesmo id se sobrescreveriam).
  const itemIds = itens.map((i) => i.id);
  if (new Set(itemIds).size !== itemIds.length) return falha("Há medicamentos com o mesmo identificador.");
  return ok(itens);
}

// ── O corpo inteiro ───────────────────────────────────────────────────────────────────────────────────────────

/** A versão enviada: um instante ISO válido, normalizado para o formato do servidor ("...Z"). */
function validarVersao(v: unknown): ResultadoCompra<string> {
  if (typeof v !== "string" || v.trim() === "") return falha("Informe atualizadoEm: a versão da compra que você viu.");
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? falha("atualizadoEm inválido: use a data e hora ISO que a compra trouxe.") : ok(d.toISOString());
}

/** O corpo do PATCH /api/compras/:id → o estado limpo, ou a mensagem do 400. */
export function validarCompraSalvar(corpo: unknown): ResultadoCompra<CompraEstado> {
  const o = objeto(corpo);
  if (!o) return falha("Dados inválidos.");
  const desconhecida = chavesDesconhecidas(o, CHAVES_DA_COMPRA, "");
  if (desconhecida) return falha(desconhecida);

  const versao = validarVersao(o.atualizadoEm);
  if (!versao.ok) return versao;

  const campos: Record<string, unknown> = {};

  for (const [campo, { rotulo, max }] of Object.entries(CAMPOS_TEXTO_COMPRA)) {
    if (o[campo] === undefined) continue;
    const t = texto(o[campo], rotulo, max);
    if (!t.ok) return t;
    campos[campo] = t.valor;
  }
  for (const [campo, rotulo] of Object.entries(CAMPOS_BOOLEANOS_COMPRA)) {
    if (o[campo] === undefined) continue;
    const b = booleano(o[campo], rotulo);
    if (!b.ok) return b;
    campos[campo] = b.valor;
  }
  for (const [campo, rotulo] of Object.entries(CAMPOS_BOOLEANOS_OU_NULO_COMPRA)) {
    if (o[campo] === undefined) continue;
    const b = booleanoOuNulo(o[campo], rotulo);
    if (!b.ok) return b;
    campos[campo] = b.valor;
  }
  for (const [campo, rotulo] of Object.entries(CAMPOS_DINHEIRO_COMPRA)) {
    if (o[campo] === undefined) continue;
    const d = validarDinheiroCompra(o[campo], rotulo);
    if (!d.ok) return d;
    campos[campo] = d.valor;
  }
  if (o.numeroOrdens !== undefined) {
    const n = validarNumeroOrdens(o.numeroOrdens);
    if (!n.ok) return n;
    campos.numeroOrdens = n.valor;
  }
  if (o.pagamentoMomento !== undefined) {
    const m = o.pagamentoMomento;
    if (m !== null && !(COMPRA_MOMENTOS_PAGAMENTO as readonly unknown[]).includes(m)) {
      return falha('Momento do pagamento inválido: use "vamos_pagar", "apos_awb" ou nulo.');
    }
    campos.pagamentoMomento = m as MomentoPagamentoResumo | null;
  }
  if (o.pendencias !== undefined) {
    const p = validarPendencias(o.pendencias);
    if (!p.ok) return p;
    campos.pendencias = p.valor;
  }

  const estado: CompraEstado = { atualizadoEm: versao.valor, campos: campos as Partial<CamposCompraEditaveis> };
  if (o.itens !== undefined) {
    const itens = validarItens(o.itens);
    if (!itens.ok) return itens;
    estado.itens = itens.valor;
  }
  return ok(estado);
}

/** O mês da lista (`?ano_mes=AAAA-MM`); ausente = o `padrao`. */
export function validarAnoMesDaConsulta(v: unknown, padrao: string): ResultadoCompra<string> {
  if (v === undefined || v === "") return ok(padrao);
  if (typeof v !== "string" || !COMPRA_ANO_MES_RE.test(v)) return falha("Mês inválido: use AAAA-MM.");
  return ok(v);
}

/** A consulta de medicamentos de `/api/compras/opcoes`: `?q=` (busca), `?limite=` (1 a 100, padrão 50) e `?pagina=` (a partir de 1). */
export interface ConsultaMedicamentos {
  q: string;
  limite: number;
  pagina: number;
}

function inteiroDaConsulta(v: unknown, padrao: number, minimo: number, maximo: number, rotulo: string): ResultadoCompra<number> {
  if (v === undefined || v === "") return ok(padrao);
  if (typeof v !== "string" || !/^[0-9]{1,6}$/.test(v)) return falha(`${rotulo} inválido.`);
  const n = Number(v);
  if (n < minimo || n > maximo) return falha(`${rotulo} inválido: use de ${minimo} a ${maximo}.`);
  return ok(n);
}

/** O texto da busca vira a chave do Cadastro (sem acento, caixa nem espaços repetidos) e perde os curingas do LIKE (% e _) e a barra. */
export function normalizarBuscaCompra(v: string): string {
  return chaveCadastro(v).replace(/[%_\\]/g, " ").replace(/\s+/g, " ").trim();
}

export function validarConsultaMedicamentos(consulta: Record<string, unknown>): ResultadoCompra<ConsultaMedicamentos> {
  const bruto = consulta.q;
  if (bruto !== undefined && typeof bruto !== "string") return falha("Busca inválida.");
  if ((bruto ?? "").length > COMPRA_BUSCA_MAX) return falha(`A busca pode ter no máximo ${COMPRA_BUSCA_MAX} caracteres.`);
  const limite = inteiroDaConsulta(consulta.limite, COMPRA_MEDICAMENTOS_LIMITE_PADRAO, 1, COMPRA_MEDICAMENTOS_LIMITE_MAX, "Limite");
  if (!limite.ok) return limite;
  const pagina = inteiroDaConsulta(consulta.pagina, 1, 1, 100000, "Página");
  if (!pagina.ok) return pagina;
  return ok({ q: normalizarBuscaCompra(bruto ?? ""), limite: limite.valor, pagina: pagina.valor });
}

/** `{ nome }` de POST /api/compras/temperaturas: as mesmas regras de nome do Cadastro de Temperaturas (aparado, espaços colapsados, tamanho máximo, "Outro" reservado, chave desconhecida recusada). */
export function validarNovaTemperaturaCompra(corpo: unknown): ResultadoCompra<{ nome: string }> {
  const r = validarNovoCadastro("temperaturas", corpo);
  return r.ok ? ok({ nome: r.valor.nome }) : falha(r.erro);
}

export interface PreCadastroMedicamentoDTO {
  /** Em MAIÚSCULAS, aparado, espaços colapsados (como o nome de um medicamento do Cadastro). */
  nome: string;
  temperatura: string;
  compraId: string | null;
}

/** `{ nome, temperatura, compraId? }` de POST /api/compras/pre-cadastro-medicamentos. */
export function validarPreCadastroCompra(corpo: unknown): ResultadoCompra<PreCadastroMedicamentoDTO> {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return falha("Dados inválidos.");
  const o = corpo as Record<string, unknown>;
  const desconhecida = Object.keys(o).find((k) => !["nome", "temperatura", "compraId"].includes(k));
  if (desconhecida) return falha(`Campo desconhecido: ${desconhecida}.`);

  const compraId = o.compraId ?? null;
  if (compraId !== null && !idDaCompraValido(compraId)) return falha("Compra inválida.");

  // Nome e temperatura seguem as regras do medicamento do Cadastro (o pré-cadastro vira um medicamento quando aprovado).
  const r = validarNovoCadastro("medicamentos", { nome: o.nome, temperatura: o.temperatura });
  if (!r.ok) return falha(r.erro);
  return ok({ nome: r.valor.nome, temperatura: r.valor.temperatura, compraId });
}

export interface ConsultaListaCompras {
  anoMes: string;
  incluirCanceladas: boolean;
  pagina: number;
}

/**
 * A consulta de GET /api/compras: `?ano_mes=AAAA-MM`, `?pagina=` (a partir de 1) e `?incluir_canceladas=1`. Parâmetro desconhecido é IGNORADO
 * (como sempre): o `?status=` que existia antes deixou de existir (o estado da compra é só ativa ou cancelada) e, se vier, não muda nada.
 */
export function validarConsultaListaCompras(consulta: Record<string, unknown>, anoMesPadrao: string): ResultadoCompra<ConsultaListaCompras> {
  const mes = validarAnoMesDaConsulta(consulta.ano_mes, anoMesPadrao);
  if (!mes.ok) return mes;

  const pagina = inteiroDaConsulta(consulta.pagina, 1, 1, 100000, "Página");
  if (!pagina.ok) return pagina;

  return ok({ anoMes: mes.valor, incluirCanceladas: consulta.incluir_canceladas === "1", pagina: pagina.valor });
}

/** O id da compra na rota. */
export function idDaCompraValido(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v);
}
