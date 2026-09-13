import type { PatientComputed } from "#shared/types/Patient";
import { formatCurrency } from "../utils/formatters";

export function useWhatsappShare() {
  function buildMessage(patient: PatientComputed): string {
    return (
      `Paciente: ${patient.paciente}\n` +
      `Medicamento: ${patient.descricaoResumo}\n` +
      `Valor da nota: R$ ${formatCurrency(patient.valorNota)}`
    );
  }

  async function copyMessage(patient: PatientComputed): Promise<void> {
    const message = buildMessage(patient);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(message);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = message;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  return { buildMessage, copyMessage };
}
