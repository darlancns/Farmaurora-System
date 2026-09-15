import {
  BANCOS_CAMBIO,
  EMPRESAS_PAGAMENTO,
  MOEDAS,
  STATUS_ITEM_GRUPO_ORDER,
  TIPOS_GRUPO_PAGAMENTO,
} from "../../shared/constants/pagamentos";
import type {
  AtualizarCotacaoDTO,
  AtualizarGrupoRealizadoDTO,
  AtualizarItemGrupoDTO,
  AtualizarLancamentoBancoDTO,
  AtualizarLancamentoRealizadoDTO,
  BancoCambio,
  EditarItemGrupoDTO,
  EmpresaPagamento,
  Moeda,
  NovoGrupoPagamentoDTO,
  NovoLancamentoBancoDTO,
  StatusItemGrupo,
  TipoGrupoPagamento,
} from "../../shared/types/Pagamento";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isEmpresa(value: unknown): value is EmpresaPagamento {
  return EMPRESAS_PAGAMENTO.includes(value as EmpresaPagamento);
}

function isMoeda(value: unknown): value is Moeda {
  return MOEDAS.includes(value as Moeda);
}

function isBanco(value: unknown): value is BancoCambio {
  return BANCOS_CAMBIO.includes(value as BancoCambio);
}

function isStatusItem(value: unknown): value is StatusItemGrupo {
  return STATUS_ITEM_GRUPO_ORDER.includes(value as StatusItemGrupo);
}

// Alvo válido para o ciclo clicável do item: só NAO_PAGO ou COMPLEMENTO.
// PAGO nunca é setável por `atualizarItemGrupo` — só entra via
// `pagarGrupoPagamento` ("Marcar grupo como pago").
function isStatusCicloItem(value: unknown): value is "NAO_PAGO" | "COMPLEMENTO" {
  return value === "NAO_PAGO" || value === "COMPLEMENTO";
}

/**
 * Transição de status permitida para um item de grupo via `atualizarItemGrupo`:
 * só o ciclo clicável NAO_PAGO <-> COMPLEMENTO. Qualquer coisa envolvendo PAGO,
 * ou "mesmo -> mesmo", é inválida — PAGO é responsabilidade exclusiva de
 * `pagarGrupoPagamento`. Usada pelo store (que conhece o status atual do item).
 */
export function isTransicaoStatusItemValida(
  atual: StatusItemGrupo,
  novo: StatusItemGrupo,
): boolean {
  return (
    (atual === "NAO_PAGO" && novo === "COMPLEMENTO") ||
    (atual === "COMPLEMENTO" && novo === "NAO_PAGO")
  );
}

function isTipoGrupo(value: unknown): value is TipoGrupoPagamento {
  return TIPOS_GRUPO_PAGAMENTO.includes(value as TipoGrupoPagamento);
}

export function isValidNovoLancamentoBanco(body: unknown): body is NovoLancamentoBancoDTO {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;

  // Destino do lote: `loteId` (string não-vazia) e `forcarLoteNovo` (boolean) são
  // opcionais e mutuamente exclusivos — informar os dois é sempre inválido.
  if (b.loteId !== undefined && !isNonEmptyString(b.loteId)) return false;
  if (b.forcarLoteNovo !== undefined && typeof b.forcarLoteNovo !== "boolean") return false;
  if (b.loteId !== undefined && b.forcarLoteNovo === true) return false;

  return (
    isEmpresa(b.empresa) &&
    isMoeda(b.moeda) &&
    isNonEmptyString(b.fornecedor) &&
    isNonEmptyString(b.invoice) &&
    isNonEmptyString(b.cliente) &&
    isFiniteNumber(b.valorMoeda) &&
    b.valorMoeda > 0
  );
}

export function isValidAtualizarLancamentoBanco(
  body: unknown
): body is AtualizarLancamentoBancoDTO {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;

  if (b.fornecedor !== undefined && !isNonEmptyString(b.fornecedor)) return false;
  if (b.invoice !== undefined && !isNonEmptyString(b.invoice)) return false;
  if (b.cliente !== undefined && !isNonEmptyString(b.cliente)) return false;
  if (b.valorMoeda !== undefined && !(isFiniteNumber(b.valorMoeda) && b.valorMoeda > 0)) return false;

  return (
    b.fornecedor !== undefined ||
    b.invoice !== undefined ||
    b.cliente !== undefined ||
    b.valorMoeda !== undefined
  );
}

