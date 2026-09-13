import type { ConsultorNome, NewPatientDTO } from "../../shared/types/Patient";
import { CONSULTORES } from "../../shared/constants/consultores";

function isMedicamentoItem(value: unknown): value is { qtd: string; medicamento: string } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.qtd === "string" && typeof v.medicamento === "string";
}

export function isValidPatientPayload(body: unknown): body is Omit<NewPatientDTO, "empresa"> {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.paciente === "string" &&
    b.paciente.trim().length > 0 &&
    typeof b.descricaoCompra === "string" &&
    b.descricaoCompra.trim().length > 0 &&
    typeof b.descricaoResumo === "string" &&
    b.descricaoResumo.trim().length > 0 &&
    (b.consultor === "" || CONSULTORES.includes(b.consultor as ConsultorNome)) &&
    typeof b.alvara === "number" &&
    typeof b.custoImportacao === "number" &&
    typeof b.despesaTotal === "number" &&
    typeof b.transporteTotal === "number" &&
    typeof b.despachanteRemessas === "number" &&
    typeof b.transporteRemessas === "number" &&
    typeof b.remessas === "number" &&
    typeof b.data === "string" &&
    Array.isArray(b.medicamentos) &&
    b.medicamentos.every(isMedicamentoItem) &&
    Array.isArray(b.despesasPorRemessa) &&
    b.despesasPorRemessa.every((v) => typeof v === "string") &&
    Array.isArray(b.transportesPorRemessa) &&
    b.transportesPorRemessa.every((v) => typeof v === "string")
  );
}
