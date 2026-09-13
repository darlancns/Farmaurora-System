import type { EmpresaCodigo, Patient, PatientComputed } from "#shared/types/Patient";
import { TAXA_IMPOSTO } from "#shared/constants/empresas";

/**
 * Regra de negócio confirmada com o usuário — já foi revisada 3 vezes, NÃO reinterpretar
 * por conta própria. Qualquer mudança futura precisa ser confirmada com o usuário antes
 * de ser aplicada.
 *
 * Critério de quando a nota é "cheia" (estável desde a 2ª revisão):
 *   (custoImportacao + despesaTotal + transporteTotal) / alvara < 0.5
 *
 * Valor da nota quando É cheia (mudou na 3ª revisão, versão atual):
 *   valorNota = alvara (valor cheio do alvará, sem descontar custo, despesa ou transporte)
 *
 * Valor da nota quando NÃO é cheia (estável desde a 1ª revisão):
 *   valorNota = alvara - custoImportacao - despesaTotal - transporteTotal
 *
 * Imposto (sempre, nos dois casos): valorNota * taxaImposto[empresa]
 *
 * Histórico das revisões:
 *   1ª — critério de nota cheia comparava só custoImportacao/alvara (sem despesa/transporte). Incorreto.
 *   2ª — critério corrigido pra somar despesa e transporte; valorNota quando cheia =
 *        alvara - despesaTotal - transporteTotal.
 *   3ª (atual) — valorNota quando cheia passou a ser o alvará cheio, sem nenhum desconto.
 */
export function isNotaCheia(
  alvara: number,
  custoImportacao: number,
  despesaTotal: number,
  transporteTotal: number
): boolean {
  if (alvara <= 0) return false;
  return (custoImportacao + despesaTotal + transporteTotal) / alvara < 0.5;
}

export function isFarmauroraModeloCompleto(
  patient: Pick<Patient, "empresa" | "despesaTotal" | "transporteTotal">
): boolean {
  return patient.empresa === "FARMAURORA" && (patient.despesaTotal > 0 || patient.transporteTotal > 0);
}

export function calculateValorNota(
  alvara: number,
  custoImportacao: number,
  despesaTotal: number,
  transporteTotal: number
): number {
  if (isNotaCheia(alvara, custoImportacao, despesaTotal, transporteTotal)) {
    return alvara;
  }
  return alvara - custoImportacao - despesaTotal - transporteTotal;
}

export function calculateImposto(valorNota: number, empresa: EmpresaCodigo): number {
  return valorNota * TAXA_IMPOSTO[empresa];
}

export function withComputedFields(patient: Patient): PatientComputed {
  const valorNota = calculateValorNota(
    patient.alvara,
    patient.custoImportacao,
    patient.despesaTotal,
    patient.transporteTotal
  );
  const imposto = calculateImposto(valorNota, patient.empresa);

  return {
    ...patient,
    valorNota,
    imposto,
    taxaImposto: TAXA_IMPOSTO[patient.empresa],
    valorTotal: patient.alvara,
    isNotaCheia: isNotaCheia(patient.alvara, patient.custoImportacao, patient.despesaTotal, patient.transporteTotal),
  };
}
