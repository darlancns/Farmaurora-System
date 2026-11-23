// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { TEXTO_PRE_CADASTRO_REJEITADO } from "../../shared/constants/compra";
import {
  acoesFalsas,
  clicar,
  compraComUmMedicamento,
  digitar,
  escolherNoSelect,
  esperar,
  itemDeTeste,
  montarFormulario,
  q,
  qa,
  texto,
  type FormularioMontado,
} from "./helpers/montarFormulario";

// Medicamentos no formulário único: 1 e 2 medicamentos (Med. 1, Med. 2), "+" e remover, Opção A (vínculo com limite de palavra),
// "Pedir cadastro" SEMPRE explícito (exige temperatura), Brand, valores e temperatura ("Outro…"). Dados fictícios (TESTE).

let montado: FormularioMontado | null = null;
afterEach(() => {
  montado?.desmontar();
  montado = null;
  document.body.innerHTML = "";
});

const ID1 = "itm_teste_0001";
const ID2 = "itm_teste_0002";
const med = (id: string, campo: string): string => `#compra-item-${id}-${campo}`;
const OPCOES = { temperaturas: [{ nome: "2°C a 8°C" }, { nome: "Ambiente" }] };

const doisMedicamentos = () =>
  compraComUmMedicamento({
    itens: [itemDeTeste(1, { medicamento: "MED TESTE A", laboratorio: "Lab A" }), itemDeTeste(2, { medicamento: "MED TESTE B", laboratorio: "Lab B" })],
  });

const ligado = (extra = {}) =>
  compraComUmMedicamento({
    itens: [itemDeTeste(1, { medicamento: "DIPIRONA TESTE", medicamentoCadastroId: "med_1", medicamentoCadastroNome: "DIPIRONA TESTE", temperatura: "2°C a 8°C", ...extra })],
  });

const ultimoItens = (m: FormularioMontado) => m.compra().itens;

describe("1 medicamento: um controle por linha, com <label for>", () => {
  it("as linhas por medicamento têm UM controle, e o rótulo da linha é o <label for> dele", () => {
    montado = montarFormulario(compraComUmMedicamento(), { opcoes: OPCOES });
    for (const [linha, campo] of [
      ["medicamento", "medicamento"],
      ["laboratorio", "laboratorio"],
      ["brand", "brand"],
      ["quantidade", "quantidade"],
      ["valor_unitario", "valor-unitario"],
      ["valor_real", "valor-real"],
      ["temperatura", "temperatura"],
    ] as const) {
      const rotulo = q<HTMLLabelElement>(`[data-linha="${linha}"] label`)!;
      expect(rotulo.getAttribute("for"), linha).toBe(`compra-item-${ID1}-${campo}`);
      expect(q(`#compra-item-${ID1}-${campo}`), linha).not.toBeNull();
      expect(qa(`[data-linha="${linha}"] [role="group"]`), `${linha} sem grupo Med.`).toHaveLength(0);
    }
  });

  it("sem '✕' de remover (a compra nunca fica sem medicamento)", () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(q(med(ID1, "remover"))).toBeNull();
  });

  it("digitar no campo Medicamento grava o texto do 1º item e só dele", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    await digitar(med(ID1, "medicamento"), "KEYTRUDA 100mg - 2 vials per box");
    expect(ultimoItens(montado)[0]!.medicamento).toBe("KEYTRUDA 100MG - 2 VIALS PER BOX"); // o valor digitado vira MAIÚSCULAS (como no Follow-Up)
    expect(montado.mudancas.at(-1)).toHaveProperty("itens");
  });
});

