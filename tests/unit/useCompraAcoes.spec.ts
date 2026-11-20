import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { OpcoesCompra } from "../../shared/types/compra";
import { LIMITE_BUSCA_MEDICAMENTOS, useCompraAcoes } from "../../app/composables/useCompraAcoes";
import type { CompraOpcoes } from "../../app/composables/useCompraOpcoes";

// useCompraAcoes com fetch simulado: busca de medicamentos, temperatura nova (201, 200, 409 inativa, erro) e pré-cadastro (201, 200, 409
// com o medicamento, erro). Dados fictícios (TESTE).

const OPCOES: OpcoesCompra = {
  fornecedores: [],
  despachantes: [],
  ciasAereas: [],
  transportadoras: [],
  consultores: [],
  temperaturas: [{ nome: "2°C a 8°C" }, { nome: "Ambiente" }],
  medicamentos: { itens: [], pagina: 1, limite: 20, temMais: false, q: "" },
};

function opcoesFalsas(): CompraOpcoes {
  return { opcoes: ref<OpcoesCompra | null>({ ...OPCOES }) } as unknown as CompraOpcoes;
}

const resposta = (status: number, corpo: unknown): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

function montar(res: Response | (() => Response), compraId: string | null = "cmp_1") {
  const fetchFalso = vi.fn(async () => (typeof res === "function" ? res() : res.clone()));
  const opcoes = opcoesFalsas();
  const avisar = vi.fn();
  const acoes = useCompraAcoes({ opcoes, compraId: () => compraId, avisar, buscarRede: fetchFalso as unknown as typeof fetch });
  return { acoes, fetchFalso, opcoes, avisar };
}

const chamada = (f: ReturnType<typeof vi.fn>) => ({ url: String(f.mock.calls[0]![0]), init: (f.mock.calls[0]![1] ?? {}) as RequestInit });

describe("buscarMedicamentos", () => {
  it("GET /api/compras/opcoes?q=...&limite=20 (com o sinal de cancelamento) e devolve as sugestões com a temperatura", async () => {
    const m = montar(resposta(200, { ...OPCOES, medicamentos: { itens: [{ id: "med_1", nome: "DIPIRONA TESTE", temperatura: "2°C a 8°C" }, { id: "med_2", nome: "OUTRO TESTE", temperatura: "" }], pagina: 1, limite: 20, temMais: false, q: "dipi" } }));
    const controle = new AbortController();
    const r = await m.acoes.buscarMedicamentos("dipi & co", controle.signal);
    const c = chamada(m.fetchFalso);
    expect(c.url).toBe(`/api/compras/opcoes?q=dipi+%26+co&limite=${LIMITE_BUSCA_MEDICAMENTOS}`);
    expect(c.init.signal).toBe(controle.signal);
    expect(r).toEqual([
      { valor: "med_1", rotulo: "DIPIRONA TESTE", extra: { temperatura: "2°C a 8°C" } },
      { valor: "med_2", rotulo: "OUTRO TESTE", extra: { temperatura: "" } },
    ]);
  });

  it("erro do servidor sobe (o campo mostra 'Não foi possível buscar.')", async () => {
    const m = montar(resposta(500, { statusMessage: "Falha." }));
    await expect(m.acoes.buscarMedicamentos("x", new AbortController().signal)).rejects.toMatchObject({ status: 500 });
  });
});

describe("registrarTemperatura", () => {
  it("201: POST { nome }, devolve 'criada' e a nova entra na lista de temperaturas, em ordem alfabética", async () => {
    const m = montar(resposta(201, { criada: true, item: { id: "temp_9", nome: "TESTE TEMP", ativo: true } }));
    const r = await m.acoes.registrarTemperatura("TESTE TEMP");
    const c = chamada(m.fetchFalso);
    expect(c.url).toBe("/api/compras/temperaturas");
    expect(c.init.method).toBe("POST");
    expect(JSON.parse(String(c.init.body))).toEqual({ nome: "TESTE TEMP" });
    expect(r).toEqual({ tipo: "criada", nome: "TESTE TEMP" });
    expect(m.opcoes.opcoes.value!.temperaturas.map((t) => t.nome)).toEqual(["2°C a 8°C", "Ambiente", "TESTE TEMP"]);
  });

  it("200 (já existia ativa): 'existente' com o nome do servidor; não duplica na lista", async () => {
    const m = montar(resposta(200, { criada: false, item: { id: "temp_2", nome: "Ambiente", ativo: true } }));
    const r = await m.acoes.registrarTemperatura("ambiente");
    expect(r).toEqual({ tipo: "existente", nome: "Ambiente" });
    expect(m.opcoes.opcoes.value!.temperaturas).toHaveLength(2);
  });

  it("409 (existe mas está inativa): 'inativa', e a lista não muda", async () => {
    const m = montar(resposta(409, { statusMessage: "Essa temperatura já existe, mas está inativa.", data: { criada: false, inativo: true, item: { id: "t", nome: "Antiga", ativo: false } } }));
    expect(await m.acoes.registrarTemperatura("Antiga")).toEqual({ tipo: "inativa" });
    expect(m.opcoes.opcoes.value!.temperaturas).toHaveLength(2);
  });

  it("400/500 e erro de rede SOBEM (a linha mostra 'Tentar de novo')", async () => {
    await expect(montar(resposta(400, { statusMessage: "Informe o nome." })).acoes.registrarTemperatura("")).rejects.toMatchObject({ status: 400 });
    const rede = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const acoes = useCompraAcoes({ opcoes: opcoesFalsas(), compraId: () => null, avisar: vi.fn(), buscarRede: rede as unknown as typeof fetch });
    await expect(acoes.registrarTemperatura("x")).rejects.toBeInstanceOf(TypeError);
  });
});

