// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { BLOCOS_DA_COMPRA } from "../../shared/constants/compraResumo";
import { compraParaResumoEntrada, montarResumo } from "../../shared/utils/compraResumo";
import { compraComUmMedicamento, itemDeTeste, montarFormulario, q, qa, texto, type FormularioMontado } from "./helpers/montarFormulario";

// TESTE DE ARQUITETURA: a ordem das linhas do formulário é a ordem das linhas do resumo no modo "modelo" (montarResumo). Se alguém mexer
// numa das duas, este teste quebra. Também confere o Tab (a ordem do DOM), que cada linha tem rótulo e que todo controle tem nome acessível.
// Dados fictícios (TESTE).

let montado: FormularioMontado | null = null;
afterEach(() => {
  montado?.desmontar();
  montado = null;
  document.body.innerHTML = "";
});

/** O id de linha do resumo SEM o número do medicamento/temperatura (medicamento_2 → medicamento) e sem repetir. */
function idsDoResumo(compra: Parameters<typeof compraParaResumoEntrada>[0]): string[] {
  const ids = montarResumo(compraParaResumoEntrada(compra, null), "modelo").flatMap((b) => b.linhas.map((l) => l.id));
  const base = ids.map((id) => id.replace(/_\d+$/, "")).filter((id) => id !== "titulo");
  return base.filter((id, i) => base.indexOf(id) === i);
}

const idsDoFormulario = (): string[] => qa<HTMLElement>("#compra-campos [data-linha]").map((el) => el.getAttribute("data-linha")!);

const ESPERADA = [
  "medicamento",
  "laboratorio",
  "brand",
  "quantidade",
  "ordens",
  "valor_unitario",
  "valor_real",
  "frete",
  "frete_real",
  "temperatura",
  "envio",
  "fornecedor",
  "cnpj",
  "pagamento",
  "termo_posterior",
  "paciente",
  "despachante",
  "observacoes",
  "isencao",
  "documentos",
  "pendencias",
  "recorrente",
  "consultor",
  "responsavel",
  "processo",
  "medico",
  "local_aplicacao",
  "entrega",
  "contatos",
];

describe("a ordem das linhas do formulário é a ordem das linhas do resumo (modo 'modelo')", () => {
  it("1 medicamento: as 29 linhas, EXATAMENTE na ordem de montarResumo('modelo') (sem o título)", () => {
    const compra = compraComUmMedicamento();
    montado = montarFormulario(compra);
    expect(idsDoFormulario()).toEqual(idsDoResumo(compra));
    expect(idsDoFormulario()).toEqual(ESPERADA);
    expect(idsDoFormulario()).toHaveLength(29);
  });

  it("2 medicamentos: a mesma ordem (cada linha por medicamento continua UMA linha, com um controle por medicamento)", () => {
    const compra = compraComUmMedicamento({ itens: [itemDeTeste(1, { medicamento: "MED A" }), itemDeTeste(2, { medicamento: "MED B" })] });
    montado = montarFormulario(compra);
    expect(idsDoFormulario()).toEqual(idsDoResumo(compra));
    expect(idsDoFormulario()).toEqual(ESPERADA);
  });

  it("uma compra completa e uma de Courier Simples também: a ordem do formulário não depende dos dados", () => {
    for (const extra of [{ envio: "Courier Simples", despachante: "X" }, { envio: "Air Cargo", cia: "Emirates", paciente: "Paciente Teste", termoPosterior: true }]) {
      const compra = compraComUmMedicamento(extra);
      montado?.desmontar();
      montado = montarFormulario(compra);
      expect(idsDoFormulario()).toEqual(idsDoResumo(compra));
    }
  });

  it("os rótulos, na ordem pedida pela Cris", () => {
    montado = montarFormulario(compraComUmMedicamento());
    const rotulos = qa<HTMLElement>("#compra-campos [data-linha]").map((linha) => texto(linha.querySelector(":scope > label, :scope > span")));
    expect(rotulos).toEqual([
      "Medicamento",
      "Laboratório",
      "Brand",
      "Quantidade",
      "Ordens",
      "Valor unitário",
      "Valor real",
      "Frete",
      "Valor real do frete",
      "Temperatura",
      "Envio",
      "Fornecedor",
      "CNPJ",
      "Pagamento",
      "Termo de pagamento posterior",
      "Paciente",
      "Despachante",
      "Obs.",
      "Pedir isenção de imposto",
      "Documento e assinatura",
      "Pendente",
      "Recorrente",
      "Consultor",
      "Responsável",
      "Nº do processo",
      "Médico",
      "Local de aplicação",
      "Entrega (Doctor/AJC)",
      "Contatos",
    ]);
  });

  it("BLOCOS_DA_COMPRA segue sendo a fonte da ordem dos blocos do resumo (o id medicamentos_e_ordens não mudou)", () => {
    expect([...BLOCOS_DA_COMPRA].slice(0, 3)).toEqual(["titulo", "medicamentos_e_ordens", "pagamento"]);
    expect(BLOCOS_DA_COMPRA).toContain("consultor_responsavel");
  });
});