describe("2 ou mais medicamentos: um controle por medicamento, 'Med. 1', 'Med. 2'", () => {
  it("cada linha por medicamento vira um grupo 'Med. N' com um controle por medicamento e o rótulo da linha como texto", () => {
    montado = montarFormulario(doisMedicamentos(), { opcoes: OPCOES });
    for (const linha of ["medicamento", "laboratorio", "brand", "quantidade", "valor_unitario", "valor_real", "temperatura"]) {
      const grupos = qa<HTMLElement>(`[data-linha="${linha}"] [role="group"][aria-label^="Med."]`);
      expect(grupos.map((g) => g.getAttribute("aria-label")), linha).toEqual(["Med. 1", "Med. 2"]);
      expect(qa(`[data-linha="${linha}"] label`).map((l) => texto(l)).filter((t) => t.startsWith("Med.")), linha).toEqual(["Med. 1", "Med. 2"]);
    }
  });

  it("cada controle tem nome acessível '<rótulo>, Med. N' (o <label for> é o 'Med. N' visível)", () => {
    montado = montarFormulario(doisMedicamentos());
    expect(q(med(ID1, "laboratorio"))!.getAttribute("aria-label")).toBe("Laboratório, Med. 1");
    expect(q(med(ID2, "laboratorio"))!.getAttribute("aria-label")).toBe("Laboratório, Med. 2");
    expect(q(med(ID2, "medicamento"))!.getAttribute("aria-label")).toBe("Medicamento, Med. 2");
  });

  it("editar o laboratório do Med. 2 muda só o Med. 2", async () => {
    montado = montarFormulario(doisMedicamentos());
    await digitar(med(ID2, "laboratorio"), "Lab Novo");
    expect(ultimoItens(montado).map((i) => i.laboratorio)).toEqual(["Lab A", "Lab Novo"]);
  });

  it("os dois medicamentos têm '✕'; remover o Med. 1 deixa o outro e renumera", async () => {
    montado = montarFormulario(doisMedicamentos());
    expect(q(med(ID1, "remover"))!.getAttribute("aria-label")).toBe("Remover Med. 1");
    await clicar(med(ID1, "remover"));
    expect(ultimoItens(montado).map((i) => [i.id, i.posicao])).toEqual([[ID2, 1]]);
    expect(q(med(ID2, "remover"))).toBeNull(); // sobrou um: sem ✕
  });
});

const BOTAO_MAIS = "button[aria-label='Adicionar medicamento']";

describe("'+' ao lado do input do último medicamento (aria-label 'Adicionar medicamento')", () => {
  it("acrescenta um medicamento vazio no fim (e a linha passa a ter Med. 1 e Med. 2)", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    await clicar(BOTAO_MAIS);
    expect(ultimoItens(montado)).toHaveLength(2);
    expect(ultimoItens(montado)[1]).toMatchObject({ posicao: 2, medicamento: "", medicamentoCadastroId: null, brand: "" });
    expect(qa('[data-linha="laboratorio"] [role="group"][aria-label^="Med."]')).toHaveLength(2);
  });

  it("no teto de 30 medicamentos o botão fica desabilitado, com title", () => {
    const itens = Array.from({ length: 30 }, (_, i) => itemDeTeste(i + 1, { id: `itm_teste_${String(i + 1).padStart(4, "0")}` }));
    montado = montarFormulario(compraComUmMedicamento({ itens }));
    const botao = q<HTMLButtonElement>(BOTAO_MAIS)!;
    expect(botao.disabled).toBe(true);
    expect(botao.title).toContain("30");
  });

  it("é um botão quadrado só com '+': sem texto visível 'Adicionar medicamento', com aria-label e title, focável e que age com Enter/Espaço (click nativo)", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    const botao = q<HTMLButtonElement>(BOTAO_MAIS)!;
    expect(botao.type).toBe("button");
    expect(texto(botao)).toBe("+");
    expect(botao.getAttribute("aria-label")).toBe("Adicionar medicamento");
    expect(botao.title).toBe("Adicionar medicamento");
    expect(botao.tabIndex).not.toBe(-1);
    expect(botao.className).toContain("focus-visible:outline-2");
    expect(botao.className).toContain("w-11"); // quadrado
    expect(document.body.textContent).not.toContain("Adicionar medicamento"); // nenhum texto visível
    botao.focus();
    expect(document.activeElement).toBe(botao);
  });

  it("com 1 medicamento: [input] [+]; com 2: o '+' só no ÚLTIMO, ao lado do ✕, e o 1º tem ✕ e um espaço do tamanho do '+' (inputs alinhados)", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    const um = q<HTMLElement>(`#compra-item-${ID1}`)!;
    expect(um.querySelector(BOTAO_MAIS)).not.toBeNull();
    expect(um.querySelector("[id$='-remover']")).toBeNull();
    await clicar(BOTAO_MAIS);
    const [m1, m2] = qa<HTMLElement>("[data-item-medicamento]");
    expect(m1!.querySelector(BOTAO_MAIS)).toBeNull();
    expect(m1!.querySelector("[id$='-remover']")).not.toBeNull();
    expect(m1!.querySelector("span[aria-hidden='true'].w-11")).not.toBeNull(); // espaço do "+"
    expect(m2!.querySelector(BOTAO_MAIS)).not.toBeNull();
    expect(m2!.querySelector("[id$='-remover']")).not.toBeNull();
    // ✕ e + na ordem: [✕][+]
    const trilho = m2!.querySelector(BOTAO_MAIS)!.parentElement!;
    expect(trilho.firstElementChild!.querySelector("[id$='-remover']")).not.toBeNull();
    expect(qa(BOTAO_MAIS)).toHaveLength(1);
  });

  it("depois de remover o último, o '+' passa para o que ficou como último", async () => {
    montado = montarFormulario(doisMedicamentos());
    await clicar(med(ID2, "remover"));
    expect(qa(BOTAO_MAIS)).toHaveLength(1);
    expect(q<HTMLElement>(`#compra-item-${ID1}`)!.querySelector(BOTAO_MAIS)).not.toBeNull();
  });
});

