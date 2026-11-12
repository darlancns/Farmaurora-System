import {
  ciaAereaValidaParaModal,
  ciasAereasDoModal,
  CONSULTORES_PROCESSO,
  EMPRESAS_PROCESSO,
  LIMITE_ATUALIZACAO_DATA,
  LIMITE_ATUALIZACAO_TEXTO,
  LIMITE_ATUALIZACOES_POR_PROCESSO,
  isStatusProcessoLegado,
  mensagemStatusLegado,
  STATUS_PROCESSO_ORDER,
} from "../../shared/constants/processos";
import type {
  AtualizacaoProcesso,
  ConsultorProcesso,
  EmpresaProcesso,
  Medicamento,
  NewProcessoDTO,
  ProcessoPatchDTO,
  StatusProcesso,
} from "../../shared/types/processo";
import { NUMERO_PO_ERRO, normalizarNumeroPo, numeroPoValido } from "../../shared/utils/numeroPo";
import { NUMERO_REMESSA_ERRO, normalizarNumeroRemessa, numeroRemessaValido } from "../../shared/utils/numeroRemessa";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isMedicamento(value: unknown): value is Medicamento {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.nome === "string" && isOptionalString(v.dosagem) && isOptionalString(v.quantidade);
}

// data: string (aceita vazia); texto: string não vazia após trim; ambos com limite de tamanho (os
// limites têm folga sobre os maiores valores já existentes em produção — ver shared/constants).
function isAtualizacao(value: unknown): value is AtualizacaoProcesso {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.data === "string" &&
    v.data.length <= LIMITE_ATUALIZACAO_DATA &&
    isNonEmptyString(v.texto) &&
    v.texto.length <= LIMITE_ATUALIZACAO_TEXTO
  );
}

export function isValidAtualizacoes(value: unknown): value is AtualizacaoProcesso[] {
  return Array.isArray(value) && value.length <= LIMITE_ATUALIZACOES_POR_PROCESSO && value.every(isAtualizacao);
}

// `versao` = o updated_at que o cliente viu (string opaca, devolvida do servidor sem conversão).
export function isVersaoValida(value: unknown): value is string {
  return isNonEmptyString(value);
}

// Mensagem do 400 quando o PATCH com listas chega sem `versao` (cliente antigo, sem a conferência).
export const MENSAGEM_VERSAO_AUSENTE = "Atualize a página (Ctrl+Shift+R) e tente de novo.";

// O PATCH traz uma das LISTAS (`atualizacoes`, `pendencias` ou `medicamentos`) → exige `versao`
// (conferência de versão). Cada lista é gravada INTEIRA (substitui a da linha), então duas pessoas editando
// a mesma lista ao mesmo tempo perderiam o que a outra fez. Sem nenhuma das três a versão não é exigida
// (pagamento, alertas, campos simples do formulário seguem como estavam).
export function patchExigeVersao(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return b.atualizacoes !== undefined || b.pendencias !== undefined || b.medicamentos !== undefined;
}

function isValidDatas(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// Transportadora do PATCH com `parcial: true`: todas as chaves opcionais; `null` limpa. `nome`, quando
// presente, é texto não vazio ou null (nome vazio não existe: o cliente manda null).
function isValidTransportadoraParcial(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const nomeOk = v.nome === undefined || v.nome === null || isNonEmptyString(v.nome);
  const cotacaoOk = v.cotacao === undefined || v.cotacao === null || typeof v.cotacao === "string";
  const valorOk = v.valor === undefined || v.valor === null || (typeof v.valor === "number" && Number.isFinite(v.valor));
  return nomeOk && cotacaoOk && valorOk;
}

// Datas do PATCH com `parcial: true`: cada valor é texto ou null (null limpa a coluna).
function isValidDatasParcial(value: unknown): boolean {
  if (!isValidDatas(value)) return false;
  return Object.values(value as Record<string, unknown>).every((v) => v === null || typeof v === "string");
}

function isValidTransportadora(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.nome === "string" &&
    isOptionalString(v.cotacao) &&
    (v.valor === undefined || typeof v.valor === "number")
  );
}

// ── Status ──────────────────────────────────────────────────────────────────────────────────────
// Só os 5 (STATUS_PROCESSO_ORDER). Um status que saiu do app (aguardando_inicio, liberado_parcial, outro) tem
// mensagem própria, para quem vier de uma aba antiga entender o 400. `statusOutro` não existe mais: se chegar, é
// ignorado (nunca é gravado), sem erro.

