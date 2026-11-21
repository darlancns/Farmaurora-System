import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListaCompras } from "../../shared/types/compra";
import type { StatusDaCompra } from "../../shared/constants/compra";
import { validarConsultaListaCompras } from "../../shared/utils/compraValidacao";
import { FakeSupabase } from "./helpers/fakeSupabase";

// A lista do mês (painel esquerdo): paginação "mostrar mais", filtro por estado, totais do mês inteiro, e o que NÃO sai dela.
// Dados fictícios (TESTE).

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { ComprasRegraError, listarComprasDoMes } = await import("../../server/utils/comprasStore");

// ── Semeadura ─────────────────────────────────────────────────────────────────────────────────────────────────

const SEGREDOS = {
  contatos: "CONTATO SECRETO TESTE 11 90000-0000",
  entrega: "ENDERECO DE ENTREGA SECRETO TESTE",
  localAplicacao: "LOCAL DE APLICACAO SECRETO TESTE",
  observacoes: "OBSERVACAO SECRETA TESTE",
  termoObservacao: "TERMO SECRETO TESTE",
  isencaoPara: "ISENCAO PARA SECRETO TESTE",
  medico: "MEDICO SECRETO TESTE",
  processo: "PROCESSO-SECRETO-TESTE",
  valorUnitario: "98765.43",
  valorReal: "87654.32",
  frete: "76543.21",
  freteReal: "65432.10",
  cia: "CIA SECRETA TESTE",
  criadoPor: "CRIADOR SECRETO TESTE",
};

interface Semente {
  sequencia: number;
  /** O estado que a checagem DEVE dar. */
  estado: StatusDaCompra;
  anoMes?: string;
  itensPorOrdem?: number;
  /** Quantas ordens semear (padrão: 1 para 'pronta' e 0 para as outras). */
  ordens?: number;
  nomeBase?: string;
}

let contador = 0;

function semearCompra(s: Semente): string {
  const id = `cmp_${String(++contador).padStart(6, "0")}`;
  const pronta = s.estado === "pronta";
  fake.semear("compras", [
    {
      id,
      ano_mes: s.anoMes ?? "2026-11",
      sequencia: s.sequencia,
      cancelada: s.estado === "cancelada",
      paciente: `PACIENTE TESTE ${s.sequencia}`,
      processo_numero: pronta ? SEGREDOS.processo : "",
      medico: pronta ? SEGREDOS.medico : "",
      local_aplicacao: SEGREDOS.localAplicacao,
      entrega: SEGREDOS.entrega,
      contatos: SEGREDOS.contatos,
      termo_observacao: SEGREDOS.termoObservacao,
      despachante: pronta ? "DESPACHANTE TESTE" : "",
      isencao_para: SEGREDOS.isencaoPara,
      observacoes: SEGREDOS.observacoes,
      vendedor: pronta ? "VENDEDOR TESTE" : "",
      responsavel: pronta ? "RESPONSAVEL TESTE" : "",
      compra_particular: false,
      local_declarado: false,
      termo_posterior: false,
      courier_simples: false,
      isencao: false,
      recorrente: false,
      pagamento_alvara: null,
      pagamento_momento: pronta ? "vamos_pagar" : null,
      documentos: true,
      pendencias: [],
      criado_por: SEGREDOS.criadoPor,
      atualizado_por: "TESTE",
      created_at: "2026-11-19T12:00:00.000Z",
      updated_at: "2026-11-19T12:00:00.000Z",
    },
  ]);

  // Uma ordem por compra (ou `ordens`); rascunho/cancelada ficam sem ordem.
  const qtdOrdens = s.ordens ?? (pronta ? 1 : 0);
  for (let o = 1; o <= qtdOrdens; o++) {
    const ordemId = `ord_${id}_${o}`;
    fake.semear("compra_ordens", [
      {
        id: ordemId,
        compra_id: id,
        posicao: o,
        fornecedor: "FORNECEDOR TESTE",
        envio: "Air Cargo",
        cia: SEGREDOS.cia,
        po: `PO26-11-${String(s.sequencia * 10 + o).padStart(4, "0")}`,
        frete: SEGREDOS.frete,
        frete_real: SEGREDOS.freteReal,
      },
    ]);
    const itens = Array.from({ length: s.itensPorOrdem ?? 1 }, (_, i) => ({
      id: `itm_${ordemId}_${i + 1}`,
      ordem_id: ordemId,
      posicao: i + 1,
      medicamento: s.nomeBase === "curto" ? `M${i + 1}` : `${s.nomeBase ?? "MED"} ${s.sequencia}-${o}-${i + 1}`,
      medicamento_cadastro_id: "med_1",
      pre_cadastro_id: null,
      apresentacao: s.nomeBase === "curto" ? "" : "10 mg",
      referencia: "",
      laboratorio: "",
      quantidade: "2 caixas",
      temperatura: "2°C a 8°C",
      valor_unitario: SEGREDOS.valorUnitario,
      valor_real: SEGREDOS.valorReal,
    }));
    fake.semear("compra_itens", itens);
  }
  return id;
}

