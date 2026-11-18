import { describe, expect, it } from "vitest";
import type { ConsultorProcesso, Processo } from "#shared/types/processo";
import {
  LIMITE_DETALHES_AUTOMATICOS,
  assinaturaDeResultados,
  avancarAberturaPorBusca,
  calcularAberturaAutomatica,
  criarTermoBusca,
  filtrarPorBusca,
  camposPesquisaveis,
  normalizarPasta,
  pastaCombina,
  processoCombinaBusca,
  processoCombinaBuscaAntiga,
  processoCombinaPorPalavras,
  type EstadoAbertura,
  type PassoBusca,
} from "../../app/utils/processoBusca";

// Busca em Processos (paciente OU pasta) e a abertura automática de grupos e detalhes (regra dos 5).

function proc(id: string, consultor: ConsultorProcesso, paciente: string, pasta = "2026 - 100"): Processo {
  return {
    id,
    paciente,
    pasta,
    empresa: "FARMAURORA",
    consultor,
    medicamentos: [],
    status: "em_transito",
    datas: {},
    pendencias: [],
    atualizacoes: [],
    createdAt: "",
    updatedAt: "",
  };
}

const ids = (lista: readonly Processo[]) => lista.map((p) => p.id);
const vazio = (): EstadoAbertura => ({ grupos: new Set(), detalhes: new Set() });
const estado = (grupos: string[], detalhes: string[]): EstadoAbertura => ({
  grupos: new Set(grupos),
  detalhes: new Set(detalhes),
});
const lista = (e: EstadoAbertura) => ({ grupos: [...e.grupos].sort(), detalhes: [...e.detalhes].sort() });

describe("normalizarPasta / pastaCombina", () => {
  it("espaços e hífens são ignorados", () => {
    for (const v of ["2026 - 375", "2026-375", "2026 375", "2026  -  375", " 2026-375 ", "2026–375", "2026 — 375"]) {
      expect(normalizarPasta(v), v).toBe("2026375");
    }
  });

  it.each([
    ["2026 - 375"],
    ["2026-375"],
    ["2026 375"],
    ["375"],
    ["26 - 375"],
    ["6-375"],
    ["2026"],
  ])("%j acha a pasta '2026 - 375'", (termo) => {
    expect(pastaCombina("2026 - 375", termo)).toBe(true);
  });

  it.each([["376"], ["2025 - 375"], ["3750"], ["999"], ["maria"]])("%j NÃO acha a pasta '2026 - 375'", (termo) => {
    expect(pastaCombina("2026 - 375", termo)).toBe(false);
  });

  it("termo só de espaços/hífens não casa com pasta nenhuma", () => {
    expect(pastaCombina("2026 - 375", " - ")).toBe(false);
    expect(pastaCombina("2026 - 375", "")).toBe(false);
  });

  it("pasta com 2 dígitos na sequência ('2026 - 11') também é achada", () => {
    expect(pastaCombina("2026 - 11", "2026-11")).toBe(true);
    expect(pastaCombina("2026 - 11", "11")).toBe(true);
  });
});

