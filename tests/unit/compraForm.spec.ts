import { describe, expect, it } from "vitest";
import { COMPRA_ID_RE } from "../../shared/constants/compra";
import { MODAL_AIR_CARGO, MODAL_COURIER_FORMAL, MODAL_COURIER_SIMPLES } from "../../shared/constants/processos";
import type { OrdemCompra } from "../../shared/types/compra";
import { courierSimplesDasOrdens, itemVazio, novoIdCompra, ordemVazia, renumerar } from "../../shared/utils/compraForm";

// Peças puras do formulário da Compra. Dados fictícios (TESTE).

describe("ids novos", () => {
  it("têm o prefixo e passam no formato que o SERVIDOR aceita (COMPRA_ID_RE)", () => {
    for (let i = 0; i < 50; i++) {
      const o = novoIdCompra("ord");
      const it = novoIdCompra("itm");
      expect(o.startsWith("ord_")).toBe(true);
      expect(it.startsWith("itm_")).toBe(true);
      expect(COMPRA_ID_RE.test(o), o).toBe(true);
      expect(COMPRA_ID_RE.test(it), it).toBe(true);
      expect(o.length).toBeLessThanOrEqual(64);
    }
  });

  it("são únicos", () => {
    const ids = new Set(Array.from({ length: 500 }, () => novoIdCompra("itm")));
    expect(ids.size).toBe(500);
  });

  it("sem crypto.randomUUID cai num id do mesmo formato", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
    try {
      const id = novoIdCompra("ord");
      expect(COMPRA_ID_RE.test(id), id).toBe(true);
    } finally {
      if (original) Object.defineProperty(globalThis, "crypto", original);
    }
  });
});

describe("ordem e item vazios", () => {
  it("o item nasce todo vazio, sem cadastro nem pré-cadastro, dinheiro null", () => {
    expect(itemVazio(3)).toMatchObject({
      posicao: 3,
      medicamento: "",
      medicamentoCadastroId: null,
      preCadastroId: null,
      apresentacao: "",
      referencia: "",
      laboratorio: "",
      quantidade: "",
      temperatura: "",
      valorUnitario: null,
      valorReal: null,
    });
  });

  it("a ordem nasce vazia com UM item vazio", () => {
    const o = ordemVazia(2);
    expect(o).toMatchObject({ posicao: 2, fornecedor: "", envio: "", cia: "", po: "", frete: null, freteReal: null });
    expect(o.itens).toHaveLength(1);
    expect(o.itens[0]!.posicao).toBe(1);
    expect(o.itens[0]!.id).not.toBe(ordemVazia(2).itens[0]!.id);
  });
});

describe("renumerar", () => {
  it("a posição é a ordem em que aparecem (ordens e itens), e não mexe no recebido", () => {
    const a = ordemVazia(7);
    const b = ordemVazia(3);
    a.itens.push({ ...itemVazio(9), id: "itm_extra_0001" });
    const antes = JSON.stringify([a, b]);
    const r = renumerar([a, b]);
    expect(r.map((o) => o.posicao)).toEqual([1, 2]);
    expect(r[0]!.itens.map((i) => i.posicao)).toEqual([1, 2]);
    expect(JSON.stringify([a, b])).toBe(antes);
  });
});

describe("courierSimplesDasOrdens (derivado)", () => {
  const com = (...envios: string[]): Array<Pick<OrdemCompra, "envio">> => envios.map((envio) => ({ envio }));
  it("todas Courier Simples: true", () => {
    expect(courierSimplesDasOrdens(com(MODAL_COURIER_SIMPLES))).toBe(true);
    expect(courierSimplesDasOrdens(com(MODAL_COURIER_SIMPLES, MODAL_COURIER_SIMPLES))).toBe(true);
  });
  it("uma que não é: false", () => {
    expect(courierSimplesDasOrdens(com(MODAL_COURIER_SIMPLES, MODAL_AIR_CARGO))).toBe(false);
    expect(courierSimplesDasOrdens(com(MODAL_COURIER_FORMAL))).toBe(false);
    expect(courierSimplesDasOrdens(com(""))).toBe(false);
  });
  it("nenhuma ordem: false (não é 'todas')", () => {
    expect(courierSimplesDasOrdens([])).toBe(false);
  });
});
