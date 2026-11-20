// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h } from "vue";
import type { Compra } from "../../shared/types/compra";
import { ApiError } from "../../app/utils/apiFetch";
import CompraFaixaConflito from "../../app/components/compras/CompraFaixaConflito.vue";
import CompraOrdemCartao from "../../app/components/compras/CompraOrdemCartao.vue";
import { useCompraEditor, type ApiCompra } from "../../app/composables/useCompraEditor";
import { useComprasPagina } from "../../app/composables/useComprasPagina";
import { OPCOES_VAZIAS } from "../../app/utils/comprasBlocos";
import { AVISO_CANCELAR_COM_ENCAMINHADAS, conflitoEhDeTrava } from "../../app/utils/comprasEncaminhar";
import { compraTeste, ordemTeste } from "./helpers/encaminharFixtures";

// As travas da ordem encaminhada na TELA, para casar com o servidor: PO desabilitado, "Remover ordem" parado, os 409 de trava só com
// "Carregar a versão salva" (nunca "Manter as minhas"), e o aviso ao cancelar uma compra com ordens já encaminhadas. Dados fictícios (TESTE).

const montados: Array<() => void> = [];
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  while (montados.length) montados.pop()!();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const texto = (el: Element | null): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string): T | null => document.querySelector<T>(sel);

function montar(render: () => ReturnType<typeof h>): void {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(defineComponent({ render }));
  app.mount(el);
  montados.push(() => app.unmount());
}

const JA = { dirId: "dir_ord_teste_0001", encaminhadaEm: "2026-12-01T10:00:00.000Z" };

describe("o cartão da ordem encaminhada", () => {
  function cartao(ordem = ordemTeste(1, JA), extra: { podeRemover?: boolean; desabilitado?: boolean } = {}): void {
    montar(() => h(CompraOrdemCartao, { ordem, numero: 1, podeRemover: extra.podeRemover ?? true, desabilitado: extra.desabilitado ?? false, opcoes: OPCOES_VAZIAS }));
  }

  it("o campo PO fica desabilitado, com 'PO já encaminhado: altere na DIR' ligado por aria-describedby", () => {
    cartao();
    const po = q<HTMLInputElement>("#ordem-ord_teste_0001-po")!;
    expect(po.disabled).toBe(true);
    expect(po.value).toBe("PO26-12-9998");
    expect(texto(q("#ordem-ord_teste_0001-po-apoio"))).toBe("PO já encaminhado: altere na DIR");
    expect(po.getAttribute("aria-describedby")).toBe("ordem-ord_teste_0001-po-apoio");
  });

  it("os outros campos da ordem seguem editáveis (o servidor só trava o PO e a remoção)", () => {
    cartao();
    for (const campo of ["fornecedor", "envio", "cia"]) {
      const botao = q<HTMLButtonElement>(`#ordem-ord_teste_0001-${campo}`);
      expect(botao, campo).not.toBeNull();
      expect(botao!.disabled, campo).toBe(false);
    }
    expect(q<HTMLInputElement>("#ordem-ord_teste_0001-frete")!.disabled).toBe(false);
  });

  it("'Remover ordem' continua desabilitado, com a dica 'Já encaminhada para a DIR', e a etiqueta 'Encaminhada em dd/mm' fica", () => {
    cartao();
    const remover = q<HTMLButtonElement>("#ordem-ord_teste_0001-remover")!;
    expect(remover.disabled).toBe(true);
    expect(remover.getAttribute("title")).toBe("Já encaminhada para a DIR");
    expect(texto(q("#ordem-ord_teste_0001-encaminhada"))).toBe("Encaminhada em 01/12");
  });

  it("ordem NÃO encaminhada: PO editável e a dica de sempre; remover habilitado", () => {
    cartao(ordemTeste(1));
    expect(q<HTMLInputElement>("#ordem-ord_teste_0001-po")!.disabled).toBe(false);
    expect(texto(q("#ordem-ord_teste_0001-po-apoio"))).toBe("Pode ficar para depois.");
    expect(q<HTMLButtonElement>("#ordem-ord_teste_0001-remover")!.disabled).toBe(false);
  });

  it("dir_id só de espaços não conta como encaminhada", () => {
    cartao(ordemTeste(1, { dirId: "  " }));
    expect(q<HTMLInputElement>("#ordem-ord_teste_0001-po")!.disabled).toBe(false);
  });
});

