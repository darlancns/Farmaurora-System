import { describe, expect, it } from "vitest";
import { createFilaPorChave } from "../../app/utils/filaPorChave";

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("createFilaPorChave", () => {
  it("tarefas da mesma chave rodam uma de cada vez, na ordem pedida", async () => {
    const { enfileirar } = createFilaPorChave();
    const eventos: string[] = [];
    const tarefa = (nome: string, ms: number) => async () => {
      eventos.push(`${nome}:inicio`);
      await espera(ms);
      eventos.push(`${nome}:fim`);
    };

    await Promise.all([enfileirar("p1", tarefa("a", 30)), enfileirar("p1", tarefa("b", 5)), enfileirar("p1", tarefa("c", 1))]);

    expect(eventos).toEqual(["a:inicio", "a:fim", "b:inicio", "b:fim", "c:inicio", "c:fim"]);
  });

  it("chaves diferentes não esperam umas pelas outras", async () => {
    const { enfileirar } = createFilaPorChave();
    const eventos: string[] = [];
    const lenta = enfileirar("p1", async () => {
      await espera(40);
      eventos.push("p1");
    });
    const rapida = enfileirar("p2", async () => {
      eventos.push("p2");
    });
    await Promise.all([lenta, rapida]);
    expect(eventos).toEqual(["p2", "p1"]);
  });

  it("uma falha não trava a fila e o erro volta só pra quem pediu", async () => {
    const { enfileirar } = createFilaPorChave();
    const falha = enfileirar("p1", async () => {
      throw new Error("falhou");
    });
    const seguinte = enfileirar("p1", async () => "ok");
    await expect(falha).rejects.toThrow("falhou");
    await expect(seguinte).resolves.toBe("ok");
  });

  it("limpa a entrada da chave quando a fila esvazia", async () => {
    const { enfileirar, tamanho } = createFilaPorChave();
    await enfileirar("p1", async () => undefined);
    await espera(0);
    expect(tamanho()).toBe(0);
  });
});
