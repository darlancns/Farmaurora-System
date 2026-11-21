import { describe, expect, it } from "vitest";
import { BLOCOS_DA_COMPRA, TEXTOS_RESUMO } from "../../shared/constants/compraResumo";
import { MODAIS_ENVIO } from "../../shared/constants/processos";
import type { BlocoDoResumo, CompraResumoEntrada, DespachanteResumo, MedicamentoResumo } from "../../shared/types/compraResumo";
import {
  formatarValorResumo,
  gruposDeTemperatura,
  juntarPorOrdem,
  limparTextoResumo,
  montarResumo,
  montarResumoCompra,
  nomeDoMes,
  nomeEmTitleCase,
  resumoParaTexto,
  rotuloDoBrand,
  textoDoEnvio,
} from "../../shared/utils/compraResumo";

// Resumo da compra (o texto que o operacional cola no WhatsApp): função PURA com dois modos — "copia" (o texto) e "modelo" (todos os
// rótulos, valor cru). Só dados FICTÍCIOS com "TESTE": nenhum nome de paciente, processo, endereço ou telefone reais.

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────────────────────────

const medA: MedicamentoResumo = {
  medicamento: "TESTE MED A 500 mg",
  laboratorio: "LAB TESTE",
  brand: "bioequivalente",
  quantidade: "12 ampolas",
  temperatura: "2°C a 8°C",
  valorUnitario: 1234.5,
  valorReal: 1200,
};

/** Uma compra completa (todos os campos preenchidos): 1 medicamento, Air Cargo com cia. */
function compra(extra: Partial<CompraResumoEntrada> = {}): CompraResumoEntrada {
  return {
    numero: 5,
    mes: 11,
    ano: 2026,
    medicamentos: [medA],
    numeroOrdens: 2,
    frete: 150,
    freteReal: 140.5,
    envio: "Air Cargo",
    cia: "Emirates",
    fornecedor: "FORNECEDOR TESTE",
    empresa: "FARMAURORA",
    pagamento: { alvara: true, momento: "vamos_pagar" },
    termoPosterior: { sim: false },
    paciente: "PACIENTE TESTE DA SILVA",
    despachante: { nome: "DESPACHANTE TESTE", telefone: "+00 00 00000-0000", email: "teste@exemplo.invalid", contato: "CONTATO TESTE" },
    avisos: { isencao: true, documentos: true, pendencias: ["Receita", "Laudo"], observacoes: "Observação de teste", recorrente: true },
    consultor: "Consultor Teste",
    responsavel: "Responsável Teste",
    processo: { particular: false, numero: "0000000-00.0000.0.00.0000/SP" },
    medico: "Dr. Teste",
    localAplicacao: "Clínica Teste, Rua Teste 0",
    entrega: "Entrega Teste",
    contatos: "Contato Teste (00) 00000-0000",
    ...extra,
  };
}

/** Uma compra QUASE VAZIA: só o que o servidor preenche sozinho (número, mês, ano, empresa, 1 ordem) e um medicamento digitado. */
function compraQuaseVazia(extra: Partial<CompraResumoEntrada> = {}): CompraResumoEntrada {
  return {
    numero: 1,
    mes: 1,
    ano: 2026,
    medicamentos: [{ medicamento: "TESTE MED A" }],
    numeroOrdens: 1,
    envio: "",
    cia: "",
    fornecedor: "",
    empresa: "FARMAURORA",
    pagamento: { alvara: null, momento: null },
    termoPosterior: { sim: false },
    paciente: "",
    despachante: null,
    avisos: { isencao: false, documentos: null, pendencias: [], recorrente: false },
    consultor: "",
    responsavel: "",
    processo: { particular: false },
    medico: "",
    localAplicacao: "",
    entrega: "",
    contatos: "",
    ...extra,
  };
}

/** Uma compra TOTALMENTE vazia: nenhum medicamento (o formulário recém-aberto, antes de digitar). */
const compraTotalmenteVazia = (extra: Partial<CompraResumoEntrada> = {}): CompraResumoEntrada => compraQuaseVazia({ medicamentos: [], ...extra });

const copia = (e: CompraResumoEntrada): string => montarResumoCompra(e);
const modelo = (e: CompraResumoEntrada): BlocoDoResumo[] => montarResumo(e, "modelo");
const idsDe = (blocos: readonly BlocoDoResumo[]): string[] => blocos.flatMap((b) => b.linhas.map((l) => l.id));

/** As linhas do parágrafo que começa com `prefixo` (o bloco inteiro, separado por linhas em branco). */
const paragrafo = (texto: string, prefixo: string): string[] =>
  (texto.split("\n\n").find((p) => p.startsWith(prefixo)) ?? "").split("\n").filter((l) => l !== "");

// ── (a) 1 medicamento, tudo preenchido (Air Cargo com cia) ────────────────────────────────────────────────────

