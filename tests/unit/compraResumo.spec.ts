import { describe, expect, it } from "vitest";
import { BLOCOS_DA_COMPRA, TEXTOS_RESUMO, type BlocoDaCompra } from "../../shared/constants/compraResumo";
import type {
  CompraResumoEntrada,
  DespachanteResumo,
  MedicamentoResumo,
  OrdemResumo,
} from "../../shared/types/compraResumo";
import {
  formatarValorResumo,
  juntarPorOrdem,
  limparTextoResumo,
  linhasDeTemperatura,
  montarResumoCompra,
  nomeDoMes,
  nomeEmTitleCase,
} from "../../shared/utils/compraResumo";

// Resumo da compra (o texto que o operacional cola no WhatsApp): função PURA. Só dados FICTÍCIOS com "TESTE": nenhum nome de
// paciente, processo, endereço ou telefone reais.

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────────────────────

const medA: MedicamentoResumo = {
  nome: "TESTE MED A",
  apresentacao: "500 mg c/ 30 comprimidos",
  referencia: "TESTE REFERENCIA",
  laboratorio: "LAB TESTE",
  quantidade: "12 ampolas",
  valorUnitario: 1234.5,
  valorReal: 1200,
  temperatura: "2°C a 8°C",
};

const ordemSimples: OrdemResumo = {
  fornecedor: "FORNECEDOR TESTE",
  envio: "Aéreo",
  frete: 150,
  freteReal: 140.5,
  medicamentos: [medA],
};

/** Uma compra completa (todos os blocos presentes). */
function compra(extra: Partial<CompraResumoEntrada> = {}): CompraResumoEntrada {
  return {
    numero: 5,
    mes: 11,
    ano: 2026,
    ordens: [ordemSimples],
    pagamento: { alvara: true, momento: "vamos_pagar" },
    termoPosterior: { sim: false },
    paciente: "PACIENTE TESTE DA SILVA",
    despachante: {
      courierSimples: false,
      nome: "DESPACHANTE TESTE",
      telefone: "+00 00 00000-0000",
      email: "teste@exemplo.invalid",
      contato: "CONTATO TESTE",
    },
    avisos: {
      isencao: true,
      isencaoPara: "Hospital Teste",
      documentos: true,
      pendencias: ["Receita", "Laudo"],
      observacoes: "Observação de teste",
    },
    vendedor: "VENDEDOR TESTE",
    responsavel: "RESPONSAVEL TESTE",
    processo: { particular: false, numero: "0000000-00.0000.0.00.0000/SP" },
    medico: "Dr. Teste",
    localAplicacao: "Clínica Teste, Rua Teste 0",
    localDeclarado: false,
    entrega: "Entrega Teste",
    contatos: "Contato Teste (00) 00000-0000",
    ...extra,
  };
}

/** Uma compra com o MÍNIMO: só um medicamento com nome. */
function compraMinima(extra: Partial<CompraResumoEntrada> = {}): CompraResumoEntrada {
  return {
    numero: 1,
    mes: 1,
    ano: 2026,
    ordens: [{ fornecedor: "", envio: "", medicamentos: [{ nome: "TESTE MED A" }] }],
    pagamento: { alvara: null, momento: null },
    termoPosterior: { sim: false },
    paciente: "",
    despachante: null,
    avisos: { isencao: false, documentos: null, pendencias: [] },
    vendedor: "",
    responsavel: "",
    processo: { particular: false },
    medico: "",
    localAplicacao: "",
    localDeclarado: false,
    entrega: "",
    contatos: "",
    ...extra,
  };
}

const med = (nome: string, extra: Partial<MedicamentoResumo> = {}): MedicamentoResumo => ({ nome, ...extra });

/** Só as linhas do bloco que começa com `prefixo` (o parágrafo inteiro, separado por linhas em branco). */
const paragrafo = (texto: string, prefixo: string): string[] =>
  (texto.split("\n\n").find((p) => p.startsWith(prefixo)) ?? "").split("\n").filter((l) => l !== "");

// ── (a) compra simples ────────────────────────────────────────────────────────────────────────────────────────

