import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListaCompras } from "../../shared/types/compra";
import { FakeSupabase } from "./helpers/fakeSupabase";

// A lista do mês (painel esquerdo): paginação "mostrar mais", ativas e canceladas, totais do mês inteiro, e o que NÃO sai dela.
// O estado da compra é só derivado: ativa ou cancelada. Dados fictícios (TESTE).

const fake = new FakeSupabase();
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { listarComprasDoMes } = await import("../../server/utils/comprasStore");
const { ComprasRegraError } = await import("../../server/utils/comprasErro");

// ── Semeadura ─────────────────────────────────────────────────────────────────────────────────────────────────

const SEGREDOS = {
  contatos: "CONTATO SECRETO TESTE 11 90000-0000",
  entrega: "ENDERECO DE ENTREGA SECRETO TESTE",
  localAplicacao: "LOCAL DE APLICACAO SECRETO TESTE",
  observacoes: "OBSERVACAO SECRETA TESTE",
  termoObservacao: "TERMO SECRETO TESTE",
  medico: "MEDICO SECRETO TESTE",
  processo: "PROCESSO-SECRETO-TESTE",
  valorUnitario: "98765.43",
  valorReal: "87654.32",
  frete: "76543.21",
  freteReal: "65432.10",
  cia: "CIA SECRETA TESTE",
  fornecedor: "FORNECEDOR SECRETO TESTE",
  laboratorio: "LABORATORIO SECRETO TESTE",
  criadoPor: "CRIADOR SECRETO TESTE",
};

interface Semente {
  sequencia: number;
  cancelada?: boolean;
  anoMes?: string;
  /** Quantos medicamentos (itens) semear (padrão 1). */
  itens?: number;
  numeroOrdens?: number;
  nomeBase?: string;
}

let contador = 0;

function semearCompra(s: Semente): string {
  const id = `cmp_${String(++contador).padStart(6, "0")}`;
  fake.semear("compras", [
    {
      id,
      ano_mes: s.anoMes ?? "2026-11",
      sequencia: s.sequencia,
      cancelada: s.cancelada === true,
      fornecedor: SEGREDOS.fornecedor,
      envio: "Air Cargo",
      cia: SEGREDOS.cia,
      frete: SEGREDOS.frete,
      frete_real: SEGREDOS.freteReal,
      empresa: "FARMAURORA",
      numero_ordens: s.numeroOrdens ?? 1,
      paciente: `PACIENTE TESTE ${s.sequencia}`,
      processo_numero: SEGREDOS.processo,
      medico: SEGREDOS.medico,
      local_aplicacao: SEGREDOS.localAplicacao,
      entrega: SEGREDOS.entrega,
      contatos: SEGREDOS.contatos,
      termo_observacao: SEGREDOS.termoObservacao,
      despachante: "DESPACHANTE TESTE",
      observacoes: SEGREDOS.observacoes,
      consultor: "CONSULTOR TESTE",
      responsavel: "RESPONSAVEL TESTE",
      compra_particular: false,
      termo_posterior: false,
      isencao: false,
      recorrente: false,
      pagamento_alvara: null,
      pagamento_momento: "vamos_pagar",
      documentos: true,
      pendencias: [],
      criado_por: SEGREDOS.criadoPor,
      atualizado_por: "TESTE",
      created_at: "2026-11-19T12:00:00.000Z",
      updated_at: "2026-11-19T12:00:00.000Z",
    },
  ]);

  const itens = Array.from({ length: s.itens ?? 1 }, (_, i) => ({
    id: `itm_${id}_${i + 1}`,
    compra_id: id,
    posicao: i + 1,
    medicamento: s.nomeBase === "curto" ? `M${i + 1}` : `${s.nomeBase ?? "MED"} ${s.sequencia}-${i + 1} 10 mg`,
    medicamento_cadastro_id: "med_1",
    pre_cadastro_id: null,
    brand: "referencia",
    laboratorio: SEGREDOS.laboratorio,
    quantidade: "2 caixas",
    temperatura: "2°C a 8°C",
    valor_unitario: SEGREDOS.valorUnitario,
    valor_real: SEGREDOS.valorReal,
  }));
  fake.semear("compra_itens", itens);
  return id;
}

