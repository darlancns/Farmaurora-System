import { describe, expect, it } from "vitest";
import { CADASTRO_TAMANHO_PAGINA } from "../../shared/constants/cadastros";
import { limiteParaMostrar, paginaDaLista, textoMostrarMais } from "../../app/utils/cadastroColunas";

// "Mostrar mais" de 50 em 50 nas seções dos Cadastros (funções puras; o comportamento na tela está em cadastrosTab.spec.ts).

const lista = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe("paginaDaLista", () => {
  it("a página é de 50", () => {
    expect(CADASTRO_TAMANHO_PAGINA).toBe(50);
  });

  it("414 itens: 50 por vez; as sobras diminuem até zero", () => {
    expect(paginaDaLista(lista(414), 50)).toMatchObject({ restantes: 364 });
    expect(paginaDaLista(lista(414), 50).itens).toHaveLength(50);
    expect(paginaDaLista(lista(414), 400)).toMatchObject({ restantes: 14 });
    expect(paginaDaLista(lista(414), 450)).toMatchObject({ restantes: 0 });
    expect(paginaDaLista(lista(414), 450).itens).toHaveLength(414);
  });

  it("lista pequena e vazia: tudo à mostra, sem sobra", () => {
    expect(paginaDaLista(lista(3), 50)).toEqual({ itens: [0, 1, 2], restantes: 0 });
    expect(paginaDaLista([], 50)).toEqual({ itens: [], restantes: 0 });
    expect(paginaDaLista(lista(50), 50).restantes).toBe(0);
    expect(paginaDaLista(lista(51), 50).restantes).toBe(1);
  });

  it("mantém a ordem recebida e um limite menor que a página mostra a primeira página", () => {
    expect(paginaDaLista(lista(120), 0).itens).toHaveLength(50);
    expect(paginaDaLista(lista(120), -10).itens).toHaveLength(50);
    expect(paginaDaLista(lista(120), 50).itens[49]).toBe(49);
  });
});

describe("textoMostrarMais", () => {
  it("'Mostrar mais (N de M)': quantos vêm agora de quantos faltam (o molde da DIR)", () => {
    expect(textoMostrarMais(364)).toBe("Mostrar mais (50 de 364)");
    expect(textoMostrarMais(14)).toBe("Mostrar mais (14 de 14)");
    expect(textoMostrarMais(50)).toBe("Mostrar mais (50 de 50)");
    expect(textoMostrarMais(1)).toBe("Mostrar mais (1 de 1)");
  });
});

describe("limiteParaMostrar", () => {
  it("o menor múltiplo da página que mostra a posição (nunca diminui o limite atual)", () => {
    expect(limiteParaMostrar(0, 50)).toBe(50);
    expect(limiteParaMostrar(49, 50)).toBe(50);
    expect(limiteParaMostrar(50, 50)).toBe(100);
    expect(limiteParaMostrar(414, 50)).toBe(450);
    expect(limiteParaMostrar(10, 200)).toBe(200);
  });

  it("item que não está na lista (índice -1, ex.: escondido pela busca) não mexe no limite", () => {
    expect(limiteParaMostrar(-1, 50)).toBe(50);
    expect(limiteParaMostrar(-1, 150)).toBe(150);
  });
});
