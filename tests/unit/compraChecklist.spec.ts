import { describe, expect, it } from "vitest";
import { DIR_MEDICAMENTO_MAX, REGRAS_CHECKLIST, TEXTOS_CHECKLIST } from "../../shared/constants/compraChecklist";
import { TEXTOS_RESUMO } from "../../shared/constants/compraResumo";
import { MODAL_AIR_CARGO, MODAL_COURIER_FORMAL, MODAL_COURIER_SIMPLES } from "../../shared/constants/processos";
import type { Compra, ItemCompra, OrdemCompra } from "../../shared/types/compra";
import { checklistCompra, contarPendencias, statusDaCompra, type ItemChecklist } from "../../shared/utils/compraChecklist";
import { textoMedicamentoDir } from "../../shared/utils/compraDir";

// A checagem única da compra (função pura). Dados fictícios (TESTE).

const item = (extra: Partial<ItemCompra> = {}): ItemCompra => ({
  id: "itm_1",
  posicao: 1,
  medicamento: "MEDICAMENTO TESTE",
  medicamentoCadastroId: "med_1",
  preCadastroId: null,
  apresentacao: "10 mg",
  referencia: "",
  laboratorio: "",
  quantidade: "2 caixas",
  temperatura: "2°C a 8°C",
  valorUnitario: null,
  valorReal: null,
  ...extra,
});

const ordem = (extra: Partial<OrdemCompra> = {}): OrdemCompra => ({
  id: "ord_1",
  posicao: 1,
  fornecedor: "Fornecedor Teste",
  envio: MODAL_AIR_CARGO,
  cia: "Cia Teste",
  po: "PO26-11-0001",
  frete: null,
  freteReal: null,
  itens: [item()],
  ...extra,
});

/** Uma compra COMPLETA (pronta): cada teste estraga uma coisa. */
const compra = (extra: Partial<Compra> = {}): Compra => ({
  id: "cmp_1",
  anoMes: "2026-11",
  sequencia: 1,
  cancelada: false,
  paciente: "PACIENTE TESTE",
  processoNumero: "0000000-00.0000.0.00.0000/SP",
  medico: "Dr. Teste",
  localAplicacao: "Clínica Teste",
  entrega: "Entrega Teste",
  contatos: "Contato Teste",
  termoObservacao: "",
  despachante: "Despachante Teste",
  isencaoPara: "",
  observacoes: "",
  vendedor: "Vendedor Teste",
  responsavel: "Responsável Teste",
  compraParticular: false,
  localDeclarado: false,
  termoPosterior: false,
  courierSimples: false,
  isencao: false,
  recorrente: false,
  pagamentoAlvara: null,
  pagamentoMomento: "vamos_pagar",
  documentos: true,
  pendencias: [],
  criadoPor: "Cris",
  atualizadoPor: "Cris",
  createdAt: "2026-11-19T12:00:00.000Z",
  updatedAt: "2026-11-19T12:00:00.000Z",
  ordens: [ordem()],
  ...extra,
});

const por = (itens: ItemChecklist[], id: string): ItemChecklist | undefined => itens.find((i) => i.id === id);
const erros = (c: Compra): string[] =>
  checklistCompra(c).itens.filter((i) => i.nivel === "erro").map((i) => i.id);

describe("textoMedicamentoDir", () => {
  const o = (...pares: Array<[string, string]>) => ({ itens: pares.map(([medicamento, apresentacao]) => ({ medicamento, apresentacao })) });

  it("nome + apresentação, em MAIÚSCULAS, itens unidos por ' + '", () => {
    expect(textoMedicamentoDir(o(["Teste A", "10 mg"], ["Teste B", "5 ml"]))).toBe("TESTE A 10 MG + TESTE B 5 ML");
  });
  it("sem espaço sobrando: pontas, repetidos e apresentação vazia (sem espaço no fim)", () => {
    expect(textoMedicamentoDir(o(["  Teste   A ", "  10   mg "]))).toBe("TESTE A 10 MG");
    expect(textoMedicamentoDir(o(["Teste A", ""], ["Teste B", "   "]))).toBe("TESTE A + TESTE B");
    expect(textoMedicamentoDir(o(["", "10 mg"]))).toBe("10 MG");
  });
  it("item vazio não entra e não deixa ' + ' sobrando; ordem sem itens é ''", () => {
    expect(textoMedicamentoDir(o(["Teste A", "1"], ["", ""], ["Teste C", "3"]))).toBe("TESTE A 1 + TESTE C 3");
    expect(textoMedicamentoDir(o())).toBe("");
    expect(textoMedicamentoDir(o(["", ""]))).toBe("");
  });
  it("acentos viram maiúsculas acentuadas", () => {
    expect(textoMedicamentoDir(o(["ácido fólico", "1 mg"]))).toBe("ÁCIDO FÓLICO 1 MG");
  });
});

