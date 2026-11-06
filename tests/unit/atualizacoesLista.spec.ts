import { describe, expect, it } from "vitest";
import type { AtualizacaoProcesso } from "../../shared/types/processo";
import {
  adicionarAtualizacao,
  chaveAtualizacao,
  editarAtualizacao,
  excluirAtualizacao,
} from "../../app/utils/atualizacoesLista";

const A: AtualizacaoProcesso = { data: "01/09", texto: "Primeira" };
const B: AtualizacaoProcesso = { data: "", texto: "Segunda" };
const C: AtualizacaoProcesso = { data: "03/09", texto: "Terceira" };

describe("adicionarAtualizacao", () => {
  it("acrescenta no fim, aparando data e texto", () => {
    expect(adicionarAtualizacao([A], { data: " 02/09 ", texto: "  Nova  " })).toEqual([
      A,
      { data: "02/09", texto: "Nova" },
    ]);
  });

  it("funciona com a lista vazia e aceita data vazia", () => {
    expect(adicionarAtualizacao([], { data: "", texto: "Oi" })).toEqual([{ data: "", texto: "Oi" }]);
  });

  it("texto vazio (ou só espaços) → null", () => {
    expect(adicionarAtualizacao([A], { data: "x", texto: "" })).toBeNull();
    expect(adicionarAtualizacao([A], { data: "x", texto: "   " })).toBeNull();
  });

  it("não altera a lista recebida", () => {
    const lista = [A];
    adicionarAtualizacao(lista, { data: "", texto: "Nova" });
    expect(lista).toEqual([A]);
  });
});

describe("editarAtualizacao", () => {
  it("troca só o item do índice (e apara)", () => {
    expect(editarAtualizacao([A, B, C], 1, { data: " 02/09", texto: " Editada " })).toEqual([
      A,
      { data: "02/09", texto: "Editada" },
      C,
    ]);
  });

  it("permite limpar a data", () => {
    expect(editarAtualizacao([A], 0, { data: "", texto: "Primeira" })).toEqual([{ data: "", texto: "Primeira" }]);
  });

  it("índice inválido (negativo, fora, fracionário) → null", () => {
    expect(editarAtualizacao([A], -1, B)).toBeNull();
    expect(editarAtualizacao([A], 1, B)).toBeNull();
    expect(editarAtualizacao([A], 0.5, B)).toBeNull();
    expect(editarAtualizacao([], 0, B)).toBeNull();
  });

  it("texto vazio após trim → null", () => {
    expect(editarAtualizacao([A], 0, { data: "x", texto: "  " })).toBeNull();
  });

  it("`esperado` diferente do item atual (lista mudou) → null", () => {
    expect(editarAtualizacao([A, B], 0, C, B)).toBeNull();
    expect(editarAtualizacao([A, B], 0, { data: "", texto: "Nova" }, A)).toEqual([{ data: "", texto: "Nova" }, B]);
  });

  it("não altera a lista recebida", () => {
    const lista = [A, B];
    editarAtualizacao(lista, 0, C);
    expect(lista).toEqual([A, B]);
  });
});

describe("excluirAtualizacao", () => {
  it("remove só o item do índice", () => {
    expect(excluirAtualizacao([A, B, C], 1)).toEqual([A, C]);
  });

  it("excluir o único item deixa a lista vazia", () => {
    expect(excluirAtualizacao([A], 0)).toEqual([]);
  });

  it("índice inválido ou lista vazia → null", () => {
    expect(excluirAtualizacao([A], 1)).toBeNull();
    expect(excluirAtualizacao([A], -1)).toBeNull();
    expect(excluirAtualizacao([], 0)).toBeNull();
  });

  it("`esperado` diferente do item atual → null (não exclui o item errado)", () => {
    expect(excluirAtualizacao([A, B], 0, B)).toBeNull();
    expect(excluirAtualizacao([A, B], 0, A)).toEqual([B]);
  });

  it("não altera a lista recebida", () => {
    const lista = [A, B];
    excluirAtualizacao(lista, 0);
    expect(lista).toEqual([A, B]);
  });
});

describe("chaveAtualizacao", () => {
  it("é estável para o mesmo item/posição", () => {
    expect(chaveAtualizacao(A, 0)).toBe(chaveAtualizacao({ ...A }, 0));
  });

  it("muda com o índice e com o texto (mesma frase em posições diferentes não colide)", () => {
    expect(chaveAtualizacao(A, 0)).not.toBe(chaveAtualizacao(A, 1));
    expect(chaveAtualizacao(A, 0)).not.toBe(chaveAtualizacao(B, 0));
  });
});
