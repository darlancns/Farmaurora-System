import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "#app";
import type { ItemCadastroPagamento } from "../../shared/types/Pagamento";
import { fornecedorLido, fornecedoresLidos, itemLido, itensLidos, medicamentoLido, medicamentosLidos } from "../../shared/utils/cadastroLeitura";
import { fornecedoresFixos, montarOpcoesFornecedor } from "../../app/utils/pagamentoOptions";
import { useCadastrosFollowUp } from "../../app/composables/useCadastrosFollowUp";

// ETAPA 2 (e 6: medicamentos): o Follow-Up LÊ fornecedores, despachantes, transportadoras e medicamentos dos Cadastros (GET /api/cadastros/:lista, aberto a todos os cargos).
// (1) os mapeadores puros guardam só o que a tela usa e NUNCA a chave PIX; (2) o composable carrega as 3 listas, tolera falha e não repete
// requisição; (3) os helpers de Pagamentos ganharam variações OPCIONAIS (o padrão não muda). Nomes "TESTE"; nada de chave PIX real.

// ── 1) mapeadores puros ───────────────────────────────────────────────────────────────────────────────────
describe("cadastroLeitura: só o que a tela usa, nunca a chave PIX", () => {
  const PIX = "pix-secreta-de-teste";

  it("despachante e transportadora: nome, ativo e país vazio; a chave PIX é descartada", () => {
    const l = itemLido({ id: "d1", nome: " TESTE Despachante ", ativo: true, chavePix: PIX, telefone: "11 90000-0000", contatoNome: "X" });
    expect(l).toEqual({ nome: "TESTE Despachante", ativo: true, pais: "" });
    expect(JSON.stringify(l)).not.toContain(PIX);
    expect(JSON.stringify(l)).not.toContain("chavePix");
  });

  it("fornecedor: nome, ativo, país e prazo; sem PIX nem campos extras", () => {
    const l = fornecedorLido({ id: "f1", nome: "TESTE Alfa", ativo: true, pais: " Chile ", prazoAlertaDias: 7, semAlerta: false, chavePix: PIX, atualizadoPor: "x" });
    expect(l).toEqual({ nome: "TESTE Alfa", ativo: true, pais: "Chile", prazoAlertaDias: 7, semAlerta: false });
    expect(JSON.stringify(l)).not.toContain(PIX);
  });

  it("'semAlerta' fica com prazo nulo; prazo fora de 1 a 365, fracionário ou texto vira null (nunca um prazo inventado)", () => {
    expect(fornecedorLido({ nome: "TESTE A", ativo: true, pais: "", prazoAlertaDias: null, semAlerta: true })).toMatchObject({ prazoAlertaDias: null, semAlerta: true });
    for (const ruim of [0, 366, -3, 1.5, "7", NaN, undefined]) {
      expect(fornecedorLido({ nome: "TESTE A", ativo: true, prazoAlertaDias: ruim })!.prazoAlertaDias, String(ruim)).toBeNull();
    }
    expect(fornecedorLido({ nome: "TESTE A", ativo: true, prazoAlertaDias: 365 })!.prazoAlertaDias).toBe(365);
    expect(fornecedorLido({ nome: "TESTE A", ativo: true, prazoAlertaDias: 1 })!.prazoAlertaDias).toBe(1);
  });

  it("item sem nome, nulo ou que não é objeto é descartado; ativo só vale com `true`", () => {
    expect(itemLido({ nome: "   ", ativo: true })).toBeNull();
    expect(itemLido(null)).toBeNull();
    expect(itemLido("texto")).toBeNull();
    expect(itemLido([1])).toBeNull();
    expect(itemLido({ nome: "TESTE A", ativo: "true" })!.ativo).toBe(false);
    expect(itemLido({ nome: "TESTE A" })!.ativo).toBe(false);
  });

  it("medicamento: SÓ nome e ativo (id, temperatura, quem gravou e datas não passam)", () => {
    const l = medicamentoLido({ id: "med_1", nome: " DIPIRONA TESTE ", ativo: true, temperatura: "2°C a 8°C", atualizadoPor: "Cris", createdAt: "x", updatedAt: "y", chavePix: PIX });
    expect(l).toEqual({ nome: "DIPIRONA TESTE", ativo: true });
    expect(Object.keys(l!).sort()).toEqual(["ativo", "nome"]);
    expect(JSON.stringify(l)).not.toContain(PIX);
    expect(medicamentoLido({ nome: "", ativo: true })).toBeNull();
    expect(medicamentoLido({ nome: "TESTE A", ativo: "true" })!.ativo).toBe(false);
  });

  it("medicamentos: ativos primeiro, alfabética pt-BR; não-lista = []", () => {
    const lista = medicamentosLidos([{ nome: "TESTE Z", ativo: true }, { nome: "TESTE A", ativo: false }, { nome: "TESTE M", ativo: true }]);
    expect(lista.map((m) => `${m.nome}:${m.ativo}`)).toEqual(["TESTE M:true", "TESTE Z:true", "TESTE A:false"]);
    for (const estranho of [null, undefined, {}, "x", 7]) expect(medicamentosLidos(estranho)).toEqual([]);
  });

  it("listas: ativos primeiro, alfabética pt-BR; o que não é lista vira lista vazia", () => {
    const lista = itensLidos([{ nome: "TESTE Z", ativo: true }, { nome: "TESTE A", ativo: false }, { nome: "TESTE M", ativo: true }, { nome: "", ativo: true }]);
    expect(lista.map((i) => `${i.nome}:${i.ativo}`)).toEqual(["TESTE M:true", "TESTE Z:true", "TESTE A:false"]);
    for (const estranho of [null, undefined, {}, "x", 7]) {
      expect(itensLidos(estranho)).toEqual([]);
      expect(fornecedoresLidos(estranho)).toEqual([]);
    }
    expect(fornecedoresLidos([{ nome: "TESTE B", ativo: true }, { nome: "TESTE A", ativo: true }]).map((f) => f.nome)).toEqual(["TESTE A", "TESTE B"]);
  });
});