describe("compra completa", () => {
  it("pronta, sem nenhum erro; cada regra aparece como 'ok'", () => {
    const r = checklistCompra(compra());
    expect(r.pronta).toBe(true);
    expect(r.itens.filter((i) => i.nivel === "erro")).toEqual([]);
    expect(r.itens.filter((i) => i.nivel === "aviso")).toEqual([]);
    expect(r.itens.map((i) => i.id)).toEqual([
      "paciente",
      "processo",
      "medico",
      "vendedor",
      "responsavel",
      "ordens",
      "ordem-1-fornecedor",
      "ordem-1-envio",
      "ordem-1-po",
      "ordem-1-medicamentos",
      "ordem-1-med-1-nome",
      "ordem-1-med-1-temperatura",
      "ordem-1-med-1-quantidade",
      "ordem-1-texto-dir",
      "despachante",
      "pagamento-momento",
    ]);
    expect(r.itens.every((i) => i.nivel === "ok")).toBe(true);
    expect(contarPendencias(compra())).toBe(0);
  });

  it("não altera a compra recebida (congelada) e é determinística", () => {
    const congelar = <T>(v: T): T => {
      if (v !== null && typeof v === "object") for (const f of Object.values(v as object)) congelar(f);
      return Object.freeze(v);
    };
    const c = congelar(compra({ ordens: [ordem({ posicao: 2 }), ordem({ id: "ord_0", posicao: 1 })] }));
    expect(checklistCompra(c)).toEqual(checklistCompra(c));
  });

  it("os textos são curtos e em português, no estilo pedido", () => {
    const r = checklistCompra(compra({ ordens: [ordem({ posicao: 2, po: "" })] }));
    expect(por(r.itens, "ordem-2-po")).toEqual({ id: "ordem-2-po", nivel: "erro", texto: "PO da ordem 2 não preenchido", ordemPosicao: 2 });
  });
});

describe("dados da compra", () => {
  it.each([
    ["paciente", { paciente: "" }],
    ["paciente", { paciente: "   " }],
    ["medico", { medico: "" }],
    ["vendedor", { vendedor: "" }],
    ["responsavel", { responsavel: "  " }],
  ] as const)("%s vazio é erro", (id, extra) => {
    expect(erros(compra(extra))).toEqual([id]);
    expect(checklistCompra(compra(extra)).pronta).toBe(false);
  });

  it("processo: preenchido OU compra particular; nenhum dos dois é erro", () => {
    expect(erros(compra({ processoNumero: "" }))).toEqual(["processo"]);
    expect(erros(compra({ processoNumero: "", compraParticular: true }))).toEqual([]);
    expect(erros(compra({ processoNumero: "123", compraParticular: false }))).toEqual([]);
    expect(por(checklistCompra(compra({ processoNumero: "", compraParticular: true })).itens, "processo")!.texto).toBe(TEXTOS_CHECKLIST.processo.okParticular);
  });

  it("pelo menos 1 ordem", () => {
    const r = checklistCompra(compra({ ordens: [] }));
    expect(erros(compra({ ordens: [] }))).toContain("ordens");
    expect(r.pronta).toBe(false);
    expect(por(r.itens, "ordens")!.texto).toBe("Nenhuma ordem na compra");
    expect(por(checklistCompra(compra({ ordens: [ordem(), ordem({ id: "o2", posicao: 2 })] })).itens, "ordens")!.texto).toBe("2 ordens");
  });

  it("momento do pagamento: obrigatório; termo posterior e alvará não têm regra", () => {
    expect(erros(compra({ pagamentoMomento: null }))).toEqual(["pagamento-momento"]);
    expect(erros(compra({ pagamentoMomento: "apos_awb" }))).toEqual([]);
    for (const termoPosterior of [true, false]) for (const pagamentoAlvara of [true, false, null]) expect(erros(compra({ termoPosterior, pagamentoAlvara }))).toEqual([]);
  });
});