beforeEach(() => {
  for (const t of ["compras", "compra_ordens", "compra_itens"]) fake.tabelas[t] = [];
  fake.chamadas.length = 0;
  contador = 0;
});

const sequencias = (l: ListaCompras): number[] => l.compras.map((c) => c.sequencia);

// ── O formato ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("o item da lista", () => {
  it("formato exato: id, anoMes, sequencia, cancelada, paciente, medicamentos, totalOrdens, pendencias, status, atualizadoEm", async () => {
    const id = semearCompra({ sequencia: 1, estado: "pronta", ordens: 2, itensPorOrdem: 2 });
    const lista = await listarComprasDoMes("2026-11");
    expect(lista.compras).toEqual([
      {
        id,
        anoMes: "2026-11",
        sequencia: 1,
        cancelada: false,
        paciente: "PACIENTE TESTE 1",
        medicamentos: ["MED 1-1-1", "MED 1-1-2", "MED 1-2-1", "MED 1-2-2"],
        totalOrdens: 2,
        pendencias: 0,
        status: "pronta",
        atualizadoEm: "2026-11-19T12:00:00.000Z",
      },
    ]);
  });

  it("pendencias = contarPendencias; status = statusDaCompra (rascunho com N pendências)", async () => {
    semearCompra({ sequencia: 1, estado: "rascunho" });
    const [c] = (await listarComprasDoMes("2026-11")).compras;
    expect(c).toMatchObject({ status: "rascunho", medicamentos: [], totalOrdens: 0 });
    // paciente preenchido; faltam processo, médico, vendedor, responsável, ordens, despachante e momento do pagamento
    expect(c!.pendencias).toBe(7);
  });

  it("a lista NÃO traz valores, contatos, endereços nem outros dados: nem o campo, nem o texto, em lugar nenhum da resposta", async () => {
    for (const estado of ["pronta", "rascunho", "cancelada"] as const) semearCompra({ sequencia: ++contador, estado, itensPorOrdem: 2 });
    const lista = await listarComprasDoMes("2026-11", { incluirCanceladas: true });
    const texto = JSON.stringify(lista);
    for (const [campo, segredo] of Object.entries(SEGREDOS)) expect(texto, campo).not.toContain(segredo);
    expect(texto).not.toMatch(/DESPACHANTE TESTE|VENDEDOR TESTE|RESPONSAVEL TESTE|98765|87654|76543|65432/);
    const chaves = new Set(lista.compras.flatMap((c) => Object.keys(c)));
    expect([...chaves].sort()).toEqual(
      ["anoMes", "atualizadoEm", "cancelada", "id", "medicamentos", "paciente", "pendencias", "sequencia", "status", "totalOrdens"].sort(),
    );
    expect(Object.keys(lista).sort()).toEqual(["anoMes", "compras", "limite", "pagina", "status", "temMais", "totais", "total"]);
  });

  it("lê só as colunas necessárias (nunca `*`, contatos, valores, frete, observações) e NÃO consulta a DIR", async () => {
    semearCompra({ sequencia: 1, estado: "pronta" });
    const lidas: string[] = [];
    const from = fake.from.bind(fake);
    vi.spyOn(fake, "from").mockImplementation(((tabela: string) => {
      const consulta = from(tabela);
      const select = consulta.select.bind(consulta);
      return Object.assign(consulta, {
        select: (colunas?: string, ...resto: unknown[]) => {
          lidas.push(`${tabela}:${colunas ?? "*"}`);
          return (select as (...a: unknown[]) => unknown)(colunas, ...resto);
        },
      });
    }) as unknown as typeof fake.from);

    await listarComprasDoMes("2026-11");
    expect(lidas.length).toBeGreaterThanOrEqual(3);
    for (const l of lidas) {
      expect(l, l).not.toMatch(/\*|contatos|valor|frete|observacoes|termo_observacao|isencao_para|criado_por|atualizado_por|chave_?pix|(^|[ ,:])cia(,|$)/);
    }
    expect(new Set(fake.chamadas.map((c) => c.tabela))).toEqual(new Set(["compras", "compra_ordens", "compra_itens"]));
    vi.restoreAllMocks();
  });

  it("não escreve em nada (só select)", async () => {
    semearCompra({ sequencia: 1, estado: "pronta" });
    fake.chamadas.length = 0;
    await listarComprasDoMes("2026-11");
    expect(fake.chamadas.filter((c) => c.op !== "select")).toEqual([]);
  });
});