describe("busca por paciente OU pasta", () => {
  const lote = [
    proc("1", "Dani", "Maria da Silva", "2026 - 375"),
    proc("2", "Dani", "João Álvares", "2026 - 12"),
    proc("3", "Bolívar", "Élida Souza", "2025 - 375"),
  ];

  it("paciente: sem acento e sem diferença de maiúscula, como antes", () => {
    expect(ids(filtrarPorBusca(lote, "MARIA"))).toEqual(["1"]);
    expect(ids(filtrarPorBusca(lote, "joao alvares"))).toEqual(["2"]);
    expect(ids(filtrarPorBusca(lote, "elida"))).toEqual(["3"]);
    expect(ids(filtrarPorBusca(lote, "ÉLIDA"))).toEqual(["3"]);
  });

  it("pasta: variações de digitação", () => {
    expect(ids(filtrarPorBusca(lote, "2026 - 375"))).toEqual(["1"]);
    expect(ids(filtrarPorBusca(lote, "2026-375"))).toEqual(["1"]);
    expect(ids(filtrarPorBusca(lote, "2026 375"))).toEqual(["1"]);
    expect(ids(filtrarPorBusca(lote, "375"))).toEqual(["1", "3"]);
    expect(ids(filtrarPorBusca(lote, "2026"))).toEqual(["1", "2"]);
  });

  it("paciente e pasta somam (OU)", () => {
    const misto = [proc("a", "Dani", "Paciente 375", "2026 - 1"), proc("b", "Dani", "Outro", "2026 - 375")];
    expect(ids(filtrarPorBusca(misto, "375"))).toEqual(["a", "b"]);
  });

  it("sem termo (vazio ou só espaços), devolve a lista inteira", () => {
    expect(filtrarPorBusca(lote, "")).toBe(lote);
    expect(filtrarPorBusca(lote, "   ")).toBe(lote);
  });

  it("nenhum resultado", () => {
    expect(filtrarPorBusca(lote, "zzz")).toEqual([]);
  });

  it("criarTermoBusca: null sem busca; guarda o texto, a pasta e a ordem já normalizados", () => {
    expect(criarTermoBusca("  ")).toBeNull();
    // "-" solto não vira palavra (sem letra nem número); "2026" e "375" viram.
    expect(criarTermoBusca("2026 - 375")).toEqual({
      texto: "2026 - 375",
      pasta: "2026375",
      ordem: "2026375",
      palavras: [
        { texto: "2026", pasta: "2026", ordem: "2026", digitos: "2026" },
        { texto: "375", pasta: "375", ordem: "375", digitos: "" },
      ],
    });
    // Sem nenhuma palavra: a busca por palavras não vale; a antiga segue com o texto inteiro.
    expect(criarTermoBusca("-")).toEqual({ texto: "-", pasta: "", ordem: "", palavras: [] });
  });

  it("termo só de hífen: a busca por palavras não filtra nada; a antiga segue como antes (nome com hífen), sem casar tudo", () => {
    const termo = criarTermoBusca("-")!;
    expect(termo.palavras).toEqual([]);
    expect(processoCombinaPorPalavras(proc("x", "Dani", "Ana Paula", "2026 - 1"), termo)).toBe(false);
    expect(processoCombinaBusca(proc("x", "Dani", "Ana Paula", "2026 - 1"), termo)).toBe(false);
    expect(processoCombinaBusca(proc("y", "Dani", "Ana-Paula", "2026 - 1"), termo)).toBe(true);
    // Sobre uma lista inteira: só o nome com hífen; ninguém mais (nem pelos campos novos, como "Beldimed - Bélgica").
    const lote = [
      proc("1", "Dani", "Ana Paula"),
      { ...proc("2", "Dani", "João"), fornecedor: "Beldimed - Bélgica" },
      proc("3", "Dani", "Ana-Paula"),
    ];
    expect(ids(filtrarPorBusca(lote, "-"))).toEqual(["3"]);
    expect(ids(filtrarPorBusca(lote, " - "))).toEqual(["3"]);
  });
});

// ── Busca por palavras em todos os campos ───────────────────────────────────────────────────────────

function cheio(id: string, extra: Partial<Processo> = {}): Processo {
  return { ...proc(id, "Dani", `Paciente ${id}`, `2026 - ${id}`), ...extra };
}