describe("(a) 1 medicamento, tudo preenchido", () => {
  it("a saída completa, literal, na ORDEM DO FORMULÁRIO", () => {
    expect(copia(compra())).toBe(
      [
        "*Compra 05 - Novembro/2026*",
        "",
        "Medicamento: TESTE MED A 500 mg",
        "Laboratório: LAB TESTE",
        "Brand: Bioequivalente",
        "Quantidade: 12 ampolas",
        "Ordens: 2",
        "Valor Unitário: US$ 1.234,50",
        "Valor Real: US$ 1.200,00",
        "Frete: US$ 150,00",
        "Valor real do Frete: US$ 140,50",
        "Temperatura: 2°C a 8°C",
        "Envio: Air Cargo (Emirates)",
        "Fornecedor: FORNECEDOR TESTE",
        "CNPJ: Farmaurora",
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
        "Obs.: Observação de teste",
        "Pedir isenção imposto ❗",
        "Verificação de documento e validação de assinatura ✅",
        "Pendente: Receita, Laudo",
        "Recorrente",
        "",
        "Consultor: Consultor Teste",
        "Responsável: Responsável Teste",
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
    const texto = copia(compra());
    expect(texto.endsWith("\n")).toBe(false);
    expect(texto).not.toContain("\n\n\n");
    expect(texto.startsWith("\n")).toBe(false);
  });
});

// ── (b) 2 medicamentos com laboratórios e brands diferentes ──────────────────────────────────────────────────

describe("(b) 2 medicamentos com laboratórios e brands diferentes", () => {
  const dois: MedicamentoResumo[] = [
    { medicamento: "TESTE MED A", laboratorio: "LAB A", brand: "bioequivalente", quantidade: "10 caixas", temperatura: "2°C a 8°C", valorUnitario: 10, valorReal: 9 },
    { medicamento: "TESTE MED B", laboratorio: "LAB B", brand: "referencia", quantidade: "", temperatura: "Ambiente", valorUnitario: 20, valorReal: null },
  ];

  it("a saída do bloco de medicamentos, literal: numeração, ' | ', '-' nos vazios parciais, Ordens e temperaturas por medicamento", () => {
    const texto = copia(compra({ medicamentos: dois, numeroOrdens: 1 }));
    expect(paragrafo(texto, "Medicamento")).toEqual([
      "Medicamento 1: TESTE MED A",
      "Medicamento 2: TESTE MED B",
      "Laboratório: LAB A | LAB B",
      "Brand: Bioequivalente | Referência",
      "Quantidade: 10 caixas | -",
      "Ordens: 1",
      "Valor Unitário: US$ 10,00 | US$ 20,00",
      "Valor Real: US$ 9,00 | -",
      "Frete: US$ 150,00",
      "Valor real do Frete: US$ 140,50",
      "Temperatura TESTE MED A: 2°C a 8°C",
      "Temperatura TESTE MED B: Ambiente",
      "Envio: Air Cargo (Emirates)",
      "Fornecedor: FORNECEDOR TESTE",
      "CNPJ: Farmaurora",
    ]);
  });

  it("com UM medicamento o rótulo não tem número; com mais de um, tem", () => {
    expect(copia(compra())).toContain("Medicamento: TESTE MED A 500 mg");
    expect(copia(compra())).not.toContain("Medicamento 1");
    expect(copia(compra({ medicamentos: dois }))).toContain("Medicamento 1: TESTE MED A\nMedicamento 2: TESTE MED B");
  });

  it("os campos por medicamento seguem a ordem dos medicamentos da entrada", () => {
    const invertidos = [dois[1]!, dois[0]!];
    const linhas = paragrafo(copia(compra({ medicamentos: invertidos })), "Medicamento");
    expect(linhas).toContain("Laboratório: LAB B | LAB A");
    expect(linhas).toContain("Brand: Referência | Bioequivalente");
  });

  it("um medicamento sem texto some (o número das linhas segue a posição), mas os campos dele continuam alinhados", () => {
    const linhas = paragrafo(copia(compra({ medicamentos: [{ medicamento: "", laboratorio: "LAB X" }, { medicamento: "TESTE MED B", laboratorio: "LAB B" }] })), "Medicamento");
    expect(linhas.slice(0, 2)).toEqual(["Medicamento 2: TESTE MED B", "Laboratório: LAB X | LAB B"]);
  });
});

// ── (c) Courier Simples ──────────────────────────────────────────────────────────────────────────────────────

describe("(c) Courier Simples: é o ENVIO; despachante vira N/A", () => {
  const simples = (extra: Partial<CompraResumoEntrada> = {}) => compra({ envio: "Courier Simples", cia: "DHL", ...extra });

  it("'Despachante: N/A', mesmo com nome e contatos preenchidos, e nada de 'Broker'", () => {
    const texto = copia(simples());
    expect(paragrafo(texto, "Despachante")).toEqual(["Despachante: N/A"]);
    expect(texto).not.toContain("Broker");
    expect(texto).not.toContain("DESPACHANTE TESTE");
  });

  it("também sem despachante escolhido: 'Despachante: N/A' (a regra é do envio)", () => {
    expect(paragrafo(copia(simples({ despachante: null })), "Despachante")).toEqual(["Despachante: N/A"]);
  });

  it("o Envio sai com a cia: 'Courier Simples (DHL)'", () => {
    expect(copia(simples())).toContain("Envio: Courier Simples (DHL)");
  });

  it("outros envios (Air Cargo, Courier Formal) mantêm o despachante da compra", () => {
    for (const envio of ["Air Cargo", "Courier Formal"]) expect(paragrafo(copia(compra({ envio, cia: "" })), "Despachante")[0]).toBe("Despachante: DESPACHANTE TESTE");
  });

  it("no modelo, o despachante do Courier Simples fica VAZIO (o 'N/A' é da cópia)", () => {
    const linha = modelo(simples()).flatMap((b) => b.linhas).find((l) => l.id === "despachante")!;
    expect(linha).toMatchObject({ rotulo: "Despachante", valor: "", vazio: true });
  });
});

// ── (d) Envio com e sem cia ──────────────────────────────────────────────────────────────────────────────────

describe("(d) Envio: Air Cargo com e sem cia", () => {
  it("com cia: 'Air Cargo (Emirates)', com parênteses", () => {
    expect(copia(compra({ envio: "Air Cargo", cia: "Emirates" }))).toContain("Envio: Air Cargo (Emirates)\n");
  });

  it("sem cia: só o modal", () => {
    expect(copia(compra({ envio: "Air Cargo", cia: "" }))).toContain("Envio: Air Cargo\n");
    expect(copia(compra({ envio: "Air Cargo", cia: "   " }))).toContain("Envio: Air Cargo\n");
    expect(copia(compra({ envio: "Air Cargo", cia: "" })).split("\n").find((l) => l.startsWith("Envio"))).toBe("Envio: Air Cargo");
  });

  it("cia sem envio não sai; sem envio nem cia, nenhuma linha de Envio", () => {
    expect(copia(compra({ envio: "", cia: "Emirates" }))).not.toContain("Envio");
    expect(copia(compra({ envio: "", cia: "Emirates" }))).not.toContain("Emirates");
    expect(copia(compra({ envio: "", cia: "" }))).not.toContain("Envio:");
  });

  it("textoDoEnvio: apara espaços e junta com um espaço e parênteses", () => {
    expect(textoDoEnvio("  Courier   Formal ", " DHL ")).toBe("Courier Formal (DHL)");
    expect(textoDoEnvio("Air Cargo", "")).toBe("Air Cargo");
    expect(textoDoEnvio("", "DHL")).toBe("");
  });

  it("todos os modais conhecidos saem como vêm", () => {
    for (const modal of MODAIS_ENVIO) expect(copia(compra({ envio: modal, cia: "" }))).toContain(`Envio: ${modal}\n`);
  });
});

// ── (e) local e entrega vazios ───────────────────────────────────────────────────────────────────────────────

describe("(e) local de aplicação e entrega", () => {
  const linhasLocal = (e: Partial<CompraResumoEntrada>) => paragrafo(copia(compra(e)), "Local");

  it("vazios: as DUAS linhas saem com 'pendente ⏳'", () => {
    expect(linhasLocal({ localAplicacao: "", entrega: "" })).toEqual(["Local de aplicação: pendente ⏳", "Entrega (Doctor/AJC): pendente ⏳"]);
    expect(linhasLocal({ localAplicacao: "   ", entrega: "\n" })).toEqual(["Local de aplicação: pendente ⏳", "Entrega (Doctor/AJC): pendente ⏳"]);
  });

  it("só um vazio: só ele fica pendente", () => {
    expect(linhasLocal({ localAplicacao: "Clínica Teste", entrega: "" })).toEqual(["Local de aplicação: Clínica Teste", "Entrega (Doctor/AJC): pendente ⏳"]);
    expect(linhasLocal({ localAplicacao: "", entrega: "Entrega Teste" })).toEqual(["Local de aplicação: pendente ⏳", "Entrega (Doctor/AJC): Entrega Teste"]);
  });

  it("não há 'declarado': o rótulo do local é sempre o mesmo", () => {
    expect(TEXTOS_RESUMO).not.toHaveProperty("localAplicacaoDeclarado");
    expect(copia(compra())).not.toMatch(/declarado/i);
  });
});

// ── (f) termo posterior ──────────────────────────────────────────────────────────────────────────────────────

describe("(f) termo de pagamento posterior", () => {
  const termo = (t: CompraResumoEntrada["termoPosterior"]) => paragrafo(copia(compra({ termoPosterior: t })), "Pagamento").at(-1);

  it("n/a quando não; Sim quando sim; Sim com observação", () => {
    expect(termo({ sim: false })).toBe("Termo de pagamento posterior: n/a");
    expect(termo({ sim: true })).toBe("Termo de pagamento posterior: Sim");
    expect(termo({ sim: true, observacao: "  confirmar com o  financeiro " })).toBe("Termo de pagamento posterior: Sim - confirmar com o financeiro");
    expect(termo({ sim: true, observacao: "   " })).toBe("Termo de pagamento posterior: Sim");
  });

  it("a observação só vale com 'sim'", () => {
    expect(termo({ sim: false, observacao: "ignorada" })).toBe("Termo de pagamento posterior: n/a");
  });

  it("a linha do termo SEMPRE sai na cópia, mesmo sem nenhum outro dado de pagamento", () => {
    expect(paragrafo(copia(compra({ pagamento: { alvara: null, momento: null } })), "Termo")).toEqual(["Termo de pagamento posterior: n/a"]);
  });
});

// ── (g) pagamento ────────────────────────────────────────────────────────────────────────────────────────────

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
      const bloco = copia(compra({ pagamento: { alvara, momento } })).split("\n\n")[2]!.split("\n");
      expect(bloco).toEqual(esperado === null ? ["Termo de pagamento posterior: n/a"] : [esperado, "Termo de pagamento posterior: n/a"]);
    });
  }
});

