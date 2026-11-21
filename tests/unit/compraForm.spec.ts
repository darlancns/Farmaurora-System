import { describe, expect, it } from "vitest";
import { CIAS_AEREAS_POR_MODAL, MODAIS_ENVIO } from "../../shared/constants/processos";
import { COMPRA_ID_RE, PENDENCIAS_PADRAO } from "../../shared/constants/compra";
import { adicionarItem, atualizarItem, ciaAposTrocaDeEnvio, itemTemConteudo, itemVazio, novoIdCompra, pendenciasDoFormulario, pendenciasParaFormulario, removerItem, renumerarItens } from "../../shared/utils/compraForm";

// Peças puras do formulário da Compra (uma compra por fornecedor: só há medicamentos). Dados fictícios (TESTE).

describe("ids novos", () => {
  it("têm o prefixo e passam no formato que o SERVIDOR aceita (COMPRA_ID_RE)", () => {
    for (let i = 0; i < 50; i++) {
      const it = novoIdCompra("itm");
      expect(it.startsWith("itm_")).toBe(true);
      expect(COMPRA_ID_RE.test(it), it).toBe(true);
      expect(it.length).toBeLessThanOrEqual(64);
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
      const id = novoIdCompra("itm");
      expect(COMPRA_ID_RE.test(id), id).toBe(true);
    } finally {
      if (original) Object.defineProperty(globalThis, "crypto", original);
    }
  });
});

describe("medicamento vazio", () => {
  it("nasce todo vazio, sem cadastro nem pré-cadastro, brand vazio e dinheiro null (sem apresentação nem referência)", () => {
    const i = itemVazio(3);
    expect(i).toMatchObject({
      posicao: 3,
      medicamento: "",
      medicamentoCadastroId: null,
      medicamentoCadastroNome: null,
      preCadastroId: null,
      laboratorio: "",
      brand: "",
      quantidade: "",
      temperatura: "",
      valorUnitario: null,
      valorReal: null,
    });
    expect(Object.keys(i)).not.toContain("apresentacao");
    expect(Object.keys(i)).not.toContain("referencia");
    expect(itemVazio(3).id).not.toBe(i.id);
  });
});

describe("renumerarItens", () => {
  it("a posição é a ordem em que aparecem, e não mexe no recebido", () => {
    const itens = [{ ...itemVazio(7), id: "itm_aaaaaa" }, { ...itemVazio(3), id: "itm_bbbbbb" }, { ...itemVazio(9), id: "itm_cccccc" }];
    const antes = JSON.stringify(itens);
    expect(renumerarItens(itens).map((i) => [i.id, i.posicao])).toEqual([["itm_aaaaaa", 1], ["itm_bbbbbb", 2], ["itm_cccccc", 3]]);
    expect(JSON.stringify(itens)).toBe(antes);
  });
});

describe("itemTemConteudo", () => {
  it("vazio: não; qualquer campo (texto, brand, dinheiro, ligação) conta; id e posição não", () => {
    expect(itemTemConteudo(itemVazio(1))).toBe(false);
    expect(itemTemConteudo({ ...itemVazio(1), medicamento: " " })).toBe(false);
    for (const extra of [
      { medicamento: "TESTE" },
      { laboratorio: "Lab" },
      { brand: "referencia" as const },
      { quantidade: "2" },
      { temperatura: "Ambiente" },
      { valorUnitario: 0 },
      { valorReal: 1 },
      { medicamentoCadastroId: "med_1" },
      { preCadastroId: "pre_1" },
    ]) {
      expect(itemTemConteudo({ ...itemVazio(1), ...extra }), JSON.stringify(extra)).toBe(true);
    }
  });
});

describe("pendências: chips + texto livre", () => {
  it("ida e volta: os chips marcados (na ordem da lista padrão) e UMA entrada final com o texto livre", () => {
    const [a, b] = [PENDENCIAS_PADRAO[0], PENDENCIAS_PADRAO[2]];
    const lista = pendenciasDoFormulario([b, a], "  Algo a mais ");
    expect(lista).toEqual([a, b, "Algo a mais"]);
    expect(pendenciasParaFormulario(lista)).toEqual({ marcadas: [a, b], livre: "Algo a mais" });
    expect(pendenciasDoFormulario([], "")).toEqual([]);
  });

  it("entradas fora da lista padrão aparecem no campo livre, unidas por '; '", () => {
    expect(pendenciasParaFormulario(["Uma", PENDENCIAS_PADRAO[1], "Outra"])).toEqual({ marcadas: [PENDENCIAS_PADRAO[1]], livre: "Uma; Outra" });
  });
});

