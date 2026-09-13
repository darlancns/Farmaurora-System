import type { Patient } from "#shared/types/Patient";

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
