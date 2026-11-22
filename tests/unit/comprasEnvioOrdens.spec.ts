// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { COMPRA_MAX_ORDENS } from "../../shared/constants/compra";
import { NUMERO_REMESSA_ERRO } from "../../shared/utils/numeroRemessa";
import { compraParaResumoEntrada, montarResumoCompra } from "../../shared/utils/compraResumo";
import { clicar, compraComUmMedicamento, digitar, escolherNoSelect, esperar, montarFormulario, q, qa, texto, type FormularioMontado } from "./helpers/montarFormulario";

// Ordens (o stepper do Follow-Up, 1 a 10), Envio + Cia aérea (a cia limpa ao trocar o modal), Courier Simples, Fornecedor e CNPJ (a empresa).
// Dados fictícios (TESTE).

let montado: FormularioMontado | null = null;
afterEach(() => {
  montado?.desmontar();
  montado = null;
  document.body.innerHTML = "";
});

const opcoes = (o: Record<string, unknown> = {}) => ({ fornecedores: [{ nome: "Fornecedor Teste A" }, { nome: "Fornecedor Teste B" }], ...o });
const ultima = (m: FormularioMontado) => m.mudancas.at(-1)!;
const opcoesDoSelect = () => qa<HTMLElement>("[role=option]").map((o) => texto(o));

async function sair(sel: string): Promise<void> {
  const campo = q<HTMLInputElement>(sel)!;
  campo.dispatchEvent(new FocusEvent("blur"));
  campo.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  await nextTick();
}

describe("Ordens: o stepper do Follow-Up, de 1 a 10", () => {
  it("usa o ProcessoRemessaStepper (campo com setas ▲ ▼) com <label for>, e começa em 1", () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(q<HTMLLabelElement>('[data-linha="ordens"] label')!.getAttribute("for")).toBe("compra-ordens");
    expect(q<HTMLInputElement>("#compra-ordens")!.value).toBe("1");
    expect(q("#compra-ordens-mais")!.getAttribute("aria-label")).toBe("Aumentar Ordens");
    expect(q("#compra-ordens-menos")!.getAttribute("aria-label")).toBe("Diminuir Ordens");
  });

  it("▲ aumenta e grava o NÚMERO; ▼ diminui; no 1 o ▼ fica desabilitado", async () => {
    montado = montarFormulario(compraComUmMedicamento({ numeroOrdens: 1 }));
    expect(q<HTMLButtonElement>("#compra-ordens-menos")!.disabled).toBe(true);
    await clicar("#compra-ordens-mais");
    expect(montado.compra().numeroOrdens).toBe(2);
    expect(typeof ultima(montado).numeroOrdens).toBe("number");
    await clicar("#compra-ordens-menos");
    expect(montado.compra().numeroOrdens).toBe(1);
  });

  it("digitar de 1 a 10 grava o número (10 é o teto, COMPRA_MAX_ORDENS)", async () => {
    expect(COMPRA_MAX_ORDENS).toBe(10);
    montado = montarFormulario(compraComUmMedicamento());
    for (const n of [3, 7, 10]) {
      await digitar("#compra-ordens", String(n));
      expect(montado.compra().numeroOrdens).toBe(n);
      expect(q("#compra-linha-ordens-erro")).toBeNull();
    }
  });

  it("11 NÃO é aceito: nada é gravado, aparece NUMERO_REMESSA_ERRO ligado ao campo e, ao sair, volta ao último válido", async () => {
    montado = montarFormulario(compraComUmMedicamento({ numeroOrdens: 4 }));
    await digitar("#compra-ordens", "11");
    expect(montado.compra().numeroOrdens).toBe(4);
    expect(montado.mudancas.some((m) => m.numeroOrdens === 11)).toBe(false);
    const erro = q("#compra-linha-ordens-erro")!;
    expect(texto(erro)).toBe(NUMERO_REMESSA_ERRO);
    expect(erro.getAttribute("role")).toBe("alert");
    await esperar();
    expect(q("#compra-ordens")!.getAttribute("aria-describedby")).toBe("compra-linha-ordens-erro");
    await sair("#compra-ordens");
    expect(q<HTMLInputElement>("#compra-ordens")!.value).toBe("4");
    expect(q("#compra-linha-ordens-erro")).toBeNull();
  });

  it("▲ no 10 (11) também é recusado: continua 10", async () => {
    montado = montarFormulario(compraComUmMedicamento({ numeroOrdens: 10 }));
    await clicar("#compra-ordens-mais");
    expect(montado.compra().numeroOrdens).toBe(10);
    expect(montado.mudancas.some((m) => (m.numeroOrdens ?? 0) > 10)).toBe(false);
    expect(texto(q("#compra-linha-ordens-erro"))).toBe(NUMERO_REMESSA_ERRO);
  });

  it("vazio ou 0 ao sair vira 1 (a regra do stepper)", async () => {
    montado = montarFormulario(compraComUmMedicamento({ numeroOrdens: 5 }));
    await digitar("#compra-ordens", "");
    await sair("#compra-ordens");
    expect(montado.compra().numeroOrdens).toBe(1);
  });

  it("sócio: o campo aparece desabilitado com o número", () => {
    montado = montarFormulario(compraComUmMedicamento({ numeroOrdens: 3 }), { podeEditar: false });
    const campo = q<HTMLInputElement>("#compra-ordens")!;
    expect(campo.disabled).toBe(true);
    expect(campo.value).toBe("3");
    expect(q("#compra-ordens-mais")).toBeNull();
  });
});