describe("ciaAposTrocaDeEnvio: a cia some quando não vale para o novo modal", () => {
  it("vale para o novo modal: fica (devolve o nome canônico da lista)", () => {
    expect(ciaAposTrocaDeEnvio("Air Cargo", "Emirates")).toBe("Emirates");
    expect(ciaAposTrocaDeEnvio("Courier Formal", "DHL")).toBe("DHL");
    expect(ciaAposTrocaDeEnvio("Courier Simples", "FedEx")).toBe("FedEx");
  });

  it("não vale para o novo modal: vira vazio", () => {
    expect(ciaAposTrocaDeEnvio("Courier Formal", "Emirates")).toBe("");
    expect(ciaAposTrocaDeEnvio("Courier Simples", "Qatar")).toBe("");
    expect(ciaAposTrocaDeEnvio("Air Cargo", "DHL")).toBe("");
  });

  it("sem modal (vazio, desconhecido ou o legado 'Courier'): nenhuma cia vale", () => {
    for (const envio of ["", "Courier", "air cargo", "Navio"]) expect(ciaAposTrocaDeEnvio(envio, "Emirates")).toBe("");
  });

  it("cia vazia fica vazia; compara sem acento nem caixa e devolve o nome canônico", () => {
    expect(ciaAposTrocaDeEnvio("Air Cargo", "")).toBe("");
    expect(ciaAposTrocaDeEnvio("Air Cargo", "   ")).toBe("");
    expect(ciaAposTrocaDeEnvio("Air Cargo", "  emirates ")).toBe("Emirates");
    expect(ciaAposTrocaDeEnvio("Courier Formal", "fedex")).toBe("FedEx");
  });

  it("para TODO modal e TODA cia das constantes: a cia do próprio modal sempre fica; a de outro modal só fica se também estiver na lista dele", () => {
    for (const modal of MODAIS_ENVIO) {
      for (const cia of CIAS_AEREAS_POR_MODAL[modal]) expect(ciaAposTrocaDeEnvio(modal, cia)).toBe(cia);
      for (const outro of MODAIS_ENVIO) {
        for (const cia of CIAS_AEREAS_POR_MODAL[outro]) expect(ciaAposTrocaDeEnvio(modal, cia)).toBe(CIAS_AEREAS_POR_MODAL[modal].includes(cia) ? cia : "");
      }
    }
  });
});

describe("lista de medicamentos: atualizar, adicionar e remover", () => {
  const dois = () => [{ ...itemVazio(1), id: "itm_a", medicamento: "A" }, { ...itemVazio(2), id: "itm_b", medicamento: "B" }];

  it("atualizarItem troca só o medicamento do id, sem mexer nos outros nem no recebido", () => {
    const itens = dois();
    const novos = atualizarItem(itens, "itm_b", { medicamento: "B2", laboratorio: "Lab" });
    expect(novos.map((i) => i.medicamento)).toEqual(["A", "B2"]);
    expect(novos[1]!.laboratorio).toBe("Lab");
    expect(itens[1]!.medicamento).toBe("B");
    expect(atualizarItem(itens, "nao_existe", { medicamento: "X" })).toEqual(itens);
  });

  it("adicionarItem põe um medicamento vazio no fim, com a posição certa, até o teto", () => {
    const novos = adicionarItem(dois(), 30);
    expect(novos).toHaveLength(3);
    expect(novos[2]).toMatchObject({ posicao: 3, medicamento: "", medicamentoCadastroId: null, brand: "" });
    const cheio = Array.from({ length: 30 }, (_, i) => ({ ...itemVazio(i + 1), id: `itm_${i}0000` }));
    expect(adicionarItem(cheio, 30)).toHaveLength(30);
  });

  it("removerItem tira pelo id, renumera e NUNCA deixa a compra sem nenhum", () => {
    const novos = removerItem(dois(), "itm_a");
    expect(novos.map((i) => [i.id, i.posicao])).toEqual([["itm_b", 1]]);
    expect(removerItem(novos, "itm_b")).toHaveLength(1);
  });
});
