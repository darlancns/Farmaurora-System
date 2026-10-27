import { describe, expect, it } from "vitest";
import { useTravaEnvio } from "../../app/composables/useTravaEnvio";

describe("useTravaEnvio", () => {
  it("dois envios no mesmo tick (duplo clique, Enter + clique): só o primeiro roda", async () => {
    const { executar, emAndamento } = useTravaEnvio();
    let resolver!: () => void;
    const promessa = new Promise<void>((resolve) => (resolver = resolve));
    let execucoes = 0;

    const primeiro = executar(async () => {
      execucoes++;
      await promessa;
    });
    const segundo = executar(async () => {
      execucoes++;
    });

    expect(await segundo).toBe(false);
    expect(emAndamento.value).toBe(true);
    resolver();
    expect(await primeiro).toBe(true);
    expect(execucoes).toBe(1);
    expect(emAndamento.value).toBe(false);
  });

  it("libera a trava quando a tarefa falha (finally) e o erro continua subindo", async () => {
    const { executar, emAndamento } = useTravaEnvio();
    await expect(
      executar(async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(emAndamento.value).toBe(false);
    expect(await executar(async () => undefined)).toBe(true);
  });
});