// Mensagem do 400 para um status legado no corpo (POST ou PATCH), ou null.
export function erroStatusLegado(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const status = (body as Record<string, unknown>).status;
  return isStatusProcessoLegado(status) ? mensagemStatusLegado(status) : null;
}

// ── Cia. aérea × modal de envio ─────────────────────────────────────────────────────────────────
// A cia é opcional, mas, se vier preenchida, precisa ser uma das cias do modal (shared/constants).

function textoVazioSeNulo(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

// Mensagem de erro da combinação modal × cia, ou null se for válida. Cia vazia é sempre válida.
function erroModalCia(modal: unknown, cia: unknown): string | null {
  if (cia === undefined || cia === null) return null;
  if (typeof cia !== "string") return "Cia. aérea inválida.";
  if (cia.trim() === "") return null;

  const modalTexto = typeof modal === "string" ? modal : "";
  if (modalTexto.trim() === "") return "Escolha o envio antes da cia. aérea.";
  if (ciaAereaValidaParaModal(modalTexto, cia)) return null;

  const opcoes = ciasAereasDoModal(modalTexto);
  return opcoes.length
    ? `Cia. aérea inválida para o envio ${modalTexto}. Opções: ${opcoes.join(", ")}.`
    : `Cia. aérea inválida para o envio ${modalTexto}.`;
}

// Valor canônico da cia para gravar: texto sem espaços nas pontas; vazio → null; ausente → ausente.
export function ciaAereaCanonica(valor: unknown): string | null | undefined {
  if (valor === undefined) return undefined;
  const texto = textoVazioSeNulo(valor);
  return texto === "" ? null : texto;
}

// POST: cia preenchida exige modal preenchido e compatível.
export function erroModalCiaNoPost(body: unknown): string | null {
  const b = (body ?? {}) as Record<string, unknown>;
  return erroModalCia(b.modalEnvio, b.companhiaAerea);
}

// O PATCH mexe em modal ou cia? Só então a combinação é conferida (e a linha armazenada é lida).
export function patchTocaModalOuCia(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  return "modalEnvio" in body || "companhiaAerea" in body;
}

export interface ModalCiaArmazenados {
  modalEnvio?: string | null;
  companhiaAerea?: string | null;
}

// PATCH: combinação efetiva = valor do patch (se a chave está presente) senão o armazenado.
// - `parcial: true` (formulário atual): basta o patch tocar modal OU cia; confere a combinação efetiva.
// - Sem `parcial` (aba velha reenviando tudo): só confere se modal ou cia DIFEREM do armazenado — o que
//   é igual ao armazenado não é conferido, para dado antigo inválido não travar a gravação.
export function erroModalCiaNoPatch(body: unknown, armazenado: ModalCiaArmazenados): string | null {
  if (!patchTocaModalOuCia(body)) return null;
  const b = body as Record<string, unknown>;
  const temModal = "modalEnvio" in b;
  const temCia = "companhiaAerea" in b;

  if (b.parcial !== true) {
    const modalMudou = temModal && textoVazioSeNulo(b.modalEnvio) !== textoVazioSeNulo(armazenado.modalEnvio);
    const ciaMudou = temCia && textoVazioSeNulo(b.companhiaAerea) !== textoVazioSeNulo(armazenado.companhiaAerea);
    if (!modalMudou && !ciaMudou) return null;
  }

  const modal = temModal ? b.modalEnvio : armazenado.modalEnvio;
  const cia = temCia ? b.companhiaAerea : armazenado.companhiaAerea;
  return erroModalCia(modal, cia);
}

// ── PO ───────────────────────────────────────────────────────────────────────────────
// Opcional. Vazio/ausente/null é sempre válido; preenchido, é normalizado (maiúsculas, sem espaços; "PO" sozinho
// vira null) e precisa ser o PO COMPLETO no formato da DIR, PO26-10-0471 (incompleto é recusado). A regra vive em
// shared/utils/numeroPo.ts, a mesma da DIR.

// Mensagem de erro do PO do corpo (POST ou PATCH), ou null se válido/ausente. PATCH sem a chave não confere.
export function erroNumeroPo(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("numeroPo" in body)) return null;
  const valor = (body as Record<string, unknown>).numeroPo;
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "string") return NUMERO_PO_ERRO;
  return numeroPoValido(valor) ? null : NUMERO_PO_ERRO;
}

