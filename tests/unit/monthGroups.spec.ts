import { describe, expect, it } from "vitest";
import { groupPatientsByMonth, monthFilterOptions } from "../../app/utils/monthGroups";

// monthFilterOptions alimenta o seletor "Mês" do painel de filtros de /prestacao (abaixo de lg).
// A ordem e as contagens precisam ser as mesmas dos chips de mês (groupPatientsByMonth).

function paciente(data: string, createdAt = "2026-10-01T10:00:00Z") {
  return { data, createdAt };
}

describe("monthFilterOptions", () => {
  it("sem pacientes, só 'Todos os meses'", () => {
    expect(monthFilterOptions(groupPatientsByMonth([]))).toEqual([{ value: "", label: "Todos os meses" }]);
  });

  it("lista cada mês com ano e contagem, do mais recente ao mais antigo, como os chips", () => {
    const grupos = groupPatientsByMonth([
      paciente("05/08/2026"),
      paciente("10/09/2026"),
      paciente("11/09/2026"),
      paciente("02/10/2026"),
      paciente("20/09/2025"),
    ]);
    expect(monthFilterOptions(grupos)).toEqual([
      { value: "", label: "Todos os meses" },
      { value: "2026-10", label: "Outubro 2026 (1)" },
      { value: "2026-09", label: "Setembro 2026 (2)" },
      { value: "2026-08", label: "Agosto 2026 (1)" },
      { value: "2025-09", label: "Setembro 2025 (1)" },
    ]);
  });

  it("os valores batem com as chaves dos grupos (selectedMonthKey)", () => {
    const grupos = groupPatientsByMonth([paciente("05/08/2026"), paciente("02/10/2026")]);
    expect(monthFilterOptions(grupos).slice(1).map((o) => o.value)).toEqual(grupos.map((g) => g.key));
  });
});
