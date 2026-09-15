import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatarDataRecado } from "../../app/utils/dataRecado";

describe("formatarDataRecado", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T18:00:00.000-03:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("devolve 'Hoje' quando created_at é do mesmo dia (mesmo com hora diferente)", () => {
    expect(formatarDataRecado("2026-09-15T09:00:00.000-03:00")).toBe("Hoje");
    expect(formatarDataRecado("2026-09-15T23:59:00.000-03:00")).toBe("Hoje");
  });

  it("devolve dd/mm/aaaa quando created_at é de outro dia", () => {
    expect(formatarDataRecado("2026-09-14T18:00:00.000-03:00")).toBe("14/09/2026");
    expect(formatarDataRecado("2026-01-01T12:00:00.000-03:00")).toBe("01/01/2026");
  });

  it("não confunde dia igual em mês/ano diferentes", () => {
    expect(formatarDataRecado("2025-09-15T18:00:00.000-03:00")).not.toBe("Hoje");
    expect(formatarDataRecado("2026-08-15T18:00:00.000-03:00")).not.toBe("Hoje");
  });
});