describe("a faixa de conflito", () => {
  function faixa(conflito: { codigo: string | null; mensagem: string | null } | null): { carregar: number; manter: number } {
    const n = { carregar: 0, manter: 0 };
    montar(() => h(CompraFaixaConflito, { conflito, onCarregar: () => (n.carregar += 1), onManter: () => (n.manter += 1) }));
    return n;
  }

  it("conflito comum (alguém salvou antes): o texto de sempre e as DUAS saídas", () => {
    const n = faixa({ codigo: null, mensagem: "Esta compra foi alterada por outra pessoa. Recarregue para ver a versão atual." });
    expect(texto(q("#compra-faixa-conflito-texto"))).toBe("Esta compra foi alterada por outra pessoa.");
    expect(q("#btn-conflito-carregar")).not.toBeNull();
    expect(q("#btn-conflito-manter")).not.toBeNull();
    q<HTMLButtonElement>("#btn-conflito-manter")!.click();
    expect(n.manter).toBe(1);
  });

  it("sem informação do motivo: igual ao conflito comum (nada muda para quem não passa a prop)", () => {
    faixa(null);
    expect(q("#btn-conflito-manter")).not.toBeNull();
  });

  it.each([
    ["ordem_encaminhada_removida", "Ordem já encaminhada para a DIR não pode ser removida"],
    ["po_travado", "PO travado: já encaminhado; altere na DIR"],
  ])("409 de trava %s: mostra a mensagem do servidor e SÓ 'Carregar a versão salva' (sem 'Manter as minhas e salvar por cima')", (codigo, mensagem) => {
    const n = faixa({ codigo, mensagem });
    expect(conflitoEhDeTrava(codigo)).toBe(true);
    expect(texto(q("#compra-faixa-conflito-texto"))).toBe(mensagem);
    expect(q("#btn-conflito-manter")).toBeNull();
    expect(texto(q("#btn-conflito-carregar"))).toBe("Carregar a versão salva");
    q<HTMLButtonElement>("#btn-conflito-carregar")!.click();
    expect(n.carregar).toBe(1);
    expect(q("#compra-faixa-conflito")!.getAttribute("data-codigo")).toBe(codigo);
  });

  it("conflitoEhDeTrava só vale para os dois códigos de trava", () => {
    for (const c of [null, undefined, "", "po_ja_na_dir", "compra_cancelada", "versao"]) expect(conflitoEhDeTrava(c), String(c)).toBe(false);
  });
});