// ── 2) o composable ───────────────────────────────────────────────────────────────────────────────────────
const FORNECEDORES = [
  { id: "f1", nome: "TESTE Alfa", ativo: true, pais: "Chile", prazoAlertaDias: 3, semAlerta: false },
  { id: "f2", nome: "TESTE Beta", ativo: false, pais: "Peru", prazoAlertaDias: null, semAlerta: true },
];
const DESPACHANTES = [{ id: "d1", nome: "TESTE Despachante", ativo: true, chavePix: "pix-d", telefone: "", email: "", contatoNome: "" }];
const TRANSPORTADORAS = [{ id: "t1", nome: "TESTE Transp", ativo: true, chavePix: "pix-t" }];
const MEDICAMENTOS = [
  { id: "med_1", nome: "DIPIRONA TESTE", ativo: true, temperatura: "2°C a 8°C", atualizadoPor: "Cris", createdAt: "a", updatedAt: "b" },
  { id: "med_2", nome: "TESTE ANTIGO", ativo: false, temperatura: "", atualizadoPor: "", createdAt: "a", updatedAt: "b" },
];

const ESTADO_VAZIO = {
  fornecedores: [],
  despachantes: [],
  transportadoras: [],
  medicamentos: [],
  fornecedoresCarregados: false,
  despachantesCarregados: false,
  transportadorasCarregadas: false,
  medicamentosCarregados: false,
};

