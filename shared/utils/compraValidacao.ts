import {
  COMPRA_ANO_MES_RE,
  COMPRA_BUSCA_MAX,
  COMPRA_ID_RE,
  COMPRA_LINHA_MAX,
  COMPRA_MAX_ITENS_POR_ORDEM,
  COMPRA_MAX_ORDENS,
  COMPRA_MAX_PENDENCIAS,
  COMPRA_MEDICAMENTOS_LIMITE_MAX,
  COMPRA_MEDICAMENTOS_LIMITE_PADRAO,
  COMPRA_MOMENTOS_PAGAMENTO,
  COMPRA_REFERENCIA_ID_RE,
  COMPRA_TEXTO_LONGO_MAX,
  COMPRA_VALOR_MAX,
} from "../constants/compra";
import type { CamposCompraEditaveis, CompraEstado, ItemCompraEstado, OrdemCompraEstado } from "../types/compra";
import type { MomentoPagamentoResumo } from "../types/compraResumo";
import { chaveCadastro } from "./cadastroNome";
import { NUMERO_PO_ERRO, NUMERO_PO_REGEX, normalizarNumeroPo } from "./numeroPo";

// Validação PURA do salvamento da Compra: o servidor (handlers) a usa e o formulário da Etapa 6 poderá usar as mesmas regras. Devolve o
// estado já LIMPO (texto aparado, só as chaves conhecidas) ou a mensagem do 400. O servidor não confia no cliente.
//
// RASCUNHO PARCIAL É VÁLIDO: campo vazio passa (a checagem de "pronto para encaminhar" é do Encaminhar, não daqui).
//
// SEMÂNTICA DO CORPO (documentada também em comprasStore.ts → salvarCompra):
//  - `atualizadoEm` (a versão que o cliente viu) é obrigatório;
//  - campo da compra AUSENTE = não muda; `ordens` AUSENTE = não mexe nas ordens; `ordens` PRESENTE = o estado COMPLETO (o que não vier é
//    apagado) e a posição é a ordem do array;
//  - dentro de uma ordem e de um item, campo ausente = vazio (o item/ordem é o estado inteiro dele);
//  - `dirId` e `encaminhadaEm` das ordens são ACEITOS e IGNORADOS (só o Encaminhar os grava); qualquer outra chave desconhecida é 400.
//
// Tetos: linhas 300 caracteres, observações 2000, até 10 ordens, até 30 itens por ordem, até 50 pendências (300 cada, 2000 no total).

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

// ── Campos da compra ──────────────────────────────────────────────────────────────────────────────────────────

type CampoTextoCompra = Exclude<keyof CamposCompraEditaveis, "compraParticular" | "localDeclarado" | "termoPosterior" | "courierSimples" | "isencao" | "pagamentoAlvara" | "pagamentoMomento" | "documentos" | "pendencias">;

/** Campos de texto da compra: rótulo (para a mensagem) e teto. */
export const CAMPOS_TEXTO_COMPRA: Record<CampoTextoCompra, { rotulo: string; max: number }> = {
  paciente: { rotulo: "Paciente", max: COMPRA_LINHA_MAX },
  processoNumero: { rotulo: "Número do processo", max: COMPRA_LINHA_MAX },
  medico: { rotulo: "Médico", max: COMPRA_LINHA_MAX },
  localAplicacao: { rotulo: "Local de aplicação", max: COMPRA_LINHA_MAX },
  entrega: { rotulo: "Entrega", max: COMPRA_LINHA_MAX },
  contatos: { rotulo: "Contatos", max: COMPRA_LINHA_MAX },
  termoObservacao: { rotulo: "Observação do termo", max: COMPRA_TEXTO_LONGO_MAX },
  despachante: { rotulo: "Despachante", max: COMPRA_LINHA_MAX },
  isencaoPara: { rotulo: "Isenção para", max: COMPRA_LINHA_MAX },
  observacoes: { rotulo: "Observações", max: COMPRA_TEXTO_LONGO_MAX },
  vendedor: { rotulo: "Vendedor", max: COMPRA_LINHA_MAX },
  responsavel: { rotulo: "Responsável", max: COMPRA_LINHA_MAX },
};

const CAMPOS_BOOLEANOS_COMPRA = {
  compraParticular: "Compra particular",
  localDeclarado: "Local declarado",
  termoPosterior: "Termo de pagamento posterior",
  courierSimples: "Courier Simples",
  isencao: "Isenção",
} as const;

const CAMPOS_BOOLEANOS_OU_NULO_COMPRA = {
  pagamentoAlvara: "Alvará na conta",
  documentos: "Documentos",
} as const;