describe("escolher uma sugestão do Cadastro", () => {
  const sugestao = { valor: "med_1", rotulo: "DIPIRONA TESTE", extra: { temperatura: "2°C a 8°C" } };

  it("o texto vira o nome do Cadastro, liga o medicamento, traz a temperatura e o cursor fica no FIM", async () => {
    montado = montarFormulario(compraComUmMedicamento(), { opcoes: OPCOES, acoes: acoesFalsas({ buscarMedicamentos: async () => [sugestao] }) });
    await digitar(med(ID1, "medicamento"), "dipi");
    await esperar(320);
    const opcao = qa<HTMLElement>("[role=option]").find((o) => texto(o) === "DIPIRONA TESTE")!;
    opcao.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await esperar(5);
    expect(ultimoItens(montado)[0]).toMatchObject({ medicamento: "DIPIRONA TESTE", medicamentoCadastroId: "med_1", medicamentoCadastroNome: "DIPIRONA TESTE", temperatura: "2°C a 8°C" });
    const campo = q<HTMLInputElement>(med(ID1, "medicamento"))!;
    expect(document.activeElement).toBe(campo);
    expect(campo.selectionStart).toBe("DIPIRONA TESTE".length);
    expect(texto(q(`#compra-item-${ID1}-do-cadastro`))).toBe("Do Cadastro");
  });
});

describe("Opção A: o vínculo com o Cadastro e o limite de palavra", () => {
  it("completar o nome ('DIPIRONA TESTE 500 mg') mantém o vínculo e a temperatura; sem a linha 'Fora do Cadastro'", async () => {
    montado = montarFormulario(ligado(), { opcoes: OPCOES });
    await digitar(med(ID1, "medicamento"), "DIPIRONA TESTE 500 mg c/ 10");
    expect(ultimoItens(montado)[0]).toMatchObject({ medicamentoCadastroId: "med_1", temperatura: "2°C a 8°C" });
    expect(q(`#compra-item-${ID1}-fora-do-cadastro`)).toBeNull();
  });

  it("mudar o COMEÇO desfaz o vínculo, zera a temperatura e mostra 'Fora do Cadastro. Nome para o cadastro' logo abaixo", async () => {
    montado = montarFormulario(ligado(), { opcoes: OPCOES });
    await digitar(med(ID1, "medicamento"), "DIPIRONA TEST");
    expect(ultimoItens(montado)[0]).toMatchObject({ medicamentoCadastroId: null, medicamentoCadastroNome: null, temperatura: "" });
    const bloco = q(`#compra-item-${ID1}-fora-do-cadastro`)!;
    expect(texto(bloco)).toContain("Fora do Cadastro.");
    expect(texto(bloco)).toContain("Nome para o cadastro:");
    expect(q<HTMLInputElement>(`#compra-item-${ID1}-nome-cadastro`)!.value).toBe("DIPIRONA TEST");
    expect(q(`#compra-item-${ID1}-do-cadastro`)).toBeNull();
  });

  it("LIMITE DE PALAVRA: 'DIPIRONA TESTEX' (colado em letra) desfaz o vínculo", async () => {
    montado = montarFormulario(ligado(), { opcoes: OPCOES });
    await digitar(med(ID1, "medicamento"), "DIPIRONA TESTEX");
    expect(ultimoItens(montado)[0]).toMatchObject({ medicamentoCadastroId: null, temperatura: "" });
    expect(q(`#compra-item-${ID1}-fora-do-cadastro`)).not.toBeNull();
  });

  it("'DIPIRONA TESTE-500' (hífen depois do nome) mantém o vínculo", async () => {
    montado = montarFormulario(ligado(), { opcoes: OPCOES });
    await digitar(med(ID1, "medicamento"), "DIPIRONA TESTE-500");
    expect(ultimoItens(montado)[0]).toMatchObject({ medicamentoCadastroId: "med_1" });
  });

  it("o campo 'nome para o cadastro' é editável e tem no máximo 120 caracteres", async () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1, { medicamento: "Novo Med Teste 5 mg" })] }), { opcoes: OPCOES });
    const campo = q<HTMLInputElement>(`#compra-item-${ID1}-nome-cadastro`)!;
    expect(campo.maxLength).toBe(120);
    expect(campo.value).toBe("Novo Med Teste 5 mg"); // o texto atual, como está (a caixa só muda ao enviar)
    await digitar(`#compra-item-${ID1}-nome-cadastro`, "Novo Med");
    expect(campo.value).toBe("Novo Med");
    expect(ultimoItens(montado)[0]!.medicamento).toBe("Novo Med Teste 5 mg"); // o texto do medicamento não muda
  });

  it("enquanto o nome para o cadastro não é editado, ele acompanha o texto digitado", async () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1, { medicamento: "Novo" })] }));
    await digitar(med(ID1, "medicamento"), "Novo Teste");
    expect(q<HTMLInputElement>(`#compra-item-${ID1}-nome-cadastro`)!.value).toBe("NOVO TESTE"); // acompanha o texto, que já é maiúsculo
  });
});