type Resposta = unknown | { __status: number; mensagem: string } | "rede";
function simularFetch(respostas: Partial<Record<"fornecedores" | "despachantes" | "transportadoras" | "medicamentos", Resposta>>) {
  const mapa = { fornecedores: FORNECEDORES, despachantes: DESPACHANTES, transportadoras: TRANSPORTADORAS, medicamentos: MEDICAMENTOS, ...respostas };
  const fn = vi.fn(async (url: string) => {
    const lista = url.replace("/api/cadastros/", "") as keyof typeof mapa;
    const r = mapa[lista] as Resposta;
    if (r === "rede") throw new TypeError("Failed to fetch");
    if (r !== null && typeof r === "object" && "__status" in r) {
      return new Response(JSON.stringify({ statusMessage: (r as { mensagem: string }).mensagem }), { status: (r as { __status: number }).__status });
    }
    return new Response(JSON.stringify(r), { status: 200 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const urls = (fn: ReturnType<typeof simularFetch>): string[] => fn.mock.calls.map((c) => c[0] as string).sort();

beforeEach(() => {
  useState<unknown>("cadastros-followup").value = { ...ESTADO_VAZIO };
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCadastrosFollowUp: carrega as 4 listas por GET /api/cadastros/:lista", () => {
  it("antes de carregar: listas vazias e nada marcado como carregado", () => {
    const c = useCadastrosFollowUp();
    expect(c.fornecedores.value).toEqual([]);
    expect(c.fornecedoresCarregados.value).toBe(false);
    expect(c.despachantesCarregados.value).toBe(false);
    expect(c.transportadorasCarregadas.value).toBe(false);
    expect(c.medicamentos.value).toEqual([]);
    expect(c.medicamentosCarregados.value).toBe(false);
  });

  it("carrega fornecedores, despachantes, transportadoras e medicamentos (ativos e inativos), sem chave PIX no estado", async () => {
    const fetchFn = simularFetch({});
    const c = useCadastrosFollowUp();
    expect(await c.carregar()).toBeNull();
    expect(urls(fetchFn)).toEqual(["/api/cadastros/despachantes", "/api/cadastros/fornecedores", "/api/cadastros/medicamentos", "/api/cadastros/transportadoras"]);
    expect(c.fornecedores.value).toEqual([
      { nome: "TESTE Alfa", ativo: true, pais: "Chile", prazoAlertaDias: 3, semAlerta: false },
      { nome: "TESTE Beta", ativo: false, pais: "Peru", prazoAlertaDias: null, semAlerta: true },
    ]);
    expect(c.despachantes.value).toEqual([{ nome: "TESTE Despachante", ativo: true, pais: "" }]);
    expect(c.transportadoras.value).toEqual([{ nome: "TESTE Transp", ativo: true, pais: "" }]);
    // Medicamento: só nome e ativo (nada de id, temperatura nem quem gravou), ativos primeiro.
    expect(c.medicamentos.value).toEqual([
      { nome: "DIPIRONA TESTE", ativo: true },
      { nome: "TESTE ANTIGO", ativo: false },
    ]);
    expect(c.fornecedoresCarregados.value && c.despachantesCarregados.value && c.transportadorasCarregadas.value && c.medicamentosCarregados.value).toBe(true);
    const tudo = JSON.stringify(useState<unknown>("cadastros-followup").value);
    expect(tudo).not.toContain("pix-d");
    expect(tudo).not.toContain("pix-t");
    expect(tudo).not.toContain("chavePix");
    expect(tudo).not.toContain("temperatura");
    expect(tudo).not.toContain("atualizadoPor");
  });

  it("só GET (nunca escreve em Cadastros)", async () => {
    const fetchFn = simularFetch({});
    await useCadastrosFollowUp().carregar();
    for (const chamada of fetchFn.mock.calls) {
      const opcoes = chamada[1] as RequestInit | undefined;
      expect(opcoes?.method ?? "GET").toBe("GET");
    }
  });

  it("já carregado: não faz nova requisição (a não ser com `forcar`)", async () => {
    const fetchFn = simularFetch({});
    const c = useCadastrosFollowUp();
    await c.carregar();
    fetchFn.mockClear();
    expect(await c.carregar()).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
    await c.carregar({ forcar: true });
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("chamadas SIMULTÂNEAS (formulário e sino) dividem a mesma carga: 4 requisições, não 8", async () => {
    const fetchFn = simularFetch({});
    const a = useCadastrosFollowUp();
    const b = useCadastrosFollowUp();
    await Promise.all([a.carregar(), b.carregar()]);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it("`listas`: o sino pede SÓ os fornecedores, e a tela que pede tudo logo depois busca só o que falta (nenhuma lista é buscada duas vezes)", async () => {
    const fetchFn = simularFetch({});
    const sino = useCadastrosFollowUp();
    const tela = useCadastrosFollowUp();
    await Promise.all([sino.carregar({ listas: ["fornecedores"] }), tela.carregar()]);
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(urls(fetchFn).filter((u) => u.endsWith("/fornecedores"))).toHaveLength(1);
    expect(sino.medicamentosCarregados.value && sino.despachantesCarregados.value).toBe(true);
  });

  it("`listas`: pedir só os fornecedores NÃO busca despachantes, transportadoras nem medicamentos", async () => {
    const fetchFn = simularFetch({});
    const c = useCadastrosFollowUp();
    await c.carregar({ listas: ["fornecedores"] });
    expect(urls(fetchFn)).toEqual(["/api/cadastros/fornecedores"]);
    expect(c.fornecedoresCarregados.value).toBe(true);
    expect(c.medicamentosCarregados.value).toBe(false);
    expect(c.medicamentos.value).toEqual([]);
  });

  it("a lista de medicamentos que falha (rede) não derruba as outras e o campo segue como texto livre (lista vazia, não carregada)", async () => {
    simularFetch({ medicamentos: "rede" });
    const c = useCadastrosFollowUp();
    await expect(c.carregar()).resolves.toEqual(expect.any(String));
    expect(c.medicamentosCarregados.value).toBe(false);
    expect(c.medicamentos.value).toEqual([]);
    expect(c.fornecedoresCarregados.value && c.despachantesCarregados.value && c.transportadorasCarregadas.value).toBe(true);
  });

  it("uma lista que falha NÃO derruba as outras: devolve a mensagem, as outras carregam e a falha não vira 'lista vazia carregada'", async () => {
    simularFetch({ fornecedores: { __status: 500, mensagem: "Falha ao listar os fornecedores." } });
    const c = useCadastrosFollowUp();
    const falha = await c.carregar();
    expect(falha).toBe("Falha ao listar os fornecedores.");
    expect(c.fornecedoresCarregados.value).toBe(false);
    expect(c.fornecedores.value).toEqual([]);
    expect(c.despachantesCarregados.value).toBe(true);
    expect(c.transportadorasCarregadas.value).toBe(true);
  });

  it("falha de rede: devolve mensagem e NUNCA lança", async () => {
    simularFetch({ despachantes: "rede" });
    const c = useCadastrosFollowUp();
    await expect(c.carregar()).resolves.toEqual(expect.any(String));
    expect(c.despachantesCarregados.value).toBe(false);
    expect(c.fornecedoresCarregados.value).toBe(true);
  });

  it("tentar de novo busca SÓ a lista que faltou", async () => {
    simularFetch({ transportadoras: { __status: 503, mensagem: "fora do ar" } });
    const c = useCadastrosFollowUp();
    await c.carregar();
    expect(c.transportadorasCarregadas.value).toBe(false);
    const fetchFn = simularFetch({});
    expect(await c.carregar()).toBeNull();
    expect(urls(fetchFn)).toEqual(["/api/cadastros/transportadoras"]);
    expect(c.transportadorasCarregadas.value).toBe(true);
  });

  it("recarregar à força e falhar NÃO apaga o que já tinha vindo", async () => {
    simularFetch({});
    const c = useCadastrosFollowUp();
    await c.carregar();
    simularFetch({ fornecedores: "rede" });
    await c.carregar({ forcar: true });
    expect(c.fornecedores.value.map((f) => f.nome)).toEqual(["TESTE Alfa", "TESTE Beta"]);
    expect(c.fornecedoresCarregados.value).toBe(true);
  });

  it("resposta estranha (não é lista) vira lista vazia, sem derrubar nada", async () => {
    simularFetch({ fornecedores: { erro: "formato novo" }, despachantes: null });
    const c = useCadastrosFollowUp();
    expect(await c.carregar()).toBeNull();
    expect(c.fornecedores.value).toEqual([]);
    expect(c.despachantes.value).toEqual([]);
  });
});

// ── 3) helpers de Pagamentos generalizados (variações OPCIONAIS) ──────────────────────────────────────────
describe("montarOpcoesFornecedor / fornecedoresFixos: variações opcionais para o Follow-Up (o padrão de Pagamentos não muda)", () => {
  const f = (nome: string, ativo = true, pais = ""): ItemCadastroPagamento => ({ nome, ativo, pais });
  const lista = [f("TESTE Alfa", true, "Chile"), f("TESTE Beta", true, "Peru"), f("TESTE Velho", false, "Itália")];

  it("padrão (Pagamentos): ativos + 'Outro'; legado sem país de um ATIVO não entra como opção própria", () => {
    expect(montarOpcoesFornecedor(lista).map((o) => o.value)).toEqual(["", "TESTE Alfa - Chile", "TESTE Beta - Peru", "Outro"]);
    expect(fornecedoresFixos(lista, "TESTE Alfa")).toEqual(["TESTE Alfa - Chile", "TESTE Beta - Peru"]);
  });

  it("`extras` ('Nacional') ficam depois dos ativos e antes de 'Outro'", () => {
    const o = montarOpcoesFornecedor(lista, "", { extras: ["Nacional"] });
    expect(o.map((x) => x.value)).toEqual(["", "TESTE Alfa - Chile", "TESTE Beta - Peru", "Nacional", "Outro"]);
    expect(o.find((x) => x.value === "Nacional")!.label).toBe("Nacional");
  });

  it("`manterGravadoAtivo`: o legado sem país de um ativo continua COMO GRAVADO, sem sufixo", () => {
    const o = montarOpcoesFornecedor(lista, "TESTE Alfa", { manterGravadoAtivo: true });
    expect(o.map((x) => x.value)).toEqual(["", "TESTE Alfa - Chile", "TESTE Beta - Peru", "TESTE Alfa", "Outro"]);
    expect(o.find((x) => x.value === "TESTE Alfa")!.label).toBe("TESTE Alfa");
  });

  it("o gravado de um INATIVO continua com '(inativo)', com ou sem a variação", () => {
    for (const opcoes of [{}, { manterGravadoAtivo: true }]) {
      const o = montarOpcoesFornecedor(lista, "TESTE Velho - Itália", opcoes);
      expect(o.find((x) => x.value === "TESTE Velho - Itália")!.label).toBe("TESTE Velho - Itália (inativo)");
    }
  });

  it("texto que não está no Cadastro NÃO vira opção (fica para o 'Outro')", () => {
    expect(fornecedoresFixos(lista, "Upharm", { manterGravadoAtivo: true, extras: ["Nacional"] })).toEqual(["TESTE Alfa - Chile", "TESTE Beta - Peru", "Nacional"]);
  });

  it("o valor gravado que é exatamente um rótulo (ou um extra) não duplica", () => {
    expect(fornecedoresFixos(lista, "TESTE Alfa - Chile", { manterGravadoAtivo: true })).toEqual(["TESTE Alfa - Chile", "TESTE Beta - Peru"]);
    expect(fornecedoresFixos(lista, "Nacional", { manterGravadoAtivo: true, extras: ["Nacional"] })).toEqual(["TESTE Alfa - Chile", "TESTE Beta - Peru", "Nacional"]);
  });
});