// ── O mês, a ordem e as canceladas ───────────────────────────────────────────────────────────────────────────

describe("o mês e a ordem", () => {
  it("só o mês pedido, sequencia desc, sem as canceladas por padrão", async () => {
    semearCompra({ sequencia: 1, estado: "rascunho" });
    semearCompra({ sequencia: 2, estado: "cancelada" });
    semearCompra({ sequencia: 3, estado: "pronta" });
    semearCompra({ sequencia: 1, estado: "rascunho", anoMes: "2026-12" });
    const lista = await listarComprasDoMes("2026-11");
    expect(sequencias(lista)).toEqual([3, 1]);
    expect(lista.anoMes).toBe("2026-11");
    expect((await listarComprasDoMes("2026-12")).compras).toHaveLength(1);
    expect((await listarComprasDoMes("2025-01")).compras).toEqual([]);
  });

  it("a ordem é NUMÉRICA (12 vem antes de 9; 100 antes de 99)", async () => {
    for (const n of [9, 10, 12, 99, 100, 2]) semearCompra({ sequencia: n, estado: "rascunho" });
    expect(sequencias(await listarComprasDoMes("2026-11"))).toEqual([100, 99, 12, 10, 9, 2]);
  });

  it("incluirCanceladas traz as canceladas junto; status=cancelada traz só elas", async () => {
    semearCompra({ sequencia: 1, estado: "rascunho" });
    semearCompra({ sequencia: 2, estado: "cancelada" });
    semearCompra({ sequencia: 3, estado: "pronta" });
    expect(sequencias(await listarComprasDoMes("2026-11", { incluirCanceladas: true }))).toEqual([3, 2, 1]);
    const so = await listarComprasDoMes("2026-11", { status: "cancelada" });
    expect(sequencias(so)).toEqual([2]);
    expect(so.status).toBe("cancelada");
    expect(so.compras[0]!.status).toBe("cancelada");
  });

  it("mês fora do formato AAAA-MM é 400", async () => {
    for (const ruim of ["2026-13", "2026-1", "26-11", "novembro", "", "2026-11-01", "2026-00"]) {
      await expect(listarComprasDoMes(ruim), ruim).rejects.toMatchObject({ statusCode: 400 });
    }
    await expect(listarComprasDoMes("x")).rejects.toBeInstanceOf(ComprasRegraError);
  });
});

