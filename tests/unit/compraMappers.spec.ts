import { describe, expect, it } from "vitest";
import {
  COLUNAS_LISTA_COMPRA,
  COLUNAS_LISTA_ITEM,
  instanteIso,
  linhaDeItem,
  montarCompra,
  montarCompraDaLista,
  montarItem,
  numeroDoNumeric,
  numericParaBanco,
  type CompraRow,
  type ItemRow,
} from "../../server/utils/compraMappers";

// Mapeadores linha ↔ modelo da Compra (uma compra por fornecedor: compras + compra_itens). Dados fictícios (TESTE). O ponto mais delicado:
// o Postgres devolve numeric(14,2) como TEXTO ("1234.50", "0.00"); a conversão para número (e null) está em UM lugar, `numeroDoNumeric`.

const compraRow = (extra: Partial<CompraRow> = {}): CompraRow => ({
  id: "cmp_1",
  ano_mes: "2026-11",
  sequencia: 7,
  cancelada: false,
  fornecedor: "FORNECEDOR TESTE",
  envio: "Courier Simples",
  cia: "DHL",
  frete: "150.00",
  frete_real: null,
  empresa: "MAINZFARMA",
  numero_ordens: 3,
  paciente: "PACIENTE TESTE",
  processo_numero: "0000000-00.0000.0.00.0000/SP",
  medico: "Dr. Teste",
  local_aplicacao: "Clínica Teste",
  entrega: "Entrega Teste",
  contatos: "Contato Teste",
  termo_observacao: "",
  despachante: "DESPACHANTE TESTE",
  observacoes: "Obs de teste",
  consultor: "CONSULTOR TESTE",
  responsavel: "RESPONSAVEL TESTE",
  compra_particular: false,
  termo_posterior: true,
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

const itemRow = (extra: Partial<ItemRow> = {}): ItemRow => ({
  id: "itm_1",
  compra_id: "cmp_1",
  posicao: 1,
  medicamento: "TESTE MED A 500 mg - 2 vials per box",
  medicamento_cadastro_id: "med_1",
  pre_cadastro_id: null,
  brand: "bioequivalente",
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

describe("o item", () => {
  it("converte os numeric de texto, mantém os ids de cadastro e traz brand, sem apresentação nem referência", () => {
    expect(montarItem(itemRow())).toEqual({
      id: "itm_1",
      posicao: 1,
      medicamento: "TESTE MED A 500 mg - 2 vials per box",
      medicamentoCadastroId: "med_1",
      medicamentoCadastroNome: null,
      preCadastroId: null,
      laboratorio: "LAB A",
      brand: "bioequivalente",
      quantidade: "12 ampolas",
      temperatura: "2°C a 8°C",
      valorUnitario: 1234.5,
      valorReal: 0,
    });
  });

  it("valores vazios do banco viram null, textos null viram ''", () => {
    const i = montarItem(itemRow({ valor_unitario: null, valor_real: null, brand: null, laboratorio: null, quantidade: null, medicamento_cadastro_id: null, pre_cadastro_id: "pre_1" }));
    expect(i).toMatchObject({ valorUnitario: null, valorReal: null, brand: "", laboratorio: "", quantidade: "", medicamentoCadastroId: null, preCadastroId: "pre_1" });
  });

  it("brand: 'bioequivalente' e 'referencia' passam; qualquer outra coisa (o banco não tem check) vira ''", () => {
    expect(montarItem(itemRow({ brand: "referencia" })).brand).toBe("referencia");
    for (const lixo of ["xpto", "Referência", "REFERENCIA", " "]) expect(montarItem(itemRow({ brand: lixo })).brand, lixo).toBe("");
  });

  it("medicamentoCadastroNome: o nome do Cadastro quando o item está ligado e o medicamento existe; senão null", () => {
    const nomes = new Map([["med_1", "TESTE MED A"]]);
    expect(montarItem(itemRow(), undefined, nomes).medicamentoCadastroNome).toBe("TESTE MED A"); // ligado
    expect(montarItem(itemRow({ medicamento_cadastro_id: null }), undefined, nomes).medicamentoCadastroNome).toBeNull(); // não ligado
    expect(montarItem(itemRow({ medicamento_cadastro_id: "med_sumiu" }), undefined, nomes).medicamentoCadastroNome).toBeNull(); // Cadastro sem esse id
    expect(montarItem(itemRow()).medicamentoCadastroNome).toBeNull(); // quem não leu o Cadastro (a lista)
  });

  it("pré-cadastro: o item mostra o id só enquanto não virou item do Cadastro; o estado entra só com o pré-cadastro", () => {
    const status = new Map([["pre_1", "rejeitado" as const]]);
    expect(montarItem(itemRow({ medicamento_cadastro_id: null, pre_cadastro_id: "pre_1" }), status)).toMatchObject({ preCadastroId: "pre_1", preCadastroStatus: "rejeitado" });
    const ligado = montarItem(itemRow({ medicamento_cadastro_id: "med_1", pre_cadastro_id: "pre_1" }), status);
    expect(ligado.preCadastroId).toBeNull();
    expect(ligado).not.toHaveProperty("preCadastroStatus");
    expect(montarItem(itemRow({ medicamento_cadastro_id: null, pre_cadastro_id: null }), status)).not.toHaveProperty("preCadastroStatus");
  });
});

describe("a compra", () => {
  it("monta os campos (booleanos, NULL de 'ainda não decidiu', pendências, consultor) e normaliza as datas", () => {
    const c = montarCompra(compraRow(), []);
    expect(c).toMatchObject({
      id: "cmp_1",
      anoMes: "2026-11",
      sequencia: 7,
      cancelada: false,
      fornecedor: "FORNECEDOR TESTE",
      envio: "Courier Simples",
      cia: "DHL",
      empresa: "MAINZFARMA",
      numeroOrdens: 3,
      frete: 150,
      freteReal: null,
      consultor: "CONSULTOR TESTE",
      compraParticular: false,
      termoPosterior: true,
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
      itens: [],
    });
  });

  it("o contrato: exatamente as chaves combinadas e nenhuma das que saíram", () => {
    const chaves = Object.keys(montarCompra(compraRow(), [])).sort();
    expect(chaves).toEqual(
      [
        "id", "anoMes", "sequencia", "cancelada", "fornecedor", "envio", "cia", "empresa", "numeroOrdens", "frete", "freteReal", "paciente",
        "processoNumero", "compraParticular", "recorrente", "medico", "localAplicacao", "entrega", "contatos", "despachante",
        "pagamentoAlvara", "pagamentoMomento", "termoPosterior", "termoObservacao", "isencao", "documentos", "pendencias", "observacoes",
        "consultor", "responsavel", "criadoPor", "atualizadoPor", "createdAt", "updatedAt", "itens",
      ].sort(),
    );
  });

  it("textos null viram '', pendencias null vira [], criado_por null vira ''", () => {
    const c = montarCompra(compraRow({ paciente: null, observacoes: null, fornecedor: null, envio: null, cia: null, consultor: null, pendencias: null, criado_por: null, atualizado_por: null }), []);
    expect(c).toMatchObject({ paciente: "", observacoes: "", fornecedor: "", envio: "", cia: "", consultor: "", pendencias: [], criadoPor: "", atualizadoPor: "" });
  });

  it("frete '0.00' é zero e null é null; numeric de texto vira número", () => {
    expect(montarCompra(compraRow({ frete: "0.00", frete_real: "140.50" }), [])).toMatchObject({ frete: 0, freteReal: 140.5 });
    expect(montarCompra(compraRow({ frete: null }), []).frete).toBeNull();
  });

  it("empresa fora de FARMAURORA/MAINZFARMA vira FARMAURORA; numero_ordens inválido vira 1; texto numérico passa", () => {
    expect(montarCompra(compraRow({ empresa: "OUTRA" }), []).empresa).toBe("FARMAURORA");
    expect(montarCompra(compraRow({ empresa: null }), []).empresa).toBe("FARMAURORA");
    for (const lixo of [0, -2, 1.5, null, "x"]) expect(montarCompra(compraRow({ numero_ordens: lixo as never }), []).numeroOrdens, String(lixo)).toBe(1);
    expect(montarCompra(compraRow({ numero_ordens: "4" }), []).numeroOrdens).toBe(4);
  });

  it("pagamento_momento fora de 'vamos_pagar' e 'apos_awb' vira null; alvará e documentos null ficam null", () => {
    expect(montarCompra(compraRow({ pagamento_momento: "outro" }), []).pagamentoMomento).toBeNull();
    expect(montarCompra(compraRow({ pagamento_momento: "apos_awb" }), []).pagamentoMomento).toBe("apos_awb");
    expect(montarCompra(compraRow({ pagamento_momento: null, pagamento_alvara: null }), [])).toMatchObject({ pagamentoMomento: null, pagamentoAlvara: null });
  });

  it("os itens saem ordenados por posição e levam o nome do Cadastro e o estado do pré-cadastro", () => {
    const c = montarCompra(
      compraRow(),
      [itemRow({ id: "i3", posicao: 3, medicamento_cadastro_id: null, pre_cadastro_id: "pre_1" }), itemRow({ id: "i2", posicao: 2 }), itemRow({ id: "i1", posicao: 1, medicamento_cadastro_id: null })],
      new Map([["pre_1", "pendente" as const]]),
      new Map([["med_1", "TESTE MED A"]]),
    );
    expect(c.itens.map((i) => i.id)).toEqual(["i1", "i2", "i3"]);
    expect(c.itens.map((i) => i.medicamentoCadastroNome)).toEqual([null, "TESTE MED A", null]);
    expect(c.itens[2]).toMatchObject({ preCadastroId: "pre_1", preCadastroStatus: "pendente" });
  });

  it("não altera as linhas recebidas", () => {
    const itens = [itemRow({ id: "i2", posicao: 2 }), itemRow({ id: "i1", posicao: 1 })];
    const copia = JSON.parse(JSON.stringify(itens));
    montarCompra(compraRow(), itens);
    expect(itens).toEqual(copia);
  });
});

describe("a lista do mês", () => {
  it("lê só as colunas da linha: nada de valores, contatos, frete nem observações", () => {
    expect(COLUNAS_LISTA_COMPRA).toBe("id, ano_mes, sequencia, cancelada, paciente, numero_ordens, updated_at");
    expect(COLUNAS_LISTA_ITEM).toBe("id, compra_id, posicao, medicamento");
  });

  it("item da lista: só o necessário, com o número de ordens (o digitado) e sem status nem pendências", () => {
    const l = montarCompraDaLista(compraRow(), []);
    expect(l).toEqual({ id: "cmp_1", anoMes: "2026-11", sequencia: 7, cancelada: false, paciente: "PACIENTE TESTE", medicamentos: [], numeroOrdens: 3, atualizadoEm: "2026-11-19T12:30:15.250Z" });
    expect(montarCompraDaLista(compraRow({ cancelada: true }), []).cancelada).toBe(true);
  });

  it("os nomes dos medicamentos: únicos, por posição, sem vazios", () => {
    const l = montarCompraDaLista(compraRow(), [
      { id: "b", compra_id: "cmp_1", posicao: 2, medicamento: " REPETIDO " },
      { id: "c", compra_id: "cmp_1", posicao: 1, medicamento: "PRIMEIRO" },
      { id: "d", compra_id: "cmp_1", posicao: 3, medicamento: "REPETIDO" },
      { id: "e", compra_id: "cmp_1", posicao: 4, medicamento: "  " },
      { id: "f", compra_id: "cmp_1", posicao: 5, medicamento: null },
    ]);
    expect(l.medicamentos).toEqual(["PRIMEIRO", "REPETIDO"]);
  });
});

describe("modelo → linha", () => {
  it("a linha de um item leva a compra, a posição, o brand e os valores (null quando vazios), sem ordem_id nem apresentação", () => {
    const linha = linhaDeItem("cmp_1", 3, {
      id: "itm_9",
      medicamento: "TESTE MED A",
      medicamentoCadastroId: null,
      preCadastroId: "pre_1",
      laboratorio: "",
      brand: "referencia",
      quantidade: "5 caixas",
      temperatura: "",
      valorUnitario: 0,
      valorReal: null,
    });
    expect(linha).toEqual({
      id: "itm_9",
      compra_id: "cmp_1",
      posicao: 3,
      medicamento: "TESTE MED A",
      medicamento_cadastro_id: null,
      pre_cadastro_id: "pre_1",
      brand: "referencia",
      laboratorio: "",
      quantidade: "5 caixas",
      temperatura: "",
      valor_unitario: 0,
      valor_real: null,
    });
    expect(Object.keys(linha)).not.toContain("ordem_id");
    expect(Object.keys(linha)).not.toContain("apresentacao");
  });
});