describe("(a) compra simples: 1 ordem, 1 medicamento", () => {
  it("a saída completa, literal", () => {
    expect(montarResumoCompra(compra())).toBe(
      [
        "*Compra 05 - Novembro/2026*",
        "",
        "Medicamento: TESTE MED A 500 mg c/ 30 comprimidos",
        "Referência/Bioequivalente: TESTE REFERENCIA",
        "Laboratório: LAB TESTE",
        "Quantidade: 12 ampolas",
        "Valor Unitário: US$ 1.234,50",
        "Valor Real: US$ 1.200,00",
        "Ordens: 1",
        "Frete: US$ 150,00",
        "Valor real do Frete: US$ 140,50",
        "Envio: Aéreo",
        "Fornecedor: FORNECEDOR TESTE",
        "CNPJ: Farmaurora",
        "Temperatura: 2°C a 8°C",
        "",
        "Pagamento: alvará na conta, vamos pagar",
        "Termo de pagamento posterior: n/a",
        "",
        "Paciente: *Paciente Teste da Silva*",
        "",
        "Despachante: DESPACHANTE TESTE",
        "Broker",
        "Phone: +00 00 00000-0000",
        "Email: teste@exemplo.invalid",
        "Contact: CONTATO TESTE",
        "",
        "Pedir isenção imposto ❗ para Hospital Teste",
        "Verificação de documento e validação de assinatura ✅",
        "Pendente: Receita, Laudo",
        "Obs.: Observação de teste",
        "",
        "Vendedor: VENDEDOR TESTE",
        "Responsável: RESPONSAVEL TESTE",
        "",
        "Número do processo: 0000000-00.0000.0.00.0000/SP",
        "",
        "Médico(a): Dr. Teste",
        "",
        "Local de aplicação: Clínica Teste, Rua Teste 0",
        "Entrega (Doctor/AJC): Entrega Teste",
        "",
        "Contatos: Contato Teste (00) 00000-0000",
      ].join("\n"),
    );
  });

  it("não termina com quebra de linha nem tem duas linhas em branco seguidas", () => {
    const texto = montarResumoCompra(compra());
    expect(texto.endsWith("\n")).toBe(false);
    expect(texto).not.toContain("\n\n\n");
    expect(texto.startsWith("\n")).toBe(false);
  });
});

// ── (b) 2 ordens, 3 medicamentos ─────────────────────────────────────────────────────────────────────────────

const ordensDiferentes: OrdemResumo[] = [
  {
    fornecedor: "FORNECEDOR TESTE UM",
    envio: "Aéreo",
    frete: 100,
    freteReal: null,
    medicamentos: [
      med("TESTE MED A", { apresentacao: "10 mg", referencia: "REF A", laboratorio: "LAB A", quantidade: "5 caixas", valorUnitario: 10, temperatura: "2°C a 8°C" }),
      med("TESTE MED B", { laboratorio: "LAB B", quantidade: "3 frascos", valorUnitario: 20.5, valorReal: 19, temperatura: "Ambiente" }),
    ],
  },
  {
    fornecedor: "FORNECEDOR TESTE DOIS",
    envio: "Marítimo",
    frete: null,
    freteReal: 55,
    medicamentos: [
      med("TESTE MED C", { apresentacao: "1 g", referencia: "REF C", quantidade: "10 unidades", valorReal: 7.25, temperatura: "2°c a 8°c" }),
    ],
  },
];

describe("(b) 2 ordens, 3 medicamentos, fornecedores diferentes", () => {
  it("a saída completa, literal: numeração, ' | ', '-' nos vazios parciais, por ordem e por temperatura", () => {
    expect(montarResumoCompra(compra({ ordens: ordensDiferentes }))).toBe(
      [
        "*Compra 05 - Novembro/2026*",
        "",
        "Medicamento 1: TESTE MED A 10 mg",
        "Medicamento 2: TESTE MED B",
        "Medicamento 3: TESTE MED C 1 g",
        "Referência/Bioequivalente: REF A | - | REF C",
        "Laboratório: LAB A | LAB B | -",
        "Quantidade: 5 caixas | 3 frascos | 10 unidades",
        "Valor Unitário: US$ 10,00 | US$ 20,50 | -",
        "Valor Real: - | US$ 19,00 | US$ 7,25",
        "Ordens: 2 - fornecedores distintos",
        "Frete: US$ 100,00 | -",
        "Valor real do Frete: - | US$ 55,00",
        "Envio: Aéreo | Marítimo",
        "Fornecedor: FORNECEDOR TESTE UM | FORNECEDOR TESTE DOIS",
        "CNPJ: Farmaurora",
        "Temperatura TESTE MED A, TESTE MED C: 2°C a 8°C",
        "Temperatura TESTE MED B: Ambiente",
        "",
        "Pagamento: alvará na conta, vamos pagar",
        "Termo de pagamento posterior: n/a",
        "",
        "Paciente: *Paciente Teste da Silva*",
        "",
        "Despachante: DESPACHANTE TESTE",
        "Broker",
        "Phone: +00 00 00000-0000",
        "Email: teste@exemplo.invalid",
        "Contact: CONTATO TESTE",
        "",
        "Pedir isenção imposto ❗ para Hospital Teste",
        "Verificação de documento e validação de assinatura ✅",
        "Pendente: Receita, Laudo",
        "Obs.: Observação de teste",
        "",
        "Vendedor: VENDEDOR TESTE",
        "Responsável: RESPONSAVEL TESTE",
        "",
        "Número do processo: 0000000-00.0000.0.00.0000/SP",
        "",
        "Médico(a): Dr. Teste",
        "",
        "Local de aplicação: Clínica Teste, Rua Teste 0",
        "Entrega (Doctor/AJC): Entrega Teste",
        "",
        "Contatos: Contato Teste (00) 00000-0000",
      ].join("\n"),
    );
  });

  it("com UM medicamento no total o rótulo não tem número; com mais de um (somando as ordens) tem", () => {
    expect(paragrafo(montarResumoCompra(compra()), "Medicamento")[0]).toMatch(/^Medicamento: /);
    const duasOrdensUmaCada = compra({
      ordens: [
        { fornecedor: "FORNECEDOR TESTE", envio: "Aéreo", medicamentos: [med("TESTE MED A")] },
        { fornecedor: "FORNECEDOR TESTE", envio: "Aéreo", medicamentos: [med("TESTE MED B")] },
      ],
    });
    const linhas = paragrafo(montarResumoCompra(duasOrdensUmaCada), "Medicamento");
    expect(linhas.slice(0, 2)).toEqual(["Medicamento 1: TESTE MED A", "Medicamento 2: TESTE MED B"]);
  });

  it("as linhas por medicamento e por ordem seguem a ordem das ordens e dos itens", () => {
    const invertidas = compra({ ordens: [...ordensDiferentes].reverse() });
    const linhas = paragrafo(montarResumoCompra(invertidas), "Medicamento");
    expect(linhas.slice(0, 3)).toEqual(["Medicamento 1: TESTE MED C 1 g", "Medicamento 2: TESTE MED A 10 mg", "Medicamento 3: TESTE MED B"]);
    expect(linhas).toContain("Envio: Marítimo | Aéreo");
  });
});