export function isValidAtualizarCotacao(body: unknown): body is AtualizarCotacaoDTO {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;

  if (b.opcoes !== undefined) {
    if (!Array.isArray(b.opcoes)) return false;
    const ok = b.opcoes.every((entrada) => {
      if (!entrada || typeof entrada !== "object") return false;
      const e = entrada as Record<string, unknown>;
      return (
        isBanco(e.banco) &&
        isFiniteNumber(e.taxaCorretagem) &&
        e.taxaCorretagem >= 0 &&
        (e.taxa === null || (isFiniteNumber(e.taxa) && e.taxa > 0))
      );
    });
    if (!ok) return false;
  }

  if (b.bancoEscolhido !== undefined && !isBanco(b.bancoEscolhido)) return false;

  // taxasRendimento: só faz sentido junto de bancoEscolhido === "RENDIMENTO", e
  // nesse caso é obrigatório. Forma: [{ lancamentoId: string, taxa: number > 0 }].
  if (b.taxasRendimento !== undefined) {
    if (b.bancoEscolhido !== "RENDIMENTO") return false;
    if (!Array.isArray(b.taxasRendimento) || b.taxasRendimento.length === 0) return false;
    const ok = b.taxasRendimento.every((entrada) => {
      if (!entrada || typeof entrada !== "object") return false;
      const e = entrada as Record<string, unknown>;
      return isNonEmptyString(e.lancamentoId) && isFiniteNumber(e.taxa) && e.taxa > 0;
    });
    if (!ok) return false;
  } else if (b.bancoEscolhido === "RENDIMENTO") {
    return false;
  }

  return b.opcoes !== undefined || b.bancoEscolhido !== undefined;
}

export function isValidNovoGrupoPagamento(body: unknown): body is NovoGrupoPagamentoDTO {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    isTipoGrupo(b.tipo) &&
    isNonEmptyString(b.data) &&
    isEmpresa(b.empresa) &&
    isNonEmptyString(b.nomeGrupo) &&
    (b.chavePix === undefined || typeof b.chavePix === "string") &&
    Array.isArray(b.itens) &&
    b.itens.length > 0 &&
    b.itens.every((item) => {
      if (!item || typeof item !== "object") return false;
      const i = item as Record<string, unknown>;
      return isNonEmptyString(i.paciente) && isFiniteNumber(i.valor) && i.valor > 0;
    })
  );
}

export function isValidSalvarGrupoPix(
  body: unknown
): body is { nome: string; chavePix: string } {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return isNonEmptyString(b.nome) && isNonEmptyString(b.chavePix);
}

function isIndiceValido(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isValidAtualizarItemGrupo(body: unknown): body is AtualizarItemGrupoDTO {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  // Validação de forma: index inteiro >= 0 e status pertencente ao enum.
  // Validação de alvo: status só pode ser NAO_PAGO/COMPLEMENTO (nunca PAGO).
  // A validação da TRANSIÇÃO (de qual status pra qual) precisa do status atual
  // do item e fica em `atualizarItemGrupo` (pagamentosStore.ts).
  return isIndiceValido(b.index) && isStatusItem(b.status) && isStatusCicloItem(b.status);
}

export function isValidEditarItemGrupo(body: unknown): body is EditarItemGrupoDTO {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    isIndiceValido(b.index) &&
    isNonEmptyString(b.paciente) &&
    isFiniteNumber(b.valor) &&
    b.valor > 0
  );
}

const DATA_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

// Data de hoje em UTC (YYYY-MM-DD) — mesmo critério de `hoje()` em bancoStore.ts,
// duplicado aqui de propósito (cada store/validação é auto-contida no projeto).
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// pagoEm de uma correção em "Pagamentos realizados": formato YYYY-MM-DD e
// nunca no futuro. Validado aqui no servidor mesmo já validando no cliente —
// nunca confiar só nele. Reaproveitado pelos dois validadores abaixo
// (lançamento de Banco e grupo de Despachante/Transportadora).
function isDataPagoEmValida(value: unknown): value is string {
  return typeof value === "string" && DATA_ISO_RE.test(value) && value <= hojeISO();
}

export function isValidAtualizarLancamentoRealizado(
  body: unknown
): body is AtualizarLancamentoRealizadoDTO {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return isNonEmptyString(b.cliente) && isDataPagoEmValida(b.pagoEm);
}

export function isValidAtualizarGrupoRealizado(body: unknown): body is AtualizarGrupoRealizadoDTO {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return isNonEmptyString(b.nomeGrupo) && isDataPagoEmValida(b.pagoEm);
}
