// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { compraComUmMedicamento, digitar, marcar, montarFormulario, q, type FormularioMontado } from "./helpers/montarFormulario";

// Número do processo (+ compra particular), médico, local de aplicação, entrega (+ "Mesmo local") e contatos. Dados fictícios (TESTE).

let montado: FormularioMontado | null = null;
afterEach(() => {
  montado?.desmontar();
  montado = null;
  document.body.innerHTML = "";
});

const ultima = (m: FormularioMontado) => m.mudancas.at(-1)!;
const campo = (sel: string) => q<HTMLInputElement>(sel)!;

describe("Número do processo e Compra particular", () => {
  it("texto livre (mono, com /UF no fim); grava processoNumero", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(q<HTMLLabelElement>('[data-linha="processo"] label')!.getAttribute("for")).toBe("compra-processo");
    await digitar("#compra-processo", "0000000-00.0000.0.00.0000/SP");
    expect(ultima(montado)).toEqual({ processoNumero: "0000000-00.0000.0.00.0000/SP" });
  });

  it("'Compra particular': desabilita o campo e esvazia o número; desmarcar libera", async () => {
    montado = montarFormulario(compraComUmMedicamento({ processoNumero: "123" }));
    await marcar("#compra-particular", true);
    expect(ultima(montado)).toEqual({ compraParticular: true, processoNumero: "" });
    expect(campo("#compra-processo").disabled).toBe(true);
    expect(campo("#compra-processo").value).toBe("");
    await marcar("#compra-particular", false);
    expect(ultima(montado)).toEqual({ compraParticular: false });
    expect(campo("#compra-processo").disabled).toBe(false);
  });
});

describe("Médico e Contatos", () => {
  it("Médico e Contatos gravam o texto digitado", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    await digitar("#compra-medico", "Dra. Teste");
    expect(ultima(montado)).toEqual({ medico: "Dra. Teste" });
    await digitar("#compra-contatos", "Contato Teste (00) 00000-0000");
    expect(ultima(montado)).toEqual({ contatos: "Contato Teste (00) 00000-0000" });
    expect(q<HTMLLabelElement>('[data-linha="medico"] label')!.getAttribute("for")).toBe("compra-medico");
    expect(q<HTMLLabelElement>('[data-linha="contatos"] label')!.getAttribute("for")).toBe("compra-contatos");
  });
});

describe("Local de aplicação, Entrega e 'Mesmo local'", () => {
  it("rótulos: 'Local de aplicação' e 'Entrega (Doctor/AJC)'; sem 'Declarado' (não existe mais)", () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(q('[data-linha="local_aplicacao"] label')!.textContent).toBe("Local de aplicação");
    expect(q('[data-linha="entrega"] label[for="compra-entrega"]')!.textContent).toBe("Entrega (Doctor/AJC)");
    expect(document.body.textContent).not.toMatch(/declarado/i);
    expect(q("#compra-local-declarado")).toBeNull();
  });

  it("local e entrega são independentes quando 'Mesmo local' está desmarcado", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    await digitar("#compra-local", "Hospital Teste");
    expect(ultima(montado)).toEqual({ localAplicacao: "Hospital Teste" });
    await digitar("#compra-entrega", "Clínica Teste");
    expect(ultima(montado)).toEqual({ entrega: "Clínica Teste" });
  });

  it("estado inicial: 'Mesmo local' marcada só quando a entrega é igual ao local e não vazia", () => {
    montado = montarFormulario(compraComUmMedicamento({ localAplicacao: "Hospital Teste", entrega: "Hospital Teste" }));
    expect(campo("#compra-entrega-mesmo-local").checked).toBe(true);
    expect(campo("#compra-entrega").disabled).toBe(true);
    montado.desmontar();
    montado = montarFormulario(compraComUmMedicamento({ localAplicacao: "", entrega: "" }));
    expect(campo("#compra-entrega-mesmo-local").checked).toBe(false);
    expect(campo("#compra-entrega").disabled).toBe(false);
  });

  it("marcar copia o local para a entrega e a desabilita; cada digitação no local acompanha a entrega", async () => {
    montado = montarFormulario(compraComUmMedicamento({ localAplicacao: "Hospital Teste" }));
    await marcar("#compra-entrega-mesmo-local", true);
    expect(ultima(montado)).toEqual({ entrega: "Hospital Teste" });
    expect(campo("#compra-entrega").disabled).toBe(true);
    await digitar("#compra-local", "Hospital Teste 2");
    expect(ultima(montado)).toEqual({ localAplicacao: "Hospital Teste 2", entrega: "Hospital Teste 2" });
    expect(montado.compra().entrega).toBe("Hospital Teste 2");
  });

  it("desmarcar libera a entrega, mantém o valor, e o local deixa de mexer nela", async () => {
    montado = montarFormulario(compraComUmMedicamento({ localAplicacao: "Hospital Teste", entrega: "Hospital Teste" }));
    await marcar("#compra-entrega-mesmo-local", false);
    expect(campo("#compra-entrega").disabled).toBe(false);
    expect(campo("#compra-entrega").value).toBe("Hospital Teste");
    await digitar("#compra-local", "Outro Local");
    expect(ultima(montado)).toEqual({ localAplicacao: "Outro Local" });
    expect(montado.compra().entrega).toBe("Hospital Teste");
  });

  it("outra compra aberta: o estado inicial dela vale; carregar uma versão em que local e entrega diferem desmarca a caixa", async () => {
    montado = montarFormulario(compraComUmMedicamento({ id: "cmp_a", localAplicacao: "A", entrega: "A" }));
    expect(campo("#compra-entrega-mesmo-local").checked).toBe(true);
    await montado.trocarCompra(compraComUmMedicamento({ id: "cmp_b", localAplicacao: "A", entrega: "B" }));
    expect(campo("#compra-entrega-mesmo-local").checked).toBe(false);
  });

  it("sócio: tudo desabilitado", () => {
    montado = montarFormulario(compraComUmMedicamento(), { podeEditar: false });
    for (const id of ["#compra-processo", "#compra-particular", "#compra-medico", "#compra-local", "#compra-entrega", "#compra-entrega-mesmo-local", "#compra-contatos"]) expect(campo(id).disabled, id).toBe(true);
  });
});
