import { describe, expect, it } from "vitest";
import type { Processo, StatusProcesso } from "#shared/types/processo";
import { cotacaoAsd } from "../../shared/utils/cotacaoAsd";
import { precisaDespachanteTransportadora } from "../../shared/constants/processos";
import { filtrarPorCotacao, separarAbas } from "../../app/utils/processoListas";

// Filtro "Cotações ASD": entra quem NÃO tem a cotação da transportadora nacional, não está em Entregues e não é
// Courier Simples (onde o bloco Transportadora nacional nem aparece). Sem Envio escolhido ENTRA.

function proc(extra: Partial<Processo> = {}): Processo {
  return {
    id: "p1",
    paciente: "Maria Alves",
    pasta: "2026 - 100",
    empresa: "FARMAURORA",
    consultor: "Dani",
    medicamentos: [],
    status: "em_transito",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "",
    updatedAt: "",
    ...extra,
  };
}

describe("cotacaoAsd — o campo Cotação (transportadoraNacional.cotacao)", () => {
  it("sem transportadora nenhuma: entra", () => {
    expect(cotacaoAsd(proc({ modalEnvio: "Air Cargo" }))).toBe(true);
  });

  it("cotação undefined (nome preenchido, sem cotação): entra", () => {
    expect(cotacaoAsd(proc({ modalEnvio: "Air Cargo", transportadoraNacional: { nome: "AJC" } }))).toBe(true);
  });

  it("cotação null (vindo assim de fora do tipo): entra", () => {
    const p = proc({
      modalEnvio: "Air Cargo",
      transportadoraNacional: { nome: "AJC", cotacao: null as unknown as string },
    });
    expect(cotacaoAsd(p)).toBe(true);
  });

  it("cotação vazia (\"\"): entra", () => {
    expect(cotacaoAsd(proc({ modalEnvio: "Air Cargo", transportadoraNacional: { nome: "AJC", cotacao: "" } }))).toBe(true);
  });

  it.each([" ", "   ", "\t", "\n", " \t \n "])("cotação só com espaços (%j): entra", (cotacao) => {
    expect(cotacaoAsd(proc({ modalEnvio: "Air Cargo", transportadoraNacional: { nome: "AJC", cotacao } }))).toBe(true);
  });

  it("com Nome mas sem Cotação: entra", () => {
    expect(cotacaoAsd(proc({ modalEnvio: "Courier Formal", transportadoraNacional: { nome: "Braspress" } }))).toBe(true);
  });

  it("com Valor preenchido mas sem Cotação: entra", () => {
    const p = proc({ modalEnvio: "Air Cargo", transportadoraNacional: { nome: "AJC", valor: 1234.56 } });
    expect(cotacaoAsd(p)).toBe(true);
    expect(cotacaoAsd(proc({ modalEnvio: "Air Cargo", transportadoraNacional: { nome: "AJC", valor: 0, cotacao: "  " } }))).toBe(true);
  });

  it("com Cotação preenchida: NÃO entra (com ou sem Valor)", () => {
    expect(cotacaoAsd(proc({ modalEnvio: "Air Cargo", transportadoraNacional: { nome: "AJC", cotacao: "COT-123" } }))).toBe(false);
    expect(
      cotacaoAsd(proc({ modalEnvio: "Air Cargo", transportadoraNacional: { nome: "AJC", cotacao: "COT-123", valor: 10 } })),
    ).toBe(false);
  });

  it("cotação com espaços em volta de um texto: NÃO entra (o texto conta)", () => {
    expect(cotacaoAsd(proc({ modalEnvio: "Air Cargo", transportadoraNacional: { nome: "AJC", cotacao: "  USD/BRL 5,10 " } }))).toBe(false);
  });

  it("a palavra 'ASD' escrita na cotação é uma cotação preenchida: NÃO entra (a função só olha se há texto)", () => {
    expect(cotacaoAsd(proc({ modalEnvio: "Air Cargo", transportadoraNacional: { nome: "AJC", cotacao: "ASD" } }))).toBe(false);
  });

  it("cotação '0' é texto: NÃO entra", () => {
    expect(cotacaoAsd(proc({ modalEnvio: "Air Cargo", transportadoraNacional: { nome: "AJC", cotacao: "0" } }))).toBe(false);
  });
});