describe("Envio e Cia aérea (as opções do Follow-Up)", () => {
  it("Envio: Selecione, Air Cargo, Courier Formal e Courier Simples; ao lado, a Cia aérea (opcional), cada uma com <label for>", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(q<HTMLLabelElement>('[data-linha="envio"] label[for="compra-envio"]')).not.toBeNull();
    expect(texto(q('[data-linha="envio"] label[for="compra-cia"]'))).toBe("Cia aérea (opcional)");
    await clicar("#compra-envio");
    expect(opcoesDoSelect()).toEqual(["Selecione", "Air Cargo", "Courier Formal", "Courier Simples"]);
  });

  it("sem envio a Cia fica desabilitada ('Escolha o envio primeiro'); com Air Cargo oferece as cias do modal", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(q<HTMLButtonElement>("#compra-cia")!.disabled).toBe(true);
    await escolherNoSelect("#compra-envio", "Air Cargo");
    expect(montado.compra().envio).toBe("Air Cargo");
    expect(q<HTMLButtonElement>("#compra-cia")!.disabled).toBe(false);
    await clicar("#compra-cia");
    expect(opcoesDoSelect()).toEqual(["Selecione", "Emirates", "Lufthansa", "Qatar", "Swiss", "Turkish"]);
  });

  it("escolher a cia grava; ela é OPCIONAL (nada obriga)", async () => {
    montado = montarFormulario(compraComUmMedicamento({ envio: "Air Cargo" }));
    await escolherNoSelect("#compra-cia", "Qatar");
    expect(montado.compra().cia).toBe("Qatar");
    await escolherNoSelect("#compra-cia", "Selecione");
    expect(montado.compra().cia).toBe("");
  });

  it("trocar o modal LIMPA a cia que não vale para o novo (a mudança já sai com cia vazia)", async () => {
    montado = montarFormulario(compraComUmMedicamento({ envio: "Air Cargo", cia: "Emirates" }));
    await escolherNoSelect("#compra-envio", "Courier Formal");
    expect(ultima(montado)).toMatchObject({ envio: "Courier Formal", cia: "" });
    expect(montado.compra().cia).toBe("");
  });

  it("trocar o modal MANTÉM a cia que também vale para o novo (DHL serve a Courier Formal e a Courier Simples)", async () => {
    montado = montarFormulario(compraComUmMedicamento({ envio: "Courier Formal", cia: "DHL" }));
    await escolherNoSelect("#compra-envio", "Courier Simples");
    expect(ultima(montado)).toMatchObject({ envio: "Courier Simples", cia: "DHL" });
  });

  it("limpar o envio (Selecione) limpa a cia", async () => {
    montado = montarFormulario(compraComUmMedicamento({ envio: "Air Cargo", cia: "Emirates" }));
    await escolherNoSelect("#compra-envio", "Selecione");
    expect(ultima(montado)).toMatchObject({ envio: "", cia: "" });
  });

  it("Courier Simples: a linha Envio NÃO tem nota nem texto 'não tem despachante' (nada abaixo dos selects); o resumo segue com 'Despachante: N/A' e a linha Despachante com 'Dispensado'", async () => {
    montado = montarFormulario(compraComUmMedicamento({ envio: "Courier Simples" }), { comResumo: true });
    const linhaEnvio = q<HTMLElement>('[data-linha="envio"]')!;
    expect(texto(linhaEnvio)).not.toMatch(/n[ãa]o tem despachante/i);
    expect(texto(linhaEnvio)).not.toContain("N/A");
    expect(linhaEnvio.querySelector("p")).toBeNull(); // nenhum parágrafo de nota
    expect(q("#compra-envio-courier-simples")).toBeNull();
    // O comportamento não mudou:
    expect(texto(q("#compra-despachante-dispensado"))).toContain("Dispensado");
    expect(montarResumoCompra(compraParaResumoEntrada(montado.compra(), null))).toContain("Despachante: N/A");
    await escolherNoSelect("#compra-envio", "Air Cargo");
    expect(q('[data-linha="envio"]')!.querySelector("p")).toBeNull();
  });

  it("sócio: envio e cia desabilitados", () => {
    montado = montarFormulario(compraComUmMedicamento({ envio: "Air Cargo", cia: "Emirates" }), { podeEditar: false });
    expect(q<HTMLButtonElement>("#compra-envio")!.disabled).toBe(true);
    expect(q<HTMLButtonElement>("#compra-cia")!.disabled).toBe(true);
  });
});