// ── (c) mesmo fornecedor ──────────────────────────────────────────────────────────────────────────────────────

describe("(c) 2 ordens com o mesmo fornecedor", () => {
  it("'Ordens: 2' sem 'fornecedores distintos' (mesmo com outra caixa, acento ou espaços repetidos)", () => {
    const ordens: OrdemResumo[] = [
      { fornecedor: "Fornecedor Teste Ação", envio: "Aéreo", medicamentos: [med("TESTE MED A")] },
      { fornecedor: "  FORNECEDOR   TESTE   ACAO ", envio: "Aéreo", medicamentos: [med("TESTE MED B")] },
    ];
    const linhas = paragrafo(montarResumoCompra(compra({ ordens })), "Medicamento");
    expect(linhas).toContain("Ordens: 2");
    expect(linhas.join("\n")).not.toContain("distintos");
    expect(linhas).toContain("Fornecedor: Fornecedor Teste Ação | FORNECEDOR TESTE ACAO");
  });

  it("uma ordem só: 'Ordens: 1'; fornecedor vazio numa das ordens não conta como diferente", () => {
    expect(paragrafo(montarResumoCompra(compra()), "Medicamento")).toContain("Ordens: 1");
    const ordens: OrdemResumo[] = [
      { fornecedor: "FORNECEDOR TESTE", envio: "", medicamentos: [med("TESTE MED A")] },
      { fornecedor: "", envio: "", medicamentos: [med("TESTE MED B")] },
    ];
    const linhas = paragrafo(montarResumoCompra(compra({ ordens })), "Medicamento");
    expect(linhas).toContain("Ordens: 2");
    expect(linhas).toContain("Fornecedor: FORNECEDOR TESTE | -");
  });
});

// ── (d) temperaturas ──────────────────────────────────────────────────────────────────────────────────────────

describe("(d) temperatura", () => {
  const temps = (...t: string[]): MedicamentoResumo[] => t.map((temperatura, i) => med(`TESTE MED ${i + 1}`, { apresentacao: "10 mg", temperatura }));

  it("todas iguais (sem acento nem caixa): uma linha só, com o texto da primeira", () => {
    expect(linhasDeTemperatura(temps("2°C a 8°C", "2°c a 8°c", "  2°C   a 8°C "))).toEqual(["Temperatura: 2°C a 8°C"]);
    expect(linhasDeTemperatura(temps("Refrigerado", "REFRIGERADO"))).toEqual(["Temperatura: Refrigerado"]);
  });

  it("diferentes: uma linha por temperatura, na ordem da primeira aparição, com os NOMES (sem a apresentação)", () => {
    expect(linhasDeTemperatura(temps("Ambiente", "2°C a 8°C", "ambiente", "-20°C"))).toEqual([
      "Temperatura TESTE MED 1, TESTE MED 3: Ambiente",
      "Temperatura TESTE MED 2: 2°C a 8°C",
      "Temperatura TESTE MED 4: -20°C",
    ]);
  });

  it("medicamento sem temperatura não entra na conta: se sobra uma só, é a linha simples; se nenhuma, nenhuma linha", () => {
    expect(linhasDeTemperatura([med("TESTE MED 1", { temperatura: "Ambiente" }), med("TESTE MED 2")])).toEqual(["Temperatura: Ambiente"]);
    expect(linhasDeTemperatura([med("TESTE MED 1"), med("TESTE MED 2", { temperatura: "  " })])).toEqual([]);
  });

  it("no texto: a temperatura vem depois do CNPJ, no fim do bloco de medicamentos", () => {
    const linhas = paragrafo(montarResumoCompra(compra({ ordens: ordensDiferentes })), "Medicamento");
    expect(linhas.slice(-3)).toEqual(["CNPJ: Farmaurora", "Temperatura TESTE MED A, TESTE MED C: 2°C a 8°C", "Temperatura TESTE MED B: Ambiente"]);
  });
});