// ── (h) despachante ──────────────────────────────────────────────────────────────────────────────────────────

describe("(h) despachante", () => {
  const bloco = (d: DespachanteResumo | null): string[] => paragrafo(copia(compra({ despachante: d })), "Despachante").concat(paragrafo(copia(compra({ despachante: d })), "Broker"));

  it("null: o bloco some (sem linha em branco sobrando)", () => {
    const texto = copia(compra({ despachante: null }));
    expect(texto).not.toContain("Despachante");
    expect(texto).not.toContain("Broker");
    expect(texto).not.toContain("\n\n\n");
    expect(texto.split("\n\n").length).toBe(BLOCOS_DA_COMPRA.length - 1);
  });

  it("com broker completo: 'Broker' e as linhas Phone, Email e Contact, no mesmo bloco do despachante", () => {
    expect(bloco({ nome: "DESPACHANTE TESTE", telefone: "+00 00 00000-0000", email: "teste@exemplo.invalid", contato: "CONTATO TESTE" })).toEqual([
      "Despachante: DESPACHANTE TESTE",
      "Broker",
      "Phone: +00 00 00000-0000",
      "Email: teste@exemplo.invalid",
      "Contact: CONTATO TESTE",
    ]);
  });

  it("sem broker: só o nome, sem a palavra 'Broker'", () => {
    expect(bloco({ nome: "DESPACHANTE TESTE" })).toEqual(["Despachante: DESPACHANTE TESTE"]);
    expect(bloco({ nome: "DESPACHANTE TESTE", telefone: "  ", email: "", contato: undefined })).toEqual(["Despachante: DESPACHANTE TESTE"]);
  });

  it("broker parcial: só as linhas que existem", () => {
    expect(bloco({ nome: "DESPACHANTE TESTE", email: "teste@exemplo.invalid" })).toEqual(["Despachante: DESPACHANTE TESTE", "Broker", "Email: teste@exemplo.invalid"]);
  });

  it("sem nome mas com broker: a linha 'Despachante' não sai; sem nome e sem broker, o bloco some", () => {
    expect(copia(compra({ despachante: { telefone: "+00 00 00000-0000" } }))).toContain("Broker\nPhone: +00 00 00000-0000");
    expect(copia(compra({ despachante: { telefone: "+00 00 00000-0000" } }))).not.toContain("Despachante");
    expect(copia(compra({ despachante: {} }))).not.toContain("Despachante");
  });
});

// ── avisos ───────────────────────────────────────────────────────────────────────────────────────────────────

