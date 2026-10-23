import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mensagemConfirmarGrupo,
  mensagemConfirmarLote,
  rotuloQuantidadePagamentos,
} from "../../app/utils/pagamentoConfirmacao";
import { usePagamentoConfirmacao, type PedidoPagamento } from "../../app/composables/usePagamentoConfirmacao";

describe("textos da confirmação do Pago", () => {
  it("singular e plural da quantidade", () => {
    expect(rotuloQuantidadePagamentos(1)).toBe("1 pagamento");
    expect(rotuloQuantidadePagamentos(0)).toBe("0 pagamentos");
    expect(rotuloQuantidadePagamentos(3)).toBe("3 pagamentos");
  });

  it("lote: banco · data · quantidade · total R$, sem cálculo novo", () => {
    expect(
      mensagemConfirmarLote({ titulo: "Banco XP", dataBR: "20/10/2026", quantidade: 2, totalReaisLabel: "665.388,00" }),
    ).toBe("Banco XP · 20/10/2026 · 2 pagamentos · Total R$ 665.388,00. O lote vai para Pagamentos realizados.");
    expect(
      mensagemConfirmarLote({ titulo: "Banco Intex", dataBR: "01/02/2026", quantidade: 1, totalReaisLabel: "—" }),
    ).toBe("Banco Intex · 01/02/2026 · 1 pagamento · Total R$ —. O lote vai para Pagamentos realizados.");
  });

  it("grupo: nome · quantidade · valor total", () => {
    expect(mensagemConfirmarGrupo({ nome: "Andreza Faconi", quantidade: 2, valorTotalLabel: "1.236.418,39" })).toBe(
      "Andreza Faconi · 2 pagamentos · Valor total R$ 1.236.418,39. O grupo vai para Pagamentos realizados.",
    );
  });
});

describe("usePagamentoConfirmacao", () => {
  const pedido: PedidoPagamento = { id: "lote-a", titulo: "Marcar este lote como pago?", mensagem: "texto" };

  beforeEach(() => {
    vi.stubGlobal("document", { getElementById: () => null });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function montar(opcoes: { executar?: () => Promise<void>; continuaAberto?: () => boolean } = {}) {
    const executar = vi.fn(opcoes.executar ?? (async () => {}));
    const continuaAberto = vi.fn(opcoes.continuaAberto ?? (() => false));
    return { ...usePagamentoConfirmacao({ executar, continuaAberto }), executar, continuaAberto };
  }

  it("pedir só abre a janela: nenhum handler é chamado", () => {
    const c = montar();
    c.pedir("LOTE", pedido);
    expect(c.pendente.value).toMatchObject({ alvo: "LOTE", id: "lote-a" });
    expect(c.executar).not.toHaveBeenCalled();
  });

  it("cancelar fecha sem chamar nada", () => {
    const c = montar();
    c.pedir("DESPACHANTE", pedido);
    c.cancelar();
    expect(c.pendente.value).toBeNull();
    expect(c.executar).not.toHaveBeenCalled();
  });

  it("confirmar chama o handler UMA vez, mesmo com dois cliques seguidos, e fecha no sucesso", async () => {
    let liberar: () => void = () => {};
    const c = montar({ executar: () => new Promise<void>((r) => (liberar = r)) });
    c.pedir("TRANSPORTADORA", pedido);
    const a = c.confirmar();
    const b = c.confirmar(); // segundo clique antes do PATCH terminar
    expect(c.confirmando.value).toBe(true);
    liberar();
    await Promise.all([a, b]);
    expect(c.executar).toHaveBeenCalledTimes(1);
    expect(c.executar).toHaveBeenCalledWith(expect.objectContaining({ alvo: "TRANSPORTADORA", id: "lote-a" }));
    expect(c.confirmando.value).toBe(false);
    expect(c.pendente.value).toBeNull();
  });

  it("não deixa cancelar nem abrir outro pedido enquanto o PATCH roda", async () => {
    let liberar: () => void = () => {};
    const c = montar({ executar: () => new Promise<void>((r) => (liberar = r)) });
    c.pedir("LOTE", pedido);
    const p = c.confirmar();
    c.cancelar();
    c.pedir("LOTE", { ...pedido, id: "outro" });
    expect(c.pendente.value?.id).toBe("lote-a");
    liberar();
    await p;
  });

  it("em erro (o item continua em aberto) a janela fica aberta e dá pra tentar de novo", async () => {
    let aberto = true;
    const c = montar({ continuaAberto: () => aberto });
    c.pedir("LOTE", pedido);
    await c.confirmar();
    expect(c.pendente.value).not.toBeNull();
    expect(c.confirmando.value).toBe(false);
    aberto = false;
    await c.confirmar();
    expect(c.executar).toHaveBeenCalledTimes(2);
    expect(c.pendente.value).toBeNull();
  });
});