// ── (e) campos vazios ─────────────────────────────────────────────────────────────────────────────────────────

describe("(e) campos vazios são omitidos", () => {
  it("a compra mínima: só título, medicamento, ordens, CNPJ, termo e as duas linhas pendentes", () => {
    expect(montarResumoCompra(compraMinima())).toBe(
      [
        "*Compra 01 - Janeiro/2026*",
        "",
        "Medicamento: TESTE MED A",
        "Ordens: 1",
        "CNPJ: Farmaurora",
        "",
        "Termo de pagamento posterior: n/a",
        "",
        "Local de aplicação: pendente ⏳",
        "Entrega (Doctor/AJC): pendente ⏳",
      ].join("\n"),
    );
  });

  it("vazio parcial vira '-' e a linha só some se TODOS estão vazios", () => {
    const ordens: OrdemResumo[] = [
      { fornecedor: "FORNECEDOR TESTE", envio: "Aéreo", frete: 10, medicamentos: [med("TESTE MED A", { quantidade: "1 caixa" }), med("TESTE MED B")] },
    ];
    const linhas = paragrafo(montarResumoCompra(compraMinima({ ordens })), "Medicamento");
    expect(linhas).toContain("Quantidade: 1 caixa | -");
    expect(linhas.some((l) => l.startsWith("Laboratório"))).toBe(false);
    expect(linhas.some((l) => l.startsWith("Referência"))).toBe(false);
    expect(linhas.some((l) => l.startsWith("Valor"))).toBe(false);
    expect(linhas).toContain("Frete: US$ 10,00");
    expect(linhas.some((l) => l.startsWith("Valor real do Frete"))).toBe(false);
  });

  it("textos só com espaços ou quebras de linha contam como vazios; os com espaços sobrando são aparados", () => {
    const texto = montarResumoCompra(
      compraMinima({ vendedor: "  \n  ", responsavel: "  RESPONSAVEL   TESTE \n", medico: "\t", contatos: "Linha um\nlinha dois" }),
    );
    expect(texto).not.toContain("Vendedor");
    expect(texto).not.toContain("Médico");
    expect(texto).toContain("Responsável: RESPONSAVEL TESTE");
    expect(texto).toContain("Contatos: Linha um linha dois");
  });

  it("valor 0 NÃO é vazio ('US$ 0,00'); null, undefined e NaN são", () => {
    const ordens: OrdemResumo[] = [{ fornecedor: "FORNECEDOR TESTE", envio: "", frete: 0, freteReal: Number.NaN, medicamentos: [med("TESTE MED A", { valorUnitario: 0 })] }];
    const linhas = paragrafo(montarResumoCompra(compraMinima({ ordens })), "Medicamento");
    expect(linhas).toContain("Valor Unitário: US$ 0,00");
    expect(linhas).toContain("Frete: US$ 0,00");
    expect(linhas.some((l) => l.startsWith("Valor real do Frete"))).toBe(false);
  });

  it("sem ordens: nada de 'Ordens' nem de medicamentos, mas o CNPJ continua", () => {
    const linhas = paragrafo(montarResumoCompra(compraMinima({ ordens: [] })), "CNPJ");
    expect(linhas).toEqual(["CNPJ: Farmaurora"]);
  });
});

// ── (f) termo posterior ───────────────────────────────────────────────────────────────────────────────────────

describe("(f) termo de pagamento posterior", () => {
  const termo = (t: CompraResumoEntrada["termoPosterior"]) => paragrafo(montarResumoCompra(compra({ termoPosterior: t })), "Pagamento").at(-1);

  it("n/a quando não; Sim quando sim; Sim com observação", () => {
    expect(termo({ sim: false })).toBe("Termo de pagamento posterior: n/a");
    expect(termo({ sim: true })).toBe("Termo de pagamento posterior: Sim");
    expect(termo({ sim: true, observacao: "  confirmar com o  financeiro " })).toBe("Termo de pagamento posterior: Sim - confirmar com o financeiro");
    expect(termo({ sim: true, observacao: "   " })).toBe("Termo de pagamento posterior: Sim");
  });

  it("a observação só vale com 'sim'", () => {
    expect(termo({ sim: false, observacao: "ignorada" })).toBe("Termo de pagamento posterior: n/a");
  });

  it("a linha do termo SEMPRE sai, mesmo sem nenhum outro dado de pagamento", () => {
    const texto = montarResumoCompra(compra({ pagamento: { alvara: null, momento: null } }));
    expect(paragrafo(texto, "Termo")).toEqual(["Termo de pagamento posterior: n/a"]);
  });
});

// ── (g) pagamento ─────────────────────────────────────────────────────────────────────────────────────────────