describe("avisos: observações, isenção, documentos, pendências e recorrente (a ordem do formulário)", () => {
  const linhasDeAvisos = (a: Partial<CompraResumoEntrada["avisos"]>): string[] => {
    const texto = copia(compra({ avisos: { isencao: false, documentos: null, pendencias: [], recorrente: false, ...a } }));
    return texto.split("\n").filter((l) => /^(Pedir isenção|Verificação|Pendente:|Obs\.:|Recorrente)/.test(l));
  };

  it("isenção: só 'Pedir isenção imposto ❗' (sem 'para quem', que não existe mais)", () => {
    expect(linhasDeAvisos({ isencao: true })).toEqual(["Pedir isenção imposto ❗"]);
    expect(linhasDeAvisos({ isencao: false })).toEqual([]);
    expect(TEXTOS_RESUMO).not.toHaveProperty("isencaoPara");
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

  it("a ordem é Obs., Isenção, Verificação, Pendente e Recorrente (a Recorrente logo depois de Pendente)", () => {
    expect(linhasDeAvisos({ isencao: true, documentos: false, pendencias: ["A"], observacoes: "B", recorrente: true })).toEqual([
      "Obs.: B",
      "Pedir isenção imposto ❗",
      "Verificação de documento e validação de assinatura ❌",
      "Pendente: A",
      "Recorrente",
    ]);
  });

  it("recorrente: só quando true; fica no MESMO bloco dos outros avisos e antes do Consultor", () => {
    expect(TEXTOS_RESUMO.recorrente).toBe("Recorrente");
    expect(linhasDeAvisos({ recorrente: true })).toEqual(["Recorrente"]);
    expect(linhasDeAvisos({ recorrente: false })).toEqual([]);
    const texto = copia(compra({ avisos: { isencao: true, documentos: null, pendencias: [], observacoes: "B", recorrente: true } }));
    expect(texto).toContain("Obs.: B\nPedir isenção imposto ❗\nRecorrente\n\n");
    expect(texto.indexOf("Recorrente")).toBeLessThan(texto.indexOf("Consultor:"));
  });

  it("só recorrente já basta para o bloco de avisos aparecer", () => {
    const sem = copia(compra({ avisos: { isencao: false, documentos: null, pendencias: [], recorrente: false } }));
    const com = copia(compra({ avisos: { isencao: false, documentos: null, pendencias: [], recorrente: true } }));
    expect(com.split("\n\n").length).toBe(sem.split("\n\n").length + 1);
  });

  it("sem nenhum aviso o bloco some", () => {
    const texto = copia(compra({ avisos: { isencao: false, documentos: null, pendencias: [], recorrente: false } }));
    expect(texto).not.toMatch(/isenção|Verificação|Pendente:|Obs\.|Recorrente/);
    expect(texto).not.toContain("\n\n\n");
  });
});

// ── processo ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("processo", () => {
  const linhaProcesso = (processo: CompraResumoEntrada["processo"]) => copia(compra({ processo })).split("\n").filter((l) => l.startsWith("Número do processo"));

  it("particular: 'Compra particular' (mesmo que traga número)", () => {
    expect(linhaProcesso({ particular: true })).toEqual(["Número do processo: Compra particular"]);
    expect(linhaProcesso({ particular: true, numero: "0000000-00.0000.0.00.0000/SP" })).toEqual(["Número do processo: Compra particular"]);
  });

  it("com número (inclusive com /UF no fim, sem validar) ou sem número", () => {
    expect(linhaProcesso({ particular: false, numero: " 0000000-00.0000.0.00.0000/SP " })).toEqual(["Número do processo: 0000000-00.0000.0.00.0000/SP"]);
    expect(linhaProcesso({ particular: false })).toEqual([]);
    expect(linhaProcesso({ particular: false, numero: "  " })).toEqual([]);
  });
});

// ── Title Case ───────────────────────────────────────────────────────────────────────────────────────────────

describe("Title Case do paciente (e da empresa no CNPJ)", () => {
  it("de, da, do, das, dos e 'e' ficam em minúsculas, menos na primeira palavra", () => {
    expect(nomeEmTitleCase("PACIENTE TESTE DA SILVA")).toBe("Paciente Teste da Silva");
    expect(nomeEmTitleCase("maria das dores e josé dos santos de oliveira do vale")).toBe("Maria das Dores e José dos Santos de Oliveira do Vale");
    expect(nomeEmTitleCase("DA TESTE")).toBe("Da Teste");
  });

  it("acentos preservados, espaços repetidos colapsados, hífen também é inicial; siglas NÃO são tratadas", () => {
    expect(nomeEmTitleCase("  ÁLVARO   TESTE  ÇÃO ")).toBe("Álvaro Teste Ção");
    expect(nomeEmTitleCase("ana-clara TESTE")).toBe("Ana-Clara Teste");
    expect(nomeEmTitleCase("TESTE SILVA JR")).toBe("Teste Silva Jr");
  });

  it("vazio e só espaços viram vazio, e então a linha do paciente some", () => {
    expect(nomeEmTitleCase("   ")).toBe("");
    expect(copia(compra({ paciente: "  " }))).not.toContain("Paciente:");
  });

  it("no texto: 'Paciente: *Nome*' (o nome em negrito)", () => {
    expect(paragrafo(copia(compra({ paciente: "paciente TESTE dos SANTOS" })), "Paciente")).toEqual(["Paciente: *Paciente Teste dos Santos*"]);
  });
});

// ── CNPJ: a empresa em Title Case ────────────────────────────────────────────────────────────────────────────

describe("CNPJ: a empresa da compra, em Title Case", () => {
  it("FARMAURORA → 'Farmaurora'; MAINZFARMA → 'Mainzfarma'", () => {
    expect(copia(compra({ empresa: "FARMAURORA" }))).toContain("CNPJ: Farmaurora\n");
    expect(copia(compra({ empresa: "MAINZFARMA" }))).toContain("CNPJ: Mainzfarma\n");
  });

  it("empresa vazia: a linha não sai na cópia (e aparece vazia no modelo)", () => {
    expect(copia(compra({ empresa: "" }))).not.toContain("CNPJ");
    expect(modelo(compra({ empresa: "" })).flatMap((b) => b.linhas).find((l) => l.id === "cnpj")).toMatchObject({ vazio: true });
  });

  it("o texto fixo 'Farmaurora' não existe mais nas frases (vem da empresa)", () => {
    expect(TEXTOS_RESUMO).not.toHaveProperty("cnpjValor");
  });
});