describe("pedirPreCadastro", () => {
  it("201: POST { nome, temperatura, compraId } e devolve o id", async () => {
    const m = montar(resposta(201, { criado: true, preCadastro: { id: "pre_1", nome: "TESTE MED PRE-CADASTRO", temperatura: "Ambiente", status: "pendente", compraId: "cmp_1", cadastroId: null, solicitadoPor: "X", criadoEm: "2026-11-20T10:00:00.000Z" } }));
    const r = await m.acoes.pedirPreCadastro("TESTE MED PRE-CADASTRO", "Ambiente");
    const c = chamada(m.fetchFalso);
    expect(c.url).toBe("/api/compras/pre-cadastro-medicamentos");
    expect(JSON.parse(String(c.init.body))).toEqual({ nome: "TESTE MED PRE-CADASTRO", temperatura: "Ambiente", compraId: "cmp_1" });
    expect(r).toEqual({ tipo: "pre-cadastro", id: "pre_1" });
  });

  it("200 (já havia um pendente): devolve o id dele", async () => {
    const m = montar(resposta(200, { criado: false, preCadastro: { id: "pre_antigo" } }));
    expect(await m.acoes.pedirPreCadastro("TESTE", "Ambiente")).toEqual({ tipo: "pre-cadastro", id: "pre_antigo" });
  });

  it("sem compra aberta, o corpo não leva compraId", async () => {
    const m = montar(resposta(201, { criado: true, preCadastro: { id: "pre_1" } }), null);
    await m.acoes.pedirPreCadastro("TESTE", "Ambiente");
    expect(JSON.parse(String(chamada(m.fetchFalso).init.body))).toEqual({ nome: "TESTE", temperatura: "Ambiente" });
  });

  it("409: devolve o medicamento do CADASTRO (id, nome e temperatura; mais nada)", async () => {
    const m = montar(resposta(409, { statusMessage: "Esse medicamento já está no Cadastro.", data: { criado: false, medicamento: { id: "med_9", nome: "TESTE MED", temperatura: "2°C a 8°C", ativo: true, chave_pix: "NAO" } } }));
    const r = await m.acoes.pedirPreCadastro("TESTE MED", "Ambiente");
    expect(r).toEqual({ tipo: "cadastrado", medicamento: { id: "med_9", nome: "TESTE MED", temperatura: "2°C a 8°C" } });
    expect(JSON.stringify(r)).not.toContain("NAO");
  });

  it("409 sem o medicamento no corpo, 400, 500 e rede: erro (a linha mostra 'Tentar de novo')", async () => {
    await expect(montar(resposta(409, { statusMessage: "Conflito." })).acoes.pedirPreCadastro("T", "A")).rejects.toMatchObject({ status: 409 });
    await expect(montar(resposta(400, { statusMessage: "Ruim." })).acoes.pedirPreCadastro("T", "A")).rejects.toMatchObject({ status: 400 });
    await expect(montar(resposta(500, {})).acoes.pedirPreCadastro("T", "A")).rejects.toMatchObject({ status: 500 });
    const rede = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const acoes = useCompraAcoes({ opcoes: opcoesFalsas(), compraId: () => "cmp_1", avisar: vi.fn(), buscarRede: rede as unknown as typeof fetch });
    await expect(acoes.pedirPreCadastro("T", "A")).rejects.toBeInstanceOf(TypeError);
  });

  it("avisar é o toast da página", () => {
    const m = montar(resposta(200, {}));
    m.acoes.avisar("oi");
    expect(m.avisar).toHaveBeenCalledWith("oi");
  });
});
