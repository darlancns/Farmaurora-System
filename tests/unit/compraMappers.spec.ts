import { describe, expect, it } from "vitest";
import {
  instanteIso,
  linhaDeItem,
  linhaDeOrdem,
  montarCompra,
  montarCompraDaLista,
  montarItem,
  montarOrdem,
  numeroDoNumeric,
  numericParaBanco,
  type CompraRow,
  type ItemRow,
  type OrdemRow,
} from "../../server/utils/compraMappers";

// Mapeadores linha ↔ modelo da Compra. Dados fictícios (TESTE). O ponto mais delicado: o Postgres devolve numeric(14,2) como TEXTO
// ("1234.50", "0.00"); a conversão para número (e null) está em UM lugar, `numeroDoNumeric`.

const compraRow = (extra: Partial<CompraRow> = {}): CompraRow => ({
  id: "cmp_1",
  ano_mes: "2026-11",
  sequencia: 7,
  cancelada: false,
  paciente: "PACIENTE TESTE",
  processo_numero: "0000000-00.0000.0.00.0000/SP",
  medico: "Dr. Teste",
  local_aplicacao: "Clínica Teste",
  entrega: "Entrega Teste",
  contatos: "Contato Teste",
  termo_observacao: "",
  despachante: "DESPACHANTE TESTE",
  isencao_para: "",
  observacoes: "Obs de teste",
  vendedor: "VENDEDOR TESTE",
  responsavel: "RESPONSAVEL TESTE",
  compra_particular: false,
  local_declarado: true,
  termo_posterior: true,
  courier_simples: false,
  isencao: true,
  recorrente: true,
  pagamento_alvara: true,
  pagamento_momento: "vamos_pagar",
  documentos: null,
  pendencias: ["Receita", "Laudo"],
  criado_por: "Cris",
  atualizado_por: "Bruno",
  created_at: "2026-11-19T12:00:00.000+00:00",
  updated_at: "2026-11-19T12:30:15.250+00:00",
  ...extra,
});

const ordemRow = (extra: Partial<OrdemRow> = {}): OrdemRow => ({
  id: "ord_1",
  compra_id: "cmp_1",
  posicao: 1,
  fornecedor: "FORNECEDOR TESTE",
  envio: "Courier Simples",
  cia: "CIA TESTE",
  po: "PO26-11-0001",
  frete: "150.00",
  frete_real: null,
  ...extra,
});

const itemRow = (extra: Partial<ItemRow> = {}): ItemRow => ({
  id: "itm_1",
  ordem_id: "ord_1",
  posicao: 1,
  medicamento: "TESTE MED A",
  medicamento_cadastro_id: "med_1",
  pre_cadastro_id: null,
  apresentacao: "500 mg",
  referencia: "REF A",
  laboratorio: "LAB A",
  quantidade: "12 ampolas",
  temperatura: "2°C a 8°C",
  valor_unitario: "1234.50",
  valor_real: "0.00",
  ...extra,
});

describe("numeroDoNumeric — o ÚNICO lugar que converte numeric (texto do Postgres) em número", () => {
  it("texto com centavos vira número", () => {
    expect(numeroDoNumeric("1234.50")).toBe(1234.5);
    expect(numeroDoNumeric("0.10")).toBe(0.1);
    expect(numeroDoNumeric("19.99")).toBe(19.99);
    expect(numeroDoNumeric("100.00")).toBe(100);
    expect(numeroDoNumeric("999999999999.99")).toBe(999999999999.99);
  });

  it("'0.00' é ZERO (um valor), não vazio", () => {
    expect(numeroDoNumeric("0.00")).toBe(0);
    expect(numeroDoNumeric("0")).toBe(0);
    expect(numeroDoNumeric(0)).toBe(0);
  });

  it("null, undefined, texto vazio e lixo são vazios (null)", () => {
    for (const vazio of [null, undefined, "", "   ", "abc", "1,5x", Number.NaN, Number.POSITIVE_INFINITY, {}, []]) {
      expect(numeroDoNumeric(vazio), String(vazio)).toBeNull();
    }
  });

  it("número passa (o Supabase em memória e valores já convertidos), com 2 casas", () => {
    expect(numeroDoNumeric(12.5)).toBe(12.5);
    expect(numeroDoNumeric(7)).toBe(7);
  });

  it("não deixa sobra de ponto flutuante nos centavos", () => {
    expect(numeroDoNumeric("0.30")).toBe(0.3);
    expect(numeroDoNumeric(0.1 + 0.2)).toBe(0.3);
  });
});