describe("o editor diante do 409 de trava", () => {
  function servidor(erro: ApiError): { api: ApiCompra; salvar: ReturnType<typeof vi.fn>; obter: ReturnType<typeof vi.fn> } {
    const obter = vi.fn(async (id: string): Promise<Compra> => ({ ...compraTeste(), id }));
    const salvar = vi.fn(async (): Promise<Compra> => {
      throw erro;
    });
    return { api: { obter, salvar }, salvar, obter };
  }

  it("guarda o código e a mensagem, para o autosave e NÃO reenvia por cima (manterMinhas não faz nada)", async () => {
    const s = servidor(new ApiError("PO travado: já encaminhado; altere na DIR", 409, { code: "po_travado", ordemId: "ord_teste_0001" }));
    const e = useCompraEditor({ api: s.api, somenteLeitura: () => false });
    await e.carregar("cmp_teste_000001");
    e.alterar({ paciente: "TESTE EDITADO" });
    await vi.advanceTimersByTimeAsync(800);
    expect(e.estado.value).toBe("conflito");
    expect(e.conflito.value).toEqual({ codigo: "po_travado", mensagem: "PO travado: já encaminhado; altere na DIR" });
    expect(s.salvar).toHaveBeenCalledTimes(1);

    await e.manterMinhas();
    await vi.advanceTimersByTimeAsync(5000);
    expect(s.salvar).toHaveBeenCalledTimes(1); // nada foi reenviado
    expect(s.obter).toHaveBeenCalledTimes(1); // nem sequer leu a versão atual
    expect(e.estado.value).toBe("conflito");
    expect(e.compra.value?.paciente).toBe("TESTE EDITADO"); // nada local some

    await e.carregarVersaoSalva();
    expect(e.estado.value).toBe("ocioso");
    expect(e.conflito.value).toBeNull();
  });

  it("o 409 comum continua com as duas saídas (manterMinhas reenvia com a versão atual)", async () => {
    const obter = vi.fn(async (id: string): Promise<Compra> => ({ ...compraTeste(), id, updatedAt: "2026-12-01T13:00:00.000Z" }));
    let primeira = true;
    const salvar = vi.fn(async (): Promise<Compra> => {
      if (primeira) {
        primeira = false;
        throw new ApiError("Esta compra foi alterada por outra pessoa. Recarregue para ver a versão atual.", 409, { atual: compraTeste() });
      }
      return { ...compraTeste(), updatedAt: "2026-12-01T13:00:01.000Z" };
    });
    const e = useCompraEditor({ api: { obter, salvar }, somenteLeitura: () => false });
    await e.carregar("cmp_teste_000001");
    e.alterar({ paciente: "TESTE EDITADO" });
    await vi.advanceTimersByTimeAsync(800);
    expect(e.conflito.value).toEqual({ codigo: null, mensagem: "Esta compra foi alterada por outra pessoa. Recarregue para ver a versão atual." });
    await e.manterMinhas();
    expect(salvar).toHaveBeenCalledTimes(2);
    expect(e.estado.value).toBe("salvo");
  });

  it("ordem_encaminhada_removida também fecha a saída de 'manter'", async () => {
    const s = servidor(new ApiError("Ordem já encaminhada para a DIR não pode ser removida", 409, { code: "ordem_encaminhada_removida" }));
    const e = useCompraEditor({ api: s.api, somenteLeitura: () => false });
    await e.carregar("cmp_teste_000001");
    e.alterar({ paciente: "X" });
    await vi.advanceTimersByTimeAsync(800);
    await e.manterMinhas();
    expect(s.salvar).toHaveBeenCalledTimes(1);
  });
});

describe("cancelar uma compra com ordens já encaminhadas", () => {
  function pagina(compra: Compra) {
    const p = useComprasPagina({
      query: {},
      podeEditar: () => true,
      avisar: () => undefined,
      gravarUrl: () => undefined,
      apiLista: { listar: async () => ({ anoMes: "2026-12", compras: [], status: null, pagina: 1, limite: 50, temMais: false, total: 0, totais: { rascunho: 0, pronta: 0, parcial: 0, encaminhada: 0, cancelada: 0 } }) },
      apiCompra: { obter: async () => compra, salvar: async () => compra },
    });
    p.editor.definir(compra);
    return p;
  }

  it("sem ordem encaminhada: a mensagem de sempre, sem o aviso da DIR", () => {
    const p = pagina(compraTeste());
    expect(p.mensagemCancelar()).toBe("Cancelar a Compra 03 - Dezembro/2026? Ela continua na lista como cancelada e não poderá mais ser editada.");
    expect(p.mensagemCancelar()).not.toContain("DIR");
  });

  it("com alguma ordem encaminhada: o aviso 'Há ordens já encaminhadas para a DIR. As linhas da DIR continuam existindo e não são alteradas.'", () => {
    const p = pagina(compraTeste({ ordens: [ordemTeste(1, JA), ordemTeste(2)] }));
    expect(p.mensagemCancelar()).toBe(`Cancelar a Compra 03 - Dezembro/2026? Ela continua na lista como cancelada e não poderá mais ser editada. ${AVISO_CANCELAR_COM_ENCAMINHADAS}`);
    expect(AVISO_CANCELAR_COM_ENCAMINHADAS).toBe("Há ordens já encaminhadas para a DIR. As linhas da DIR continuam existindo e não são alteradas.");
  });

  it("dir_id só de espaços não dispara o aviso", () => {
    expect(pagina(compraTeste({ ordens: [ordemTeste(1, { dirId: " " })] })).mensagemCancelar()).not.toContain("DIR");
  });
});