// ── Filtro por estado ────────────────────────────────────────────────────────────────────────────────────────

describe("filtro por estado", () => {
  beforeEach(() => {
    // 1..3 rascunho, 4..7 pronta, 8..9 cancelada
    for (let n = 1; n <= 3; n++) semearCompra({ sequencia: n, estado: "rascunho" });
    for (let n = 4; n <= 7; n++) semearCompra({ sequencia: n, estado: "pronta" });
    for (let n = 8; n <= 9; n++) semearCompra({ sequencia: n, estado: "cancelada" });
  });

  it.each([
    ["rascunho", [3, 2, 1]],
    ["pronta", [7, 6, 5, 4]],
    ["cancelada", [9, 8]],
  ] as const)("status=%s devolve só as dele, em sequencia desc", async (status, esperado) => {
    const lista = await listarComprasDoMes("2026-11", { status });
    expect(sequencias(lista)).toEqual(esperado);
    expect(lista.compras.every((c) => c.status === status)).toBe(true);
    expect(lista.total).toBe(esperado.length);
  });

  it("sem filtro: todas menos as canceladas", async () => {
    const lista = await listarComprasDoMes("2026-11");
    expect(lista.total).toBe(7);
    expect(lista.compras.some((c) => c.status === "cancelada")).toBe(false);
  });

  it("os totais por estado são do mês INTEIRO, iguais com qualquer filtro e em qualquer página", async () => {
    const esperado = { rascunho: 3, pronta: 4, cancelada: 2 };
    for (const opcoes of [{}, { status: "pronta" as const }, { status: "cancelada" as const }, { pagina: 2 }, { incluirCanceladas: true }, { limite: 2, pagina: 3 }]) {
      expect((await listarComprasDoMes("2026-11", opcoes)).totais, JSON.stringify(opcoes)).toEqual(esperado);
    }
  });

  it("os totais não misturam outro mês", async () => {
    semearCompra({ sequencia: 1, estado: "pronta", anoMes: "2026-12" });
    expect((await listarComprasDoMes("2026-11")).totais.pronta).toBe(4);
  });
});

// ── Paginação ("mostrar mais") ───────────────────────────────────────────────────────────────────────────────

describe("paginação: 50 por vez", () => {
  beforeEach(() => {
    for (let n = 1; n <= 130; n++) semearCompra({ sequencia: n, estado: n % 2 === 0 ? "pronta" : "rascunho" });
  });

  it("130 compras: página 1 e 2 com 50 (temMais), página 3 com 30 (sem mais); sem repetir nem pular; total e totais do mês todo", async () => {
    const p1 = await listarComprasDoMes("2026-11");
    const p2 = await listarComprasDoMes("2026-11", { pagina: 2 });
    const p3 = await listarComprasDoMes("2026-11", { pagina: 3 });
    expect([p1.compras.length, p2.compras.length, p3.compras.length]).toEqual([50, 50, 30]);
    expect([p1.temMais, p2.temMais, p3.temMais]).toEqual([true, true, false]);
    expect([p1.pagina, p2.pagina, p3.pagina]).toEqual([1, 2, 3]);
    expect(p1.limite).toBe(50);
    const todas = [...sequencias(p1), ...sequencias(p2), ...sequencias(p3)];
    expect(todas).toEqual(Array.from({ length: 130 }, (_, i) => 130 - i)); // 130, 129, ..., 1
    for (const p of [p1, p2, p3]) {
      expect(p.total).toBe(130);
      expect(p.totais).toMatchObject({ pronta: 65, rascunho: 65 });
    }
  });

  it("exatamente na borda: 50 compras não têm 'mostrar mais'; 51 têm", async () => {
    for (const t of ["compras", "compra_ordens", "compra_itens"]) fake.tabelas[t] = [];
    for (let n = 1; n <= 50; n++) semearCompra({ sequencia: n, estado: "rascunho" });
    expect((await listarComprasDoMes("2026-11")).temMais).toBe(false);
    semearCompra({ sequencia: 51, estado: "rascunho" });
    expect((await listarComprasDoMes("2026-11")).temMais).toBe(true);
  });

  it("a página vale DEPOIS do filtro (o 'mostrar mais' de Prontas pagina só as prontas)", async () => {
    const p1 = await listarComprasDoMes("2026-11", { status: "pronta", limite: 20 });
    const p4 = await listarComprasDoMes("2026-11", { status: "pronta", limite: 20, pagina: 4 });
    expect(p1.compras).toHaveLength(20);
    expect(p1.temMais).toBe(true);
    expect(p1.total).toBe(65);
    expect(p4.compras).toHaveLength(5);
    expect(p4.temMais).toBe(false);
  });

  it("página além do fim: lista vazia, sem 'mostrar mais', com os totais", async () => {
    const p = await listarComprasDoMes("2026-11", { pagina: 99 });
    expect(p).toMatchObject({ compras: [], temMais: false, total: 130 });
  });
});

