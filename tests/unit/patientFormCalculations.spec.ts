import { describe, expect, it } from "vitest";
import type { MedicamentoItem } from "#shared/types/Patient";
import {
  buildDescricaoCompra,
  buildDescricaoResumo,
  countFilled,
  resizeArray,
  sumFilledValues,
} from "../../app/utils/patientFormCalculations";

// Caracterização (Round 9-prep) — funções puras extraídas de PatientForm.vue.
// Documenta o comportamento ATUAL, sem corrigir nada — achados suspeitos vão
// no relatório em "COMPORTAMENTOS A REVISAR", não aqui.

describe("sumFilledValues", () => {
  it("soma todos os valores quando todos estão preenchidos", () => {
    expect(sumFilledValues(["150,00", "200,50"])).toBe(350.5);
  });

  it("valores vazios contam como 0 (não quebram a soma)", () => {
    expect(sumFilledValues(["150,00", "", "50,00"])).toBe(200);
  });

  it("array totalmente vazio soma 0", () => {
    expect(sumFilledValues([])).toBe(0);
  });

  it("valor mal formatado vira 0 silenciosamente (parseBrCurrency nunca lança)", () => {
    expect(sumFilledValues(["abc", "100,00"])).toBe(100);
  });
});

describe("countFilled", () => {
  it("conta todos quando a sequência inteira está preenchida (mesmo resultado de antes)", () => {
    expect(countFilled(["10,00", "20,00", "30,00"])).toBe(3);
  });

  it("buraco no meio: agora conta o que vem DEPOIS dele também (2), não para mais no buraco", () => {
    expect(countFilled(["10,00", "", "30,00"])).toBe(2);
  });

  it("achado 2: remessa 1 vazia + remessa 2 preenchida → conta 1 (antes retornava 0)", () => {
    expect(countFilled(["", "10,00"])).toBe(1);
  });

  it("array vazio conta 0", () => {
    expect(countFilled([])).toBe(0);
  });

  it("'0,00' continua contando como NÃO preenchido, em qualquer posição", () => {
    expect(countFilled(["0,00", "10,00"])).toBe(1);
  });

  it("todas as posições vazias conta 0", () => {
    expect(countFilled(["", "", ""])).toBe(0);
  });
});

describe("buildDescricaoCompra", () => {
  function item(qtd: string, medicamento: string): MedicamentoItem {
    return { qtd, medicamento };
  }

  it("1 medicamento: qtd de 1 dígito vira 2 dígitos (padTwoDigits)", () => {
    expect(buildDescricaoCompra([item("3", "Dipirona")])).toBe("03 unidades de Dipirona");
  });

  it("qtd já com 2 dígitos não muda", () => {
    expect(buildDescricaoCompra([item("12", "Paracetamol")])).toBe("12 unidades de Paracetamol");
  });

  it("2+ medicamentos são juntados com ' e '", () => {
    expect(buildDescricaoCompra([item("3", "A"), item("5", "B")])).toBe(
      "03 unidades de A e 05 unidades de B",
    );
  });

  it("lista vazia devolve string vazia", () => {
    expect(buildDescricaoCompra([])).toBe("");
  });

  it("item com qtd 0 ou nome vazio é filtrado (não entra na descrição)", () => {
    expect(buildDescricaoCompra([item("0", "A"), item("3", "  "), item("5", "B")])).toBe(
      "05 unidades de B",
    );
  });
});

describe("buildDescricaoResumo", () => {
  function item(qtd: string, medicamento: string): MedicamentoItem {
    return { qtd, medicamento };
  }

  it("1 medicamento: qtd fica como veio, SEM padTwoDigits (diferente de buildDescricaoCompra)", () => {
    expect(buildDescricaoResumo([item("3", "Dipirona")])).toBe("3 Dipirona");
  });

  it("2+ medicamentos são juntados com ' e '", () => {
    expect(buildDescricaoResumo([item("3", "A"), item("5", "B")])).toBe("3 A e 5 B");
  });

  it("lista vazia devolve string vazia", () => {
    expect(buildDescricaoResumo([])).toBe("");
  });

  it("mesmo filtro de buildDescricaoCompra: qtd 0 ou nome vazio é excluído", () => {
    expect(buildDescricaoResumo([item("0", "A"), item("3", ""), item("5", "B")])).toBe("5 B");
  });
});

describe("resizeArray", () => {
  it("crescendo, preenche as novas posições com string vazia", () => {
    const arr = ["a"];
    resizeArray(arr, 3);
    expect(arr).toEqual(["a", "", ""]);
  });

  it("encolhendo, TRUNCA do fim — os valores das posições cortadas são perdidos", () => {
    const arr = ["a", "b", "c"];
    resizeArray(arr, 1);
    expect(arr).toEqual(["a"]);
    // 'b' e 'c' não sobrevivem em nenhum lugar — não há como recuperá-los depois.
  });

  it("tamanho igual não muda nada", () => {
    const arr = ["a", "b"];
    resizeArray(arr, 2);
    expect(arr).toEqual(["a", "b"]);
  });

  it("array vazio crescendo pela primeira vez", () => {
    const arr: string[] = [];
    resizeArray(arr, 2);
    expect(arr).toEqual(["", ""]);
  });
});