describe("(g) pagamento: as combinações de alvará e momento", () => {
  const casos: Array<[boolean | null, "vamos_pagar" | "apos_awb" | null, string | null]> = [
    [true, "vamos_pagar", "Pagamento: alvará na conta, vamos pagar"],
    [true, "apos_awb", "Pagamento: alvará na conta, após o envio da AWB"],
    [false, "vamos_pagar", "Pagamento: vamos pagar"],
    [null, "apos_awb", "Pagamento: após o envio da AWB"],
    [true, null, "Pagamento: alvará na conta"],
    [false, null, null],
    [null, null, null],
  ];
  for (const [alvara, momento, esperado] of casos) {
    it(`alvará ${String(alvara)} + momento ${String(momento)} → ${esperado ?? "linha omitida"}`, () => {
      // O bloco de pagamento é o 3º (título, medicamentos e ordens, pagamento): a linha do termo sempre vem nele, e sozinha quando
      // não há linha de pagamento.
      const bloco = montarResumoCompra(compra({ pagamento: { alvara, momento } })).split("\n\n")[2]!.split("\n");
      expect(bloco).toEqual(esperado === null ? ["Termo de pagamento posterior: n/a"] : [esperado, "Termo de pagamento posterior: n/a"]);
    });
  }
});

// ── (h) despachante ───────────────────────────────────────────────────────────────────────────────────────────

describe("(h) despachante", () => {
  // O bloco do despachante (o 5º: título, medicamentos, pagamento, paciente, despachante) com o "Broker" dentro dele.
  const bloco = (d: DespachanteResumo | null): string[] => {
    const texto = montarResumoCompra(compra({ despachante: d }));
    return (texto.split("\n\n").find((p) => p.startsWith("Despachante") || p.startsWith("Broker")) ?? "").split("\n").filter((l) => l !== "");
  };

  it("null: o bloco some (sem linha em branco sobrando)", () => {
    const texto = montarResumoCompra(compra({ despachante: null }));
    expect(texto).not.toContain("Despachante");
    expect(texto).not.toContain("Broker");
    expect(texto).not.toContain("\n\n\n");
    expect(texto.split("\n\n").length).toBe(BLOCOS_DA_COMPRA.length - 1);
  });

  it("courier simples: só 'Despachante: N/A', mesmo que tenha nome e contatos preenchidos", () => {
    expect(bloco({ courierSimples: true })).toEqual(["Despachante: N/A"]);
    expect(bloco({ courierSimples: true, nome: "DESPACHANTE TESTE", telefone: "+00 00 00000-0000" })).toEqual(["Despachante: N/A"]);
  });

  it("com broker completo: 'Broker' e as linhas Phone, Email e Contact, no mesmo bloco do despachante", () => {
    const d: DespachanteResumo = { courierSimples: false, nome: "DESPACHANTE TESTE", telefone: "+00 00 00000-0000", email: "teste@exemplo.invalid", contato: "CONTATO TESTE" };
    expect(bloco(d)).toEqual(["Despachante: DESPACHANTE TESTE", "Broker", "Phone: +00 00 00000-0000", "Email: teste@exemplo.invalid", "Contact: CONTATO TESTE"]);
  });

  it("sem broker: só o nome, sem a palavra 'Broker'", () => {
    expect(bloco({ courierSimples: false, nome: "DESPACHANTE TESTE" })).toEqual(["Despachante: DESPACHANTE TESTE"]);
    expect(bloco({ courierSimples: false, nome: "DESPACHANTE TESTE", telefone: "  ", email: "", contato: undefined })).toEqual(["Despachante: DESPACHANTE TESTE"]);
  });

  it("broker parcial: só as linhas que existem", () => {
    expect(bloco({ courierSimples: false, nome: "DESPACHANTE TESTE", email: "teste@exemplo.invalid" })).toEqual([
      "Despachante: DESPACHANTE TESTE",
      "Broker",
      "Email: teste@exemplo.invalid",
    ]);
  });

  it("sem nome mas com broker: a linha 'Despachante' não sai; sem nome e sem broker, o bloco some", () => {
    expect(bloco({ courierSimples: false, telefone: "+00 00 00000-0000" })).toEqual(["Broker", "Phone: +00 00 00000-0000"]);
    expect(montarResumoCompra(compra({ despachante: { courierSimples: false } }))).not.toContain("Despachante");
  });
});

// ── avisos ────────────────────────────────────────────────────────────────────────────────────────────────────