describe("'Pedir cadastro' é SEMPRE explícito e exige temperatura", () => {
  const novoMed = (extra = {}) => compraComUmMedicamento({ itens: [itemDeTeste(1, { medicamento: "Novo Med Teste", ...extra })] });

  it("sem temperatura: o botão fica desabilitado, com title e texto explicando; nada é pedido", async () => {
    const pedirPreCadastro = vi.fn(async () => ({ tipo: "pre-cadastro" as const, id: "pre_1" }));
    montado = montarFormulario(novoMed(), { opcoes: OPCOES, acoes: acoesFalsas({ pedirPreCadastro }) });
    const botao = q<HTMLButtonElement>(`#compra-item-${ID1}-pedir-cadastro`)!;
    expect(botao.disabled).toBe(true);
    expect(botao.title).toBe("Escolha a temperatura antes de pedir o cadastro.");
    expect(botao.getAttribute("aria-describedby")).toBe(`compra-item-${ID1}-pedir-dica`);
    expect(texto(q(`#compra-item-${ID1}-pedir-dica`))).toContain("Escolha a temperatura");
    botao.click();
    await esperar();
    expect(pedirPreCadastro).not.toHaveBeenCalled();
  });

  it("escolher a temperatura NÃO dispara o pedido (nunca sozinho)", async () => {
    const pedirPreCadastro = vi.fn(async () => ({ tipo: "pre-cadastro" as const, id: "pre_1" }));
    montado = montarFormulario(novoMed(), { opcoes: OPCOES, acoes: acoesFalsas({ pedirPreCadastro }) });
    await escolherNoSelect(med(ID1, "temperatura"), "Ambiente");
    await esperar(20);
    expect(ultimoItens(montado)[0]!.temperatura).toBe("Ambiente");
    expect(pedirPreCadastro).not.toHaveBeenCalled();
    expect(ultimoItens(montado)[0]!.preCadastroId).toBeNull();
  });

  it("com temperatura, o clique pede (nome em maiúsculas pelo contrato) e o item passa a 'pendente'", async () => {
    const pedirPreCadastro = vi.fn(async () => ({ tipo: "pre-cadastro" as const, id: "pre_9" }));
    montado = montarFormulario(novoMed({ temperatura: "Ambiente" }), { opcoes: OPCOES, acoes: acoesFalsas({ pedirPreCadastro }) });
    const botao = q<HTMLButtonElement>(`#compra-item-${ID1}-pedir-cadastro`)!;
    expect(botao.disabled).toBe(false);
    await clicar(`#compra-item-${ID1}-pedir-cadastro`);
    await esperar(5);
    expect(pedirPreCadastro).toHaveBeenCalledTimes(1);
    expect(pedirPreCadastro).toHaveBeenCalledWith("Novo Med Teste", "Ambiente");
    expect(ultimoItens(montado)[0]).toMatchObject({ preCadastroId: "pre_9", preCadastroStatus: "pendente" });
    expect(q(`#compra-item-${ID1}-fora-do-cadastro`)).toBeNull();
    expect(texto(q(`#compra-item-${ID1}-pre-cadastro-pendente`))).toContain("aguardando aprovação");
  });

  it("o pedido leva o nome EDITADO pela pessoa", async () => {
    const pedirPreCadastro = vi.fn(async () => ({ tipo: "pre-cadastro" as const, id: "pre_9" }));
    montado = montarFormulario(novoMed({ temperatura: "Ambiente", medicamento: "Novo Med Teste 5 mg c/ 10" }), { acoes: acoesFalsas({ pedirPreCadastro }) });
    await digitar(`#compra-item-${ID1}-nome-cadastro`, "Novo Med Teste");
    await clicar(`#compra-item-${ID1}-pedir-cadastro`);
    await esperar(5);
    expect(pedirPreCadastro).toHaveBeenCalledWith("Novo Med Teste", "Ambiente");
  });

  it("409 (já existe no Cadastro): o medicamento passa a ser o do Cadastro e a pessoa é avisada", async () => {
    const avisar = vi.fn();
    const pedirPreCadastro = vi.fn(async () => ({ tipo: "cadastrado" as const, medicamento: { id: "med_7", nome: "NOVO MED TESTE", temperatura: "2°C a 8°C" } }));
    montado = montarFormulario(novoMed({ temperatura: "Ambiente" }), { acoes: acoesFalsas({ pedirPreCadastro, avisar }) });
    await clicar(`#compra-item-${ID1}-pedir-cadastro`);
    await esperar(5);
    expect(ultimoItens(montado)[0]).toMatchObject({ medicamento: "NOVO MED TESTE", medicamentoCadastroId: "med_7", temperatura: "2°C a 8°C" });
    expect(avisar).toHaveBeenCalledWith("Já existe no Cadastro: usei o cadastrado");
  });

  it("falha do servidor: mostra o erro junto do bloco, com 'Tentar de novo' (e o texto do medicamento fica)", async () => {
    const pedirPreCadastro = vi.fn(async () => {
      throw new Error("Sem conexão com o servidor.");
    });
    montado = montarFormulario(novoMed({ temperatura: "Ambiente" }), { acoes: acoesFalsas({ pedirPreCadastro }) });
    await clicar(`#compra-item-${ID1}-pedir-cadastro`);
    await esperar(5);
    expect(texto(q(`#compra-item-${ID1}-pedir-erro`))).toContain("Sem conexão com o servidor.");
    expect(q(`#compra-item-${ID1}-pedir-erro`)!.getAttribute("role")).toBe("alert");
    expect(ultimoItens(montado)[0]!.medicamento).toBe("Novo Med Teste");
  });

  it("pré-cadastro REJEITADO mostra o texto da constante (e não oferece pedir de novo)", () => {
    montado = montarFormulario(novoMed({ preCadastroId: "pre_1", preCadastroStatus: "rejeitado" }));
    expect(texto(q(`#compra-item-${ID1}-pre-cadastro-rejeitado`))).toBe(TEXTO_PRE_CADASTRO_REJEITADO);
    expect(q(`#compra-item-${ID1}-pedir-cadastro`)).toBeNull();
  });

  it("sócio (só leitura): não há 'Pedir cadastro'", () => {
    montado = montarFormulario(novoMed({ temperatura: "Ambiente" }), { podeEditar: false });
    expect(q(`#compra-item-${ID1}-pedir-cadastro`)).toBeNull();
  });
});