const CHAVES_DA_COMPRA: readonly string[] = [
  "atualizadoEm",
  ...Object.keys(CAMPOS_TEXTO_COMPRA),
  ...Object.keys(CAMPOS_BOOLEANOS_COMPRA),
  ...Object.keys(CAMPOS_BOOLEANOS_OU_NULO_COMPRA),
  "pagamentoMomento",
  "pendencias",
  "ordens",
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

// ── Itens e ordens ────────────────────────────────────────────────────────────────────────────────────────────

const CHAVES_DO_ITEM = [
  "id",
  "medicamento",
  "medicamentoCadastroId",
  "preCadastroId",
  "apresentacao",
  "referencia",
  "laboratorio",
  "quantidade",
  "temperatura",
  "valorUnitario",
  "valorReal",
] as const;

const CHAVES_DA_ORDEM = ["id", "fornecedor", "envio", "cia", "po", "frete", "freteReal", "itens", "dirId", "encaminhadaEm"] as const;

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

  const linha = (campo: "medicamento" | "apresentacao" | "referencia" | "laboratorio" | "quantidade" | "temperatura", rotulo: string): ResultadoCompra<string> =>
    o[campo] === undefined ? ok("") : texto(o[campo], `${onde}: ${rotulo}`, COMPRA_LINHA_MAX);
  const medicamento = linha("medicamento", "medicamento");
  if (!medicamento.ok) return medicamento;
  const apresentacao = linha("apresentacao", "apresentação");
  if (!apresentacao.ok) return apresentacao;
  const referencia = linha("referencia", "referência");
  if (!referencia.ok) return referencia;
  const laboratorio = linha("laboratorio", "laboratório");
  if (!laboratorio.ok) return laboratorio;
  const quantidade = linha("quantidade", "quantidade");
  if (!quantidade.ok) return quantidade;
  const temperatura = linha("temperatura", "temperatura");
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
    apresentacao: apresentacao.valor,
    referencia: referencia.valor,
    laboratorio: laboratorio.valor,
    quantidade: quantidade.valor,
    temperatura: temperatura.valor,
    valorUnitario: valorUnitario.valor,
    valorReal: valorReal.valor,
  });
}

function validarOrdem(bruto: unknown, posicao: number): ResultadoCompra<OrdemCompraEstado> {
  const onde = `Ordem ${posicao}`;
  const o = objeto(bruto);
  if (!o) return falha(`${onde}: dados inválidos.`);
  const desconhecida = chavesDesconhecidas(o, CHAVES_DA_ORDEM, ` (${onde})`);
  if (desconhecida) return falha(desconhecida);

  const id = idDoCorpo(o.id, `${onde}: id`);
  if (!id.ok) return id;

  const linha = (campo: "fornecedor" | "envio" | "cia", rotulo: string): ResultadoCompra<string> =>
    o[campo] === undefined ? ok("") : texto(o[campo], `${onde}: ${rotulo}`, COMPRA_LINHA_MAX);
  const fornecedor = linha("fornecedor", "fornecedor");
  if (!fornecedor.ok) return fornecedor;
  const envio = linha("envio", "envio");
  if (!envio.ok) return envio;
  const cia = linha("cia", "cia aérea");
  if (!cia.ok) return cia;

  // PO: vazio ou o PO completo (o mesmo CHECK da tabela); aceita minúsculas e espaços, que viram o formato certo.
  let po = "";
  if (o.po !== undefined) {
    if (typeof o.po !== "string") return falha(`${onde}: PO: informe um texto.`);
    po = normalizarNumeroPo(o.po) ?? "";
    if (po !== "" && !NUMERO_PO_REGEX.test(po)) return falha(`${onde}: ${NUMERO_PO_ERRO}`);
  }

  const frete = validarDinheiroCompra(o.frete, `${onde}: frete`);
  if (!frete.ok) return frete;
  const freteReal = validarDinheiroCompra(o.freteReal, `${onde}: valor real do frete`);
  if (!freteReal.ok) return freteReal;

  if (!Array.isArray(o.itens)) return falha(`${onde}: informe a lista de medicamentos (itens).`);
  if (o.itens.length > COMPRA_MAX_ITENS_POR_ORDEM) return falha(`${onde}: no máximo ${COMPRA_MAX_ITENS_POR_ORDEM} medicamentos por ordem.`);
  const itens: ItemCompraEstado[] = [];
  for (const [i, bruto] of o.itens.entries()) {
    const item = validarItem(bruto, `${onde}, medicamento ${i + 1}`);
    if (!item.ok) return item;
    itens.push(item.valor);
  }

  return ok({ id: id.valor, fornecedor: fornecedor.valor, envio: envio.valor, cia: cia.valor, po, frete: frete.valor, freteReal: freteReal.valor, itens });
}

function validarOrdens(v: unknown): ResultadoCompra<OrdemCompraEstado[]> {
  if (!Array.isArray(v)) return falha("Ordens: informe uma lista.");
  if (v.length > COMPRA_MAX_ORDENS) return falha(`No máximo ${COMPRA_MAX_ORDENS} ordens por compra.`);
  const ordens: OrdemCompraEstado[] = [];
  for (const [i, bruto] of v.entries()) {
    const ordem = validarOrdem(bruto, i + 1);
    if (!ordem.ok) return ordem;
    ordens.push(ordem.valor);
  }
  // Ids repetidos no mesmo corpo (duas linhas com o mesmo id se sobrescreveriam).
  const ordemIds = ordens.map((o) => o.id);
  if (new Set(ordemIds).size !== ordemIds.length) return falha("Há ordens com o mesmo identificador.");
  const itemIds = ordens.flatMap((o) => o.itens.map((i) => i.id));
  if (new Set(itemIds).size !== itemIds.length) return falha("Há medicamentos com o mesmo identificador.");
  return ok(ordens);
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
  if (o.ordens !== undefined) {
    const ordens = validarOrdens(o.ordens);
    if (!ordens.ok) return ordens;
    estado.ordens = ordens.valor;
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

/** O id da compra na rota. */
export function idDaCompraValido(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v);
}