describe("ordens e medicamentos", () => {
  it.each([
    ["fornecedor", { fornecedor: "" }, "ordem-1-fornecedor"],
    ["envio", { envio: "" }, "ordem-1-envio"],
    ["PO vazio", { po: "" }, "ordem-1-po"],
    ["PO fora do formato", { po: "PO26-11-1" }, "ordem-1-po"],
    ["PO sem o PO", { po: "26-11-0001" }, "ordem-1-po"],
    ["sem medicamento", { itens: [] }, "ordem-1-medicamentos"],
  ] as const)("ordem com %s é erro, com ordemPosicao", (_nome, extra, id) => {
    const c = compra({ ordens: [ordem(extra as Partial<OrdemCompra>)] });
    expect(erros(c)).toEqual([id]);
    expect(por(checklistCompra(c).itens, id)!.ordemPosicao).toBe(1);
  });

  it("PO: caixa e espaços são normalizados (po26 -11-0001 vale); o texto diferencia vazio de fora do formato", () => {
    expect(erros(compra({ ordens: [ordem({ po: " po26 -11-0001 " })] }))).toEqual([]);
    const r = checklistCompra(compra({ ordens: [ordem({ po: "PO26-11-1" })] }));
    expect(por(r.itens, "ordem-1-po")!.texto).toBe("PO da ordem 1 fora do formato (PO00-00-0000)");
  });

  it.each([
    ["nome", { medicamento: "" }, "ordem-1-med-1-nome"],
    ["temperatura", { temperatura: "" }, "ordem-1-med-1-temperatura"],
    ["quantidade", { quantidade: "  " }, "ordem-1-med-1-quantidade"],
  ] as const)("medicamento sem %s é erro", (_n, extra, id) => {
    const c = compra({ ordens: [ordem({ itens: [item(extra)] })] });
    expect(erros(c)).toEqual([id]);
    expect(por(checklistCompra(c).itens, id)!.texto).toMatch(/^Medicamento 1 da ordem 1:/);
  });

  it("apresentação, referência, laboratório e valores NÃO são exigidos", () => {
    expect(erros(compra({ ordens: [ordem({ itens: [item({ apresentacao: "", referencia: "", laboratorio: "", valorUnitario: null, valorReal: null })] })] }))).toEqual([]);
  });

  it("várias ordens e medicamentos: cada erro aponta a ordem e o medicamento certos (numeração por posicao, não pela ordem do array)", () => {
    const c = compra({
      ordens: [
        ordem({ id: "o2", posicao: 2, po: "", itens: [item({ id: "a", posicao: 1 }), item({ id: "b", posicao: 2, quantidade: "" })] }),
        ordem({ id: "o1", posicao: 1 }),
      ],
    });
    expect(erros(c)).toEqual(["ordem-2-po", "ordem-2-med-2-quantidade"]);
    expect(checklistCompra(c).itens.map((i) => i.ordemPosicao).filter((p) => p !== undefined)[0]).toBe(1); // a ordem 1 vem primeiro
    expect(contarPendencias(c)).toBe(2);
  });
});

