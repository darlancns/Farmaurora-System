import { toTitleCaseName } from "../utils/formatters";

export function useTitleCaseInput(setValue: (value: string) => void): (event: Event) => void {
  return (event: Event): void => {
    const target = event.target as HTMLInputElement;
    setValue(toTitleCaseName(target.value));
  };
}