describe("Brand, valores e temperatura por medicamento", () => {
  it("Brand é um select com Selecione, Bioequivalente e Referência (as constantes do Follow-Up); escolher grava o valor", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    await clicar(med(ID1, "brand"));
    expect(qa("[role=option]").map((o) => texto(o))).toEqual(["Selecione", "Bioequivalente", "Referência"]);
    qa<HTMLElement>("[role=option]").find((o) => texto(o) === "Referência")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await esperar();
    expect(ultimoItens(montado)[0]!.brand).toBe("referencia");
  });

  it("valor unitário e valor real são dinheiro (US$) por medicamento; frete e valor real do frete são da compra", async () => {
    montado = montarFormulario(doisMedicamentos());
    await digitar(med(ID2, "valor-unitario"), "1.234,50");
    await digitar(med(ID1, "valor-real"), "10");
    await digitar("#compra-frete", "150");
    await digitar("#compra-frete-real", "140,5");
    expect(ultimoItens(montado).map((i) => [i.valorUnitario, i.valorReal])).toEqual([[null, 10], [1234.5, null]]);
    expect(montado.compra().frete).toBe(150);
    expect(montado.compra().freteReal).toBe(140.5);
  });

  it("temperatura: as do Cadastro; escolher uma grava só a temperatura daquele medicamento", async () => {
    montado = montarFormulario(doisMedicamentos(), { opcoes: OPCOES });
    await escolherNoSelect(med(ID2, "temperatura"), "2°C a 8°C");
    expect(ultimoItens(montado).map((i) => i.temperatura)).toEqual(["", "2°C a 8°C"]);
  });

  it("'Outro…' mantém o fluxo: Adicionar chama registrarTemperatura e seleciona a nova (sem pré-cadastro)", async () => {
    const registrarTemperatura = vi.fn(async (nome: string) => ({ tipo: "criada" as const, nome }));
    const pedirPreCadastro = vi.fn();
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1, { medicamento: "Novo Med" })] }), {
      opcoes: OPCOES,
      acoes: acoesFalsas({ registrarTemperatura, pedirPreCadastro: pedirPreCadastro as never }),
    });
    await escolherNoSelect(med(ID1, "temperatura"), "Outro…");
    expect(q(`${med(ID1, "temperatura")}-outra`)).not.toBeNull();
    await digitar(`${med(ID1, "temperatura")}-nova`, "Congelado TESTE");
    await clicar(`${med(ID1, "temperatura")}-adicionar`);
    await esperar(5);
    expect(registrarTemperatura).toHaveBeenCalledWith("Congelado TESTE");
    expect(ultimoItens(montado)[0]!.temperatura).toBe("Congelado TESTE");
    expect(pedirPreCadastro).not.toHaveBeenCalled();
  });

  it("'Outro…' com nome que já existe só oferece 'Usar'; temperatura inativa avisa e não seleciona", async () => {
    const registrarTemperatura = vi.fn(async () => ({ tipo: "inativa" as const }));
    montado = montarFormulario(compraComUmMedicamento(), { opcoes: OPCOES, acoes: acoesFalsas({ registrarTemperatura }) });
    await escolherNoSelect(med(ID1, "temperatura"), "Outro…");
    await digitar(`${med(ID1, "temperatura")}-nova`, "  ambiente ");
    await clicar(`${med(ID1, "temperatura")}-adicionar`);
    expect(texto(q(`${med(ID1, "temperatura")}-existe`))).toContain("Já existe “Ambiente”");
    expect(registrarTemperatura).not.toHaveBeenCalled();
    await digitar(`${med(ID1, "temperatura")}-nova`, "Outra Inativa");
    await clicar(`${med(ID1, "temperatura")}-adicionar`);
    await esperar(5);
    expect(texto(q(`${med(ID1, "temperatura")}-inativa`))).toContain("desativada");
    expect(ultimoItens(montado)[0]!.temperatura).toBe("");
  });
});