describe("avisos: isenção, documentos, pendências e observações", () => {
  const linhasDeAvisos = (a: Partial<CompraResumoEntrada["avisos"]>): string[] => {
    const texto = montarResumoCompra(compra({ avisos: { isencao: false, documentos: null, pendencias: [], ...a } }));
    return texto.split("\n").filter((l) => /^(Pedir isenção|Verificação|Pendente:|Obs\.:)/.test(l));
  };

  it("isenção sem e com destinatário", () => {
    expect(linhasDeAvisos({ isencao: true })).toEqual(["Pedir isenção imposto ❗"]);
    expect(linhasDeAvisos({ isencao: true, isencaoPara: "  Hospital   Teste " })).toEqual(["Pedir isenção imposto ❗ para Hospital Teste"]);
    expect(linhasDeAvisos({ isencao: false, isencaoPara: "Hospital Teste" })).toEqual([]);
  });

  it("documentos: ✅, ❌ e nulo omite", () => {
    expect(linhasDeAvisos({ documentos: true })).toEqual(["Verificação de documento e validação de assinatura ✅"]);
    expect(linhasDeAvisos({ documentos: false })).toEqual(["Verificação de documento e validação de assinatura ❌"]);
    expect(linhasDeAvisos({ documentos: null })).toEqual([]);
  });

  it("pendências unidas por ', ' (vazias e repetidas em espaço são limpas) e observações", () => {
    expect(linhasDeAvisos({ pendencias: ["Receita", "  ", " Laudo   médico ", ""] })).toEqual(["Pendente: Receita, Laudo médico"]);
    expect(linhasDeAvisos({ pendencias: ["", "  "] })).toEqual([]);
    expect(linhasDeAvisos({ observacoes: "  Obs   de teste " })).toEqual(["Obs.: Obs de teste"]);
  });

  it("a ordem é isenção, documentos, pendências e observações", () => {
    expect(linhasDeAvisos({ isencao: true, documentos: false, pendencias: ["A"], observacoes: "B" })).toEqual([
      "Pedir isenção imposto ❗",
      "Verificação de documento e validação de assinatura ❌",
      "Pendente: A",
      "Obs.: B",
    ]);
  });

  it("sem nenhum aviso o bloco some", () => {
    const texto = montarResumoCompra(compra({ avisos: { isencao: false, documentos: null, pendencias: [] } }));
    expect(texto).not.toMatch(/isenção|Verificação|Pendente:|Obs\./);
    expect(texto).not.toContain("\n\n\n");
  });
});

// ── (i) processo ──────────────────────────────────────────────────────────────────────────────────────────────

describe("(i) processo", () => {
  const linhaProcesso = (processo: CompraResumoEntrada["processo"]) =>
    montarResumoCompra(compra({ processo })).split("\n").filter((l) => l.startsWith("Número do processo"));

  it("particular: 'Compra particular' (mesmo que traga número)", () => {
    expect(linhaProcesso({ particular: true })).toEqual(["Número do processo: Compra particular"]);
    expect(linhaProcesso({ particular: true, numero: "0000000-00.0000.0.00.0000/SP" })).toEqual(["Número do processo: Compra particular"]);
  });

  it("com número (inclusive com /UF no fim, sem validar) ou sem número", () => {
    expect(linhaProcesso({ particular: false, numero: " 0000000-00.0000.0.00.0000/SP " })).toEqual(["Número do processo: 0000000-00.0000.0.00.0000/SP"]);
    expect(linhaProcesso({ particular: false, numero: "qualquer coisa, não é validado" })).toEqual(["Número do processo: qualquer coisa, não é validado"]);
    expect(linhaProcesso({ particular: false })).toEqual([]);
    expect(linhaProcesso({ particular: false, numero: "  " })).toEqual([]);
  });
});

// ── (j) local e entrega ───────────────────────────────────────────────────────────────────────────────────────

describe("(j) local de aplicação e entrega", () => {
  const linhasLocal = (e: Partial<CompraResumoEntrada>) => paragrafo(montarResumoCompra(compra(e)), "Local");

  it("vazios: as DUAS linhas saem com 'pendente ⏳'", () => {
    expect(linhasLocal({ localAplicacao: "", entrega: "" })).toEqual(["Local de aplicação: pendente ⏳", "Entrega (Doctor/AJC): pendente ⏳"]);
    expect(linhasLocal({ localAplicacao: "   ", entrega: "\n" })).toEqual(["Local de aplicação: pendente ⏳", "Entrega (Doctor/AJC): pendente ⏳"]);
  });

  it("só um vazio: só ele fica pendente", () => {
    expect(linhasLocal({ localAplicacao: "Clínica Teste", entrega: "" })).toEqual(["Local de aplicação: Clínica Teste", "Entrega (Doctor/AJC): pendente ⏳"]);
    expect(linhasLocal({ localAplicacao: "", entrega: "Entrega Teste" })).toEqual(["Local de aplicação: pendente ⏳", "Entrega (Doctor/AJC): Entrega Teste"]);
  });

  it("local declarado muda o rótulo (e 'Doctor/AJC' é rótulo fixo)", () => {
    expect(linhasLocal({ localAplicacao: "Clínica Teste", localDeclarado: true, entrega: "Entrega Teste" })).toEqual([
      "Local de aplicação (declarado): Clínica Teste",
      "Entrega (Doctor/AJC): Entrega Teste",
    ]);
  });
});

// ── (k) Title Case ────────────────────────────────────────────────────────────────────────────────────────────

