import {
  CONSULTORES_PROCESSO,
  EMPRESAS_PROCESSO,
  LIMITE_ATUALIZACAO_DATA,
  LIMITE_ATUALIZACAO_TEXTO,
  LIMITE_ATUALIZACOES_POR_PROCESSO,
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

// O PATCH traz `atualizacoes` → exige `versao` (conferência de versão). Sem `atualizacoes` a versão
// não é exigida (pagamento, alertas, formulário seguem como estavam).
export function patchExigeVersao(body: unknown): boolean {
  return !!body && typeof body === "object" && (body as Record<string, unknown>).atualizacoes !== undefined;
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

// Status "outro" exige o texto livre (statusOutro não vazio). Com qualquer outro
// status o campo é IGNORADO (o servidor grava NULL), então não é validado.
function statusOutroValido(status: unknown, statusOutro: unknown): boolean {
  return status !== "outro" || isNonEmptyString(statusOutro);
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
    statusOutroValido(b.status, b.statusOutro) &&
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
  if (b.status === "outro" && !isNonEmptyString(b.statusOutro)) return false;
  // statusOutro sozinho (sem status no patch) é ambíguo — o servidor não sabe o
  // status resultante —, então só vale junto com `status`.
  if (b.statusOutro !== undefined && b.status === undefined) return false;
  if (b.medicamentos !== undefined && (!Array.isArray(b.medicamentos) || !b.medicamentos.every(isMedicamento))) {
    return false;
  }
  if (b.pendencias !== undefined && (!Array.isArray(b.pendencias) || !b.pendencias.every((v) => typeof v === "string"))) {
    return false;
  }
  if (b.atualizacoes !== undefined && !isValidAtualizacoes(b.atualizacoes)) return false;
  if (b.atualizacoes !== undefined && !isVersaoValida(b.versao)) return false;
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