describe("foco e somente leitura", () => {
  it("o pedido de foco (nova compra) leva o foco ao campo Medicamento do Med. 1", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(document.activeElement).not.toBe(q(med(ID1, "medicamento")));
    montado.pedidoDeFoco.value += 1;
    await esperar(5);
    expect(document.activeElement).toBe(q(med(ID1, "medicamento")));
  });

  it("sócio: todos os campos de medicamento desabilitados, sem '+' nem '✕'", () => {
    montado = montarFormulario(doisMedicamentos(), { podeEditar: false, opcoes: OPCOES });
    for (const campo of ["medicamento", "laboratorio", "quantidade", "valor-unitario", "valor-real"]) {
      for (const id of [ID1, ID2]) expect(q<HTMLInputElement>(med(id, campo))!.disabled, `${campo} ${id}`).toBe(true);
    }
    expect(q<HTMLButtonElement>(med(ID1, "brand"))!.disabled).toBe(true);
    expect(q<HTMLButtonElement>(med(ID1, "temperatura"))!.disabled).toBe(true);
    expect(q("button[aria-label='Adicionar medicamento']")).toBeNull();
    expect(q(med(ID1, "remover"))).toBeNull();
  });

  it("compra cancelada também fica somente leitura", () => {
    montado = montarFormulario(compraComUmMedicamento({ cancelada: true }));
    expect(q<HTMLInputElement>(med(ID1, "laboratorio"))!.disabled).toBe(true);
  });
});