describe("Fornecedor e CNPJ (a empresa)", () => {
  it("Fornecedor: select dos fornecedores ativos do Cadastro; escolher grava o nome", async () => {
    montado = montarFormulario(compraComUmMedicamento(), { opcoes: opcoes() });
    expect(q<HTMLLabelElement>('[data-linha="fornecedor"] label')!.getAttribute("for")).toBe("compra-fornecedor");
    await clicar("#compra-fornecedor");
    expect(opcoesDoSelect()).toEqual(["Selecione", "Fornecedor Teste A", "Fornecedor Teste B"]);
    await clicar("#compra-fornecedor"); // fecha a lista
    await escolherNoSelect("#compra-fornecedor", "Fornecedor Teste B");
    expect(montado.compra().fornecedor).toBe("Fornecedor Teste B");
  });

  it("um fornecedor antigo (fora da lista de ativos) continua aparecendo selecionado", () => {
    montado = montarFormulario(compraComUmMedicamento({ fornecedor: "Fornecedor Antigo Teste" }), { opcoes: opcoes() });
    expect(texto(q("#compra-fornecedor"))).toBe("Fornecedor Antigo Teste");
  });

  it("CNPJ: select Empresa com FARMAURORA e MAINZFARMA (como no Follow-Up); começa em FARMAURORA", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(q<HTMLLabelElement>('[data-linha="cnpj"] label')!.getAttribute("for")).toBe("compra-empresa");
    expect(texto(q("#compra-empresa"))).toBe("FARMAURORA");
    await clicar("#compra-empresa");
    expect(opcoesDoSelect()).toEqual(["FARMAURORA", "MAINZFARMA"]);
    await clicar("#compra-empresa"); // fecha a lista
    await escolherNoSelect("#compra-empresa", "MAINZFARMA");
    expect(montado.compra().empresa).toBe("MAINZFARMA");
  });

  it("sócio: fornecedor e empresa desabilitados", () => {
    montado = montarFormulario(compraComUmMedicamento(), { podeEditar: false, opcoes: opcoes() });
    expect(q<HTMLButtonElement>("#compra-fornecedor")!.disabled).toBe(true);
    expect(q<HTMLButtonElement>("#compra-empresa")!.disabled).toBe(true);
  });
});
