// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { ItemCompra, OrdemCompra } from "../../shared/types/compra";
import type { OpcaoBusca } from "../../app/components/AppSearchSelect.vue";
import type { AcoesCompra, ResultadoPreCadastro, ResultadoTemperatura } from "../../app/utils/comprasContexto";
import { itemVazio, ordemVazia } from "../../shared/utils/compraForm";
import { compraTeste, clicar, digitar, montarFormulario, q, qa, texto, type FormularioMontado } from "./helpers/formularioCompra";

// Medicamento (busca, Cadastro, "fora do Cadastro", pré-cadastro) e Temperatura ("Outro…") nas linhas do formulário REAL, com as
// ações do servidor simuladas. Timers falsos (o campo de busca espera 250 ms). Dados fictícios (TESTE).

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  montado?.desmontar();
  montado = null;
  document.body.innerHTML = "";
});

let montado: FormularioMontado | null = null;

const item = (id: string, posicao: number, extra: Partial<ItemCompra> = {}): ItemCompra => ({ ...itemVazio(posicao), id, ...extra });
const ordem = (itens: ItemCompra[]): OrdemCompra => ({ ...ordemVazia(1), id: "ord_a00001", itens });

const CADASTRO: OpcaoBusca[] = [
  { valor: "med_1", rotulo: "DIPIRONA TESTE", extra: { temperatura: "2°C a 8°C" } },
  { valor: "med_2", rotulo: "DIPIRONA GOTAS TESTE", extra: { temperatura: "" } },
];
const TEMPERATURAS = [{ nome: "2°C a 8°C" }, { nome: "Ambiente" }];

interface Falsas extends AcoesCompra {
  buscarMedicamentos: ReturnType<typeof vi.fn<AcoesCompra["buscarMedicamentos"]>>;
  registrarTemperatura: ReturnType<typeof vi.fn<AcoesCompra["registrarTemperatura"]>>;
  pedirPreCadastro: ReturnType<typeof vi.fn<AcoesCompra["pedirPreCadastro"]>>;
  avisar: ReturnType<typeof vi.fn<AcoesCompra["avisar"]>>;
}

function falsas(extra: Partial<AcoesCompra> = {}): Falsas {
  return {
    buscarMedicamentos: vi.fn<AcoesCompra["buscarMedicamentos"]>(async () => CADASTRO),
    registrarTemperatura: vi.fn<AcoesCompra["registrarTemperatura"]>(async (nome) => ({ tipo: "criada", nome }) as ResultadoTemperatura),
    pedirPreCadastro: vi.fn<AcoesCompra["pedirPreCadastro"]>(async () => ({ tipo: "pre-cadastro", id: "pre_novo_01" }) as ResultadoPreCadastro),
    avisar: vi.fn<AcoesCompra["avisar"]>(),
    ...extra,
  } as Falsas;
}

function abrir(itens: ItemCompra[], acoes: Falsas, podeEditar = true): FormularioMontado {
  montado = montarFormulario(compraTeste({ ordens: [ordem(itens)] }), { opcoes: { temperaturas: TEMPERATURAS }, acoes, podeEditar });
  return montado;
}

const itensDe = (f: FormularioMontado): ItemCompra[] => f.compra.value.ordens[0]!.itens;
const avancar = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms);
  await nextTick();
};

async function buscarEEscolher(idItem: string, digitado: string, rotuloOpcao: string): Promise<void> {
  await digitar(`#item-${idItem}-medicamento`, digitado);
  await avancar(250);
  const op = qa<HTMLElement>("[role=option]").find((o) => texto(o) === rotuloOpcao);
  if (!op) throw new Error(`opção não encontrada: ${rotuloOpcao} (há: ${qa("[role=option]").map((o) => texto(o)).join(" | ")})`);
  op.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await avancar();
}

async function escolherTemperatura(idItem: string, rotulo: string): Promise<void> {
  await clicar(`#item-${idItem}-temperatura`);
  const op = qa<HTMLElement>("[role=option]").find((o) => texto(o) === rotulo);
  if (!op) throw new Error(`temperatura não encontrada: ${rotulo} (há: ${qa("[role=option]").map((o) => texto(o)).join(" | ")})`);
  op.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  await avancar();
}

