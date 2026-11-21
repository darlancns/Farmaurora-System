// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { PENDENCIAS_PADRAO } from "../../shared/constants/compra";
import { clicar, compraComUmMedicamento, digitar, escolherNoSelect, marcar, montarFormulario, q, qa, texto, type FormularioMontado } from "./helpers/montarFormulario";

// Consultor, despachante (e o Courier Simples), pagamento e termo, paciente, obs., isenção, verificação, pendente e recorrente. Dados fictícios (TESTE).

let montado: FormularioMontado | null = null;
afterEach(() => {
  montado?.desmontar();
  montado = null;
  document.body.innerHTML = "";
});

const DESPACHANTES = [
  { nome: "Despachante Teste", contatoNome: "Contato D", telefone: "11 90000-0000", email: "d@teste.invalid" },
  { nome: "Outro Despachante Teste", contatoNome: "", telefone: "", email: "" },
];
const opcoes = { despachantes: DESPACHANTES, consultores: [{ nome: "Consultor Teste A" }, { nome: "Consultor Teste B" }] };
const ultima = (m: FormularioMontado) => m.mudancas.at(-1)!;
const lista = () => qa<HTMLElement>("[role=option]").map((o) => texto(o));

describe("Consultor e Responsável", () => {
  it("Consultor: select dos consultores ativos do Cadastro (nada de 'vendedor'); escolher grava `consultor`", async () => {
    montado = montarFormulario(compraComUmMedicamento(), { opcoes });
    expect(q<HTMLLabelElement>('[data-linha="consultor"] label')!.getAttribute("for")).toBe("compra-consultor");
    await clicar("#compra-consultor");
    expect(lista()).toEqual(["Selecione", "Consultor Teste A", "Consultor Teste B"]);
    await clicar("#compra-consultor");
    await escolherNoSelect("#compra-consultor", "Consultor Teste B");
    expect(ultima(montado)).toEqual({ consultor: "Consultor Teste B" });
    expect(texto(q("#compra-campos"))).not.toMatch(/vendedor/i);
  });

  it("um consultor antigo (fora dos ativos) continua aparecendo selecionado", () => {
    montado = montarFormulario(compraComUmMedicamento({ consultor: "Flavinha" }), { opcoes });
    expect(texto(q("#compra-consultor"))).toBe("Flavinha");
  });

  it("Responsável vem preenchido (quem está criando) e é editável", async () => {
    montado = montarFormulario(compraComUmMedicamento({ responsavel: "Cris" }), { opcoes });
    expect(q<HTMLInputElement>("#compra-responsavel")!.value).toBe("Cris");
    await digitar("#compra-responsavel", "Bruno");
    expect(ultima(montado)).toEqual({ responsavel: "Bruno" });
  });
});

describe("Despachante", () => {
  it("select dos despachantes ativos; escolher grava, e logo abaixo aparecem contato, telefone e e-mail do Cadastro (só leitura)", async () => {
    montado = montarFormulario(compraComUmMedicamento(), { opcoes });
    expect(q("#compra-linha-despachante-apoio")).toBeNull();
    await escolherNoSelect("#compra-despachante", "Despachante Teste");
    expect(ultima(montado)).toEqual({ despachante: "Despachante Teste" });
    expect(texto(q("#compra-linha-despachante-apoio"))).toBe("Contato: Contato D · Telefone: 11 90000-0000 · E-mail: d@teste.invalid");
  });

  it("nunca mostra chave PIX, mesmo que o Cadastro a traga", () => {
    const comPix = DESPACHANTES.map((d) => ({ ...d, chavePix: "CHAVE-PIX-SECRETA", chave_pix: "CHAVE-PIX-SECRETA" }));
    montado = montarFormulario(compraComUmMedicamento({ despachante: "Despachante Teste" }), { opcoes: { ...opcoes, despachantes: comPix } });
    expect(document.body.innerHTML).not.toContain("SECRETA");
    expect(document.body.innerHTML).not.toMatch(/pix/i);
  });

  it("Courier Simples: a linha continua no lugar, mas sem o select: 'Dispensado'", () => {
    montado = montarFormulario(compraComUmMedicamento({ envio: "Courier Simples", despachante: "Despachante Teste" }), { opcoes });
    expect(q('[data-linha="despachante"]')).not.toBeNull();
    expect(q("#compra-despachante")).toBeNull();
    expect(texto(q("#compra-despachante-dispensado"))).toContain("Dispensado");
    expect(q("#compra-linha-despachante-apoio")).toBeNull();
  });

  it("um despachante antigo (fora da lista) continua aparecendo selecionado", () => {
    montado = montarFormulario(compraComUmMedicamento({ despachante: "Despachante Antigo" }), { opcoes });
    expect(texto(q("#compra-despachante"))).toBe("Despachante Antigo");
  });
});