describe("Tab e acessibilidade do formulário único", () => {
  it("a ordem do DOM é a do Tab: nenhum tabindex positivo e os controles seguem a ordem das linhas", () => {
    montado = montarFormulario(compraComUmMedicamento({ envio: "Air Cargo", termoPosterior: true }), { opcoes: { despachantes: [{ nome: "Despachante Teste", contatoNome: "", telefone: "", email: "" }] } });
    const campos = qa<HTMLElement>("#compra-campos input, #compra-campos select, #compra-campos textarea, #compra-campos button, #compra-campos [role=radio]");
    expect(campos.length).toBeGreaterThan(20);
    for (const c of campos) expect(Number(c.getAttribute("tabindex") ?? "0"), c.id).toBeLessThanOrEqual(0);
    const posicao = (el: HTMLElement): number => ESPERADA.indexOf(el.closest("[data-linha]")!.getAttribute("data-linha")!);
    const sequencia = campos.map(posicao);
    expect(sequencia.every((p) => p >= 0)).toBe(true);
    expect(sequencia).toEqual([...sequencia].sort((a, b) => a - b));
  });

  it("todo controle tem nome acessível (<label for>, aria-label ou o rótulo do grupo) e os ids são únicos", () => {
    montado = montarFormulario(compraComUmMedicamento({ itens: [itemDeTeste(1, { medicamento: "MED A" }), itemDeTeste(2, { medicamento: "MED B" })], termoPosterior: true, envio: "Air Cargo" }), {
      opcoes: { despachantes: [{ nome: "Despachante Teste", contatoNome: "", telefone: "", email: "" }] },
    });
    const controles = qa<HTMLElement>("#compra-campos input, #compra-campos textarea, #compra-campos select, #compra-campos [role=combobox]");
    const ids = qa<HTMLElement>("#compra-campos [id]").map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of controles) {
      const comLabel = c.id !== "" && document.querySelector(`label[for="${c.id}"]`) !== null;
      const comAria = (c.getAttribute("aria-label") ?? "") !== "" || (c.getAttribute("aria-labelledby") ?? "") !== "";
      expect(comLabel || comAria, `controle sem nome: ${c.tagName}#${c.id}`).toBe(true);
    }
  });

  it("cada linha tem um rótulo; as de vários controles são grupos ligados ao rótulo (aria-labelledby)", () => {
    montado = montarFormulario(compraComUmMedicamento());
    for (const linha of qa<HTMLElement>("#compra-campos [data-linha]")) {
      const id = linha.getAttribute("data-linha")!;
      const rotulo = linha.querySelector(`#compra-linha-${id}-rotulo`);
      expect(rotulo, id).not.toBeNull();
      if (rotulo!.tagName === "SPAN") expect(linha.querySelector(`[role="group"][aria-labelledby="compra-linha-${id}-rotulo"]`), id).not.toBeNull();
      else expect(rotulo!.getAttribute("for"), id).not.toBe("");
    }
  });

  it("nada de 'vendedor', 'antes de encaminhar' nem 'Dicas' no formulário", () => {
    montado = montarFormulario(compraComUmMedicamento());
    const html = document.body.textContent ?? "";
    expect(html).not.toMatch(/vendedor/i);
    expect(html).not.toMatch(/antes de encaminhar/i);
    expect(html).not.toMatch(/Dicas/);
  });
});

describe("rótulos do FORMULÁRIO x rótulos do RESUMO (separados)", () => {
  it("o formulário diz 'Documento e assinatura' e 'Nº do processo', vindos de ROTULOS_DO_FORMULARIO (um por linha, as 29)", async () => {
    const { ROTULOS_DO_FORMULARIO } = await import("../../app/utils/comprasRotulos");
    expect(ROTULOS_DO_FORMULARIO.documentos).toBe("Documento e assinatura");
    expect(ROTULOS_DO_FORMULARIO.processo).toBe("Nº do processo");
    expect(Object.keys(ROTULOS_DO_FORMULARIO)).toEqual(ESPERADA);
  });

  it("o resumo (modelo e cópia) NÃO muda: segue 'Verificação de documento e validação de assinatura' e 'Número do processo'", () => {
    const entrada = compraParaResumoEntrada(compraComUmMedicamento({ documentos: true, processoNumero: "123" }), null);
    const linhas = montarResumo(entrada, "modelo").flatMap((b) => b.linhas);
    expect(linhas.find((l) => l.id === "documentos")!.rotulo).toBe("Verificação de documento e validação de assinatura ✅");
    expect(linhas.find((l) => l.id === "processo")!.rotulo).toBe("Número do processo");
    const copia = montarResumo(entrada, "copia").flatMap((b) => b.linhas);
    expect(copia.find((l) => l.id === "processo")).toMatchObject({ rotulo: "Número do processo", valor: "123" });
    expect(JSON.stringify(linhas)).not.toContain("Nº do processo");
    expect(JSON.stringify(linhas)).not.toContain("Documento e assinatura");
  });

  it("o texto do formulário e o do resumo coexistem na tela, cada um com o seu", () => {
    montado = montarFormulario(compraComUmMedicamento(), { comResumo: true });
    expect(texto(q('[data-linha="processo"] label'))).toBe("Nº do processo");
    expect(texto(q('[data-resumo-linha="processo"]'))).toBe("Número do processo:");
    expect(texto(q('[data-linha="documentos"] > span'))).toBe("Documento e assinatura");
    expect(texto(q('[data-resumo-linha="documentos"]'))).toContain("Verificação de documento e validação de assinatura");
  });
});