beforeEach(() => {
  for (const t of ["compras", "compra_itens"]) fake.tabelas[t] = [];
  fake.chamadas.length = 0;
  contador = 0;
});

const sequencias = (l: ListaCompras): number[] => l.compras.map((c) => c.sequencia);

// ── O formato ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("o item da lista", () => {
  it("formato exato: id, anoMes, sequencia, cancelada, paciente, medicamentos, numeroOrdens, atualizadoEm (sem status nem pendências)", async () => {
    const id = semearCompra({ sequencia: 1, itens: 2, numeroOrdens: 3 });
    const lista = await listarComprasDoMes("2026-11");
    expect(lista.compras).toEqual([
      {
        id,
        anoMes: "2026-11",
        sequencia: 1,
        cancelada: false,
        paciente: "PACIENTE TESTE 1",
        medicamentos: ["MED 1-1 10 mg", "MED 1-2 10 mg"],
        numeroOrdens: 3,
        atualizadoEm: "2026-11-19T12:00:00.000Z",
      },
    ]);
  });

  it("compra sem itens: medicamentos [] ; numeroOrdens é o digitado (padrão 1)", async () => {
    semearCompra({ sequencia: 1, itens: 0 });
    const [c] = (await listarComprasDoMes("2026-11")).compras;
    expect(c).toMatchObject({ medicamentos: [], numeroOrdens: 1 });
  });

  it("a lista NÃO traz valores, contatos, endereços, fornecedor, laboratório nem outros dados: nem o campo, nem o texto, em lugar nenhum da resposta", async () => {
    semearCompra({ sequencia: 1, itens: 2 });
    semearCompra({ sequencia: 2, itens: 2, cancelada: true });
    const lista = await listarComprasDoMes("2026-11", { incluirCanceladas: true });
    const texto = JSON.stringify(lista);
    for (const [campo, segredo] of Object.entries(SEGREDOS)) expect(texto, campo).not.toContain(segredo);
    expect(texto).not.toMatch(/DESPACHANTE TESTE|CONSULTOR TESTE|RESPONSAVEL TESTE|98765|87654|76543|65432/);
    const chaves = new Set(lista.compras.flatMap((c) => Object.keys(c)));
    expect([...chaves].sort()).toEqual(["anoMes", "atualizadoEm", "cancelada", "id", "medicamentos", "numeroOrdens", "paciente", "sequencia"].sort());
    expect(Object.keys(lista).sort()).toEqual(["anoMes", "compras", "limite", "pagina", "temMais", "total", "totais"].sort());
  });

  it("lê só as colunas necessárias (nunca `*`, contatos, valores, frete, fornecedor, observações) e NÃO consulta a DIR nem os Cadastros", async () => {
    semearCompra({ sequencia: 1 });
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
    expect(lidas.sort()).toEqual(["compra_itens:id, compra_id, posicao, medicamento", "compras:id, ano_mes, sequencia, cancelada, paciente, numero_ordens, updated_at"]);
    for (const l of lidas) {
      expect(l, l).not.toMatch(/\*|contatos|valor|frete|observacoes|termo_observacao|criado_por|atualizado_por|chave_?pix|fornecedor|laboratorio|(^|[ ,:])cia(,|$)/);
    }
    expect(new Set(fake.chamadas.map((c) => c.tabela))).toEqual(new Set(["compras", "compra_itens"]));
    vi.restoreAllMocks();
  });

  it("não escreve em nada (só select)", async () => {
    semearCompra({ sequencia: 1 });
    fake.chamadas.length = 0;
    await listarComprasDoMes("2026-11");
    expect(fake.chamadas.filter((c) => c.op !== "select")).toEqual([]);
  });
});

// ── O mês, a ordem e as canceladas ────────────────────────────────────────────────────────────────────────────