describe("texto da DIR: até 300 caracteres", () => {
  const comTamanho = (n: number) => compra({ ordens: [ordem({ itens: [item({ medicamento: "A".repeat(n), apresentacao: "" })] })] });

  it("300 passa; 301 é erro com o tamanho no texto", () => {
    expect(erros(comTamanho(300))).toEqual([]);
    const r = checklistCompra(comTamanho(301));
    expect(erros(comTamanho(301))).toEqual(["ordem-1-texto-dir"]);
    expect(por(r.itens, "ordem-1-texto-dir")!.texto).toBe("Texto da DIR da ordem 1 tem 301 caracteres (máximo 300)");
    expect(DIR_MEDICAMENTO_MAX).toBe(300);
  });

  it("conta o texto FINAL (maiúsculas, apresentação e ' + ' entre os itens), não os campos soltos", () => {
    // 2 itens de 148 + " + " = 299 → passa; com 149 + 148 + 3 = 300 passa; 149 + 149 + 3 = 301 erra.
    const dois = (a: number, b: number) => compra({ ordens: [ordem({ itens: [item({ medicamento: "A".repeat(a), apresentacao: "" }), item({ id: "i2", posicao: 2, medicamento: "B".repeat(b), apresentacao: "" })] })] });
    expect(erros(dois(148, 148))).toEqual([]);
    expect(erros(dois(149, 148))).toEqual([]);
    expect(erros(dois(149, 149))).toEqual(["ordem-1-texto-dir"]);
  });

  it("cada ordem é conferida sozinha (a ordem 2 estoura, a 1 não)", () => {
    const c = compra({ ordens: [ordem(), ordem({ id: "o2", posicao: 2, itens: [item({ medicamento: "Z".repeat(301) })] })] });
    expect(erros(c)).toEqual(["ordem-2-texto-dir"]);
  });
});

describe("despachante: exigido, exceto quando TODAS as ordens são Courier Simples", () => {
  const ordensCom = (...envios: string[]): OrdemCompra[] => envios.map((envio, i) => ordem({ id: `o${i}`, posicao: i + 1, envio }));

  it("sem despachante: erro em Air Cargo e em Courier Formal", () => {
    for (const envio of [MODAL_AIR_CARGO, MODAL_COURIER_FORMAL]) expect(erros(compra({ despachante: "", ordens: ordensCom(envio) })), envio).toEqual(["despachante"]);
  });
  it("todas Courier Simples: dispensado (ok com texto próprio), com ou sem despachante preenchido", () => {
    for (const despachante of ["", "Despachante Teste"]) {
      const r = checklistCompra(compra({ despachante, ordens: ordensCom(MODAL_COURIER_SIMPLES, MODAL_COURIER_SIMPLES) }));
      expect(por(r.itens, "despachante")).toEqual({ id: "despachante", nivel: "ok", texto: "Despachante dispensado (Courier Simples)" });
    }
  });
  it("uma ordem que não é Courier Simples já exige o despachante", () => {
    expect(erros(compra({ despachante: "", ordens: ordensCom(MODAL_COURIER_SIMPLES, MODAL_AIR_CARGO) }))).toEqual(["despachante"]);
  });
  it("sem ordens não dispensa (nenhuma ordem não é 'todas Courier Simples')", () => {
    expect(erros(compra({ despachante: "", ordens: [] }))).toEqual(["ordens", "despachante"]);
  });
  it("a flag courierSimples da compra, sozinha, não dispensa (vale o envio das ordens)", () => {
    expect(erros(compra({ despachante: "", courierSimples: true }))).toEqual(["despachante"]);
  });
});