describe("numericParaBanco — o número como vai para a coluna", () => {
  it("2 casas; zero é zero; vazio e inválido viram NULL", () => {
    expect(numericParaBanco(1234.5)).toBe(1234.5);
    expect(numericParaBanco(0)).toBe(0);
    expect(numericParaBanco(10.1)).toBe(10.1);
    expect(numericParaBanco(0.1 + 0.2)).toBe(0.3);
    for (const vazio of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) expect(numericParaBanco(vazio), String(vazio)).toBeNull();
  });

  it("ida e volta: o que sai do banco como texto e volta como número é o mesmo valor", () => {
    for (const texto of ["0.00", "0.01", "1.10", "1234.50", "99999.99"]) {
      expect(numericParaBanco(numeroDoNumeric(texto))).toBe(Number(texto));
    }
  });
});

describe("instanteIso", () => {
  it("o '+00:00' do Postgres vira o ISO com Z (a versão da compra é comparada por este texto)", () => {
    expect(instanteIso("2026-11-19T12:30:15.250+00:00")).toBe("2026-11-19T12:30:15.250Z");
    expect(instanteIso("2026-11-19T12:30:15.250Z")).toBe("2026-11-19T12:30:15.250Z");
    expect(instanteIso("2026-11-19T09:30:15.250-03:00")).toBe("2026-11-19T12:30:15.250Z");
  });

  it("texto que não é data fica como veio", () => {
    expect(instanteIso("ontem")).toBe("ontem");
  });
});

