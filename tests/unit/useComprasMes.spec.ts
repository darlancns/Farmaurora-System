import { describe, expect, it, vi } from "vitest";
import type { StatusDaCompra } from "../../shared/constants/compra";
import type { Compra, CompraDaLista, ListaCompras, TotaisPorStatus } from "../../shared/types/compra";
import { itemDaLista } from "../../shared/utils/compraLista";
import { montarCompraDaLista } from "../../server/utils/compraMappers";
import { montarUrlLista, useComprasMes, type ApiListaCompras, type ParametrosLista } from "../../app/composables/useComprasMes";

// useComprasMes: mês de Brasília, filtro, totais, "mostrar mais" e a atualização do cartão logo depois de salvar. API simulada
// (sem rede). Dados fictícios (TESTE).

const item = (sequencia: number, status: StatusDaCompra = "rascunho", extra: Partial<CompraDaLista> = {}): CompraDaLista => ({
  id: `cmp_${sequencia}`,
  anoMes: "2026-11",
  sequencia,
  cancelada: status === "cancelada",
  paciente: `PACIENTE TESTE ${sequencia}`,
  medicamentos: [],
  totalOrdens: 0,
  totalOrdensEncaminhadas: 0,
  pendencias: 7,
  status,
  atualizadoEm: "2026-11-19T12:00:00.000Z",
  ...extra,
});

const totaisDe = (itens: CompraDaLista[]): TotaisPorStatus => {
  const t: TotaisPorStatus = { rascunho: 0, pronta: 0, parcial: 0, encaminhada: 0, cancelada: 0 };
  for (const i of itens) t[i.status] += 1;
  return t;
};

/** Um servidor de mentira com as compras do mês e a MESMA regra de filtro e página do de verdade. */
function servidor(porMes: Record<string, CompraDaLista[]>, tamanhoPagina = 50) {
  const chamadas: ParametrosLista[] = [];
  const api: ApiListaCompras = {
    listar: async (p) => {
      chamadas.push(p);
      const todas = [...(porMes[p.anoMes] ?? [])].sort((a, b) => b.sequencia - a.sequencia);
      const casam = todas.filter((c) => (p.status !== null ? c.status === p.status : p.incluirCanceladas || c.status !== "cancelada"));
      const de = (p.pagina - 1) * tamanhoPagina;
      const r: ListaCompras = {
        anoMes: p.anoMes,
        compras: casam.slice(de, de + tamanhoPagina),
        status: p.status,
        pagina: p.pagina,
        limite: tamanhoPagina,
        temMais: casam.length > de + tamanhoPagina,
        total: casam.length,
        totais: totaisDe(todas),
      };
      return r;
    },
  };
  return { api, chamadas };
}

const SEMPRE_NOVEMBRO = () => new Date("2026-11-19T15:00:00Z");

describe("mês inicial: o corrente de BRASÍLIA", () => {
  it.each([
    ["2026-12-01T01:30:00Z", "2026-11"],
    ["2026-12-01T02:59:59Z", "2026-11"],
    ["2026-12-01T03:00:00Z", "2026-12"],
    ["2027-01-01T01:00:00Z", "2026-12"],
  ])("agora = %s → %s", (agora, esperado) => {
    const m = useComprasMes({ agora: () => new Date(agora), api: servidor({}).api });
    expect(m.mes.value).toBe(esperado);
    expect(m.rotuloMes.value).toMatch(/^[A-Za-zÀ-ú]+\/\d{4}$/);
  });

  it("um mês passado na abertura (da URL) vale; um inválido é ignorado", () => {
    expect(useComprasMes({ mes: "2026-08", api: servidor({}).api }).mes.value).toBe("2026-08");
    expect(useComprasMes({ mes: "lixo", agora: SEMPRE_NOVEMBRO, api: servidor({}).api }).mes.value).toBe("2026-11");
  });

  it("o rótulo é o mês por extenso", () => {
    expect(useComprasMes({ mes: "2026-11", api: servidor({}).api }).rotuloMes.value).toBe("Novembro/2026");
  });
});