describe("avisos (não bloqueiam)", () => {
  it("medicamento no pré-cadastro (pre_cadastro_id, ou sem id do Cadastro): aviso com o NOME do item; Cadastro não avisa", () => {
    const c = compra({
      ordens: [
        ordem({
          itens: [
            item({ id: "a", posicao: 1, medicamento: "DO CADASTRO" }),
            item({ id: "b", posicao: 2, medicamento: "NOVO TESTE", medicamentoCadastroId: null, preCadastroId: "pre_1" }),
            item({ id: "c", posicao: 3, medicamento: "DIGITADO TESTE", medicamentoCadastroId: null, preCadastroId: null }),
            item({ id: "d", posicao: 4, medicamento: "COM OS DOIS", medicamentoCadastroId: "med_9", preCadastroId: "pre_2" }),
          ],
        }),
      ],
    });
    const r = checklistCompra(c);
    const avisos = r.itens.filter((i) => i.id.endsWith("pre-cadastro"));
    expect(avisos.map((a) => a.id)).toEqual(["ordem-1-med-2-pre-cadastro", "ordem-1-med-3-pre-cadastro", "ordem-1-med-4-pre-cadastro"]);
    expect(avisos[0]).toEqual({ id: "ordem-1-med-2-pre-cadastro", nivel: "aviso", texto: "NOVO TESTE no pré-cadastro: a linha da DIR leva o nome digitado", ordemPosicao: 1 });
    expect(r.pronta).toBe(true); // aviso não bloqueia
    expect(contarPendencias(c)).toBe(0);
  });

  it("medicamento sem nome não gera o aviso do pré-cadastro (já é erro de nome)", () => {
    const r = checklistCompra(compra({ ordens: [ordem({ itens: [item({ medicamento: "", medicamentoCadastroId: null })] })] }));
    expect(r.itens.some((i) => i.id.endsWith("pre-cadastro"))).toBe(false);
    expect(erros(compra({ ordens: [ordem({ itens: [item({ medicamento: "", medicamentoCadastroId: null })] })] }))).toEqual(["ordem-1-med-1-nome"]);
  });

  it("local de aplicação e entrega vazios avisam (com a marca 'pendente ⏳' do resumo); documentos não verificados avisam", () => {
    const r = checklistCompra(compra({ localAplicacao: "", entrega: " ", documentos: null }));
    expect(r.itens.filter((i) => i.nivel === "aviso").map((i) => i.id)).toEqual(["local-aplicacao", "entrega", "documentos"]);
    expect(por(r.itens, "local-aplicacao")!.texto).toContain(TEXTOS_RESUMO.pendenteMarca);
    expect(r.pronta).toBe(true);
    expect(checklistCompra(compra({ documentos: false })).itens.some((i) => i.id === "documentos" && i.nivel === "aviso")).toBe(true);
    expect(checklistCompra(compra({ documentos: true })).itens.some((i) => i.id === "documentos")).toBe(false);
  });
});

describe("contarPendencias", () => {
  it("é a quantidade de itens 'erro' (avisos e oks não contam)", () => {
    const c = compra({ paciente: "", medico: "", localAplicacao: "", documentos: null, ordens: [ordem({ po: "" })] });
    expect(contarPendencias(c)).toBe(3);
    expect(checklistCompra(c).itens.filter((i) => i.nivel === "aviso").length).toBe(2); // local de aplicação e documentos
  });
  it("rascunho vazio: as pendências da compra sem nada", () => {
    const vazio = compra({ paciente: "", processoNumero: "", medico: "", vendedor: "", responsavel: "", despachante: "", pagamentoMomento: null, ordens: [], localAplicacao: "", entrega: "", documentos: null });
    // paciente, processo, médico, vendedor, responsável, ordens, despachante, momento do pagamento
    expect(contarPendencias(vazio)).toBe(8);
    expect(checklistCompra(vazio).pronta).toBe(false);
  });
});

describe("statusDaCompra", () => {
  it("cancelada vence tudo (mesmo pronta)", () => {
    expect(statusDaCompra(compra({ cancelada: true }))).toBe("cancelada");
    expect(statusDaCompra(compra({ cancelada: true, paciente: "" }))).toBe("cancelada");
  });
  it("pronta: sem erro; rascunho: com erro", () => {
    expect(statusDaCompra(compra())).toBe("pronta");
    expect(statusDaCompra(compra({ paciente: "" }))).toBe("rascunho");
    expect(statusDaCompra(compra({ ordens: [] }))).toBe("rascunho");
  });
  it("aviso não tira a compra de 'pronta'", () => {
    expect(statusDaCompra(compra({ localAplicacao: "", documentos: null }))).toBe("pronta");
  });
});

describe("os ids das regras são todos usados e únicos", () => {
  it("REGRAS_CHECKLIST não tem valor repetido", () => {
    const valores = Object.values(REGRAS_CHECKLIST);
    expect(new Set(valores).size).toBe(valores.length);
  });
  it("em uma compra com tudo errado e tudo avisado, os ids dos itens são únicos", () => {
    const c = compra({
      paciente: "",
      ordens: [ordem({ po: "", itens: [item({ medicamento: "", medicamentoCadastroId: null }), item({ id: "i2", posicao: 2, medicamentoCadastroId: null, preCadastroId: "p" })] }), ordem({ id: "o2", posicao: 2 })],
      documentos: null,
      localAplicacao: "",
      entrega: "",
    });
    const ids = checklistCompra(c).itens.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