// Valor para gravar: normalizado; vazio → null; chave ausente → undefined (não toca a coluna).
export function numeroPoCanonico(valor: unknown): string | null | undefined {
  if (valor === undefined) return undefined;
  return typeof valor === "string" ? normalizarNumeroPo(valor) : null;
}

// ── Nº Remessa ──────────────────────────────────────────────────────────────────────────────────
// Inteiro >= 1 (até 2147483647). POST: ausente = 1. PATCH: ausente = não mexe. null ou "" = 1 nos dois. A regra
// vive em shared/utils/numeroRemessa.ts (a mesma do formulário).

// Mensagem de erro do Nº Remessa do corpo (POST ou PATCH), ou null se válido/ausente.
export function erroNumeroRemessa(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("numeroRemessa" in body)) return null;
  const valor = (body as Record<string, unknown>).numeroRemessa;
  if (valor === undefined) return null;
  return numeroRemessaValido(valor) ? null : NUMERO_REMESSA_ERRO;
}

// Valor para gravar: inteiro >= 1 (null/""/0 → 1); chave ausente (ou inválida, já barrada antes) → undefined.
export function numeroRemessaCanonico(valor: unknown): number | undefined {
  if (valor === undefined) return undefined;
  return normalizarNumeroRemessa(valor);
}

export function isValidProcessoPayload(body: unknown): body is NewProcessoDTO {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    isNonEmptyString(b.paciente) &&
    isNonEmptyString(b.pasta) &&
    EMPRESAS_PROCESSO.includes(b.empresa as EmpresaProcesso) &&
    CONSULTORES_PROCESSO.includes(b.consultor as ConsultorProcesso) &&
    STATUS_PROCESSO_ORDER.includes(b.status as StatusProcesso) &&
    Array.isArray(b.medicamentos) &&
    b.medicamentos.every(isMedicamento) &&
    Array.isArray(b.pendencias) &&
    b.pendencias.every((v) => typeof v === "string") &&
    isValidAtualizacoes(b.atualizacoes) &&
    isValidDatas(b.datas) &&
    isValidTransportadora(b.transportadoraNacional)
  );
}

export function isValidProcessoPatch(body: unknown): body is ProcessoPatchDTO {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;

  if (b.paciente !== undefined && !isNonEmptyString(b.paciente)) return false;
  if (b.pasta !== undefined && !isNonEmptyString(b.pasta)) return false;
  if (b.empresa !== undefined && !EMPRESAS_PROCESSO.includes(b.empresa as EmpresaProcesso)) return false;
  if (b.consultor !== undefined && !CONSULTORES_PROCESSO.includes(b.consultor as ConsultorProcesso)) return false;
  if (b.status !== undefined && !STATUS_PROCESSO_ORDER.includes(b.status as StatusProcesso)) return false;
  if (b.medicamentos !== undefined && (!Array.isArray(b.medicamentos) || !b.medicamentos.every(isMedicamento))) {
    return false;
  }
  if (b.pendencias !== undefined && (!Array.isArray(b.pendencias) || !b.pendencias.every((v) => typeof v === "string"))) {
    return false;
  }
  if (b.atualizacoes !== undefined && !isValidAtualizacoes(b.atualizacoes)) return false;
  if (patchExigeVersao(b) && !isVersaoValida(b.versao)) return false;
  if (b.versao !== undefined && !isVersaoValida(b.versao)) return false;
  if (b.parcial !== undefined && typeof b.parcial !== "boolean") return false;
  const parcial = b.parcial === true;
  if (b.datas !== undefined && !(parcial ? isValidDatasParcial(b.datas) : isValidDatas(b.datas))) return false;
  // `null` = esvaziar o bloco (limpa nome, cotação e valor). Só o PATCH aceita; o POST não. Com
  // `parcial`, o objeto pode trazer só as chaves alteradas; sem ele, é o formato completo de sempre.
  if (
    b.transportadoraNacional !== undefined &&
    b.transportadoraNacional !== null &&
    !(parcial ? isValidTransportadoraParcial(b.transportadoraNacional) : isValidTransportadora(b.transportadoraNacional))
  ) {
    return false;
  }
  if (b.alertaMandadoResolvido !== undefined && typeof b.alertaMandadoResolvido !== "boolean") return false;

  return true;
}
