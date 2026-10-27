import type { Patient } from "#shared/types/Patient";
import { hojeBrasilia, parseDataISO } from "#shared/utils/dataBrasilia";
import type { AppSelectOption } from "../types/appSelect";

const MONTH_NAMES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export interface MonthKey {
  year: number;
  month: number;
}

export interface MonthGroup<T> extends MonthKey {
  key: string;
  label: string;
  patients: T[];
}

function parseDataField(data: string, fallbackYear: number): MonthKey | null {
  const match = data.trim().match(/^(\d{2})\/(\d{2})(?:\/(\d{4}))?$/);
  if (!match) return null;

  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return null;

  const year = match[3] ? Number(match[3]) : fallbackYear;
  return { year, month };
}

export function getPatientMonthKey(patient: Pick<Patient, "data" | "createdAt">): MonthKey {
  const createdAtDate = new Date(patient.createdAt);
  const createdAtValid = !Number.isNaN(createdAtDate.getTime());
  const fallbackYear = createdAtValid ? createdAtDate.getFullYear() : new Date().getFullYear();

  const parsed = parseDataField(patient.data, fallbackYear);
  if (parsed) return parsed;

  if (createdAtValid) {
    return { year: createdAtDate.getFullYear(), month: createdAtDate.getMonth() };
  }

  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function monthKeyId({ year, month }: MonthKey): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function monthKeyLabel({ year, month }: MonthKey): string {
  return `${MONTH_NAMES_PT[month]} ${year}`;
}

export function monthShortLabel({ month }: MonthKey): string {
  return MONTH_NAMES_PT[month] as string;
}

export function groupPatientsByMonth<T extends Pick<Patient, "data" | "createdAt">>(
  patients: T[]
): Array<MonthGroup<T>> {
  const groups = new Map<string, MonthGroup<T>>();

  for (const patient of patients) {
    const monthKey = getPatientMonthKey(patient);
    const id = monthKeyId(monthKey);

    let group = groups.get(id);
    if (!group) {
      group = { ...monthKey, key: id, label: monthKeyLabel(monthKey), patients: [] };
      groups.set(id, group);
    }
    group.patients.push(patient);
  }

  return [...groups.values()].sort((a, b) => b.year - a.year || b.month - a.month);
}

// Mês corrente e mês anterior segundo o "hoje" de Brasília (nunca o fuso do navegador: o servidor roda em
// UTC e a virada do mês precisa ser a mesma nos dois lados, senão a hydration diverge). Janeiro => dezembro
// do ano anterior. `agora` existe para testar.
export function currentAndPreviousMonthKeys(agora: Date = new Date()): [MonthKey, MonthKey] {
  const hoje = parseDataISO(hojeBrasilia(agora));
  const atual: MonthKey = hoje ? { year: hoje.ano, month: hoje.mes - 1 } : { year: agora.getUTCFullYear(), month: agora.getUTCMonth() };
  const anterior: MonthKey =
    atual.month === 0 ? { year: atual.year - 1, month: 11 } : { year: atual.year, month: atual.month - 1 };
  return [atual, anterior];
}

// Divide os meses da barra de filtros (lg+): os chips são SÓ o mês corrente e o anterior (mais recente
// primeiro, mesmo sem prestações — viram um grupo vazio, "(0)"); todos os demais meses vão para o dropdown
// "Mais meses", na ordem original (do mais recente ao mais antigo).
export function splitMonthPills<T>(
  groups: Array<MonthGroup<T>>,
  agora: Date = new Date()
): { pills: Array<MonthGroup<T>>; overflow: Array<MonthGroup<T>> } {
  const pillKeys = currentAndPreviousMonthKeys(agora);
  const pillIds = pillKeys.map(monthKeyId);

  const pills = pillKeys.map((monthKey, index): MonthGroup<T> => {
    const id = pillIds[index]!;
    return (
      groups.find((group) => group.key === id) ?? { ...monthKey, key: id, label: monthKeyLabel(monthKey), patients: [] }
    );
  });

  return { pills, overflow: groups.filter((group) => !pillIds.includes(group.key)) };
}

// Opções do seletor "Mês" do painel de filtros (abaixo de lg): "Todos os meses" (valor "", que
// a página mapeia para selectedMonthKey = null) + cada mês com a contagem, na mesma ordem dos chips.
export function monthFilterOptions<T>(groups: Array<MonthGroup<T>>): Array<AppSelectOption<string>> {
  return [
    { value: "", label: "Todos os meses" },
    ...groups.map((group) => ({ value: group.key, label: `${monthKeyLabel(group)} (${group.patients.length})` })),
  ];
}