describe("Pagamento e Termo de pagamento posterior", () => {
  it("Alvará na conta (caixinha) e Quando pagar (Vamos pagar | Após o envio da AWB), sem valor inicial", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(q<HTMLInputElement>("#compra-alvara")!.checked).toBe(false);
    await marcar("#compra-alvara", true);
    expect(ultima(montado)).toEqual({ pagamentoAlvara: true });
    const momento = q("#compra-pagamento-momento")!;
    expect(qa("[role=radio]", ).filter((r) => momento.contains(r)).map((r) => [texto(r), r.getAttribute("aria-checked")])).toEqual([["Vamos pagar", "false"], ["Após o envio da AWB", "false"]]);
    const apos = qa<HTMLElement>("[role=radio]").find((r) => texto(r) === "Após o envio da AWB")!;
    apos.click();
    await Promise.resolve();
    expect(ultima(montado)).toEqual({ pagamentoMomento: "apos_awb" });
  });

  it("Termo: 'Sim' | 'n/a'; com 'Sim' aparece a Observação do termo (e some com 'n/a')", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(q("#compra-termo-observacao")).toBeNull();
    qa<HTMLElement>("#compra-termo-posterior [role=radio]").find((r) => texto(r) === "Sim")!.click();
    await Promise.resolve();
    expect(ultima(montado)).toEqual({ termoPosterior: true });
    await Promise.resolve();
    expect(q("#compra-termo-observacao")).not.toBeNull();
    await digitar("#compra-termo-observacao", "pagar depois da liberação");
    expect(ultima(montado)).toEqual({ termoObservacao: "pagar depois da liberação" });
    qa<HTMLElement>("#compra-termo-posterior [role=radio]").find((r) => texto(r) === "n/a")!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(q("#compra-termo-observacao")).toBeNull();
  });
});

describe("Paciente, Obs., isenção, verificação, pendente e recorrente", () => {
  it("Paciente: texto livre com <label for>", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(q<HTMLLabelElement>('[data-linha="paciente"] label')!.getAttribute("for")).toBe("compra-paciente");
    await digitar("#compra-paciente", "Paciente Teste");
    expect(ultima(montado)).toEqual({ paciente: "Paciente Teste" });
  });

  it("Obs. grava `observacoes`", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    await digitar("#compra-observacoes", "Observação de teste");
    expect(ultima(montado)).toEqual({ observacoes: "Observação de teste" });
  });

  it("Pedir isenção de imposto: caixinha; marcada NÃO abre 'para quem'", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(texto(q('[data-linha="isencao"] label'))).toBe("Pedir isenção de imposto");
    await marcar("#compra-isencao", true);
    expect(ultima(montado)).toEqual({ isencao: true });
    expect(q("#compra-isencao-para")).toBeNull();
    expect(texto(q("#compra-campos"))).not.toMatch(/para \(opcional\)/i);
  });

  it("Documento e assinatura: Pendente | Verificado; sem valor = null", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(texto(q('[data-linha="documentos"] > span'))).toBe("Documento e assinatura");
    const radios = () => qa<HTMLElement>("#compra-documentos [role=radio]");
    expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    radios().find((r) => texto(r) === "Verificado")!.click();
    await Promise.resolve();
    expect(ultima(montado)).toEqual({ documentos: true });
    radios().find((r) => texto(r) === "Pendente")!.click();
    await Promise.resolve();
    expect(ultima(montado)).toEqual({ documentos: false });
  });

  it("Pendente: um chip por pendência padrão (aria-pressed) + 'Outras pendências'; grava a lista", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    const chips = qa<HTMLButtonElement>('[data-linha="pendencias"] button[aria-pressed]');
    expect(chips.map((c) => texto(c))).toEqual([...PENDENCIAS_PADRAO]);
    await clicar("#compra-pendencia-chip-0");
    expect(ultima(montado)).toEqual({ pendencias: [PENDENCIAS_PADRAO[0]] });
    expect(q("#compra-pendencia-chip-0")!.getAttribute("aria-pressed")).toBe("true");
    await digitar("#compra-pendencias-livre", "Algo a mais");
    expect(ultima(montado)).toEqual({ pendencias: [PENDENCIAS_PADRAO[0], "Algo a mais"] });
    await clicar("#compra-pendencia-chip-0");
    expect(ultima(montado)).toEqual({ pendencias: ["Algo a mais"] });
  });

  it("Recorrente: caixinha", async () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(texto(q('[data-linha="recorrente"] label'))).toBe("Recorrente");
    await marcar("#compra-recorrente", true);
    expect(ultima(montado)).toEqual({ recorrente: true });
  });

  it("sócio: todos os controles desta parte desabilitados", () => {
    montado = montarFormulario(compraComUmMedicamento({ envio: "Air Cargo" }), { podeEditar: false, opcoes });
    for (const id of ["#compra-paciente", "#compra-observacoes", "#compra-isencao", "#compra-recorrente", "#compra-alvara", "#compra-responsavel", "#compra-pendencias-livre", "#compra-pendencia-chip-0", "#compra-consultor", "#compra-despachante"]) {
      expect((q(id) as HTMLInputElement | HTMLButtonElement).disabled, id).toBe(true);
    }
    for (const r of qa<HTMLButtonElement>("#compra-documentos [role=radio], #compra-termo-posterior [role=radio], #compra-pagamento-momento [role=radio]")) expect(r.disabled).toBe(true);
  });
});