describe("carregar, totais e 'N compras'", () => {
  it("lê o mês e guarda lista, totais e total; 'N compras' soma tudo menos as canceladas", async () => {
    const compras = [item(1), item(2, "pronta"), item(3, "parcial"), item(4, "encaminhada"), item(5, "cancelada"), item(6, "cancelada")];
    const m = useComprasMes({ mes: "2026-11", api: servidor({ "2026-11": compras }).api });
    await m.carregar();
    expect(m.compras.value.map((c) => c.sequencia)).toEqual([4, 3, 2, 1]); // sem as canceladas
    expect(m.totais.value).toEqual({ rascunho: 1, pronta: 1, parcial: 1, encaminhada: 1, cancelada: 2 });
    expect(m.totalDoMes.value).toBe(4);
    expect(m.carregando.value).toBe(false);
    expect(m.erro.value).toBeNull();
  });

  it("falha na leitura: erro com a mensagem, sem derrubar o que já estava", async () => {
    const api: ApiListaCompras = { listar: vi.fn().mockRejectedValueOnce(new Error("Sem conexão.")).mockResolvedValue({ anoMes: "2026-11", compras: [], status: null, pagina: 1, limite: 50, temMais: false, total: 0, totais: totaisDe([]) }) };
    const m = useComprasMes({ mes: "2026-11", api });
    await m.carregar();
    expect(m.erro.value).toBe("Sem conexão.");
    await m.carregar();
    expect(m.erro.value).toBeNull();
  });

  it("uma resposta que chega atrasada (de outro mês) é descartada", async () => {
    let soltar: (r: ListaCompras) => void = () => undefined;
    const lenta = new Promise<ListaCompras>((r) => {
      soltar = r;
    });
    const rapida = servidor({ "2026-10": [item(1, "pronta", { anoMes: "2026-10" })] }).api;
    const api: ApiListaCompras = { listar: (p) => (p.anoMes === "2026-11" ? lenta : rapida.listar(p)) };
    const m = useComprasMes({ mes: "2026-11", api });
    const primeira = m.carregar();
    await m.irParaMes("2026-10"); // a segunda leitura termina antes
    soltar({ anoMes: "2026-11", compras: [item(9)], status: null, pagina: 1, limite: 50, temMais: false, total: 1, totais: totaisDe([item(9)]) });
    await primeira;
    expect(m.mes.value).toBe("2026-10");
    expect(m.compras.value.map((c) => c.sequencia)).toEqual([1]);
  });
});

describe("mês anterior e próximo", () => {
  it("troca o mês, relê e vira o ano nos dois sentidos", async () => {
    const s = servidor({ "2026-12": [item(1, "pronta", { anoMes: "2026-12" })], "2027-01": [item(1, "rascunho", { anoMes: "2027-01" })] });
    const m = useComprasMes({ mes: "2026-12", api: s.api });
    await m.mesSeguinte();
    expect([m.mes.value, m.rotuloMes.value]).toEqual(["2027-01", "Janeiro/2027"]);
    expect(m.compras.value[0]!.status).toBe("rascunho");
    await m.mesAnterior();
    await m.mesAnterior();
    expect(m.mes.value).toBe("2026-11");
    expect(m.compras.value).toEqual([]);
    expect(s.chamadas.map((c) => c.anoMes)).toEqual(["2027-01", "2026-12", "2026-11"]);
  });

  it("irParaMes com texto inválido não faz nada", async () => {
    const s = servidor({});
    const m = useComprasMes({ mes: "2026-11", api: s.api });
    await m.irParaMes("novembro");
    expect(m.mes.value).toBe("2026-11");
    expect(s.chamadas).toEqual([]);
  });
});

