import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createToastScheduler, TOAST_AVISO_MS, TOAST_PADRAO_MS } from "../../app/utils/toastScheduler";

describe("createToastScheduler", () => {
  let atual: string | null;
  let scheduler: ReturnType<typeof createToastScheduler>;

  beforeEach(() => {
    vi.useFakeTimers();
    atual = null;
    scheduler = createToastScheduler({
      setMessage: (text) => {
        atual = text;
      },
    });
  });
  afterEach(() => vi.useRealTimers());

  it("toast comum dura 2,2 s e é substituído na hora pelo seguinte", () => {
    scheduler.show("a");
    vi.advanceTimersByTime(1000);
    scheduler.show("b");
    expect(atual).toBe("b");
    vi.advanceTimersByTime(TOAST_PADRAO_MS - 1);
    expect(atual).toBe("b");
    vi.advanceTimersByTime(1);
    expect(atual).toBeNull();
  });

  it("aviso protegido dura pelo menos 8 s e NÃO é sobrescrito por outro toast", () => {
    expect(TOAST_AVISO_MS).toBeGreaterThanOrEqual(8000);
    scheduler.show("falha parcial", { protegido: true });
    vi.advanceTimersByTime(3000);
    scheduler.show("Prestação atualizada");
    expect(atual).toBe("falha parcial");
    vi.advanceTimersByTime(TOAST_AVISO_MS - 3000 - 1);
    expect(atual).toBe("falha parcial");
  });

  it("o que chegou durante o aviso aparece depois dele, em ordem", () => {
    scheduler.show("aviso", { protegido: true });
    scheduler.show("um");
    scheduler.show("dois");
    vi.advanceTimersByTime(TOAST_AVISO_MS);
    expect(atual).toBe("um");
    vi.advanceTimersByTime(TOAST_PADRAO_MS);
    expect(atual).toBe("dois");
    vi.advanceTimersByTime(TOAST_PADRAO_MS);
    expect(atual).toBeNull();
  });

  it("a fila é limitada (não acumula indefinidamente)", () => {
    scheduler.show("aviso", { protegido: true });
    for (let i = 0; i < 20; i++) scheduler.show(`t${i}`);
    vi.advanceTimersByTime(TOAST_AVISO_MS);
    const exibidos: Array<string | null> = [];
    for (let i = 0; i < 20 && atual !== null; i++) {
      exibidos.push(atual);
      vi.advanceTimersByTime(TOAST_PADRAO_MS);
    }
    expect(exibidos).toHaveLength(5);
  });

  it("depois que o aviso sai, um toast novo volta a substituir normalmente", () => {
    scheduler.show("aviso", { protegido: true });
    vi.advanceTimersByTime(TOAST_AVISO_MS);
    scheduler.show("novo");
    expect(atual).toBe("novo");
  });
});
