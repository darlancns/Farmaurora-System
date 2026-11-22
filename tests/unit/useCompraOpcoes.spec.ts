import { describe, expect, it, vi } from "vitest";
import type { OpcoesCompra } from "../../shared/types/compra";
import { CIAS_AEREAS_POR_MODAL, MODAIS_ENVIO } from "../../shared/constants/processos";
import { useCompraOpcoes } from "../../app/composables/useCompraOpcoes";
import { ciasDoEnvio, OPCOES_VAZIAS, opcoesParaFormulario } from "../../app/utils/comprasOpcoes";

// useCompraOpcoes (uma vez por sessão, falha com "Tentar de novo", despachante pelo nome) e as opções do formulário: consultores (sem
// vendedor), sem lista de cias aéreas nem de transportadoras do servidor — a cia vem do envio (CIAS_AEREAS_POR_MODAL). Dados fictícios (TESTE).

const OPCOES: OpcoesCompra = {
  fornecedores: [{ nome: "Fornecedor Teste" }],
  despachantes: [{ nome: "Despachante Teste", contatoNome: "Contato D", telefone: "11 90000-0000", email: "d@teste.com" }],
  consultores: [{ nome: "Dani" }, { nome: "Flávia" }],
  temperaturas: [{ nome: "2°C a 8°C" }],
  medicamentos: { itens: [], pagina: 1, limite: 50, temMais: false, q: "" },
};

let chaveN = 0;
const novaChave = () => `compras-opcoes-teste-${++chaveN}`;

describe("useCompraOpcoes", () => {
  it("lê UMA vez por sessão: chamadas seguidas de carregar() não repetem", async () => {
    const obter = vi.fn(async () => OPCOES);
    const o = useCompraOpcoes({ api: { obter }, chave: novaChave() });
    await o.carregar();
    await o.carregar();
    await Promise.all([o.carregar(), o.carregar()]);
    expect(obter).toHaveBeenCalledTimes(1);
    expect(o.consultores.value.map((c) => c.nome)).toEqual(["Dani", "Flávia"]);
    expect(o.despachantes.value).toHaveLength(1);
    expect(o.erro.value).toBeNull();
  });

  it("outra instância na mesma sessão reaproveita o que já foi lido", async () => {
    const chave = novaChave();
    const obter = vi.fn(async () => OPCOES);
    await useCompraOpcoes({ api: { obter }, chave }).carregar();
    const outra = useCompraOpcoes({ api: { obter }, chave });
    await outra.carregar();
    expect(obter).toHaveBeenCalledTimes(1);
    expect(outra.consultores.value).toHaveLength(2);
  });

  it("falha: guarda a mensagem; 'Tentar de novo' (forçar) relê e limpa o erro", async () => {
    const obter = vi.fn().mockRejectedValueOnce(new Error("Sem conexão.")).mockResolvedValue(OPCOES);
    const o = useCompraOpcoes({ api: { obter }, chave: novaChave() });
    await o.carregar();
    expect(o.erro.value).toBe("Sem conexão.");
    expect(o.opcoes.value).toBeNull();
    expect(o.consultores.value).toEqual([]);
    await o.carregar(true);
    expect(o.erro.value).toBeNull();
    expect(o.consultores.value).toHaveLength(2);
    expect(obter).toHaveBeenCalledTimes(2);
  });

  it("despachantePeloNome: acha pela chave (sem acento nem caixa) e copia SÓ nome, telefone, e-mail e contato", async () => {
    const comPix = { ...OPCOES, despachantes: [{ ...OPCOES.despachantes[0]!, chavePix: "SECRETA", chave_pix: "SECRETA" } as unknown as OpcoesCompra["despachantes"][number]] };
    const o = useCompraOpcoes({ api: { obter: async () => comPix }, chave: novaChave() });
    await o.carregar();
    expect(o.despachantePeloNome("  DESPACHANTE   teste ")).toEqual({ nome: "Despachante Teste", telefone: "11 90000-0000", email: "d@teste.com", contatoNome: "Contato D" });
    expect(JSON.stringify(o.despachantePeloNome("Despachante Teste"))).not.toContain("SECRETA");
    expect(o.despachantePeloNome("Outro")).toBeNull();
    expect(o.despachantePeloNome("")).toBeNull();
  });

  it("antes de carregar não há despachante nem consultor", () => {
    const o = useCompraOpcoes({ api: { obter: async () => OPCOES }, chave: novaChave() });
    expect(o.despachantePeloNome("Despachante Teste")).toBeNull();
    expect(o.consultores.value).toEqual([]);
  });

  it("paraFormulario: consultores, despachantes, fornecedores e temperaturas; sem cias aéreas nem transportadoras", async () => {
    const o = useCompraOpcoes({ api: { obter: async () => OPCOES }, chave: novaChave() });
    expect(o.paraFormulario.value).toEqual(OPCOES_VAZIAS);
    await o.carregar();
    expect(Object.keys(o.paraFormulario.value).sort()).toEqual(["consultores", "despachantes", "fornecedores", "temperaturas"]);
    expect(o.paraFormulario.value.consultores.map((c) => c.nome)).toEqual(["Dani", "Flávia"]);
    expect(o.paraFormulario.value.temperaturas).toEqual([{ nome: "2°C a 8°C" }]);
  });

  it("não há `ciasAereas`/`transportadoras` no composable nem nas opções do formulário", async () => {
    const o = useCompraOpcoes({ api: { obter: async () => OPCOES }, chave: novaChave() });
    await o.carregar();
    expect(o).not.toHaveProperty("ciasAereas");
    expect(o).not.toHaveProperty("transportadoras");
    expect(opcoesParaFormulario(OPCOES)).not.toHaveProperty("ciasAereas");
    expect(opcoesParaFormulario(OPCOES)).not.toHaveProperty("transportadoras");
  });
});

describe("opcoesParaFormulario e ciasDoEnvio", () => {
  it("sem opções lidas: tudo vazio", () => {
    expect(opcoesParaFormulario(null)).toEqual({ consultores: [], despachantes: [], fornecedores: [], temperaturas: [] });
  });

  it("ciasDoEnvio: as cias do MODAL, as mesmas constantes do Follow-Up (em ordem), nada para modal vazio ou desconhecido", () => {
    for (const modal of MODAIS_ENVIO) expect(ciasDoEnvio(modal).map((c) => c.nome)).toEqual([...CIAS_AEREAS_POR_MODAL[modal]]);
    expect(ciasDoEnvio("Air Cargo").map((c) => c.nome)).toEqual(["Emirates", "Lufthansa", "Qatar", "Swiss", "Turkish"]);
    expect(ciasDoEnvio("Courier Formal").map((c) => c.nome)).toEqual(["DHL", "FedEx"]);
    expect(ciasDoEnvio("Courier Simples").map((c) => c.nome)).toEqual(["DHL", "FedEx"]);
    expect(ciasDoEnvio("")).toEqual([]);
    expect(ciasDoEnvio("Courier")).toEqual([]); // o legado
    expect(ciasDoEnvio("air cargo")).toEqual([]); // o modal é comparado exatamente como vem
  });
});
