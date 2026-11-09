import { FECHAMENTO_RESTANTE_ENCERRADA_ERRO, STATUS_DIR_ORDER } from "../../shared/constants/dir";
import type { DirPatchDTO, NewDirDTO, StatusDir } from "../../shared/types/dir";
import { parseDataISO } from "../../shared/utils/dataBrasilia";
import { CONTRATO_CAMBIO_ERRO, contratoCambioValido, normalizarContratoCambio } from "../../shared/utils/contratoCambio";
import { NUMERO_PO_REGEX as PO_RE } from "../../shared/utils/numeroPo";

// Tamanho máximo de qualquer campo de texto (mesmo limite do parser da importação).
const TAMANHO_MAXIMO = 300;

function textoComTamanho(v: unknown): v is string {
  return typeof v === "string" && v.length <= TAMANHO_MAXIMO;
}

function textoObrigatorio(v: unknown): boolean {
  return textoComTamanho(v) && v.trim().length > 0;
}

// Data civil "YYYY-MM-DD" que existe no calendário, ou "" (vazio).
function dataOuVazio(v: unknown): boolean {
  return typeof v === "string" && (v === "" || parseDataISO(v) !== null);
}

function statusOuNulo(v: unknown): boolean {
  return v === null || STATUS_DIR_ORDER.includes(v as StatusDir);
}

function booleano(v: unknown): boolean {
  return typeof v === "boolean";
}

// Um validador por campo do DTO. O Record<keyof NewDirDTO, …> obriga a cobrir TODOS os
// campos (campo novo no tipo sem validador quebra o vue-tsc).
const VALIDADORES: Record<keyof NewDirDTO, (v: unknown) => boolean> = {
  po: (v) => textoComTamanho(v) && PO_RE.test(v.trim()),
  paciente: textoObrigatorio,
  vendedor: textoObrigatorio,
  conferido: booleano,
  exigencia: booleano,
  operacaoEncerrada: booleano,
  fechamentoRestante: booleano,
  dactes: booleano,
  dsiDirDuimp: booleano,
  logger: booleano,
  fechamento: booleano,
  numerario: booleano,
  protocoloAssinado: booleano,
  swift: booleano,
  termometro: booleano,
  responsavel: textoComTamanho,
  receita: textoComTamanho,
  medicamento: textoComTamanho,
  temperatura: textoComTamanho,
  fornecedor: textoComTamanho,
  origem: textoComTamanho,
  envio: textoComTamanho,
  // Texto livre (como as outras listas): o valor fora da lista de cias (dado antigo) é tolerado. O conteúdo do AWB não é validado.
  companhiaAerea: textoComTamanho,
  awb: textoComTamanho,
  despachante: textoComTamanho,
  contratoCambio: textoComTamanho,
  observacao: textoComTamanho,
  banco: textoComTamanho,
  dataEmissao: dataOuVazio,
  dataCobrancaFornecedores: dataOuVazio,
  dataEntrega: dataOuVazio,
  dataPagamento: dataOuVazio,
  status: statusOuNulo,
};

const CHAVES = Object.keys(VALIDADORES) as Array<keyof NewDirDTO>;

// Campos que o create pode omitir (aba antiga do navegador): ausente vale como vazio; se vier, é validado.
const CHAVES_OPCIONAIS_NO_CREATE: ReadonlyArray<keyof NewDirDTO> = ["companhiaAerea"];

function objeto(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

// Create: TODAS as chaves do DTO, cada uma válida; chave desconhecida é rejeitada.
export function isValidDirPayload(body: unknown): body is NewDirDTO {
  const b = objeto(body);
  if (!b) return false;
  if (Object.keys(b).some((k) => !CHAVES.includes(k as keyof NewDirDTO))) return false;
  return CHAVES.every((k) => (k in b ? VALIDADORES[k](b[k]) : CHAVES_OPCIONAIS_NO_CREATE.includes(k)));
}

// Patch: pelo menos uma chave, só chaves conhecidas, cada uma válida.
export function isValidDirPatch(body: unknown): body is DirPatchDTO {
  const b = objeto(body);
  if (!b) return false;
  const chaves = Object.keys(b);
  if (chaves.length === 0) return false;
  return chaves.every((k) => CHAVES.includes(k as keyof NewDirDTO) && VALIDADORES[k as keyof NewDirDTO](b[k]));
}

// ── Regra: não se marca em "fechamento restante" um PO com a operação encerrada ──────────────
// Vale para o estado RESULTANTE: `{ fechamentoRestante: true, operacaoEncerrada: true }` no mesmo
// corpo também é recusado. Encerrar um PO que JÁ está marcado é permitido (a marca fica guardada e a
// lista só deixa de mostrá-lo; reabrir a operação o devolve à lista). Desmarcar é sempre permitido.
//
// Devolve a mensagem de erro (para o 400) ou null quando o corpo é aceitável. `atual` é o estado do
// PO no banco (PATCH); no create não há `atual`.
export function erroMarcacaoFechamentoRestante(
  corpo: DirPatchDTO | NewDirDTO,
  atual?: { operacaoEncerrada: boolean },
): string | null {
  if (corpo.fechamentoRestante !== true) return null;
  const encerrada = corpo.operacaoEncerrada ?? atual?.operacaoEncerrada ?? false;
  return encerrada ? FECHAMENTO_RESTANTE_ENCERRADA_ERRO : null;
}

// ── Regra: contrato de câmbio só número (shared/utils/contratoCambio.ts, a mesma do formulário) ──
// Vale para o que o corpo traz. Tolerância a dado antigo: um valor IGUAL ao já gravado (anotação em texto de antes da
// regra, ex.: "Venda a prazo") não impede salvar os outros campos — por isso o PATCH informa o valor `atual`.
// Corpo sem a chave não é conferido. Devolve a mensagem de erro (400) ou null.
export function erroContratoCambio(corpo: DirPatchDTO | NewDirDTO, atual?: { contratoCambio: string | null }): string | null {
  if (!("contratoCambio" in corpo)) return null;
  const valor = corpo.contratoCambio;
  if (contratoCambioValido(valor)) return null;
  if (typeof valor === "string" && atual && normalizarContratoCambio(valor) === normalizarContratoCambio(atual.contratoCambio ?? "")) {
    return null;
  }
  return CONTRATO_CAMBIO_ERRO;
}

// Violação de regra de negócio (400), lançada pelo dirStore e traduzida pelo endpoint.
export class DirRegraError extends Error {
  readonly statusCode = 400;
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "DirRegraError";
  }
}