// ── Brand ────────────────────────────────────────────────────────────────────────────────────────────────────

describe("Brand: o rótulo que o Follow-Up mostra", () => {
  it("bioequivalente → Bioequivalente; referencia → Referência (as constantes do Follow-Up)", () => {
    expect(rotuloDoBrand("bioequivalente")).toBe("Bioequivalente");
    expect(rotuloDoBrand("referencia")).toBe("Referência");
  });

  it("vazio, desconhecido e null não saem", () => {
    for (const b of ["", "generico", null, undefined]) expect(rotuloDoBrand(b)).toBe("");
    expect(copia(compra({ medicamentos: [{ ...medA, brand: "" }] }))).not.toContain("Brand");
    expect(copia(compra({ medicamentos: [{ ...medA, brand: "generico" }] }))).not.toContain("Brand");
  });

  it("vários medicamentos: ' | ' com '-' nos sem brand; todos sem brand: a linha some", () => {
    const meds = [{ ...medA, brand: "referencia" }, { ...medA, brand: "" }, { ...medA, brand: "bioequivalente" }];
    expect(copia(compra({ medicamentos: meds }))).toContain("Brand: Referência | - | Bioequivalente");
    expect(copia(compra({ medicamentos: meds.map((m) => ({ ...m, brand: "" })) }))).not.toContain("Brand");
  });
});

// ── Ordens ───────────────────────────────────────────────────────────────────────────────────────────────────

describe("Ordens: o número, SEMPRE na cópia", () => {
  it("'Ordens: N' para 1, 2 e 10 (inclusive quando é 1)", () => {
    for (const n of [1, 2, 10]) expect(copia(compra({ numeroOrdens: n }))).toContain(`Ordens: ${n}\n`);
    expect(copia(compraQuaseVazia())).toContain("Ordens: 1");
  });

  it("sai logo depois da Quantidade e antes do Valor Unitário", () => {
    const linhas = paragrafo(copia(compra()), "Medicamento");
    expect(linhas.indexOf("Ordens: 2")).toBe(linhas.findIndex((l) => l.startsWith("Quantidade")) + 1);
    expect(linhas.indexOf("Ordens: 2")).toBe(linhas.findIndex((l) => l.startsWith("Valor Unitário")) - 1);
  });

  it("número inválido (0, negativo, fracionário, NaN): a linha não sai", () => {
    for (const n of [0, -1, 1.5, Number.NaN]) expect(copia(compra({ numeroOrdens: n }))).not.toContain("Ordens");
  });

  it("não há mais 'fornecedores distintos' nem ordens como objetos", () => {
    expect(TEXTOS_RESUMO).not.toHaveProperty("fornecedoresDistintos");
    expect(copia(compra())).not.toContain("distintos");
  });
});

// ── Temperatura ──────────────────────────────────────────────────────────────────────────────────────────────

describe("temperatura", () => {
  const temps = (...t: string[]): MedicamentoResumo[] => t.map((temperatura, i) => ({ medicamento: `TESTE MED ${i + 1}`, temperatura }));

  it("todas iguais (sem acento nem caixa): um grupo só, com o texto da primeira", () => {
    expect(gruposDeTemperatura(temps("2°C a 8°C", "2°c a 8°c", "  2°C   a 8°C "))).toEqual([{ rotulo: "Temperatura", valor: "2°C a 8°C" }]);
    expect(gruposDeTemperatura(temps("Refrigerado", "REFRIGERADO"))).toEqual([{ rotulo: "Temperatura", valor: "Refrigerado" }]);
  });

  it("diferentes: um grupo por temperatura, na ordem da primeira aparição, com os NOMES dos medicamentos", () => {
    expect(gruposDeTemperatura(temps("Ambiente", "2°C a 8°C", "ambiente", "-20°C"))).toEqual([
      { rotulo: "Temperatura TESTE MED 1, TESTE MED 3", valor: "Ambiente" },
      { rotulo: "Temperatura TESTE MED 2", valor: "2°C a 8°C" },
      { rotulo: "Temperatura TESTE MED 4", valor: "-20°C" },
    ]);
  });

  it("medicamento sem temperatura não entra na conta: se sobra uma só, é a linha simples; se nenhuma, nenhum grupo", () => {
    expect(gruposDeTemperatura([{ medicamento: "TESTE MED 1", temperatura: "Ambiente" }, { medicamento: "TESTE MED 2" }])).toEqual([{ rotulo: "Temperatura", valor: "Ambiente" }]);
    expect(gruposDeTemperatura([{ medicamento: "TESTE MED 1" }, { medicamento: "TESTE MED 2", temperatura: "  " }])).toEqual([]);
  });

  it("no texto: a Temperatura vem DEPOIS do Valor real do Frete e ANTES do Envio", () => {
    const linhas = paragrafo(copia(compra()), "Medicamento");
    const i = linhas.findIndex((l) => l.startsWith("Temperatura"));
    expect(linhas[i - 1]).toBe("Valor real do Frete: US$ 140,50");
    expect(linhas[i + 1]).toBe("Envio: Air Cargo (Emirates)");
  });

  it("vários grupos no texto: uma linha por temperatura, com ids estáveis (temperatura, temperatura_2)", () => {
    const meds = [{ medicamento: "TESTE MED A", temperatura: "Ambiente" }, { medicamento: "TESTE MED B", temperatura: "2°C a 8°C" }];
    expect(idsDe(modelo(compra({ medicamentos: meds }))).filter((id) => id.startsWith("temperatura"))).toEqual(["temperatura", "temperatura_2"]);
  });
});

// ── Campos vazios ────────────────────────────────────────────────────────────────────────────────────────────