describe("cotacaoAsd — o Envio", () => {
  it("Courier Simples sem cotação: NÃO entra (o bloco nem aparece)", () => {
    expect(cotacaoAsd(proc({ modalEnvio: "Courier Simples" }))).toBe(false);
    expect(cotacaoAsd(proc({ modalEnvio: "Courier Simples", transportadoraNacional: { nome: "AJC" } }))).toBe(false);
    expect(cotacaoAsd(proc({ modalEnvio: "Courier Simples", transportadoraNacional: { nome: "AJC", cotacao: " " } }))).toBe(false);
  });

  it("Courier Formal sem cotação: entra", () => {
    expect(cotacaoAsd(proc({ modalEnvio: "Courier Formal" }))).toBe(true);
  });

  it("Air Cargo sem cotação: entra", () => {
    expect(cotacaoAsd(proc({ modalEnvio: "Air Cargo" }))).toBe(true);
  });

  it("sem Envio escolhido (undefined, \"\"): entra", () => {
    expect(cotacaoAsd(proc())).toBe(true);
    expect(cotacaoAsd(proc({ modalEnvio: undefined }))).toBe(true);
    expect(cotacaoAsd(proc({ modalEnvio: "" }))).toBe(true);
  });

  it("Envio legado 'Courier' (registro migrado): entra, como o formulário que mostra o bloco", () => {
    expect(cotacaoAsd(proc({ modalEnvio: "Courier" }))).toBe(true);
  });

  it("usa a MESMA condição do formulário (precisaDespachanteTransportadora), para todo Envio", () => {
    for (const modalEnvio of ["Courier Simples", "Courier Formal", "Air Cargo", "", "Courier", undefined]) {
      expect(cotacaoAsd(proc({ modalEnvio })), String(modalEnvio)).toBe(precisaDespachanteTransportadora(modalEnvio));
    }
  });
});

describe("cotacaoAsd — Entregues", () => {
  it("processo Entregue sem cotação: NÃO entra", () => {
    expect(cotacaoAsd(proc({ status: "entregue", modalEnvio: "Air Cargo" }))).toBe(false);
  });

  it("os demais status (os 4 de Em andamento) entram", () => {
    const status: StatusProcesso[] = ["elaboracao_fornecedores", "em_transito", "desembaraco", "liberado"];
    for (const s of status) expect(cotacaoAsd(proc({ status: s, modalEnvio: "Air Cargo" })), s).toBe(true);
  });

  it("bate com a aba: tudo o que separarAbas põe em Entregues fica de fora; o resto depende só do resto da regra", () => {
    const todos = [
      proc({ id: "a", status: "entregue" }),
      proc({ id: "b", status: "em_transito" }),
      proc({ id: "c", status: "liberado" }),
    ];
    const { andamento, entregues } = separarAbas(todos);
    expect(entregues.some(cotacaoAsd)).toBe(false);
    expect(andamento.every(cotacaoAsd)).toBe(true);
  });
});

describe("cotacaoAsd — combinações de borda", () => {
  it("Entregue + Courier Simples + sem cotação: NÃO entra", () => {
    expect(cotacaoAsd(proc({ status: "entregue", modalEnvio: "Courier Simples" }))).toBe(false);
  });

  it("Entregue + com cotação: NÃO entra", () => {
    expect(cotacaoAsd(proc({ status: "entregue", transportadoraNacional: { nome: "AJC", cotacao: "X" } }))).toBe(false);
  });

  it("Courier Simples + com cotação: NÃO entra", () => {
    expect(cotacaoAsd(proc({ modalEnvio: "Courier Simples", transportadoraNacional: { nome: "AJC", cotacao: "X" } }))).toBe(false);
  });

  it("sem Envio + Entregue: NÃO entra; sem Envio + em andamento + cotação só com espaços: entra", () => {
    expect(cotacaoAsd(proc({ status: "entregue" }))).toBe(false);
    expect(cotacaoAsd(proc({ transportadoraNacional: { nome: "AJC", cotacao: "  " } }))).toBe(true);
  });

  it("Courier Formal + Valor + cotação só com espaços + em andamento: entra", () => {
    expect(
      cotacaoAsd(proc({ modalEnvio: "Courier Formal", transportadoraNacional: { nome: "AJC", valor: 50, cotacao: "   " } })),
    ).toBe(true);
  });

  it("não altera o processo", () => {
    const p = proc({ modalEnvio: "Air Cargo", transportadoraNacional: { nome: "AJC", cotacao: "  " } });
    const copia = JSON.stringify(p);
    cotacaoAsd(p);
    expect(JSON.stringify(p)).toBe(copia);
  });
});

describe("filtrarPorCotacao", () => {
  const lote = [
    proc({ id: "sem", modalEnvio: "Air Cargo" }),
    proc({ id: "com", modalEnvio: "Air Cargo", transportadoraNacional: { nome: "AJC", cotacao: "X" } }),
    proc({ id: "simples", modalEnvio: "Courier Simples" }),
    proc({ id: "entregue", status: "entregue", modalEnvio: "Air Cargo" }),
    proc({ id: "semEnvio" }),
  ];

  it("'' devolve a lista inteira (a mesma, sem filtrar)", () => {
    expect(filtrarPorCotacao(lote, "")).toBe(lote);
  });

  it("'asd' devolve só os que entram, na mesma ordem", () => {
    expect(filtrarPorCotacao(lote, "asd").map((p) => p.id)).toEqual(["sem", "semEnvio"]);
  });
});