describe("busca por palavras: todos os campos", () => {
  const lote: Processo[] = [
    cheio("430", {
      paciente: "Maria da Silva",
      numeroPo: "PO26-10-0471",
      companhiaAerea: "FedEx",
      responsavelOperacional: "Rebeca",
      fornecedor: "Beldimed - Bélgica",
      despachante: "Andreza Faconi",
      consultor: "Bolívar",
      empresa: "FARMAURORA",
      numeroAwb: "8787 4954 6211",
      transportadoraNacional: { nome: "AJC", cotacao: "COT-1" },
      modalEnvio: "Courier Formal",
      numeroProcesso: "5001234-56.2026.4.01.3400",
      localEntrega: "Hospital Sírio-Libanês",
      status: "desembaraco",
      statusPagamento: "pago",
      medicamentos: [
        { nome: "VERZENIOS 150MG", laboratorio: "Eli Lilly", brand: "referencia" },
        { nome: "Pembrolizumabe", laboratorio: "", brand: "bioequivalente" },
      ],
    }),
    cheio("431", {
      paciente: "João Álvares",
      companhiaAerea: "FEDEX Express",
      responsavelOperacional: "Bruno",
      fornecedor: "Pharyx - China",
      empresa: "MAINZFARMA",
      status: "em_transito",
      statusPagamento: "pendente",
      numeroAwb: "87874954",
    }),
    cheio("432", {
      paciente: "Élida Souza",
      companhiaAerea: "LATAM Cargo",
      responsavelOperacional: "Rebeca",
      status: "liberado",
      // sem statusPagamento, sem numeroAwb, sem transportadora
    }),
    cheio("433", { paciente: "Carlos Rebelo", companhiaAerea: "FedEx", responsavelOperacional: "Rebeca", status: "entregue" }),
  ];
  const achar = (termo: string) => ids(filtrarPorBusca(lote, termo));

  it('"fedex" acha só os processos com companhia FedEx; maiúsculas e minúsculas dão o mesmo', () => {
    expect(achar("fedex")).toEqual(["430", "431", "433"]);
    expect(achar("FEDEX")).toEqual(["430", "431", "433"]);
    expect(achar("FedEx")).toEqual(["430", "431", "433"]);
    expect(achar("latam")).toEqual(["432"]);
  });

  it("medicamento (nome), laboratório e brand pelo RÓTULO", () => {
    expect(achar("verzenios")).toEqual(["430"]);
    expect(achar("pembrolizumabe")).toEqual(["430"]);
    expect(achar("eli lilly")).toEqual(["430"]);
    expect(achar("lilly")).toEqual(["430"]);
    expect(achar("referencia")).toEqual(["430"]); // sem acento acha "Referência"
    expect(achar("Referência")).toEqual(["430"]);
    expect(achar("bioequivalente")).toEqual(["430"]);
    // Só o rótulo: o valor interno do brand não é um campo (o rótulo e o valor coincidem sem acento; "referencia" acima já prova o rótulo).
    expect(camposPesquisaveis(lote[0]!)).toContain("referencia");
  });

  it("empresa, responsável, consultor, despachante", () => {
    expect(achar("mainzfarma")).toEqual(["431"]);
    expect(achar("farmaurora")).toEqual(["430", "432", "433"]);
    expect(achar("bruno")).toEqual(["431"]);
    expect(achar("rebeca")).toEqual(["430", "432", "433"]);
    expect(achar("bolivar")).toEqual(["430"]);
    expect(achar("Andreza")).toEqual(["430"]);
    expect(achar("faconi andreza")).toEqual(["430"]);
  });

  it('fornecedor "Beldimed - Bélgica": por "beldimed", por "belgica", pelo texto todo e por "beldimed - belgica"', () => {
    expect(achar("beldimed")).toEqual(["430"]);
    expect(achar("belgica")).toEqual(["430"]);
    expect(achar("Bélgica beldimed")).toEqual(["430"]);
    expect(achar("beldimed - belgica")).toEqual(["430"]);
    expect(achar("pharyx")).toEqual(["431"]);
  });

  it("transportadora, modal, nº do processo e local de entrega", () => {
    expect(achar("ajc")).toEqual(["430"]);
    expect(achar("courier")).toEqual(["430"]);
    expect(achar("5001234")).toEqual(["430"]);
    expect(achar("hospital sirio")).toEqual(["430"]);
    expect(achar("libanes")).toEqual(["430"]);
  });

  it("status pelo RÓTULO da tela", () => {
    expect(achar("em transito")).toEqual(["431"]);
    expect(achar("EM TRÂNSITO")).toEqual(["431"]);
    expect(achar("desembaraco")).toEqual(["430"]);
    expect(achar("liberado")).toEqual(["432"]);
    expect(achar("entregue")).toEqual(["433"]);
    expect(achar("na origem")).toEqual([]); // ninguém está "Na origem" neste lote
    // O valor interno ("em_transito", "elaboracao_fornecedores") NÃO é pesquisável.
    expect(achar("em_transito")).toEqual([]);
    expect(achar("elaboracao")).toEqual([]);
  });

  it('"pago" só acha pago e "pendente" só pendente; sem statusPagamento não acha nenhum dos dois', () => {
    expect(achar("pago")).toEqual(["430"]);
    expect(achar("pendente")).toEqual(["431"]);
    expect(achar("pago pendente")).toEqual([]);
    const semPagamento = lote[2]!;
    expect(semPagamento.statusPagamento).toBeUndefined();
    const pago = criarTermoBusca("pago")!;
    const pendente = criarTermoBusca("pendente")!;
    expect(processoCombinaBusca(semPagamento, pago)).toBe(false);
    expect(processoCombinaBusca(semPagamento, pendente)).toBe(false);
  });

  it("AWB: com espaços, sem espaços e só dígitos (4+ dígitos)", () => {
    expect(achar("8787 4954 6211")).toEqual(["430"]);
    expect(achar("878749546211")).toEqual(["430"]); // sem espaços, achado só pelos dígitos
    expect(achar("8787 4954")).toEqual(["430", "431"]);
    expect(achar("87874954")).toEqual(["430", "431"]); // 431 guarda o AWB sem espaços
    expect(achar("8787-4954-6211")).toEqual(["430"]);
    expect(achar("4954")).toEqual(["430", "431"]);
    expect(achar("7874")).toEqual(["430", "431"]); // 4 dígitos: "8787 4954…" só contém "7874" sem os espaços
    expect(achar("787 4")).toEqual(["430", "431"]); // 3 dígitos / 1 dígito: só o trecho normal de cada palavra
    expect(achar("878157542300")).toEqual([]);
  });

  it("palavra com letras não é comparada com os dígitos do AWB", () => {
    expect(achar("awb8787")).toEqual([]);
    expect(achar("x87874954")).toEqual([]);
  });

  it('pasta "2026 - 430", "2026-430" e "430" acham a mesma pasta; PO como antes', () => {
    expect(achar("2026 - 430")).toEqual(["430"]);
    expect(achar("2026-430")).toEqual(["430"]);
    expect(achar("2026 430")).toEqual(["430"]);
    expect(achar("430")).toEqual(["430"]);
    expect(achar("po26100471")).toEqual(["430"]);
    expect(achar("PO26-10-0471")).toEqual(["430"]);
    expect(achar("26-10-0471")).toEqual(["430"]);
    expect(achar("26 10 0471")).toEqual(["430"]);
  });

  it("pasta e PO também valem dentro de uma busca com várias palavras", () => {
    expect(achar("2026-430 fedex")).toEqual(["430"]);
    expect(achar("2026-431 fedex")).toEqual(["431"]);
    expect(achar("2026-432 fedex")).toEqual([]);
    expect(achar("po26-10-0471 rebeca")).toEqual(["430"]);
  });

  it('"maria silva" acha "Maria da Silva" (palavras separadas, qualquer ordem)', () => {
    expect(achar("maria silva")).toEqual(["430"]);
    expect(achar("silva maria")).toEqual(["430"]);
    expect(achar("MARIA   SILVA")).toEqual(["430"]);
  });

  it('"fedex rebeca": só os FedEx da Rebeca (E lógico entre palavras, em campos diferentes)', () => {
    expect(achar("fedex rebeca")).toEqual(["430", "433"]);
    expect(achar("rebeca fedex")).toEqual(["430", "433"]);
    expect(achar("fedex bruno")).toEqual(["431"]);
    expect(achar("fedex rebeca entregue")).toEqual(["433"]);
  });

  it("palavras em processos diferentes, mas não no mesmo, não acham ninguém", () => {
    expect(achar("verzenios latam")).toEqual([]); // 430 tem verzenios, 432 tem latam
    expect(achar("pharyx rebeca")).toEqual([]); // pharyx é do 431, rebeca não
  });

  it("uma palavra nunca atravessa dois campos", () => {
    // paciente "Maria da Silva" + pasta "2026 - 430": "silva2026" não existe em nenhum campo
    expect(achar("silva2026")).toEqual([]);
    // fim de um campo e começo do seguinte: "sirio-libanes" não é o fornecedor+despachante
    expect(achar("belgicaandreza")).toEqual([]);
  });

  it("campos que NÃO são pesquisados: atualizações, pendências e datas", () => {
    const p = cheio("900", {
      atualizacoes: [{ data: "01/11", texto: "Aguardando liberação da Anvisa" }],
      pendencias: ["Enviar procuração assinada"],
      datas: { dataEmbarque: "05/11", previsaoEntrega: "30/11" },
    });
    expect(ids(filtrarPorBusca([p], "anvisa"))).toEqual([]);
    expect(ids(filtrarPorBusca([p], "procuracao"))).toEqual([]);
    expect(ids(filtrarPorBusca([p], "30/11"))).toEqual([]);
    expect(camposPesquisaveis(p).join(" ")).not.toMatch(/anvisa|procuracao|30\/11/);
  });

  it("campos undefined, medicamentos vazios e transportadora ausente não quebram", () => {
    const vazio = cheio("901", { medicamentos: [], transportadoraNacional: undefined });
    expect(vazio.fornecedor).toBeUndefined();
    expect(vazio.companhiaAerea).toBeUndefined();
    expect(vazio.numeroAwb).toBeUndefined();
    expect(ids(filtrarPorBusca([vazio], "fedex"))).toEqual([]);
    expect(ids(filtrarPorBusca([vazio], "8787 4954"))).toEqual([]);
    expect(ids(filtrarPorBusca([vazio], "paciente 901"))).toEqual(["901"]);
    expect(ids(filtrarPorBusca([vazio], "em transito"))).toEqual(["901"]);
    // Defesa: itens fora do contrato (null no meio dos medicamentos, brand desconhecido) também não quebram.
    const sujo = cheio("902", {
      medicamentos: [null as unknown as Processo["medicamentos"][number], { nome: "X", laboratorio: "", brand: "invalido" as never }],
    });
    expect(() => filtrarPorBusca([sujo], "x")).not.toThrow();
    expect(ids(filtrarPorBusca([sujo], "invalido"))).toEqual([]);
  });

  it("busca vazia ou só de espaços devolve a lista inteira (a mesma referência)", () => {
    expect(filtrarPorBusca(lote, "")).toBe(lote);
    expect(filtrarPorBusca(lote, "   ")).toBe(lote);
  });

  it("a ordem dos resultados é a da lista (sem relevância)", () => {
    const invertido = [...lote].reverse();
    expect(ids(filtrarPorBusca(invertido, "fedex"))).toEqual(["433", "431", "430"]);
  });

  it("a busca antiga com o texto inteiro continua valendo, mesmo quando as palavras sozinhas não achariam", () => {
    // "da silva" é um trecho do paciente; "silva da" não é (só pelas palavras).
    const termo = criarTermoBusca("maria da silva")!;
    expect(processoCombinaBuscaAntiga(lote[0]!, termo)).toBe(true);
    const fora = criarTermoBusca("silva da maria")!;
    expect(processoCombinaBuscaAntiga(lote[0]!, fora)).toBe(false);
    expect(processoCombinaPorPalavras(lote[0]!, fora)).toBe(true);
    // Hífen no meio: o texto inteiro "2026-430" acha a pasta pela regra antiga, mesmo com o "-" que não é palavra.
    expect(processoCombinaBuscaAntiga(lote[0]!, criarTermoBusca("2026-430")!)).toBe(true);
  });

  it("o texto pesquisável é calculado uma vez por processo e recalculado quando o processo é atualizado", () => {
    const original = cheio("950", { companhiaAerea: "DHL", updatedAt: "v1" });
    expect(ids(filtrarPorBusca([original], "dhl"))).toEqual(["950"]);
    // Mesma versão (updatedAt): reaproveita o texto já calculado, mesmo que o objeto tenha sido mexido por fora.
    original.companhiaAerea = "UPS";
    expect(ids(filtrarPorBusca([original], "dhl"))).toEqual(["950"]);
    // O servidor devolve outra versão: recalcula.
    original.updatedAt = "v2";
    expect(ids(filtrarPorBusca([original], "dhl"))).toEqual([]);
    expect(ids(filtrarPorBusca([original], "ups"))).toEqual(["950"]);
    // Objeto novo (substituído na lista): índice próprio.
    expect(ids(filtrarPorBusca([{ ...original, companhiaAerea: "TNT" }], "tnt"))).toEqual(["950"]);
  });
});