describe("campos vazios são omitidos na cópia", () => {
  it("a compra quase vazia: só título, medicamento, ordens, CNPJ, termo e as duas linhas pendentes", () => {
    expect(copia(compraQuaseVazia())).toBe(
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

  it("a compra TOTALMENTE vazia (sem medicamento): sem a linha de Medicamento, o resto igual", () => {
    expect(copia(compraTotalmenteVazia())).toBe(
      [
        "*Compra 01 - Janeiro/2026*",
        "",
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
    const meds: MedicamentoResumo[] = [{ medicamento: "TESTE MED A", quantidade: "1 caixa" }, { medicamento: "TESTE MED B" }];
    const linhas = paragrafo(copia(compraQuaseVazia({ medicamentos: meds, frete: 10 })), "Medicamento");
    expect(linhas).toContain("Quantidade: 1 caixa | -");
    expect(linhas.some((l) => l.startsWith("Laboratório"))).toBe(false);
    expect(linhas.some((l) => l.startsWith("Brand"))).toBe(false);
    expect(linhas.some((l) => l.startsWith("Valor Unit"))).toBe(false);
    expect(linhas).toContain("Frete: US$ 10,00");
    expect(linhas.some((l) => l.startsWith("Valor real do Frete"))).toBe(false);
  });

  it("textos só com espaços ou quebras de linha contam como vazios; os com espaços sobrando são aparados", () => {
    const texto = copia(compraQuaseVazia({ consultor: "  \n  ", responsavel: "  RESPONSAVEL   TESTE \n", medico: "\t", contatos: "Linha um\nlinha dois" }));
    expect(texto).not.toContain("Consultor");
    expect(texto).not.toContain("Médico");
    expect(texto).toContain("Responsável: RESPONSAVEL TESTE");
    expect(texto).toContain("Contatos: Linha um linha dois");
  });

  it("valor 0 NÃO é vazio ('US$ 0,00'); null, undefined e NaN são", () => {
    const linhas = paragrafo(copia(compraQuaseVazia({ medicamentos: [{ medicamento: "TESTE MED A", valorUnitario: 0 }], frete: 0, freteReal: Number.NaN })), "Medicamento");
    expect(linhas).toContain("Valor Unitário: US$ 0,00");
    expect(linhas).toContain("Frete: US$ 0,00");
    expect(linhas.some((l) => l.startsWith("Valor real do Frete"))).toBe(false);
  });

  it("o Consultor (e não 'Vendedor') abre o bloco de responsáveis", () => {
    expect(paragrafo(copia(compra()), "Consultor")).toEqual(["Consultor: Consultor Teste", "Responsável: Responsável Teste"]);
    expect(copia(compra())).not.toContain("Vendedor");
    expect(TEXTOS_RESUMO).not.toHaveProperty("vendedor");
  });
});

// ── título ───────────────────────────────────────────────────────────────────────────────────────────────────

describe("título: mês por extenso e número com 2 ou 3 dígitos", () => {
  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const titulo = (e: Partial<CompraResumoEntrada>) => copia(compra(e)).split("\n")[0];

  it("os 12 meses, com inicial maiúscula e acento", () => {
    MESES.forEach((nome, i) => {
      expect(nomeDoMes(i + 1)).toBe(nome);
      expect(titulo({ numero: 1, mes: i + 1, ano: 2026 })).toBe(`*Compra 01 - ${nome}/2026*`);
    });
  });

  it("número com 2 dígitos (completa com zero) e com 3 ou 4 (não corta)", () => {
    expect(titulo({ numero: 7 })).toBe("*Compra 07 - Novembro/2026*");
    expect(titulo({ numero: 99 })).toBe("*Compra 99 - Novembro/2026*");
    expect(titulo({ numero: 100 })).toBe("*Compra 100 - Novembro/2026*");
    expect(titulo({ numero: 1234 })).toBe("*Compra 1234 - Novembro/2026*");
  });

  it("ano com 4 dígitos; mês, número e ano inválidos: a parte some, o resto fica", () => {
    expect(titulo({ ano: 2027 })).toBe("*Compra 05 - Novembro/2027*");
    expect(titulo({ mes: 13 })).toBe("*Compra 05 - 2026*");
    expect(titulo({ mes: 0, ano: 0 })).toBe("*Compra 05*");
    expect(titulo({ numero: 0 })).toBe("*Compra - Novembro/2026*");
    expect(nomeDoMes(0)).toBe("");
    expect(nomeDoMes(13)).toBe("");
    expect(nomeDoMes(1.5)).toBe("");
  });
});

// ── auxiliares ───────────────────────────────────────────────────────────────────────────────────────────────

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
    const texto = copia(compra({ avisos: { isencao: true, documentos: true, pendencias: [], recorrente: false } }));
    expect(texto).toContain(TEXTOS_RESUMO.isencao);
    expect(texto).toContain(`${TEXTOS_RESUMO.documentos} ${TEXTOS_RESUMO.documentosOk}`);
    expect(copia(compraQuaseVazia())).toContain(TEXTOS_RESUMO.pendenteMarca);
  });
});

// ── sem efeitos colaterais ───────────────────────────────────────────────────────────────────────────────────

function congelar<T>(valor: T): T {
  if (valor !== null && typeof valor === "object" && !Object.isFrozen(valor)) {
    Object.freeze(valor);
    for (const filho of Object.values(valor as object)) congelar(filho);
  }
  return valor;
}

describe("sem efeitos colaterais", () => {
  const dois = compra({ medicamentos: [medA, { medicamento: "TESTE MED B", temperatura: "Ambiente", brand: "referencia" }] });

  it("não muda a entrada (Object.freeze profundo não derruba, e uma cópia profunda é igual depois) — nos dois modos", () => {
    const copiaProfunda = structuredClone(dois);
    const congelada = congelar(structuredClone(dois));
    expect(() => montarResumo(congelada, "copia")).not.toThrow();
    expect(() => montarResumo(congelada, "modelo")).not.toThrow();
    expect(montarResumoCompra(congelada)).toBe(montarResumoCompra(dois));
    montarResumo(dois, "modelo");
    montarResumo(dois, "copia");
    expect(dois).toEqual(copiaProfunda);
  });

  it("não reordena os medicamentos da entrada e é determinística", () => {
    const antes = JSON.stringify(dois);
    montarResumoCompra(dois);
    expect(JSON.stringify(dois)).toBe(antes);
    expect(montarResumoCompra(structuredClone(dois))).toBe(montarResumoCompra(dois));
    expect(montarResumo(dois, "modelo")).toEqual(montarResumo(structuredClone(dois), "modelo"));
  });
});

// ── BLOCOS_DA_COMPRA ─────────────────────────────────────────────────────────────────────────────────────────

describe("BLOCOS_DA_COMPRA", () => {
  it("os ids, na ordem: título, medicamentos e ordens, pagamento, paciente, despachante, avisos, consultor/responsável, processo, médico, local/entrega, contatos", () => {
    expect([...BLOCOS_DA_COMPRA]).toEqual([
      "titulo",
      "medicamentos_e_ordens",
      "pagamento",
      "paciente",
      "despachante",
      "avisos",
      "consultor_responsavel",
      "processo",
      "medico",
      "local_entrega",
      "contatos",
    ]);
    expect(new Set(BLOCOS_DA_COMPRA).size).toBe(BLOCOS_DA_COMPRA.length);
    expect(BLOCOS_DA_COMPRA as readonly string[]).not.toContain("vendedor_responsavel");
  });

  it("numa compra completa os blocos aparecem no texto exatamente na ordem do array, um parágrafo por bloco, e montarResumo devolve o mesmo", () => {
    const blocos = montarResumo(compra(), "copia");
    expect(blocos.map((b) => b.id)).toEqual([...BLOCOS_DA_COMPRA]);
    const paragrafos = copia(compra()).split("\n\n");
    expect(paragrafos).toHaveLength(BLOCOS_DA_COMPRA.length);
    blocos.forEach((b, i) => expect(paragrafos[i]!.split("\n")).toHaveLength(b.linhas.length));
  });

  it("bloco sem linha some junto com a linha em branco que o separaria (nunca fica separador sobrando)", () => {
    const texto = copia(compraQuaseVazia());
    expect(texto.split("\n\n")).toHaveLength(4); // título, medicamentos, termo, local/entrega
    expect(texto).not.toMatch(/\n\n\n|^\n|\n$/);
    expect(montarResumo(compraQuaseVazia(), "copia").map((b) => b.id)).toEqual(["titulo", "medicamentos_e_ordens", "pagamento", "local_entrega"]);
  });
});

// ── resumoParaTexto ──────────────────────────────────────────────────────────────────────────────────────────

describe("resumoParaTexto", () => {
  const blocos: BlocoDoResumo[] = [
    { id: "titulo", linhas: [{ id: "titulo", rotulo: "", valor: "Compra 01", vazio: false, negrito: true }] },
    { id: "paciente", linhas: [{ id: "paciente", rotulo: "Paciente", valor: "Nome Teste", vazio: false, negrito: true }] },
    { id: "avisos", linhas: [{ id: "recorrente", rotulo: "Recorrente", valor: "", vazio: false }, { id: "medico", rotulo: "Médico(a)", valor: "", vazio: true }] },
    { id: "contatos", linhas: [] },
  ];

  it("blocos separados por UMA linha em branco; negrito com asteriscos; marcador só com o rótulo; vazio com 'Rótulo:'; bloco sem linha não conta", () => {
    expect(resumoParaTexto(blocos)).toBe("*Compra 01*\n\nPaciente: *Nome Teste*\n\nRecorrente\nMédico(a):");
  });

  it("sem blocos: texto vazio; sem quebra no fim", () => {
    expect(resumoParaTexto([])).toBe("");
    expect(resumoParaTexto(blocos).endsWith("\n")).toBe(false);
  });

  it("montarResumoCompra = resumoParaTexto(montarResumo(entrada, 'copia'))", () => {
    for (const e of [compra(), compraQuaseVazia(), compraTotalmenteVazia()]) expect(montarResumoCompra(e)).toBe(resumoParaTexto(montarResumo(e, "copia")));
  });
});

// ── modo "modelo" ────────────────────────────────────────────────────────────────────────────────────────────

const IDS_NA_ORDEM_DO_FORMULARIO = [
  "titulo",
  "medicamento",
  "laboratorio",
  "brand",
  "quantidade",
  "ordens",
  "valor_unitario",
  "valor_real",
  "frete",
  "frete_real",
  "temperatura",
  "envio",
  "fornecedor",
  "cnpj",
  "pagamento",
  "termo_posterior",
  "paciente",
  "despachante",
  "observacoes",
  "isencao",
  "documentos",
  "pendencias",
  "recorrente",
  "consultor",
  "responsavel",
  "processo",
  "medico",
  "local_aplicacao",
  "entrega",
  "contatos",
];

describe("modo 'modelo': todos os rótulos, na ordem do formulário", () => {
  it("os ids das linhas, EXATAMENTE nesta ordem: título · Medicamento · Laboratório · Brand · Quantidade · Ordens · Valor unitário · Valor real · Frete · Valor real do frete · Temperatura · Envio · Fornecedor · CNPJ · Pagamento · Termo · Paciente · Despachante · Obs. · Isenção · Verificação · Pendente · Recorrente · Consultor · Responsável · Processo · Médico · Local · Entrega · Contatos", () => {
    expect(idsDe(modelo(compraTotalmenteVazia()))).toEqual(IDS_NA_ORDEM_DO_FORMULARIO);
    expect(idsDe(modelo(compraQuaseVazia()))).toEqual(IDS_NA_ORDEM_DO_FORMULARIO);
    expect(idsDe(modelo(compra({ despachante: { nome: "DESPACHANTE TESTE" } })))).toEqual(IDS_NA_ORDEM_DO_FORMULARIO);
  });

  it("a ordem dos blocos é a de BLOCOS_DA_COMPRA, nos dois modos", () => {
    expect(modelo(compra()).map((b) => b.id)).toEqual([...BLOCOS_DA_COMPRA]);
    expect(modelo(compraTotalmenteVazia()).map((b) => b.id)).toEqual([...BLOCOS_DA_COMPRA]);
  });

  it("as mudanças em relação à ordem antiga: Laboratório antes do Brand; Ordens logo depois da Quantidade; Temperatura depois do Frete real; Obs. antes da Isenção; Recorrente logo depois de Pendente", () => {
    const ids = idsDe(modelo(compraQuaseVazia()));
    const antes = (a: string, b: string): boolean => ids.indexOf(a) < ids.indexOf(b);
    expect(antes("laboratorio", "brand")).toBe(true);
    expect(ids.indexOf("ordens")).toBe(ids.indexOf("quantidade") + 1);
    expect(ids.indexOf("temperatura")).toBe(ids.indexOf("frete_real") + 1);
    expect(antes("observacoes", "isencao")).toBe(true);
    expect(ids.indexOf("recorrente")).toBe(ids.indexOf("pendencias") + 1);
  });

  it("os ids são únicos e estáveis (não dependem do texto)", () => {
    const ids = idsDe(modelo(compra()));
    expect(new Set(ids).size).toBe(ids.length);
    expect(idsDe(modelo(compra({ paciente: "OUTRO", medico: "" })))).toEqual(ids);
  });

  it("com mais de um medicamento os ids de Medicamento ganham o número (medicamento_1, medicamento_2) e o resto não muda", () => {
    const ids = idsDe(modelo(compra({ medicamentos: [medA, { medicamento: "TESTE MED B" }] })));
    expect(ids.slice(0, 4)).toEqual(["titulo", "medicamento_1", "medicamento_2", "laboratorio"]);
  });

  it("com contatos do despachante (vêm do Cadastro), as linhas Broker/Phone/Email/Contact entram logo depois de Despachante", () => {
    const ids = idsDe(modelo(compra()));
    const i = ids.indexOf("despachante");
    expect(ids.slice(i, i + 5)).toEqual(["despachante", "broker", "broker_telefone", "broker_email", "broker_contato"]);
    expect(ids[i + 5]).toBe("observacoes");
  });

  it("o modelo da compra TOTALMENTE vazia, em texto: só os rótulos (o título e o número de ordens, que sempre existem, têm valor)", () => {
    expect(resumoParaTexto(montarResumo(compraTotalmenteVazia(), "modelo"))).toBe(
      [
        "*Compra 01 - Janeiro/2026*",
        "",
        "Medicamento:",
        "Laboratório:",
        "Brand:",
        "Quantidade:",
        "Ordens: 1",
        "Valor Unitário:",
        "Valor Real:",
        "Frete:",
        "Valor real do Frete:",
        "Temperatura:",
        "Envio:",
        "Fornecedor:",
        "CNPJ: Farmaurora",
        "",
        "Pagamento:",
        "Termo de pagamento posterior:",
        "",
        "Paciente:",
        "",
        "Despachante:",
        "",
        "Obs.:",
        "Pedir isenção imposto ❗:",
        "Verificação de documento e validação de assinatura:",
        "Pendente:",
        "Recorrente:",
        "",
        "Consultor:",
        "Responsável:",
        "",
        "Número do processo:",
        "",
        "Médico(a):",
        "",
        "Local de aplicação:",
        "Entrega (Doctor/AJC):",
        "",
        "Contatos:",
      ].join("\n"),
    );
  });

  it("NÃO inventa valores: sem 'pendente ⏳' no local/entrega, sem 'n/a' no termo e sem 'N/A' no despachante (Courier Simples)", () => {
    const texto = resumoParaTexto(montarResumo(compraTotalmenteVazia({ envio: "Courier Simples" }), "modelo"));
    expect(texto).not.toContain("pendente ⏳");
    expect(texto).not.toMatch(/n\/a/i);
    const linhas = modelo(compraTotalmenteVazia()).flatMap((b) => b.linhas);
    for (const id of ["local_aplicacao", "entrega", "termo_posterior", "despachante"]) expect(linhas.find((l) => l.id === id)).toMatchObject({ valor: "", vazio: true });
  });

  it("`vazio` é true exatamente nas linhas sem valor; as com valor têm vazio false e o valor", () => {
    const linhas = modelo(compra({ termoPosterior: { sim: true } })).flatMap((b) => b.linhas);
    for (const l of linhas) expect(l.vazio, l.id).toBe(false);
    for (const l of modelo(compraTotalmenteVazia()).flatMap((b) => b.linhas)) expect(l.vazio, l.id).toBe(l.valor === "" && !["titulo", "ordens", "cnpj"].includes(l.id));
  });

  it("modelo e cópia concordam: TODA linha não vazia do modelo aparece idêntica na cópia (mesmo id, rótulo, valor e negrito)", () => {
    const entradas: CompraResumoEntrada[] = [
      compra(),
      compraQuaseVazia(),
      compraTotalmenteVazia(),
      compra({ envio: "Courier Simples", cia: "DHL", localAplicacao: "", entrega: "", termoPosterior: { sim: true, observacao: "teste" } }),
      compra({ medicamentos: [medA, { medicamento: "TESTE MED B", laboratorio: "LAB B", brand: "referencia", temperatura: "Ambiente" }], despachante: { nome: "X" } }),
      compra({ envio: "Air Cargo", cia: "", despachante: null, avisos: { isencao: false, documentos: false, pendencias: [], recorrente: false } }),
    ];
    for (const e of entradas) {
      const daCopia = new Map(montarResumo(e, "copia").flatMap((b) => b.linhas).map((l) => [l.id, l]));
      for (const l of montarResumo(e, "modelo").flatMap((b) => b.linhas)) {
        if (l.vazio) continue;
        expect(daCopia.get(l.id), `${l.id} deveria estar na cópia`).toEqual(l);
      }
    }
  });

  it("a cópia é um SUBCONJUNTO dos rótulos do modelo (mesmos ids, mesma ordem relativa)", () => {
    const idsModelo = idsDe(modelo(compra({ despachante: { nome: "X" } })));
    for (const e of [compra({ despachante: { nome: "X" } }), compraQuaseVazia(), compraTotalmenteVazia()]) {
      const idsCopia = idsDe(montarResumo(e, "copia"));
      expect(idsCopia.every((id) => idsModelo.includes(id)), idsCopia.join(",")).toBe(true);
      expect(idsCopia.map((id) => idsModelo.indexOf(id))).toEqual([...idsCopia.map((id) => idsModelo.indexOf(id))].sort((a, b) => a - b));
    }
  });
});