describe("casos portados da tela antiga: pendências, termo e verificação", () => {
  it("Quando pagar: sem valor escolhido, o grupo continua ALCANÇÁVEL pelo Tab (a 1ª opção tem tabindex 0)", () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect(qa<HTMLElement>("#compra-pagamento-momento [role=radio]").map((r) => r.getAttribute("tabindex"))).toEqual(["0", "-1"]);
  });

  it("Termo: voltar a 'n/a' esconde a observação mas o texto fica guardado; carregar uma compra com termo já mostra o campo preenchido", async () => {
    montado = montarFormulario(compraComUmMedicamento({ termoPosterior: true, termoObservacao: "pagar depois" }));
    expect((q("#compra-termo-observacao") as HTMLInputElement).value).toBe("pagar depois");
    qa<HTMLElement>("#compra-termo-posterior [role=radio]").find((r) => texto(r) === "n/a")!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(montado.compra().termoObservacao).toBe("pagar depois");
  });

  it("Verificação: carregar com documentos true/false/null marca a opção certa", () => {
    const marcados = (documentos: boolean | null) => {
      montado?.desmontar();
      montado = montarFormulario(compraComUmMedicamento({ documentos }));
      return qa<HTMLElement>("#compra-documentos [role=radio]").map((r) => r.getAttribute("aria-checked"));
    };
    expect(marcados(null)).toEqual(["false", "false"]);
    expect(marcados(false)).toEqual(["true", "false"]); // Pendente
    expect(marcados(true)).toEqual(["false", "true"]); // Verificado
  });

  it("o texto livre vira UMA entrada final, some quando o campo esvazia, e um espaço no fim não é engolido", async () => {
    montado = montarFormulario(compraComUmMedicamento({ pendencias: [PENDENCIAS_PADRAO[1]] }));
    await digitar("#compra-pendencias-livre", "algo ");
    expect(ultima(montado)).toEqual({ pendencias: [PENDENCIAS_PADRAO[1], "algo"] });
    expect((q("#compra-pendencias-livre") as HTMLInputElement).value).toBe("algo ");
    await digitar("#compra-pendencias-livre", "");
    expect(ultima(montado)).toEqual({ pendencias: [PENDENCIAS_PADRAO[1]] });
  });

  it("round-trip: carregar chips + entradas soltas mostra os chips marcados e as soltas no campo livre, unidas por '; '", () => {
    montado = montarFormulario(compraComUmMedicamento({ pendencias: [PENDENCIAS_PADRAO[0], "Solta A", "Solta B"] }));
    expect(q("#compra-pendencia-chip-0")!.getAttribute("aria-pressed")).toBe("true");
    expect((q("#compra-pendencias-livre") as HTMLInputElement).value).toBe("Solta A; Solta B");
  });

  it("trocar de compra (ou carregar a versão salva) atualiza o campo livre e os chips", async () => {
    montado = montarFormulario(compraComUmMedicamento({ id: "cmp_a", pendencias: ["Solta A"] }));
    expect((q("#compra-pendencias-livre") as HTMLInputElement).value).toBe("Solta A");
    await montado.trocarCompra(compraComUmMedicamento({ id: "cmp_b", pendencias: [PENDENCIAS_PADRAO[2]] }));
    expect((q("#compra-pendencias-livre") as HTMLInputElement).value).toBe("");
    expect(q("#compra-pendencia-chip-2")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("o campo livre aceita no máximo 300 caracteres (o limite de cada entrada no servidor)", () => {
    montado = montarFormulario(compraComUmMedicamento());
    expect((q("#compra-pendencias-livre") as HTMLInputElement).maxLength).toBe(300);
  });
});