describe("filtro por estado e canceladas", () => {
  const compras = [item(1), item(2, "pronta"), item(3, "pronta"), item(4, "encaminhada"), item(5, "cancelada")];

  it("definirStatus relê com o filtro e mantém os totais do mês inteiro", async () => {
    const s = servidor({ "2026-11": compras });
    const m = useComprasMes({ mes: "2026-11", api: s.api });
    await m.carregar();
    await m.definirStatus("pronta");
    expect(s.chamadas.at(-1)).toMatchObject({ status: "pronta", pagina: 1 });
    expect(m.compras.value.map((c) => c.sequencia)).toEqual([3, 2]);
    expect(m.total.value).toBe(2);
    expect(m.totais.value).toEqual({ rascunho: 1, pronta: 2, parcial: 0, encaminhada: 1, cancelada: 1 });
    await m.definirStatus(null);
    expect(m.compras.value).toHaveLength(4);
  });

  it("repetir o mesmo filtro não relê", async () => {
    const s = servidor({ "2026-11": compras });
    const m = useComprasMes({ mes: "2026-11", status: "pronta", api: s.api });
    await m.definirStatus("pronta");
    await m.definirMostrarCanceladas(false);
    expect(s.chamadas).toEqual([]);
  });

  it("'Mostrar canceladas' pede incluir_canceladas e traz as canceladas junto", async () => {
    const s = servidor({ "2026-11": compras });
    const m = useComprasMes({ mes: "2026-11", api: s.api });
    await m.definirMostrarCanceladas(true);
    expect(s.chamadas.at(-1)).toMatchObject({ incluirCanceladas: true });
    expect(m.compras.value.map((c) => c.sequencia)).toEqual([5, 4, 3, 2, 1]);
  });
});

describe("mostrar mais (50 em 50)", () => {
  const cento = Array.from({ length: 120 }, (_, i) => item(i + 1));

  it("soma a próxima página sem repetir; temMais cai a false na última; N de M", async () => {
    const s = servidor({ "2026-11": cento }, 50);
    const m = useComprasMes({ mes: "2026-11", api: s.api });
    await m.carregar();
    expect([m.compras.value.length, m.total.value, m.temMais.value]).toEqual([50, 120, true]);
    await m.mostrarMais();
    expect([m.compras.value.length, m.temMais.value]).toEqual([100, true]);
    await m.mostrarMais();
    expect([m.compras.value.length, m.temMais.value]).toEqual([120, false]);
    expect(new Set(m.compras.value.map((c) => c.id)).size).toBe(120);
    expect(m.compras.value.map((c) => c.sequencia)).toEqual(Array.from({ length: 120 }, (_, i) => 120 - i));
    expect(s.chamadas.map((c) => c.pagina)).toEqual([1, 2, 3]);
    await m.mostrarMais(); // nada mais: não chama
    expect(s.chamadas).toHaveLength(3);
  });

  it("duas chamadas seguidas de mostrarMais não pedem a mesma página duas vezes", async () => {
    const s = servidor({ "2026-11": cento }, 50);
    const m = useComprasMes({ mes: "2026-11", api: s.api });
    await m.carregar();
    await Promise.all([m.mostrarMais(), m.mostrarMais()]);
    expect(s.chamadas.map((c) => c.pagina)).toEqual([1, 2]);
  });

  it("trocar de filtro volta para a página 1", async () => {
    const s = servidor({ "2026-11": cento }, 50);
    const m = useComprasMes({ mes: "2026-11", api: s.api });
    await m.carregar();
    await m.mostrarMais();
    await m.definirStatus("rascunho");
    expect(s.chamadas.at(-1)!.pagina).toBe(1);
    expect(m.compras.value).toHaveLength(50);
  });
});

// ── A atualização depois de salvar ───────────────────────────────────────────────────────────────────────────