describe("itens e ordens", () => {
  it("o item converte os numeric de texto e mantém os ids de cadastro", () => {
    expect(montarItem(itemRow())).toEqual({
      id: "itm_1",
      posicao: 1,
      medicamento: "TESTE MED A",
      medicamentoCadastroId: "med_1",
      preCadastroId: null,
      apresentacao: "500 mg",
      referencia: "REF A",
      laboratorio: "LAB A",
      quantidade: "12 ampolas",
      temperatura: "2°C a 8°C",
      valorUnitario: 1234.5,
      valorReal: 0,
    });
  });

  it("valores vazios do banco viram null, textos null viram ''", () => {
    const i = montarItem(itemRow({ valor_unitario: null, valor_real: null, apresentacao: null, quantidade: null, medicamento_cadastro_id: null, pre_cadastro_id: "pre_1" }));
    expect(i).toMatchObject({ valorUnitario: null, valorReal: null, apresentacao: "", quantidade: "", medicamentoCadastroId: null, preCadastroId: "pre_1" });
  });

  it("a ordem converte frete e frete real, e os itens saem por posição", () => {
    const o = montarOrdem(ordemRow({ frete: "150.00", frete_real: "140.50" }), [itemRow({ id: "b", posicao: 2 }), itemRow({ id: "a", posicao: 1 })]);
    expect(o).toMatchObject({ id: "ord_1", frete: 150, freteReal: 140.5 });
    expect(o.itens.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("frete '0.00' é zero e frete null é null", () => {
    expect(montarOrdem(ordemRow({ frete: "0.00" }), []).frete).toBe(0);
    expect(montarOrdem(ordemRow({ frete: null }), []).frete).toBeNull();
  });
});

describe("a compra", () => {
  it("monta os campos (booleanos, NULL de 'ainda não decidiu', pendências) e normaliza as datas", () => {
    const c = montarCompra(compraRow(), [], []);
    expect(c).toMatchObject({
      id: "cmp_1",
      anoMes: "2026-11",
      sequencia: 7,
      cancelada: false,
      compraParticular: false,
      localDeclarado: true,
      termoPosterior: true,
      courierSimples: false,
      isencao: true,
      recorrente: true,
      pagamentoAlvara: true,
      pagamentoMomento: "vamos_pagar",
      documentos: null,
      pendencias: ["Receita", "Laudo"],
      criadoPor: "Cris",
      atualizadoPor: "Bruno",
      createdAt: "2026-11-19T12:00:00.000Z",
      updatedAt: "2026-11-19T12:30:15.250Z",
      ordens: [],
    });
  });

  it("textos null viram '', pendencias null vira [], criado_por null vira ''", () => {
    const c = montarCompra(compraRow({ paciente: null, observacoes: null, pendencias: null, criado_por: null, atualizado_por: null }), [], []);
    expect(c).toMatchObject({ paciente: "", observacoes: "", pendencias: [], criadoPor: "", atualizadoPor: "" });
  });

  it("pagamento_momento fora de 'vamos_pagar' e 'apos_awb' vira null; alvará e documentos null ficam null", () => {
    expect(montarCompra(compraRow({ pagamento_momento: "outro" }), [], []).pagamentoMomento).toBeNull();
    expect(montarCompra(compraRow({ pagamento_momento: "apos_awb" }), [], []).pagamentoMomento).toBe("apos_awb");
    expect(montarCompra(compraRow({ pagamento_momento: null, pagamento_alvara: null }), [], [])).toMatchObject({ pagamentoMomento: null, pagamentoAlvara: null });
  });

  it("ordens e itens saem ordenados por posição e cada item vai para a SUA ordem", () => {
    const c = montarCompra(
      compraRow(),
      [ordemRow({ id: "o2", posicao: 2 }), ordemRow({ id: "o1", posicao: 1 })],
      [
        itemRow({ id: "i3", ordem_id: "o2", posicao: 1 }),
        itemRow({ id: "i2", ordem_id: "o1", posicao: 2 }),
        itemRow({ id: "i1", ordem_id: "o1", posicao: 1 }),
      ],
    );
    expect(c.ordens.map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(c.ordens[0]!.itens.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(c.ordens[1]!.itens.map((i) => i.id)).toEqual(["i3"]);
  });

  it("não altera as linhas recebidas", () => {
    const ordens = [ordemRow({ id: "o2", posicao: 2 }), ordemRow({ id: "o1", posicao: 1 })];
    const copia = JSON.parse(JSON.stringify(ordens));
    montarCompra(compraRow(), ordens, []);
    expect(ordens).toEqual(copia);
  });

  it("item da lista: só o necessário, com o total de ordens", () => {
    const l = montarCompraDaLista(
      compraRow(),
      [ordemRow({ id: "o1" }), ordemRow({ id: "o2", posicao: 2 })],
      [],
    );
    expect(l).toMatchObject({ id: "cmp_1", anoMes: "2026-11", sequencia: 7, totalOrdens: 2, atualizadoEm: "2026-11-19T12:30:15.250Z" });
    expect(Object.keys(l).sort()).toEqual(
      ["anoMes", "atualizadoEm", "cancelada", "id", "medicamentos", "paciente", "pendencias", "sequencia", "status", "totalOrdens"].sort(),
    );
    expect(montarCompraDaLista(compraRow(), [], [])).toMatchObject({ totalOrdens: 0 });
  });

  it("os nomes dos medicamentos: únicos, na ordem das ordens e dos itens (por posição), sem vazios", () => {
    const l = montarCompraDaLista(
      compraRow(),
      [ordemRow({ id: "o2", posicao: 2 }), ordemRow({ id: "o1", posicao: 1 })],
      [
        itemRow({ id: "a", ordem_id: "o2", posicao: 1, medicamento: "SEGUNDA ORDEM" }),
        itemRow({ id: "b", ordem_id: "o1", posicao: 2, medicamento: " REPETIDO " }),
        itemRow({ id: "c", ordem_id: "o1", posicao: 1, medicamento: "PRIMEIRO" }),
        itemRow({ id: "d", ordem_id: "o2", posicao: 2, medicamento: "REPETIDO" }),
        itemRow({ id: "e", ordem_id: "o2", posicao: 3, medicamento: "  " }),
      ],
    );
    expect(l.medicamentos).toEqual(["PRIMEIRO", "REPETIDO", "SEGUNDA ORDEM"]);
  });
});

describe("modelo → linha", () => {
  it("a linha de uma ordem arredonda o frete", () => {
    const linha = linhaDeOrdem("cmp_1", 2, { id: "ord_9", fornecedor: "F", envio: "E", cia: "C", po: "", frete: 10.1, freteReal: null });
    expect(linha).toEqual({ id: "ord_9", compra_id: "cmp_1", posicao: 2, fornecedor: "F", envio: "E", cia: "C", po: "", frete: 10.1, frete_real: null });
  });

  it("a linha de um item leva a posição, a ordem e os valores (null quando vazios)", () => {
    const linha = linhaDeItem("ord_1", 3, {
      id: "itm_9",
      medicamento: "TESTE MED A",
      medicamentoCadastroId: null,
      preCadastroId: "pre_1",
      apresentacao: "",
      referencia: "",
      laboratorio: "",
      quantidade: "5 caixas",
      temperatura: "",
      valorUnitario: 0,
      valorReal: null,
    });
    expect(linha).toMatchObject({ id: "itm_9", ordem_id: "ord_1", posicao: 3, pre_cadastro_id: "pre_1", medicamento_cadastro_id: null, valor_unitario: 0, valor_real: null });
  });
});
