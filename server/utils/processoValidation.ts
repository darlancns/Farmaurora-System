import { CONSULTORES_PROCESSO, EMPRESAS_PROCESSO, STATUS_PROCESSO_ORDER } from "../../shared/constants/processos";
import type {
  AtualizacaoProcesso,
  ConsultorProcesso,
  EmpresaProcesso,
  Medicamento,
  NewProcessoDTO,
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

function isAtualizacao(value: unknown): value is AtualizacaoProcesso {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.data === "string" && typeof v.texto === "string";
}

function isValidDatas(value: unknown): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
    Array.isArray(b.atualizacoes) &&
    b.atualizacoes.every(isAtualizacao) &&
    isValidDatas(b.datas) &&
    isValidTransportadora(b.transportadoraNacional)
  );
}

export function isValidProcessoPatch(body: unknown): body is Partial<NewProcessoDTO> {
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
  if (b.atualizacoes !== undefined && (!Array.isArray(b.atualizacoes) || !b.atualizacoes.every(isAtualizacao))) {
    return false;
  }
  if (b.datas !== undefined && !isValidDatas(b.datas)) return false;
  if (b.transportadoraNacional !== undefined && !isValidTransportadora(b.transportadoraNacional)) return false;

  return true;
}