describe("calcularAberturaAutomatica — regra dos 5", () => {
  const mk = (n: number, consultor: ConsultorProcesso = "Dani") =>
    Array.from({ length: n }, (_, i) => proc(`${consultor}-${i}`, consultor, `Paciente ${i}`));

  it("o limite é 5", () => {
    expect(LIMITE_DETALHES_AUTOMATICOS).toBe(5);
  });

  it("0 resultados: nada abre", () => {
    expect(calcularAberturaAutomatica([], true)).toEqual({ grupos: [], detalhes: [] });
  });

  it("1 resultado: o grupo e o detalhe abrem", () => {
    const [p] = mk(1);
    expect(calcularAberturaAutomatica([p!], true)).toEqual({ grupos: ["Dani"], detalhes: [p!.id] });
  });

  it("5 resultados: grupo e os 5 detalhes", () => {
    const r = mk(5);
    expect(calcularAberturaAutomatica(r, true)).toEqual({ grupos: ["Dani"], detalhes: ids(r) });
  });

  it("6 resultados: só o grupo, detalhes fechados", () => {
    const r = mk(6);
    expect(calcularAberturaAutomatica(r, true)).toEqual({ grupos: ["Dani"], detalhes: [] });
  });

  it("vários consultores: abre TODOS os grupos que têm resultado; o total (e não o de cada grupo) decide os detalhes", () => {
    const r = [...mk(2, "Dani"), ...mk(2, "Bolívar"), ...mk(1, "Flávia")];
    const auto = calcularAberturaAutomatica(r, true);
    expect([...auto.grupos].sort()).toEqual(["Bolívar", "Dani", "Flávia"]);
    expect(auto.detalhes).toHaveLength(5); // total 5 → todos os detalhes

    const seis = [...r, ...mk(1, "Dani").map((p) => ({ ...p, id: "extra" }))];
    expect(calcularAberturaAutomatica(seis, true).detalhes).toEqual([]);
    expect([...calcularAberturaAutomatica(seis, true).grupos].sort()).toEqual(["Bolívar", "Dani", "Flávia"]);
  });

  it("consultor sem resultado não entra", () => {
    const auto = calcularAberturaAutomatica(mk(3, "Dani"), true);
    expect(auto.grupos).toEqual(["Dani"]);
    expect(auto.grupos).not.toContain("Bolívar");
  });

  it("lista plana (cargo consultor) e aba Entregues: sem grupos; só a regra dos 5", () => {
    const tres = mk(3);
    expect(calcularAberturaAutomatica(tres, false)).toEqual({ grupos: [], detalhes: ids(tres) });
    expect(calcularAberturaAutomatica(mk(6), false)).toEqual({ grupos: [], detalhes: [] });
  });
});

