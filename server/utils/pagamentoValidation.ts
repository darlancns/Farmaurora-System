import {
  BANCOS_CAMBIO,
  EMPRESAS_PAGAMENTO,
  MOEDAS,
  STATUS_ITEM_GRUPO_ORDER,
  TAXA_MAX,
  TAXA_MIN,
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
import { ehDataFutura } from "../../shared/utils/dataBrasilia";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Taxa de câmbio dentro da trava de sanidade [TAXA_MIN, TAXA_MAX] (shared/constants).
function isTaxaCambio(value: unknown): value is number {
  return isFiniteNumber(value) && value >= TAXA_MIN && value <= TAXA_MAX;
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

  // Destino do lote: só `forcarLoteNovo` (boolean, opcional). `loteId` não existe
  // mais — rejeitar (em vez de ignorar) evita que um cliente antigo, com o bundle
  // em cache, grave no lote errado sem aviso.
  if (b.loteId !== undefined) return false;
  if (b.forcarLoteNovo !== undefined && typeof b.forcarLoteNovo !== "boolean") return false;

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
        (e.taxa === null || isTaxaCambio(e.taxa))
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
      return isNonEmptyString(e.lancamentoId) && isTaxaCambio(e.taxa);
    });
    if (!ok) return false;
  } else if (b.bancoEscolhido === "RENDIMENTO") {
    return false;
  }

  return b.opcoes !== undefined || b.bancoEscolhido !== undefined;
}

/**
 * Se o body da cotação traz alguma taxa numérica FORA de [TAXA_MIN, TAXA_MAX],
 * devolve a mensagem de erro (para o 400); senão null. Complementa
 * `isValidAtualizarCotacao` (que só diz "inválido") com um motivo claro — o caso
 * clássico é "5.4231" lido como 54231 por um parser de moeda.
 */
export function mensagemTaxaForaDoIntervalo(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const taxas: number[] = [];
  if (Array.isArray(b.opcoes)) {
    for (const o of b.opcoes) {
      const t = (o as Record<string, unknown> | null)?.taxa;
      if (isFiniteNumber(t)) taxas.push(t);
    }
  }
  if (Array.isArray(b.taxasRendimento)) {
    for (const o of b.taxasRendimento) {
      const t = (o as Record<string, unknown> | null)?.taxa;
      if (isFiniteNumber(t)) taxas.push(t);
    }
  }
  const fora = taxas.find((t) => !isTaxaCambio(t));
  if (fora === undefined) return null;
  return `Taxa ${fora} fora do intervalo permitido (${TAXA_MIN} a ${TAXA_MAX}). Confira o separador decimal.`;
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

// pagoEm de uma correção em "Pagamentos realizados": formato YYYY-MM-DD e
// nunca no futuro ("hoje" = dia de Brasília, o mesmo critério do cliente). Validado aqui no servidor mesmo já validando no cliente —
// nunca confiar só nele. Reaproveitado pelos dois validadores abaixo
// (lançamento de Banco e grupo de Despachante/Transportadora).
function isDataPagoEmValida(value: unknown): value is string {
  return typeof value === "string" && DATA_ISO_RE.test(value) && !ehDataFutura(value);
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
