// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { compraParaResumoEntrada, montarResumoCompra } from "../../shared/utils/compraResumo";
import { acoesFalsas, compraComUmMedicamento, digitar, esperar, itemDeTeste, montarFormulario, q, type FormularioMontado } from "./helpers/montarFormulario";

// O campo Medicamento da Compra em MAIÚSCULAS, como o do Follow-Up: o VALOR digitado (ou colado) vira maiúsculas ao digitar, com o cursor onde
// estava. O vínculo com o Cadastro e a busca usam chaveCadastro (sem caixa) e não mudam; o campo "nome para o cadastro" continua como está.
// Dados fictícios (TESTE).

let montado: FormularioMontado | null = null;
afterEach(() => {
  montado?.desmontar();
  montado = null;
  document.body.innerHTML = "";
});

const ID1 = "itm_teste_0001";
const CAMPO = `#compra-item-${ID1}-medicamento`;
const campo = (): HTMLInputElement => q<HTMLInputElement>(CAMPO)!;
const itens = (m: FormularioMontado) => m.compra().itens;

const ligado = () =>
  compraComUmMedicamento({
    itens: [itemDeTeste(1, { medicamento: "DIPIRONA TESTE", medicamentoCadastroId: "med_1", medicamentoCadastroNome: "DIPIRONA TESTE", temperatura: "2°C a 8°C" })],
  });

describe("digitar em minúsculas grava maiúsculas", () => {
  it("o campo mostra e o item grava o texto em MAIÚSCULAS (inclusive 'mg' e o resto da apresentação)", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    await digitar(CAMPO, "keytruda 100mg - 2 vials per box");
    expect(campo().value).toBe("KEYTRUDA 100MG - 2 VIALS PER BOX");
    expect(itens(montado)[0]!.medicamento).toBe("KEYTRUDA 100MG - 2 VIALS PER BOX");
  });

  it("colar um texto misto também vira maiúsculas", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    await digitar(CAMPO, "Nivolumabe Opdivo 100 mg");
    expect(itens(montado)[0]!.medicamento).toBe("NIVOLUMABE OPDIVO 100 MG");
  });

  it("a busca no Cadastro recebe o texto já em maiúsculas", async () => {
    const consultas: string[] = [];
    montado = montarFormulario(compraComUmMedicamento(), {
      acoes: acoesFalsas({
        buscarMedicamentos: async (q: string) => {
          consultas.push(q);
          return [];
        },
      }),
    });
    await digitar(CAMPO, "dipi");
    await esperar(320);
    expect(consultas).toEqual(["DIPI"]);
  });

  it("o resumo copiado (e o painel) mostram o medicamento em maiúsculas, sem quebrar o resto do resumo", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    await digitar(CAMPO, "keytruda 100mg");
    const copia = montarResumoCompra(compraParaResumoEntrada(montado.compra(), null));
    expect(copia).toContain("KEYTRUDA 100MG");
    expect(copia).not.toContain("keytruda");
  });
});

describe("o cursor fica onde estava", () => {
  it("editar no MEIO do texto não faz o cursor pular para o fim", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    const c = campo();
    c.focus();
    c.value = "keytruda";
    c.setSelectionRange(3, 3);
    c.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect(c.value).toBe("KEYTRUDA");
    expect(c.selectionStart).toBe(3);
    expect(c.selectionEnd).toBe(3);
    expect(itens(montado)[0]!.medicamento).toBe("KEYTRUDA");
  });

  it("digitar uma letra no meio de um texto já maiúsculo: o cursor fica logo depois dela", async () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1, { medicamento: "KEYTRDA" })] }));
    const c = campo();
    c.focus();
    c.value = "KEYTRuDA"; // a pessoa digitou "u" depois de "KEYTR" (minúscula)
    c.setSelectionRange(6, 6);
    c.dispatchEvent(new Event("input", { bubbles: true }));
    await nextTick();
    expect(c.value).toBe("KEYTRUDA");
    expect(c.selectionStart).toBe(6);
  });
});

describe("valor já gravado em minúsculas continua até ser editado", () => {
  it("abrir a compra e sair do campo sem editar NÃO muda o texto nem grava nada", async () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1, { medicamento: "keytruda 100mg" })] }));
    expect(campo().value).toBe("keytruda 100mg");
    const antes = montado.mudancas.length;
    campo().focus();
    campo().dispatchEvent(new Event("blur"));
    await nextTick();
    expect(campo().value).toBe("keytruda 100mg");
    expect(itens(montado)[0]!.medicamento).toBe("keytruda 100mg");
    expect(montado.mudancas.length).toBe(antes);
  });

  it("ao editar, o texto inteiro passa a maiúsculas", async () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1, { medicamento: "keytruda 100mg" })] }));
    await digitar(CAMPO, "keytruda 100mg x");
    expect(itens(montado)[0]!.medicamento).toBe("KEYTRUDA 100MG X");
  });
});

describe("o vínculo com o Cadastro não muda (usa chaveCadastro, sem caixa)", () => {
  it("complementar o nome do Cadastro em minúsculas continua vinculado (prefixo com limite de palavra)", async () => {
    montado = montarFormulario(ligado());
    await digitar(CAMPO, "dipirona teste 500mg");
    expect(itens(montado)[0]).toMatchObject({ medicamento: "DIPIRONA TESTE 500MG", medicamentoCadastroId: "med_1", medicamentoCadastroNome: "DIPIRONA TESTE" });
  });

  it("mudar o começo (sem limite de palavra) desliga o vínculo e zera a temperatura que veio do Cadastro, como antes", async () => {
    montado = montarFormulario(ligado());
    await digitar(CAMPO, "dipironax");
    expect(itens(montado)[0]).toMatchObject({ medicamento: "DIPIRONAX", medicamentoCadastroId: null, medicamentoCadastroNome: null, temperatura: "" });
  });
});

describe("o campo 'nome para o cadastro' continua como está", () => {
  it("não tem transformação própria (data-sem-maiuscula) e o que a pessoa edita lá fica como digitou", async () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1, { medicamento: "NOVO MED", temperatura: "Ambiente" })] }));
    const nome = q<HTMLInputElement>(`#compra-item-${ID1}-nome-cadastro`)!;
    expect(nome.hasAttribute("data-sem-maiuscula")).toBe(true);
    await digitar(`#compra-item-${ID1}-nome-cadastro`, "Novo Med Editado");
    expect(nome.value).toBe("Novo Med Editado");
    expect(campo().value).toBe("NOVO MED"); // o campo do medicamento não é afetado
  });
});