describe("(k) Title Case do paciente", () => {
  it("de, da, do, das, dos e 'e' ficam em minúsculas, menos na primeira palavra", () => {
    expect(nomeEmTitleCase("PACIENTE TESTE DA SILVA")).toBe("Paciente Teste da Silva");
    expect(nomeEmTitleCase("maria das dores e josé dos santos de oliveira do vale")).toBe("Maria das Dores e José dos Santos de Oliveira do Vale");
    expect(nomeEmTitleCase("DA TESTE")).toBe("Da Teste");
    expect(nomeEmTitleCase("e TESTE")).toBe("E Teste");
  });

  it("acentos preservados, espaços repetidos colapsados, hífen também é inicial", () => {
    expect(nomeEmTitleCase("  ÁLVARO   TESTE  ÇÃO ")).toBe("Álvaro Teste Ção");
    expect(nomeEmTitleCase("ana-clara TESTE")).toBe("Ana-Clara Teste");
  });

  it("siglas NÃO são tratadas (Title Case simples): 'JR' vira 'Jr', 'II' vira 'Ii'", () => {
    expect(nomeEmTitleCase("TESTE SILVA JR")).toBe("Teste Silva Jr");
    expect(nomeEmTitleCase("TESTE II")).toBe("Teste Ii");
  });

  it("vazio e só espaços viram vazio, e então a linha do paciente some", () => {
    expect(nomeEmTitleCase("   ")).toBe("");
    expect(montarResumoCompra(compra({ paciente: "  " }))).not.toContain("Paciente:");
  });

  it("no texto: 'Paciente: *Nome*'", () => {
    expect(paragrafo(montarResumoCompra(compra({ paciente: "paciente TESTE dos SANTOS" })), "Paciente")).toEqual(["Paciente: *Paciente Teste dos Santos*"]);
  });
});

// ── (l) título ────────────────────────────────────────────────────────────────────────────────────────────────

describe("(l) título: mês por extenso e número com 2 ou 3 dígitos", () => {
  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const titulo = (e: Partial<CompraResumoEntrada>) => montarResumoCompra(compra(e)).split("\n")[0];

  it("os 12 meses, com inicial maiúscula e acento", () => {
    MESES.forEach((nome, i) => {
      expect(nomeDoMes(i + 1)).toBe(nome);
      expect(titulo({ numero: 1, mes: i + 1, ano: 2026 })).toBe(`*Compra 01 - ${nome}/2026*`);
    });
  });

  it("número com 2 dígitos (completa com zero) e com 3 (não corta)", () => {
    expect(titulo({ numero: 7 })).toBe("*Compra 07 - Novembro/2026*");
    expect(titulo({ numero: 42 })).toBe("*Compra 42 - Novembro/2026*");
    expect(titulo({ numero: 99 })).toBe("*Compra 99 - Novembro/2026*");
    expect(titulo({ numero: 100 })).toBe("*Compra 100 - Novembro/2026*");
    expect(titulo({ numero: 123 })).toBe("*Compra 123 - Novembro/2026*");
    expect(titulo({ numero: 1234 })).toBe("*Compra 1234 - Novembro/2026*");
  });

  it("ano com 4 dígitos", () => {
    expect(titulo({ ano: 2027 })).toBe("*Compra 05 - Novembro/2027*");
  });

  it("mês fora de 1 a 12, número inválido e ano inválido: a parte some, o resto fica", () => {
    expect(nomeDoMes(0)).toBe("");
    expect(nomeDoMes(13)).toBe("");
    expect(nomeDoMes(2.5)).toBe("");
    expect(nomeDoMes(Number.NaN)).toBe("");
    expect(titulo({ mes: 13 })).toBe("*Compra 05 - 2026*");
    expect(titulo({ numero: 0 })).toBe("*Compra - Novembro/2026*");
    expect(titulo({ mes: 0, ano: 0 })).toBe("*Compra 05*");
  });
});

// ── auxiliares ────────────────────────────────────────────────────────────────────────────────────────────────

