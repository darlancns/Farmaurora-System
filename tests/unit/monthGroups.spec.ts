import { describe, expect, it } from "vitest";
import {
  currentAndPreviousMonthKeys,
  groupPatientsByMonth,
  monthFilterOptions,
  monthShortLabel,
  splitMonthPills,
} from "../../app/utils/monthGroups";

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

// Chips de mês de /prestacao (lg+): "Todos" + SÓ o mês corrente e o anterior, pelo "hoje" de Brasília.
// O "agora" é injetado; os instantes abaixo são em UTC de propósito (a virada do mês em Brasília cai
// 3h depois da UTC) e o resultado não pode depender do fuso da máquina (TZ=UTC, America/Sao_Paulo e
// Pacific/Honolulu passam).
describe("currentAndPreviousMonthKeys", () => {
  const nomes = (agora: string) => currentAndPreviousMonthKeys(new Date(agora)).map(monthShortLabel);
  const anos = (agora: string) => currentAndPreviousMonthKeys(new Date(agora)).map((k) => k.year);

  it("27/10/2026 -> Outubro e Setembro", () => {
    expect(nomes("2026-10-27T15:00:00Z")).toEqual(["Outubro", "Setembro"]);
  });

  it("01/11/2026 -> Novembro e Outubro", () => {
    expect(nomes("2026-11-01T15:00:00Z")).toEqual(["Novembro", "Outubro"]);
  });

  it("01/01/2027 -> Janeiro e Dezembro do ano anterior", () => {
    expect(nomes("2027-01-01T15:00:00Z")).toEqual(["Janeiro", "Dezembro"]);
    expect(anos("2027-01-01T15:00:00Z")).toEqual([2027, 2026]);
  });

  it("31/10 às 22h em Brasília (já 1º/11 em UTC) ainda é Outubro e Setembro", () => {
    expect(nomes("2026-11-01T01:00:00Z")).toEqual(["Outubro", "Setembro"]);
  });

  it("01/11 às 00h30 em Brasília (03h30 UTC) já é Novembro e Outubro", () => {
    expect(nomes("2026-11-01T03:30:00Z")).toEqual(["Novembro", "Outubro"]);
  });

  it("31/12 às 22h em Brasília (já 1º/01 em UTC) ainda é Dezembro e Novembro, sem virar o ano", () => {
    expect(nomes("2027-01-01T01:00:00Z")).toEqual(["Dezembro", "Novembro"]);
    expect(anos("2027-01-01T01:00:00Z")).toEqual([2026, 2026]);
  });

  it("29/02 de ano bissexto -> Fevereiro e Janeiro (também às 23h30 em Brasília, já 1º/03 em UTC)", () => {
    expect(nomes("2028-02-29T15:00:00Z")).toEqual(["Fevereiro", "Janeiro"]);
    expect(nomes("2028-03-01T02:30:00Z")).toEqual(["Fevereiro", "Janeiro"]);
    expect(nomes("2028-03-01T15:00:00Z")).toEqual(["Março", "Fevereiro"]);
  });

  it("chaves no mesmo formato de monthKeyId / selectedMonthKey (ex.: 2026-10)", () => {
    const [atual, anterior] = currentAndPreviousMonthKeys(new Date("2027-01-15T15:00:00Z"));
    expect(`${atual.year}-${String(atual.month + 1).padStart(2, "0")}`).toBe("2027-01");
    expect(`${anterior.year}-${String(anterior.month + 1).padStart(2, "0")}`).toBe("2026-12");
  });
});

describe("splitMonthPills", () => {
  const AGORA = new Date("2026-10-27T15:00:00Z");

  it("chips são o mês corrente e o anterior (mais recente primeiro); o resto vai pro 'Mais meses' na mesma ordem", () => {
    const grupos = groupPatientsByMonth([
      paciente("05/08/2026"),
      paciente("10/09/2026"),
      paciente("11/09/2026"),
      paciente("02/10/2026"),
      paciente("20/09/2025"),
    ]);
    const { pills, overflow } = splitMonthPills(grupos, AGORA);
    expect(pills.map((g) => [g.key, g.patients.length])).toEqual([
      ["2026-10", 1],
      ["2026-09", 2],
    ]);
    expect(overflow.map((g) => [g.key, g.patients.length])).toEqual([
      ["2026-08", 1],
      ["2025-09", 1],
    ]);
  });

  it("os chips reaproveitam o grupo real (mesmos pacientes, mesma chave do filtro)", () => {
    const grupos = groupPatientsByMonth([paciente("02/10/2026"), paciente("10/09/2026")]);
    const { pills } = splitMonthPills(grupos, AGORA);
    expect(pills[0]).toBe(grupos[0]);
    expect(pills[1]).toBe(grupos[1]);
  });

  it("mês corrente sem prestações continua como chip, com contagem 0", () => {
    const grupos = groupPatientsByMonth([paciente("10/09/2026"), paciente("05/08/2026")]);
    const { pills, overflow } = splitMonthPills(grupos, AGORA);
    expect(pills.map((g) => [g.key, g.patients.length])).toEqual([
      ["2026-10", 0],
      ["2026-09", 1],
    ]);
    expect(monthShortLabel(pills[0]!)).toBe("Outubro");
    expect(overflow.map((g) => g.key)).toEqual(["2026-08"]);
  });

  it("sem nenhuma prestação: os dois chips vazios e nada no 'Mais meses'", () => {
    const { pills, overflow } = splitMonthPills(groupPatientsByMonth([]), AGORA);
    expect(pills.map((g) => [g.key, g.patients.length])).toEqual([
      ["2026-10", 0],
      ["2026-09", 0],
    ]);
    expect(overflow).toEqual([]);
  });

  it("em janeiro o chip anterior é dezembro do ano passado (com as prestações dele)", () => {
    const grupos = groupPatientsByMonth([paciente("15/12/2026"), paciente("03/01/2027"), paciente("04/01/2027")]);
    const { pills, overflow } = splitMonthPills(grupos, new Date("2027-01-20T15:00:00Z"));
    expect(pills.map((g) => [g.key, g.patients.length])).toEqual([
      ["2027-01", 2],
      ["2026-12", 1],
    ]);
    expect(overflow).toEqual([]);
  });

  it("mês futuro (data digitada à frente) e meses antigos ficam no 'Mais meses', do mais recente ao mais antigo", () => {
    const grupos = groupPatientsByMonth([paciente("05/12/2026"), paciente("02/10/2026"), paciente("01/06/2026")]);
    const { pills, overflow } = splitMonthPills(grupos, AGORA);
    expect(pills.map((g) => g.key)).toEqual(["2026-10", "2026-09"]);
    expect(overflow.map((g) => g.key)).toEqual(["2026-12", "2026-06"]);
  });

  it("a divisão cobre todos os grupos: nenhum mês com prestação some da barra", () => {
    const grupos = groupPatientsByMonth([paciente("05/08/2026"), paciente("02/10/2026"), paciente("20/09/2025")]);
    const { pills, overflow } = splitMonthPills(grupos, AGORA);
    const mostrados = new Set([...pills, ...overflow].map((g) => g.key));
    for (const grupo of grupos) expect(mostrados.has(grupo.key)).toBe(true);
  });
});