describe("medicamento do Cadastro", () => {
  it("busca no servidor com o texto digitado e mostra as sugestões", async () => {
    const a = falsas();
    abrir([item("itm_a", 1)], a);
    await digitar("#item-itm_a-medicamento", "dipi");
    await avancar(250);
    expect(a.buscarMedicamentos).toHaveBeenCalledTimes(1);
    expect(a.buscarMedicamentos.mock.calls[0]![0]).toBe("dipi");
    expect(qa("[role=option]").map((o) => texto(o))).toEqual(["DIPIRONA TESTE", "DIPIRONA GOTAS TESTE", "Usar “dipi” (fora do Cadastro)"]);
  });

  it("escolher um do Cadastro grava o nome, o id do Cadastro, zera o pré-cadastro e PREENCHE a temperatura com a do Cadastro", async () => {
    const a = falsas();
    const f = abrir([item("itm_a", 1, { preCadastroId: "pre_antigo", temperatura: "Ambiente" })], a);
    await buscarEEscolher("itm_a", "dipi", "DIPIRONA TESTE");
    expect(itensDe(f)[0]).toMatchObject({ medicamento: "DIPIRONA TESTE", medicamentoCadastroId: "med_1", preCadastroId: null, temperatura: "2°C a 8°C" });
    expect(a.pedirPreCadastro).not.toHaveBeenCalled();
    expect(q<HTMLInputElement>("#item-itm_a-medicamento")!.value).toBe("DIPIRONA TESTE");
    expect(q("#item-itm_a-fora-do-cadastro")).toBeNull();
  });

  it("a pessoa pode trocar a temperatura depois (a do Cadastro é só o ponto de partida)", async () => {
    const f = abrir([item("itm_a", 1)], falsas());
    await buscarEEscolher("itm_a", "dipi", "DIPIRONA TESTE");
    await escolherTemperatura("itm_a", "Ambiente");
    expect(itensDe(f)[0]!.temperatura).toBe("Ambiente");
    expect(itensDe(f)[0]!.medicamentoCadastroId).toBe("med_1");
  });

  it("Cadastro sem temperatura: mantém a que a linha já tinha", async () => {
    const f = abrir([item("itm_a", 1, { temperatura: "Ambiente" })], falsas());
    await buscarEEscolher("itm_a", "dipi", "DIPIRONA GOTAS TESTE");
    expect(itensDe(f)[0]).toMatchObject({ medicamentoCadastroId: "med_2", temperatura: "Ambiente" });
  });
});