describe("auxiliares", () => {
  it("limparTextoResumo: apara, junta espaços e quebras de linha, e trata não-texto como vazio", () => {
    expect(limparTextoResumo("  a \n\t b  ")).toBe("a b");
    expect(limparTextoResumo(undefined)).toBe("");
    expect(limparTextoResumo(null)).toBe("");
    expect(limparTextoResumo("   ")).toBe("");
  });

  it("formatarValorResumo: 'US$ 0,00' com milhar e centavos; vazio, null e NaN dão ''", () => {
    expect(formatarValorResumo(0)).toBe("US$ 0,00");
    expect(formatarValorResumo(5)).toBe("US$ 5,00");
    expect(formatarValorResumo(1234.5)).toBe("US$ 1.234,50");
    expect(formatarValorResumo(1234567.891)).toBe("US$ 1.234.567,89");
    expect(formatarValorResumo(0.005)).toMatch(/^US\$ 0,0[01]$/);
    expect(formatarValorResumo(null)).toBe("");
    expect(formatarValorResumo(undefined)).toBe("");
    expect(formatarValorResumo(Number.NaN)).toBe("");
    expect(formatarValorResumo(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("juntarPorOrdem: ' | ' na ordem, '-' nos vazios e '' quando todos vazios", () => {
    expect(juntarPorOrdem(["a", "b", "c"])).toBe("a | b | c");
    expect(juntarPorOrdem(["a", "", undefined, "  ", "d"])).toBe("a | - | - | - | d");
    expect(juntarPorOrdem(["", undefined, null, "  "])).toBe("");
    expect(juntarPorOrdem(["só um"])).toBe("só um");
    expect(juntarPorOrdem([])).toBe("");
  });

  it("as frases fixas vêm de TEXTOS_RESUMO (o resumo usa o texto de lá)", () => {
    const texto = montarResumoCompra(compra({ avisos: { isencao: true, documentos: true, pendencias: [] } }));
    expect(texto).toContain(TEXTOS_RESUMO.isencao);
    expect(texto).toContain(TEXTOS_RESUMO.documentosOk);
    expect(montarResumoCompra(compraMinima())).toContain(TEXTOS_RESUMO.pendenteMarca);
  });
});

// ── (m) imutabilidade ─────────────────────────────────────────────────────────────────────────────────────────

function congelar<T>(valor: T): T {
  if (valor !== null && typeof valor === "object" && !Object.isFrozen(valor)) {
    Object.freeze(valor);
    for (const filho of Object.values(valor as object)) congelar(filho);
  }
  return valor;
}

describe("(m) sem efeitos colaterais", () => {
  it("não muda a entrada (Object.freeze profundo não derruba, e uma cópia profunda é igual depois)", () => {
    const entrada = compra({ ordens: ordensDiferentes });
    const copia = structuredClone(entrada);
    const congelada = congelar(structuredClone(entrada));
    expect(() => montarResumoCompra(congelada)).not.toThrow();
    expect(montarResumoCompra(congelada)).toBe(montarResumoCompra(entrada));
    montarResumoCompra(entrada);
    expect(entrada).toEqual(copia);
  });

  it("não reordena as ordens nem os medicamentos da entrada", () => {
    const entrada = compra({ ordens: ordensDiferentes });
    const antes = JSON.stringify(entrada);
    montarResumoCompra(entrada);
    expect(JSON.stringify(entrada)).toBe(antes);
  });

  it("é determinística: a mesma entrada dá o mesmo texto, sempre", () => {
    const entrada = compra({ ordens: ordensDiferentes });
    expect(montarResumoCompra(entrada)).toBe(montarResumoCompra(entrada));
    expect(montarResumoCompra(structuredClone(entrada))).toBe(montarResumoCompra(entrada));
  });
});

// ── (n) BLOCOS_DA_COMPRA ──────────────────────────────────────────────────────────────────────────────────────

describe("(n) BLOCOS_DA_COMPRA", () => {
  // O primeiro texto que só aquele bloco escreve.
  const MARCADOR: Record<BlocoDaCompra, string> = {
    titulo: "*Compra ",
    medicamentos_e_ordens: "Medicamento: ",
    pagamento: "Pagamento: ",
    paciente: "Paciente: ",
    despachante: "Despachante: ",
    avisos: "Pedir isenção imposto",
    vendedor_responsavel: "Vendedor: ",
    processo: "Número do processo: ",
    medico: "Médico(a): ",
    local_entrega: "Local de aplicação: ",
    contatos: "Contatos: ",
  };

  it("o array não tem id repetido nem faltando (tem exatamente os ids conhecidos)", () => {
    expect(new Set(BLOCOS_DA_COMPRA).size).toBe(BLOCOS_DA_COMPRA.length);
    expect([...BLOCOS_DA_COMPRA].sort()).toEqual(Object.keys(MARCADOR).sort());
    expect(BLOCOS_DA_COMPRA).toHaveLength(11);
  });

  it("numa compra completa os blocos aparecem no texto exatamente na ordem do array, um parágrafo por bloco", () => {
    const texto = montarResumoCompra(compra());
    const paragrafos = texto.split("\n\n");
    expect(paragrafos).toHaveLength(BLOCOS_DA_COMPRA.length);
    BLOCOS_DA_COMPRA.forEach((id, i) => {
      expect(paragrafos[i]!.startsWith(MARCADOR[id]), `${id} deveria ser o parágrafo ${i + 1}`).toBe(true);
    });
    const posicoes = BLOCOS_DA_COMPRA.map((id) => texto.indexOf(MARCADOR[id]));
    expect(posicoes.every((p) => p >= 0)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
  });

  it("o título é o primeiro bloco e os contatos o último; o corpo do resumo começa pelos medicamentos", () => {
    expect(BLOCOS_DA_COMPRA[0]).toBe("titulo");
    expect(BLOCOS_DA_COMPRA[1]).toBe("medicamentos_e_ordens");
    expect(BLOCOS_DA_COMPRA.at(-1)).toBe("contatos");
  });

  it("bloco sem linha some junto com a linha em branco que o separaria (nunca fica separador sobrando)", () => {
    const texto = montarResumoCompra(compraMinima());
    expect(texto.split("\n\n")).toHaveLength(4); // título, medicamentos, termo, local/entrega
    expect(texto).not.toMatch(/\n\n\n|^\n|\n$/);
  });
});