describe("mês grande: passa do teto de 1000 linhas por consulta do PostgREST", () => {
  it("40 compras com 1 ordem de 30 itens (1200 itens): nenhum medicamento se perde e o status vale", async () => {
    for (let n = 1; n <= 40; n++) semearCompra({ sequencia: n, estado: "pronta", itensPorOrdem: 30, nomeBase: "curto" });
    expect(fake.tabelas.compra_itens).toHaveLength(1200);
    const lista = await listarComprasDoMes("2026-11", { limite: 40 });
    expect(lista.compras).toHaveLength(40);
    for (const c of lista.compras) {
      expect(c.medicamentos, `compra ${c.sequencia}`).toHaveLength(30);
      expect(c.status).toBe("pronta");
    }
    expect(lista.totais.pronta).toBe(40);
  });

  it("mais de 1000 compras no mês: todas contadas nos totais", async () => {
    for (let n = 1; n <= 1100; n++) semearCompra({ sequencia: n, estado: "rascunho" });
    const lista = await listarComprasDoMes("2026-11");
    expect(lista.total).toBe(1100);
    expect(lista.totais.rascunho).toBe(1100);
    expect(lista.compras).toHaveLength(50);
    expect(lista.compras[0]!.sequencia).toBe(1100);
  });
});

// ── A consulta ───────────────────────────────────────────────────────────────────────────────────────────────

describe("validarConsultaListaCompras", () => {
  it("padrões: mês atual, sem filtro, página 1", () => {
    expect(validarConsultaListaCompras({}, "2026-11")).toEqual({ ok: true, valor: { anoMes: "2026-11", status: null, incluirCanceladas: false, pagina: 1 } });
  });

  it("aceita os 3 estados, a página e ?incluir_canceladas=1", () => {
    for (const s of ["rascunho", "pronta", "cancelada"]) expect(validarConsultaListaCompras({ status: s }, "2026-11")).toMatchObject({ ok: true, valor: { status: s } });
    expect(validarConsultaListaCompras({ ano_mes: "2026-10", pagina: "3", incluir_canceladas: "1" }, "2026-11")).toEqual({
      ok: true,
      valor: { anoMes: "2026-10", status: null, incluirCanceladas: true, pagina: 3 },
    });
    expect(validarConsultaListaCompras({ status: "" }, "2026-11")).toMatchObject({ ok: true, valor: { status: null } });
  });

  it("status desconhecido, repetido ou com outra caixa; página 0, negativa, decimal ou texto; mês ruim → erro", () => {
    for (const ruim of [{ status: "todas" }, { status: "PRONTA" }, { status: "parcial" }, { status: "encaminhada" }, { status: ["pronta", "rascunho"] }, { status: 1 }, { pagina: "0" }, { pagina: "-1" }, { pagina: "1.5" }, { pagina: "x" }, { pagina: ["1", "2"] }, { ano_mes: "2026-13" }]) {
      expect(validarConsultaListaCompras(ruim, "2026-11").ok, JSON.stringify(ruim)).toBe(false);
    }
  });
});
