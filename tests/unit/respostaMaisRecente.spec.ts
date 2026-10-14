import { describe, expect, it } from "vitest";
import { criarFilaPorChave, criarGuardaSequencia } from "../../app/utils/respostaMaisRecente";

function atraso(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("criarFilaPorChave", () => {
  it("tarefas da MESMA chave rodam uma por vez, na ordem pedida", async () => {
    const fila = criarFilaPorChave();
    const log: string[] = [];

    const a = fila.enfileirar("L1", async () => {
      log.push("a:inicio");
      await atraso(30);
      log.push("a:fim");
    });
    const b = fila.enfileirar("L1", async () => {
      log.push("b:inicio");
      await atraso(5);
      log.push("b:fim");
    });
    await Promise.all([a, b]);

    // b só começa depois de a terminar, mesmo sendo bem mais rápida
    expect(log).toEqual(["a:inicio", "a:fim", "b:inicio", "b:fim"]);
  });

  it("chaves diferentes não esperam uma pela outra", async () => {
    const fila = criarFilaPorChave();
    const log: string[] = [];

    const lento = fila.enfileirar("L1", async () => {
      await atraso(40);
      log.push("L1");
    });
    const rapido = fila.enfileirar("L2", async () => {
      await atraso(5);
      log.push("L2");
    });
    await Promise.all([lento, rapido]);

    expect(log).toEqual(["L2", "L1"]);
  });

  it("erro de uma tarefa chega a quem pediu e NÃO trava a próxima", async () => {
    const fila = criarFilaPorChave();

    const falha = fila.enfileirar("L1", async () => {
      throw new Error("boom");
    });
    const seguinte = fila.enfileirar("L1", async () => "ok");

    await expect(falha).rejects.toThrow("boom");
    await expect(seguinte).resolves.toBe("ok");
  });

  it("devolve o resultado da tarefa", async () => {
    const fila = criarFilaPorChave();
    await expect(fila.enfileirar("L1", async () => 42)).resolves.toBe(42);
  });
});

describe("criarGuardaSequencia (contador global)", () => {
  it("resposta antiga que chega DEPOIS de uma mais nova é descartada", () => {
    const guarda = criarGuardaSequencia();
    const antiga = guarda.proximo(); // 1: autosave
    const nova = guarda.proximo(); //   2: escolha do banco

    expect(guarda.podeAplicar(nova)).toBe(true); // a escolha responde primeiro
    expect(guarda.podeAplicar(antiga)).toBe(false); // o autosave atrasado NÃO sobrescreve
  });

  it("resposta antiga que chega ANTES da nova ainda é aplicada (e a nova depois sobrescreve)", () => {
    const guarda = criarGuardaSequencia();
    const antiga = guarda.proximo();
    const nova = guarda.proximo();

    expect(guarda.podeAplicar(antiga)).toBe(true);
    expect(guarda.podeAplicar(nova)).toBe(true);
  });

  it("é global: uma requisição de OUTRO lote/rota também invalida respostas mais antigas", () => {
    const guarda = criarGuardaSequencia();
    const cotacaoLoteA = guarda.proximo();
    const editarLancamentoLoteB = guarda.proximo();

    expect(guarda.podeAplicar(editarLancamentoLoteB)).toBe(true);
    // a resposta do lote A trazia o estado inteiro de ANTES da edição do lote B
    expect(guarda.podeAplicar(cotacaoLoteA)).toBe(false);
  });
});