function compraCompleta(extra: Partial<Compra> = {}): Compra {
  return {
    id: "cmp_2",
    anoMes: "2026-11",
    sequencia: 2,
    cancelada: false,
    paciente: "PACIENTE TESTE 2",
    processoNumero: "",
    medico: "",
    localAplicacao: "",
    entrega: "",
    contatos: "",
    termoObservacao: "",
    despachante: "",
    isencaoPara: "",
    observacoes: "",
    vendedor: "",
    responsavel: "",
    compraParticular: false,
    localDeclarado: false,
    termoPosterior: false,
    courierSimples: false,
    isencao: false,
    recorrente: false,
    pagamentoAlvara: null,
    pagamentoMomento: null,
    documentos: null,
    pendencias: [],
    criadoPor: "Cris",
    atualizadoPor: "Cris",
    createdAt: "2026-11-19T12:00:00.000Z",
    updatedAt: "2026-11-19T13:00:00.000Z",
    ordens: [],
    ...extra,
  };
}

describe("aplicarCompra: o cartão e os totais refletem o que acabou de ser salvo", () => {
  async function aberto(compras: CompraDaLista[]) {
    const m = useComprasMes({ mes: "2026-11", api: servidor({ "2026-11": compras }).api });
    await m.carregar();
    return m;
  }

  it("atualiza o paciente, os medicamentos, as pendências e a versão do cartão", async () => {
    const m = await aberto([item(1), item(2)]);
    m.aplicarCompra(
      compraCompleta({
        paciente: "NOVO PACIENTE TESTE",
        ordens: [{ id: "o1", posicao: 1, fornecedor: "F", envio: "Air Cargo", cia: "", po: "", frete: null, freteReal: null, dirId: null, encaminhadaEm: null, itens: [{ id: "i1", posicao: 1, medicamento: "MED TESTE", medicamentoCadastroId: "m1", preCadastroId: null, apresentacao: "", referencia: "", laboratorio: "", quantidade: "", temperatura: "", valorUnitario: null, valorReal: null }] }],
      }),
    );
    const c = m.compras.value.find((x) => x.id === "cmp_2")!;
    expect(c).toMatchObject({ paciente: "NOVO PACIENTE TESTE", medicamentos: ["MED TESTE"], totalOrdens: 1, atualizadoEm: "2026-11-19T13:00:00.000Z" });
    expect(c.pendencias).toBeGreaterThan(0);
    expect(m.compras.value.map((x) => x.sequencia)).toEqual([2, 1]); // continua no mesmo lugar
  });

  it("o cartão de uma compra é EXATAMENTE o que o servidor monta (mesma regra para as duas pontas)", () => {
    const compra = compraCompleta({ paciente: "X", medico: "Dr", vendedor: "V", responsavel: "R", compraParticular: true, pagamentoMomento: "apos_awb" });
    const doCliente = itemDaLista({ ...compra, atualizadoEm: compra.updatedAt });
    const doServidor = montarCompraDaLista(
      { id: compra.id, ano_mes: compra.anoMes, sequencia: compra.sequencia, cancelada: false, paciente: "X", processo_numero: "", compra_particular: true, medico: "Dr", vendedor: "V", responsavel: "R", despachante: "", pagamento_momento: "apos_awb", local_aplicacao: "", entrega: "", documentos: null, updated_at: "2026-11-19T13:00:00+00:00" },
      [],
      [],
    );
    expect(doCliente).toEqual(doServidor);
  });

  it("a mudança de estado move os totais (de rascunho para cancelada)", async () => {
    const m = await aberto([item(1), item(2), item(3, "pronta")]);
    expect(m.totais.value).toMatchObject({ rascunho: 2, cancelada: 0 });
    m.aplicarCompra(compraCompleta({ cancelada: true }));
    expect(m.totais.value).toMatchObject({ rascunho: 1, cancelada: 1, pronta: 1 });
    expect(m.totalDoMes.value).toBe(2);
    // Sem 'mostrar canceladas', o cartão sai da lista.
    expect(m.compras.value.map((c) => c.sequencia)).toEqual([3, 1]);
    expect(m.total.value).toBe(2);
  });

  it("com 'mostrar canceladas' ligado o cartão fica, como cancelada", async () => {
    const m = useComprasMes({ mes: "2026-11", mostrarCanceladas: true, api: servidor({ "2026-11": [item(1), item(2)] }).api });
    await m.carregar();
    m.aplicarCompra(compraCompleta({ cancelada: true }));
    expect(m.compras.value.find((c) => c.id === "cmp_2")).toMatchObject({ status: "cancelada", cancelada: true });
    expect(m.compras.value).toHaveLength(2);
  });

  it("filtro ativo: o cartão que muda de estado e deixa de casar sai da lista, e o total do filtro cai", async () => {
    const m = useComprasMes({ mes: "2026-11", status: "rascunho", api: servidor({ "2026-11": [item(1), item(2)] }).api });
    await m.carregar();
    expect(m.total.value).toBe(2);
    m.aplicarCompra(compraCompleta({ cancelada: true }));
    expect(m.compras.value.map((c) => c.sequencia)).toEqual([1]);
    expect(m.total.value).toBe(1);
  });

  it("compra NOVA entra no topo (sequencia maior), soma nos totais e no total", async () => {
    const m = await aberto([item(1), item(2)]);
    m.aplicarCompra(compraCompleta({ id: "cmp_3", sequencia: 3, paciente: "" }), { nova: true });
    expect(m.compras.value.map((c) => c.sequencia)).toEqual([3, 2, 1]);
    expect(m.totais.value.rascunho).toBe(3);
    expect(m.total.value).toBe(3);
    expect(m.totalDoMes.value).toBe(3);
  });

  it("compra nova com filtro que não casa: soma só nos totais (os chips), não entra na lista", async () => {
    const m = useComprasMes({ mes: "2026-11", status: "pronta", api: servidor({ "2026-11": [item(1, "pronta")] }).api });
    await m.carregar();
    m.aplicarCompra(compraCompleta({ id: "cmp_9", sequencia: 9 }), { nova: true });
    expect(m.compras.value.map((c) => c.sequencia)).toEqual([1]);
    expect(m.totais.value.rascunho).toBe(1);
  });

  it("compra de OUTRO mês não mexe em nada", async () => {
    const m = await aberto([item(1)]);
    const antes = JSON.stringify([m.compras.value, m.totais.value, m.total.value]);
    m.aplicarCompra(compraCompleta({ id: "cmp_x", anoMes: "2026-10" }), { nova: true });
    expect(JSON.stringify([m.compras.value, m.totais.value, m.total.value])).toBe(antes);
  });

  it("aplicar a mesma compra duas vezes não duplica nem conta duas vezes", async () => {
    const m = await aberto([item(1)]);
    const nova = compraCompleta({ id: "cmp_3", sequencia: 3 });
    m.aplicarCompra(nova, { nova: true });
    m.aplicarCompra(nova);
    m.aplicarCompra({ ...nova, paciente: "OUTRO NOME" });
    expect(m.compras.value.filter((c) => c.id === "cmp_3")).toHaveLength(1);
    expect(m.totais.value.rascunho).toBe(2);
    expect(m.compras.value[0]!.paciente).toBe("OUTRO NOME");
  });

  it("compra de uma página ainda não lida: atualiza o que sabe, sem inventar totais", async () => {
    const m = await aberto([item(1)]);
    const antes = { ...m.totais.value };
    m.aplicarCompra(compraCompleta({ id: "cmp_longe", sequencia: 99, paciente: "LONGE" }));
    expect(m.totais.value).toEqual(antes);
    expect(m.compras.value.map((c) => c.id)).toEqual(["cmp_1"]);
  });
});

describe("montarUrlLista", () => {
  it("mês, e só o que foi pedido: status, incluir_canceladas e página (a partir da 2ª)", () => {
    expect(montarUrlLista({ anoMes: "2026-11", status: null, incluirCanceladas: false, pagina: 1 })).toBe("/api/compras?ano_mes=2026-11");
    expect(montarUrlLista({ anoMes: "2026-11", status: "pronta", incluirCanceladas: true, pagina: 3 })).toBe(
      "/api/compras?ano_mes=2026-11&status=pronta&incluir_canceladas=1&pagina=3",
    );
  });
});