describe("medicamento fora do Cadastro e o pré-cadastro", () => {
  it("com a temperatura já escolhida: medicamento em MAIÚSCULAS, sem id do Cadastro, e o pedido sai na hora; 201 guarda o pre_cadastro_id", async () => {
    const a = falsas();
    const f = abrir([item("itm_a", 1, { temperatura: "Ambiente" })], a);
    await digitar("#item-itm_a-medicamento", "  teste   med pre-cadastro ");
    await avancar(250);
    const usar = qa<HTMLElement>("[data-opcao-novo]")[0]!;
    expect(texto(usar)).toBe("Usar “teste med pre-cadastro” (fora do Cadastro)");
    usar.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await avancar();
    expect(a.pedirPreCadastro).toHaveBeenCalledWith("TESTE MED PRE-CADASTRO", "Ambiente");
    expect(itensDe(f)[0]).toMatchObject({ medicamento: "TESTE MED PRE-CADASTRO", medicamentoCadastroId: null, preCadastroId: "pre_novo_01", temperatura: "Ambiente" });
    expect(texto(q("#item-itm_a-fora-do-cadastro"))).toBe("Fora do Cadastro: entra no pré-cadastro para aprovação.");
  });

  it("SEM temperatura: aparece 'Escolha a temperatura.', o pedido NÃO sai ainda; ao escolher a temperatura ele sai e guarda o id", async () => {
    const a = falsas();
    const f = abrir([item("itm_a", 1)], a);
    await digitar("#item-itm_a-medicamento", "TESTE MED PRE-CADASTRO");
    await avancar(250);
    qa<HTMLElement>("[data-opcao-novo]")[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await avancar();
    expect(a.pedirPreCadastro).not.toHaveBeenCalled();
    expect(itensDe(f)[0]).toMatchObject({ medicamento: "TESTE MED PRE-CADASTRO", medicamentoCadastroId: null, preCadastroId: null });
    expect(texto(q("#item-itm_a-fora-do-cadastro"))).toBe("Fora do Cadastro: entra no pré-cadastro para aprovação. Escolha a temperatura.");
    await escolherTemperatura("itm_a", "2°C a 8°C");
    expect(a.pedirPreCadastro).toHaveBeenCalledWith("TESTE MED PRE-CADASTRO", "2°C a 8°C");
    expect(itensDe(f)[0]).toMatchObject({ preCadastroId: "pre_novo_01", temperatura: "2°C a 8°C" });
    expect(texto(q("#item-itm_a-fora-do-cadastro"))).toBe("Fora do Cadastro: entra no pré-cadastro para aprovação.");
  });

  it("200 (já havia um pendente com o mesmo nome) também guarda o id devolvido", async () => {
    const a = falsas({ pedirPreCadastro: vi.fn(async () => ({ tipo: "pre-cadastro", id: "pre_ja_existia" }) as ResultadoPreCadastro) });
    const f = abrir([item("itm_a", 1, { temperatura: "Ambiente" })], a as Falsas);
    await digitar("#item-itm_a-medicamento", "TESTE MED");
    await avancar(250);
    qa<HTMLElement>("[data-opcao-novo]")[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await avancar();
    expect(itensDe(f)[0]!.preCadastroId).toBe("pre_ja_existia");
  });

  it("409 (já existe no Cadastro): troca para o item do Cadastro devolvido (com a temperatura dele) e avisa", async () => {
    const a = falsas({
      pedirPreCadastro: vi.fn(async () => ({ tipo: "cadastrado", medicamento: { id: "med_9", nome: "TESTE MED CADASTRADO", temperatura: "2°C a 8°C" } }) as ResultadoPreCadastro),
    });
    const f = abrir([item("itm_a", 1, { temperatura: "Ambiente" })], a as Falsas);
    await digitar("#item-itm_a-medicamento", "teste med cadastrado");
    await avancar(250);
    qa<HTMLElement>("[data-opcao-novo]")[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await avancar();
    expect(itensDe(f)[0]).toMatchObject({ medicamento: "TESTE MED CADASTRADO", medicamentoCadastroId: "med_9", preCadastroId: null, temperatura: "2°C a 8°C" });
    expect(a.avisar).toHaveBeenCalledWith("Já existe no Cadastro: usei o cadastrado");
    expect(q<HTMLInputElement>("#item-itm_a-medicamento")!.value).toBe("TESTE MED CADASTRADO");
    expect(q("#item-itm_a-fora-do-cadastro")).toBeNull();
  });

  it("trocar para OUTRO medicamento depois limpa o pre_cadastro_id (do Cadastro e também de outro texto novo)", async () => {
    const a = falsas();
    const f = abrir([item("itm_a", 1, { temperatura: "Ambiente", medicamento: "ANTIGO TESTE", preCadastroId: "pre_antigo" })], a);
    await buscarEEscolher("itm_a", "dipi", "DIPIRONA TESTE");
    expect(itensDe(f)[0]).toMatchObject({ medicamentoCadastroId: "med_1", preCadastroId: null });

    const g = abrir([item("itm_b", 1, { temperatura: "Ambiente", medicamento: "ANTIGO TESTE", preCadastroId: "pre_antigo" })], falsas({ pedirPreCadastro: vi.fn(() => new Promise<ResultadoPreCadastro>(() => undefined)) }));
    await digitar("#item-itm_b-medicamento", "OUTRO NOVO TESTE");
    await avancar(250);
    qa<HTMLElement>("[data-opcao-novo]")[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await avancar();
    expect(itensDe(g)[0]).toMatchObject({ medicamento: "OUTRO NOVO TESTE", preCadastroId: null });
  });

  it("uma resposta de pré-cadastro que chega DEPOIS de a pessoa trocar de medicamento é descartada", async () => {
    let soltar: (r: ResultadoPreCadastro) => void = () => undefined;
    const a = falsas({ pedirPreCadastro: vi.fn(() => new Promise<ResultadoPreCadastro>((r) => (soltar = r))) });
    const f = abrir([item("itm_a", 1, { temperatura: "Ambiente" })], a as Falsas);
    await digitar("#item-itm_a-medicamento", "TESTE LENTO");
    await avancar(250);
    qa<HTMLElement>("[data-opcao-novo]")[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await avancar();
    await buscarEEscolher("itm_a", "dipi", "DIPIRONA TESTE"); // trocou para um do Cadastro enquanto o pedido estava no ar
    soltar({ tipo: "pre-cadastro", id: "pre_tarde" });
    await avancar();
    expect(itensDe(f)[0]).toMatchObject({ medicamento: "DIPIRONA TESTE", medicamentoCadastroId: "med_1", preCadastroId: null });
  });

  it("sair do campo com o texto digitado SEM escolher aplica a mesma regra de 'fora do Cadastro'", async () => {
    const a = falsas();
    const f = abrir([item("itm_a", 1, { temperatura: "Ambiente" })], a);
    await digitar("#item-itm_a-medicamento", "texto solto teste");
    q<HTMLInputElement>("#item-itm_a-medicamento")!.dispatchEvent(new FocusEvent("blur"));
    await avancar();
    expect(a.pedirPreCadastro).toHaveBeenCalledWith("TEXTO SOLTO TESTE", "Ambiente");
    expect(itensDe(f)[0]).toMatchObject({ medicamento: "TEXTO SOLTO TESTE", medicamentoCadastroId: null, preCadastroId: "pre_novo_01" });
  });

  it("falha de rede: mantém o texto, mostra 'Não foi possível registrar no pré-cadastro. Tentar de novo' e tentar de novo registra", async () => {
    const a = falsas();
    a.pedirPreCadastro.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const f = abrir([item("itm_a", 1, { temperatura: "Ambiente" })], a);
    await digitar("#item-itm_a-medicamento", "TESTE MED");
    await avancar(250);
    qa<HTMLElement>("[data-opcao-novo]")[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await avancar();
    expect(texto(q("#item-itm_a-falha-pre-cadastro"))).toBe("Não foi possível registrar no pré-cadastro. Tentar de novo");
    expect(itensDe(f)[0]).toMatchObject({ medicamento: "TESTE MED", preCadastroId: null }); // o texto fica
    // O estado do formulário continua editável (o que vai para o autosave não fica preso por isso).
    await digitar("#item-itm_a-quantidade", "5 caixas");
    expect(itensDe(f)[0]!.quantidade).toBe("5 caixas");
    await clicar("#item-itm_a-falha-pre-cadastro button");
    await avancar();
    expect(a.pedirPreCadastro).toHaveBeenCalledTimes(2);
    expect(itensDe(f)[0]!.preCadastroId).toBe("pre_novo_01");
    expect(q("#item-itm_a-falha-pre-cadastro")).toBeNull();
  });

  it("esvaziar o campo limpa o medicamento e os ids (a temperatura fica)", async () => {
    const f = abrir([item("itm_a", 1, { medicamento: "DIPIRONA TESTE", medicamentoCadastroId: "med_1", temperatura: "Ambiente" })], falsas());
    await digitar("#item-itm_a-medicamento", "");
    q<HTMLInputElement>("#item-itm_a-medicamento")!.dispatchEvent(new FocusEvent("blur"));
    await avancar();
    expect(itensDe(f)[0]).toMatchObject({ medicamento: "", medicamentoCadastroId: null, preCadastroId: null, temperatura: "Ambiente" });
  });

  it("carregar uma compra com medicamento de fora do Cadastro já mostra o aviso (sem pedir nada de novo)", () => {
    const a = falsas();
    abrir([item("itm_a", 1, { medicamento: "TESTE MED", preCadastroId: "pre_1", temperatura: "Ambiente" })], a);
    expect(texto(q("#item-itm_a-fora-do-cadastro"))).toBe("Fora do Cadastro: entra no pré-cadastro para aprovação.");
    expect(a.pedirPreCadastro).not.toHaveBeenCalled();
  });
});

describe("temperatura 'Outro…'", () => {
  it("a lista é a do Cadastro e a ÚLTIMA opção é 'Outro…' (nunca gravada)", async () => {
    const f = abrir([item("itm_a", 1)], falsas());
    await clicar("#item-itm_a-temperatura");
    expect(qa("[role=option]").map((o) => texto(o))).toEqual(["Selecione", "2°C a 8°C", "Ambiente", "Outro…"]);
    qa<HTMLElement>("[role=option]")[3]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await avancar();
    expect(itensDe(f)[0]!.temperatura).toBe(""); // o sentinela não vira dado
    expect(q("#item-itm_a-outra-temperatura")).not.toBeNull();
    expect(texto(q("#item-itm_a-outra-temperatura label"))).toBe("Nova temperatura");
  });

  async function abrirOutra(a: Falsas, itens = [item("itm_a", 1)]): Promise<FormularioMontado> {
    const f = abrir(itens, a);
    await escolherTemperatura("itm_a", "Outro…");
    return f;
  }

  it("DUPLICATA (acento, caixa e espaços): mostra 'Já existe “X”: usar essa?' sem chamar a API; 'Usar' seleciona a existente", async () => {
    const a = falsas();
    const f = await abrirOutra(a);
    await digitar("#item-itm_a-nova-temperatura", "  2°c   A  8°C ");
    await clicar("#item-itm_a-adicionar-temperatura");
    expect(texto(q("#item-itm_a-temperatura-existe"))).toBe("Já existe “2°C a 8°C”: usar essa? Usar");
    expect(a.registrarTemperatura).not.toHaveBeenCalled();
    await clicar("#item-itm_a-temperatura-existe button");
    expect(itensDe(f)[0]!.temperatura).toBe("2°C a 8°C");
    expect(q("#item-itm_a-outra-temperatura")).toBeNull();
    expect(a.registrarTemperatura).not.toHaveBeenCalled();
  });

  it("201: cria, entra nas opções de TODAS as linhas e fica selecionada; o formulário fecha", async () => {
    const a = falsas();
    const f = abrir([item("itm_a", 1), item("itm_b", 2)], a);
    a.registrarTemperatura.mockImplementation(async (nome) => {
      f.opcoes.value = { ...f.opcoes.value, temperaturas: [...f.opcoes.value.temperaturas, { nome }] }; // como useCompraAcoes faz
      return { tipo: "criada", nome };
    });
    await escolherTemperatura("itm_a", "Outro…");
    await digitar("#item-itm_a-nova-temperatura", "TESTE TEMP");
    await clicar("#item-itm_a-adicionar-temperatura");
    await avancar();
    expect(a.registrarTemperatura).toHaveBeenCalledWith("TESTE TEMP");
    expect(itensDe(f)[0]!.temperatura).toBe("TESTE TEMP");
    expect(q("#item-itm_a-outra-temperatura")).toBeNull();
    await clicar("#item-itm_b-temperatura");
    expect(qa("[role=option]").map((o) => texto(o))).toContain("TESTE TEMP");
  });

  it("200 (já existia ativa): seleciona a existente que o servidor devolveu", async () => {
    const a = falsas({ registrarTemperatura: vi.fn(async () => ({ tipo: "existente", nome: "Congelado -20°C" }) as ResultadoTemperatura) });
    const f = await abrirOutra(a as Falsas);
    await digitar("#item-itm_a-nova-temperatura", "congelado -20°c");
    await clicar("#item-itm_a-adicionar-temperatura");
    await avancar();
    expect(itensDe(f)[0]!.temperatura).toBe("Congelado -20°C");
  });

  it("409 inativa: 'Essa temperatura existe, mas está desativada. Peça a quem administra os Cadastros.' e NADA é selecionado", async () => {
    const a = falsas({ registrarTemperatura: vi.fn(async () => ({ tipo: "inativa" }) as ResultadoTemperatura) });
    const f = await abrirOutra(a as Falsas);
    await digitar("#item-itm_a-nova-temperatura", "Temperatura antiga");
    await clicar("#item-itm_a-adicionar-temperatura");
    await avancar();
    expect(texto(q("#item-itm_a-temperatura-inativa"))).toBe("Essa temperatura existe, mas está desativada. Peça a quem administra os Cadastros.");
    expect(itensDe(f)[0]!.temperatura).toBe("");
    expect(q("#item-itm_a-outra-temperatura")).not.toBeNull(); // continua aberto
  });

  it("erro de rede: mensagem e botão 'Tentar de novo', que tenta outra vez", async () => {
    const a = falsas();
    a.registrarTemperatura.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const f = await abrirOutra(a);
    await digitar("#item-itm_a-nova-temperatura", "TESTE TEMP");
    await clicar("#item-itm_a-adicionar-temperatura");
    await avancar();
    expect(texto(q("#item-itm_a-temperatura-erro"))).toBe("Não foi possível adicionar a temperatura. Tentar de novo");
    expect(itensDe(f)[0]!.temperatura).toBe("");
    await clicar("#item-itm_a-temperatura-erro button");
    await avancar();
    expect(a.registrarTemperatura).toHaveBeenCalledTimes(2);
    expect(itensDe(f)[0]!.temperatura).toBe("TESTE TEMP");
    expect(q("#item-itm_a-outra-temperatura")).toBeNull();
  });

  it("nome vazio não chama a API; 'Cancelar' fecha sem mexer", async () => {
    const a = falsas();
    const f = await abrirOutra(a);
    await clicar("#item-itm_a-adicionar-temperatura");
    expect(a.registrarTemperatura).not.toHaveBeenCalled();
    await clicar("#item-itm_a-outra-temperatura button:last-of-type");
    expect(q("#item-itm_a-outra-temperatura")).toBeNull();
    expect(itensDe(f)[0]!.temperatura).toBe("");
  });

  it("uma temperatura nova num medicamento fora do Cadastro também dispara o pedido de pré-cadastro", async () => {
    const a = falsas();
    const f = abrir([item("itm_a", 1, { medicamento: "TESTE MED" })], a);
    await escolherTemperatura("itm_a", "Outro…");
    await digitar("#item-itm_a-nova-temperatura", "TESTE TEMP");
    await clicar("#item-itm_a-adicionar-temperatura");
    await avancar();
    expect(a.pedirPreCadastro).toHaveBeenCalledWith("TESTE MED", "TESTE TEMP");
    expect(itensDe(f)[0]).toMatchObject({ temperatura: "TESTE TEMP", preCadastroId: "pre_novo_01" });
  });
});

describe("somente leitura", () => {
  it("sem 'Outro…', sem abrir a busca e tudo desabilitado", async () => {
    const a = falsas();
    abrir([item("itm_a", 1, { medicamento: "DIPIRONA TESTE", medicamentoCadastroId: "med_1" })], a, false);
    expect(q<HTMLInputElement>("#item-itm_a-medicamento")!.disabled).toBe(true);
    expect(q<HTMLButtonElement>("#item-itm_a-temperatura")!.disabled).toBe(true);
    await digitar("#item-itm_a-medicamento", "dipi");
    await avancar(1000);
    expect(a.buscarMedicamentos).not.toHaveBeenCalled();
    expect(q("[role=listbox]")).toBeNull();
    expect(q("#item-itm_a-outra-temperatura")).toBeNull();
  });
});