describe("casos portados da tela antiga (Cadastro, temperatura e pré-cadastro)", () => {
  const sugestao = { valor: "med_1", rotulo: "DIPIRONA TESTE", extra: { temperatura: "" } };

  it("o texto do aviso de pré-cadastro rejeitado é o pedido, sem acento perdido", () => {
    expect(TEXTO_PRE_CADASTRO_REJEITADO).toBe("Pré-cadastro rejeitado: escolha outro medicamento do Cadastro ou mantenha o texto livre");
  });

  it("busca no servidor com o texto digitado e mostra as sugestões", async () => {
    const buscarMedicamentos = vi.fn(async (_q: string) => [sugestao, { valor: "med_2", rotulo: "DIPIRONA OUTRA", extra: { temperatura: "" } }]);
    montado = montarFormulario(compraComUmMedicamento(), { acoes: acoesFalsas({ buscarMedicamentos }) });
    await digitar(med(ID1, "medicamento"), "dipi");
    await esperar(320);
    expect(buscarMedicamentos).toHaveBeenCalledTimes(1);
    expect(buscarMedicamentos.mock.calls[0]![0]).toBe("DIPI"); // a busca recebe o texto já em maiúsculas (o servidor busca sem caixa)
    expect(qa("[role=option]").map((o) => texto(o))).toEqual(["DIPIRONA TESTE", "DIPIRONA OUTRA"]);
  });

  it("Cadastro sem temperatura: mantém a temperatura que o medicamento já tinha; e a pessoa pode trocá-la depois", async () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1, { temperatura: "Ambiente" })] }), { opcoes: OPCOES, acoes: acoesFalsas({ buscarMedicamentos: async () => [sugestao] }) });
    await digitar(med(ID1, "medicamento"), "dipi");
    await esperar(320);
    qa<HTMLElement>("[role=option]")[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    await esperar(5);
    expect(ultimoItens(montado)[0]).toMatchObject({ medicamentoCadastroId: "med_1", temperatura: "Ambiente" });
    await escolherNoSelect(med(ID1, "temperatura"), "2°C a 8°C");
    expect(ultimoItens(montado)[0]!.temperatura).toBe("2°C a 8°C");
    expect(ultimoItens(montado)[0]!.medicamentoCadastroId).toBe("med_1"); // trocar a temperatura não desliga o vínculo
  });

  it("uma resposta de 'Pedir cadastro' que chega DEPOIS de a pessoa mudar o texto é descartada", async () => {
    let responder: (v: { tipo: "pre-cadastro"; id: string }) => void = () => undefined;
    const pedirPreCadastro = vi.fn(() => new Promise<{ tipo: "pre-cadastro"; id: string }>((r) => (responder = r)));
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1, { medicamento: "Novo Med", temperatura: "Ambiente" })] }), { acoes: acoesFalsas({ pedirPreCadastro }) });
    await clicar(`#compra-item-${ID1}-pedir-cadastro`);
    await digitar(med(ID1, "medicamento"), "Outro Med Totalmente Diferente");
    responder({ tipo: "pre-cadastro", id: "pre_tarde" });
    await esperar(5);
    expect(ultimoItens(montado)[0]).toMatchObject({ medicamento: "OUTRO MED TOTALMENTE DIFERENTE", preCadastroId: null });
  });

  it("'Tentar de novo' depois de uma falha de rede pede outra vez", async () => {
    const pedirPreCadastro = vi
      .fn<() => Promise<{ tipo: "pre-cadastro"; id: string }>>()
      .mockRejectedValueOnce(new Error("Sem conexão."))
      .mockResolvedValue({ tipo: "pre-cadastro", id: "pre_2" });
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1, { medicamento: "Novo Med", temperatura: "Ambiente" })] }), { acoes: acoesFalsas({ pedirPreCadastro }) });
    await clicar(`#compra-item-${ID1}-pedir-cadastro`);
    await esperar(5);
    expect(texto(q(`#compra-item-${ID1}-pedir-erro`))).toContain("Sem conexão.");
    q<HTMLButtonElement>(`#compra-item-${ID1}-pedir-erro button`)!.click();
    await esperar(5);
    expect(pedirPreCadastro).toHaveBeenCalledTimes(2);
    expect(ultimoItens(montado)[0]!.preCadastroId).toBe("pre_2");
  });

  it("esvaziar o campo limpa o medicamento e os ids; a temperatura que a pessoa escolheu fica (se não veio do Cadastro)", async () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1, { medicamento: "Novo Med", preCadastroId: "pre_1", temperatura: "Ambiente" })] }));
    await digitar(med(ID1, "medicamento"), "");
    expect(ultimoItens(montado)[0]).toMatchObject({ medicamento: "", medicamentoCadastroId: null, preCadastroId: null, temperatura: "Ambiente" });
  });

  it("carregar uma compra com medicamento de fora do Cadastro e pedido pendente já mostra o aviso, sem pedir nada de novo", () => {
    const pedirPreCadastro = vi.fn();
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1, { medicamento: "Novo Med", preCadastroId: "pre_1", preCadastroStatus: "pendente" })] }), { acoes: acoesFalsas({ pedirPreCadastro: pedirPreCadastro as never }) });
    expect(texto(q(`#compra-item-${ID1}-pre-cadastro-pendente`))).toContain("aguardando aprovação");
    expect(pedirPreCadastro).not.toHaveBeenCalled();
  });

  it("temperatura: a lista é a do Cadastro, com 'Selecione' no início e 'Outro…' por ÚLTIMO (nunca gravada)", async () => {
    montado = montarFormulario(compraComUmMedicamento(), { opcoes: OPCOES });
    await clicar(med(ID1, "temperatura"));
    expect(qa("[role=option]").map((o) => texto(o))).toEqual(["Selecione", "2°C a 8°C", "Ambiente", "Outro…"]);
    await clicar(med(ID1, "temperatura")); // fecha
    await escolherNoSelect(med(ID1, "temperatura"), "Outro…");
    expect(ultimoItens(montado)[0]!.temperatura).toBe(""); // o sentinela nunca é gravado
  });

  it("'Outro…' que já existe ativa (200): seleciona a existente que o servidor devolveu", async () => {
    const registrarTemperatura = vi.fn(async () => ({ tipo: "existente" as const, nome: "Ambiente" }));
    montado = montarFormulario(compraComUmMedicamento(), { opcoes: OPCOES, acoes: acoesFalsas({ registrarTemperatura }) });
    await escolherNoSelect(med(ID1, "temperatura"), "Outro…");
    await digitar(`${med(ID1, "temperatura")}-nova`, "Ambiente TESTE");
    await clicar(`${med(ID1, "temperatura")}-adicionar`);
    await esperar(5);
    expect(ultimoItens(montado)[0]!.temperatura).toBe("Ambiente");
  });

  it("'Outro…': nome vazio não chama a API; erro de rede mostra a mensagem e 'Tentar de novo', que tenta outra vez", async () => {
    const registrarTemperatura = vi
      .fn<(nome: string) => Promise<{ tipo: "criada"; nome: string }>>()
      .mockRejectedValueOnce(new Error("falhou"))
      .mockImplementation(async (nome) => ({ tipo: "criada", nome }));
    montado = montarFormulario(compraComUmMedicamento(), { opcoes: OPCOES, acoes: acoesFalsas({ registrarTemperatura }) });
    await escolherNoSelect(med(ID1, "temperatura"), "Outro…");
    await clicar(`${med(ID1, "temperatura")}-adicionar`); // nome vazio
    expect(registrarTemperatura).not.toHaveBeenCalled();
    await digitar(`${med(ID1, "temperatura")}-nova`, "Congelado TESTE");
    await clicar(`${med(ID1, "temperatura")}-adicionar`);
    await esperar(5);
    expect(texto(q(`${med(ID1, "temperatura")}-erro`))).toContain("Não foi possível adicionar a temperatura.");
    q<HTMLButtonElement>(`${med(ID1, "temperatura")}-erro button`)!.click();
    await esperar(5);
    expect(ultimoItens(montado)[0]!.temperatura).toBe("Congelado TESTE");
    expect(q(`${med(ID1, "temperatura")}-outra`)).toBeNull(); // fechou
  });

  it("'Cancelar' no 'Outro…' fecha sem mexer na temperatura", async () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1, { temperatura: "Ambiente" })] }), { opcoes: OPCOES });
    await escolherNoSelect(med(ID1, "temperatura"), "Outro…");
    q<HTMLButtonElement>(`${med(ID1, "temperatura")}-outra button:last-of-type`)!.click();
    await esperar();
    expect(q(`${med(ID1, "temperatura")}-outra`)).toBeNull();
    expect(ultimoItens(montado)[0]!.temperatura).toBe("Ambiente");
  });
});