describe("avancarAberturaPorBusca — digitar, mudar resultados, limpar", () => {
  const A = proc("a", "Dani", "Maria Alves");
  const B = proc("b", "Bolívar", "Maria Bastos");
  const C = proc("c", "Dani", "Mariana Costa");

  function passo(termo: string, encontrados: Processo[], anterior: PassoBusca, agrupado = true): PassoBusca {
    return avancarAberturaPorBusca({
      termo,
      encontrados,
      agrupado,
      atual: anterior.estado,
      snapshot: anterior.snapshot,
      assinatura: anterior.assinatura,
    });
  }
  const inicio = (e: EstadoAbertura = vazio()): PassoBusca => ({ estado: e, snapshot: null, assinatura: null });

  it("sem busca e sem instantâneo: o estado fica como está", () => {
    const e = estado(["Dani"], ["a"]);
    const p = passo("", [A], inicio(e));
    expect(p.estado).toBe(e);
    expect(p.snapshot).toBeNull();
    expect(p.assinatura).toBeNull();
  });

  it("primeira digitação: guarda o instantâneo e abre os grupos e detalhes da regra", () => {
    const antes = estado(["Flávia"], ["z"]);
    const p = passo("maria", [A, B], inicio(antes));

    expect(lista(p.snapshot!)).toEqual({ grupos: ["Flávia"], detalhes: ["z"] });
    expect(lista(p.estado)).toEqual({ grupos: ["Bolívar", "Dani", "Flávia"], detalhes: ["a", "b"] });
  });

  it("apagar a busca restaura EXATAMENTE o estado de antes de digitar", () => {
    const antes = estado(["Flávia"], ["z"]);
    const digitando = passo("maria", [A, B], inicio(antes));
    const limpo = passo("", [A, B, C], digitando);

    expect(lista(limpo.estado)).toEqual({ grupos: ["Flávia"], detalhes: ["z"] });
    expect(limpo.snapshot).toBeNull();
    expect(limpo.assinatura).toBeNull();
  });

  it("restaurar vale mesmo depois de escolhas manuais e de vários resultados diferentes", () => {
    const antes = estado([], []);
    let p = passo("m", [A, B, C], inicio(antes));
    p = { ...p, estado: estado(["Dani"], []) }; // a pessoa fechou um grupo e um detalhe à mão
    p = passo("ma", [A], p);
    p = passo("", [A, B, C], p);
    expect(lista(p.estado)).toEqual({ grupos: [], detalhes: [] });
  });

  it("o instantâneo é guardado só na PRIMEIRA digitação (não é sobrescrito pelas seguintes)", () => {
    const antes = estado(["Flávia"], []);
    let p = passo("m", [A, B, C], inicio(antes));
    const snap = p.snapshot;
    p = passo("ma", [A, B], p);
    expect(p.snapshot).toBe(snap);
    p = passo("mar", [A], p);
    expect(lista(p.snapshot!)).toEqual({ grupos: ["Flávia"], detalhes: [] });
  });

  it("digitar mais uma letra que NÃO muda os resultados mantém as escolhas manuais", () => {
    let p = passo("mar", [A, B], inicio());
    p = { ...p, estado: estado(["Bolívar"], ["a"]) }; // fechou o grupo Dani e o detalhe de b à mão
    const depois = passo("mari", [A, B], p); // mesmos resultados
    expect(depois.estado).toBe(p.estado);
    expect(lista(depois.estado)).toEqual({ grupos: ["Bolívar"], detalhes: ["a"] });
  });

  it("quando o conjunto de resultados MUDA, a regra automática é reaplicada (escolhas manuais caem)", () => {
    let p = passo("mar", [A, B, C], inicio());
    p = { ...p, estado: estado([], []) }; // fechou tudo à mão
    const depois = passo("mari", [A, C], p);
    expect(lista(depois.estado)).toEqual({ grupos: ["Dani"], detalhes: ["a", "c"] });
  });

  it("reaplicar não fecha grupos que já estavam abertos e não têm resultado agora", () => {
    let p = passo("mar", [A, B], inicio(estado(["Flávia"], [])));
    p = passo("alves", [A], p);
    expect([...p.estado.grupos].sort()).toEqual(["Bolívar", "Dani", "Flávia"]);
    expect([...p.estado.detalhes]).toEqual(["a"]); // os detalhes seguem exatamente a regra
  });

  it("passar de 5 para 6 resultados fecha os detalhes; voltar a 5 abre de novo", () => {
    const cinco = Array.from({ length: 5 }, (_, i) => proc(`p${i}`, "Dani", `Maria ${i}`));
    const seis = [...cinco, proc("p5", "Dani", "Maria 5")];
    let p = passo("maria", cinco, inicio());
    expect(p.estado.detalhes.size).toBe(5);
    p = passo("maria", seis, p);
    expect(p.estado.detalhes.size).toBe(0);
    expect([...p.estado.grupos]).toEqual(["Dani"]);
    p = passo("maria", cinco, p);
    expect(p.estado.detalhes.size).toBe(5);
  });

  it("zero resultados é um conjunto como outro qualquer (e restaura ao limpar)", () => {
    const antes = estado(["Dani"], ["a"]);
    let p = passo("zzz", [], inicio(antes));
    expect(lista(p.estado)).toEqual({ grupos: ["Dani"], detalhes: [] });
    p = passo("", [], p);
    expect(lista(p.estado)).toEqual({ grupos: ["Dani"], detalhes: ["a"] });
  });

  it("termo só de espaços conta como sem busca", () => {
    const antes = estado(["Dani"], []);
    let p = passo("a", [A], inicio(antes));
    p = passo("   ", [A, B, C], p);
    expect(lista(p.estado)).toEqual({ grupos: ["Dani"], detalhes: [] });
  });

  it("aba Entregues / lista plana: só detalhes", () => {
    const antes = estado([], []);
    const p = passo("maria", [A, B], inicio(antes), false);
    expect(lista(p.estado)).toEqual({ grupos: [], detalhes: ["a", "b"] });
  });

  it("a assinatura identifica o conjunto (e o modo), não o texto", () => {
    expect(assinaturaDeResultados([A, B], true)).toBe(assinaturaDeResultados([A, B], true));
    expect(assinaturaDeResultados([A, B], true)).not.toBe(assinaturaDeResultados([A], true));
    expect(assinaturaDeResultados([A], true)).not.toBe(assinaturaDeResultados([A], false));
  });
});