describe("o mês e a ordem", () => {
  it("só o mês pedido, sequencia desc, sem as canceladas por padrão", async () => {
    semearCompra({ sequencia: 1 });
    semearCompra({ sequencia: 2, cancelada: true });
    semearCompra({ sequencia: 3 });
    semearCompra({ sequencia: 1, anoMes: "2026-12" });
    const lista = await listarComprasDoMes("2026-11");
    expect(sequencias(lista)).toEqual([3, 1]);
    expect(lista.anoMes).toBe("2026-11");
    expect((await listarComprasDoMes("2026-12")).compras).toHaveLength(1);
    expect((await listarComprasDoMes("2025-01")).compras).toEqual([]);
  });

  it("a ordem é NUMÉRICA (12 vem antes de 9; 100 antes de 99)", async () => {
    for (const n of [9, 10, 12, 99, 100, 2]) semearCompra({ sequencia: n });
    expect(sequencias(await listarComprasDoMes("2026-11"))).toEqual([100, 99, 12, 10, 9, 2]);
  });

  it("incluirCanceladas traz as canceladas junto, na mesma ordem; cada item diz se está cancelado", async () => {
    semearCompra({ sequencia: 1 });
    semearCompra({ sequencia: 2, cancelada: true });
    semearCompra({ sequencia: 3 });
    const todas = await listarComprasDoMes("2026-11", { incluirCanceladas: true });
    expect(sequencias(todas)).toEqual([3, 2, 1]);
    expect(todas.compras.map((c) => c.cancelada)).toEqual([false, true, false]);
    expect(todas.total).toBe(3);
  });

  it("mês fora do formato AAAA-MM é 400", async () => {
    for (const ruim of ["2026-13", "2026-1", "26-11", "novembro", "", "2026-11-01", "2026-00"]) {
      await expect(listarComprasDoMes(ruim), ruim).rejects.toMatchObject({ statusCode: 400 });
    }
    await expect(listarComprasDoMes("x")).rejects.toBeInstanceOf(ComprasRegraError);
  });
});

// ── Totais ────────────────────────────────────────────────────────────────────────────────────────────────────

describe("totais { ativas, canceladas }", () => {
  beforeEach(() => {
    // 1..4 ativas, 5..6 canceladas
    for (let n = 1; n <= 4; n++) semearCompra({ sequencia: n });
    for (let n = 5; n <= 6; n++) semearCompra({ sequencia: n, cancelada: true });
  });

  it("são do mês INTEIRO, iguais com ou sem canceladas e em qualquer página", async () => {
    const esperado = { ativas: 4, canceladas: 2 };
    for (const opcoes of [{}, { pagina: 2 }, { incluirCanceladas: true }, { limite: 2, pagina: 3 }, { incluirCanceladas: true, limite: 1, pagina: 5 }]) {
      expect((await listarComprasDoMes("2026-11", opcoes)).totais, JSON.stringify(opcoes)).toEqual(esperado);
    }
  });

  it("canceladas conta as canceladas (e só elas) mesmo sem pedir para listá-las; ativas não conta canceladas", async () => {
    const lista = await listarComprasDoMes("2026-11");
    expect(lista.totais.canceladas).toBe(2);
    expect(lista.totais.ativas).toBe(4);
    expect(lista.compras.every((c) => !c.cancelada)).toBe(true);
    expect(lista.total).toBe(4); // sem as canceladas
  });

  it("não misturam outro mês", async () => {
    semearCompra({ sequencia: 1, anoMes: "2026-12" });
    semearCompra({ sequencia: 2, anoMes: "2026-12", cancelada: true });
    expect((await listarComprasDoMes("2026-11")).totais).toEqual({ ativas: 4, canceladas: 2 });
    expect((await listarComprasDoMes("2026-12")).totais).toEqual({ ativas: 1, canceladas: 1 });
  });

  it("o formato é só { ativas, canceladas } (sem rascunho, pronta, parcial nem encaminhada)", async () => {
    expect(Object.keys((await listarComprasDoMes("2026-11")).totais).sort()).toEqual(["ativas", "canceladas"]);
  });
});