describe("abertura automática com a busca por palavras (só a busca antiga abre o detalhe)", () => {
  const fedex = (id: string, consultor: ConsultorProcesso, paciente: string): Processo => ({
    ...proc(id, consultor, paciente),
    companhiaAerea: "FedEx",
  });
  const maria = fedex("m", "Dani", "Maria Alves"); // a busca antiga acha por "maria"
  const outro = fedex("o", "Bolívar", "Pedro Costa"); // só a busca por palavras acha por "fedex"

  it('"fedex": a lista aparece (grupos abrem) mas nenhum detalhe abre sozinho', () => {
    const termo = criarTermoBusca("fedex")!;
    const auto = calcularAberturaAutomatica([maria, outro], true, termo);
    expect([...auto.grupos].sort()).toEqual(["Bolívar", "Dani"]);
    expect(auto.detalhes).toEqual([]);
  });

  it("o detalhe só abre para quem a busca antiga também acha (paciente, pasta, Nº Ordem)", () => {
    const termo = criarTermoBusca("maria")!;
    const comFedex = { ...maria, companhiaAerea: "FedEx" };
    expect(calcularAberturaAutomatica([comFedex], true, termo).detalhes).toEqual(["m"]);
    // Pasta e PO (busca antiga) continuam abrindo o detalhe.
    const p = { ...proc("p", "Dani", "Ana", "2026 - 430"), numeroPo: "PO26-10-0471" };
    expect(calcularAberturaAutomatica([p], true, criarTermoBusca("2026-430")!).detalhes).toEqual(["p"]);
    expect(calcularAberturaAutomatica([p], true, criarTermoBusca("26100471")!).detalhes).toEqual(["p"]);
  });

  it("misto: com até 5 resultados abre só o detalhe de quem a busca antiga acha; com 6+ nenhum", () => {
    const misto = [
      proc("a", "Dani", "Fedex Silva"), // paciente tem "fedex": a busca antiga acha
      fedex("b", "Dani", "Pedro Costa"), // só pelas palavras
    ];
    const termo = criarTermoBusca("fedex")!;
    expect(calcularAberturaAutomatica(misto, true, termo).detalhes).toEqual(["a"]);
    const muitos = [...misto, ...Array.from({ length: 4 }, (_, i) => fedex(`x${i}`, "Dani", `Outro ${i}`))];
    expect(calcularAberturaAutomatica(muitos, true, termo).detalhes).toEqual([]);
  });

  it("sem termo (uso antigo), a regra dos 5 vale para todos, como antes", () => {
    expect(calcularAberturaAutomatica([maria, outro], true).detalhes).toEqual(["m", "o"]);
  });

  it("avancarAberturaPorBusca: buscar por 'fedex' não abre detalhes; buscar por 'maria' abre", () => {
    const passo = (termo: string, encontrados: Processo[]) =>
      avancarAberturaPorBusca({ termo, encontrados, agrupado: true, atual: vazio(), snapshot: null, assinatura: null });
    const porFedex = passo("fedex", [maria, outro]);
    expect(lista(porFedex.estado)).toEqual({ grupos: ["Bolívar", "Dani"], detalhes: [] });
    const porMaria = passo("maria", [maria]);
    expect(lista(porMaria.estado)).toEqual({ grupos: ["Dani"], detalhes: ["m"] });
  });

  it("a assinatura muda quando o mesmo conjunto passa a ser achado só pelas palavras", () => {
    const pelaAntiga = assinaturaDeResultados([maria], true, criarTermoBusca("maria")!);
    const soPalavras = assinaturaDeResultados([maria], true, criarTermoBusca("fedex")!);
    expect(pelaAntiga).not.toBe(soPalavras);
    // mesmo conjunto e mesma situação: mesma assinatura (as escolhas manuais continuam valendo)
    expect(assinaturaDeResultados([maria], true, criarTermoBusca("mari")!)).toBe(
      assinaturaDeResultados([maria], true, criarTermoBusca("maria")!),
    );
    // sem termo, o formato de sempre
    expect(assinaturaDeResultados([maria], true)).toBe("g:m");
  });
});