// ── Paginação ("mostrar mais") ────────────────────────────────────────────────────────────────────────────────

describe("paginação: 50 por vez", () => {
  beforeEach(() => {
    for (let n = 1; n <= 130; n++) semearCompra({ sequencia: n, cancelada: n % 2 === 0 });
  });

  it("130 compras (65 ativas): a lista só tem as ativas, em páginas; sem repetir nem pular; total e totais do mês todo", async () => {
    const p1 = await listarComprasDoMes("2026-11");
    const p2 = await listarComprasDoMes("2026-11", { pagina: 2 });
    expect([p1.compras.length, p2.compras.length]).toEqual([50, 15]);
    expect([p1.temMais, p2.temMais]).toEqual([true, false]);
    expect([p1.pagina, p2.pagina]).toEqual([1, 2]);
    expect(p1.limite).toBe(50);
    expect([...sequencias(p1), ...sequencias(p2)]).toEqual(Array.from({ length: 65 }, (_, i) => 129 - 2 * i)); // 129, 127, ..., 1
    for (const p of [p1, p2]) {
      expect(p.total).toBe(65);
      expect(p.totais).toEqual({ ativas: 65, canceladas: 65 });
    }
  });

  it("com as canceladas: 130 compras, página 1 e 2 com 50 (temMais), página 3 com 30 (sem mais)", async () => {
    const p1 = await listarComprasDoMes("2026-11", { incluirCanceladas: true });
    const p2 = await listarComprasDoMes("2026-11", { incluirCanceladas: true, pagina: 2 });
    const p3 = await listarComprasDoMes("2026-11", { incluirCanceladas: true, pagina: 3 });
    expect([p1.compras.length, p2.compras.length, p3.compras.length]).toEqual([50, 50, 30]);
    expect([p1.temMais, p2.temMais, p3.temMais]).toEqual([true, true, false]);
    expect([...sequencias(p1), ...sequencias(p2), ...sequencias(p3)]).toEqual(Array.from({ length: 130 }, (_, i) => 130 - i));
  });

  it("exatamente na borda: 50 compras não têm 'mostrar mais'; 51 têm", async () => {
    for (const t of ["compras", "compra_itens"]) fake.tabelas[t] = [];
    for (let n = 1; n <= 50; n++) semearCompra({ sequencia: n });
    expect((await listarComprasDoMes("2026-11")).temMais).toBe(false);
    semearCompra({ sequencia: 51 });
    expect((await listarComprasDoMes("2026-11")).temMais).toBe(true);
  });

  it("página além do fim: lista vazia, sem 'mostrar mais', com os totais", async () => {
    const p = await listarComprasDoMes("2026-11", { pagina: 99 });
    expect(p).toMatchObject({ compras: [], temMais: false, total: 65, totais: { ativas: 65, canceladas: 65 } });
  });
});

describe("mês grande: passa do teto de 1000 linhas por consulta do PostgREST", () => {
  it("40 compras com 30 itens cada (1200 itens): nenhum medicamento se perde", async () => {
    for (let n = 1; n <= 40; n++) semearCompra({ sequencia: n, itens: 30, nomeBase: "curto" });
    expect(fake.tabelas.compra_itens).toHaveLength(1200);
    const lista = await listarComprasDoMes("2026-11", { limite: 40 });
    expect(lista.compras).toHaveLength(40);
    for (const c of lista.compras) expect(c.medicamentos, `compra ${c.sequencia}`).toHaveLength(30);
    expect(lista.totais.ativas).toBe(40);
  });

  it("mais de 1000 compras no mês: todas contadas nos totais", async () => {
    for (let n = 1; n <= 1100; n++) semearCompra({ sequencia: n });
    const lista = await listarComprasDoMes("2026-11");
    expect(lista.total).toBe(1100);
    expect(lista.totais.ativas).toBe(1100);
    expect(lista.compras).toHaveLength(50);
    expect(lista.compras[0]!.sequencia).toBe(1100);
  });
});
