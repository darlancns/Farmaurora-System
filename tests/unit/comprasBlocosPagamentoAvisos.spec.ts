// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { PENDENCIAS_PADRAO } from "../../shared/constants/compra";
import type { OpcoesFormulario } from "../../app/utils/comprasBlocos";
import { compraTeste, clicar, digitar, escolherNoSelect, marcar, montarFormulario, q, qa, texto, type FormularioMontado } from "./helpers/formularioCompra";
import { pendenciasDoFormulario, pendenciasParaFormulario } from "../../shared/utils/compraForm";

// Os blocos Pagamento, Despachante e Avisos (com as pendências em chips) no formulário REAL. Dados fictícios (TESTE).

let montado: FormularioMontado | null = null;
afterEach(() => {
  montado?.desmontar();
  montado = null;
  document.body.innerHTML = "";
});
const abrir = (...args: Parameters<typeof montarFormulario>): FormularioMontado => (montado = montarFormulario(...args));

const despachantes: OpcoesFormulario["despachantes"] = [
  { nome: "Despachante Teste", contatoNome: "Contato D", telefone: "11 90000-0000", email: "d@teste.com" },
  { nome: "Outro Despachante", contatoNome: "", telefone: "", email: "" },
];

describe("bloco Pagamento", () => {
  it("Alvará na conta: marcar grava true e desmarcar grava false; começa desmarcado quando é null", async () => {
    const f = abrir(compraTeste());
    expect(q<HTMLInputElement>("#compra-alvara")!.checked).toBe(false);
    await marcar("#compra-alvara", true);
    expect(f.compra.value.pagamentoAlvara).toBe(true);
    await marcar("#compra-alvara", false);
    expect(f.compra.value.pagamentoAlvara).toBe(false);
  });

  it("Quando pagar: SEM valor inicial (nenhuma opção marcada), e escolher grava vamos_pagar ou apos_awb", async () => {
    const f = abrir(compraTeste());
    const radios = qa<HTMLElement>("#compra-pagamento-momento [role=radio]");
    expect(radios.map((r) => texto(r))).toEqual(["Vamos pagar", "Após o envio da AWB"]);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    expect(f.compra.value.pagamentoMomento).toBeNull();
    await clicar("#compra-pagamento-momento-vamos_pagar");
    expect(f.compra.value.pagamentoMomento).toBe("vamos_pagar");
    await clicar("#compra-pagamento-momento-apos_awb");
    expect(f.compra.value.pagamentoMomento).toBe("apos_awb");
    expect(qa("#compra-pagamento-momento [role=radio]").map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true"]);
  });

  it("sem valor escolhido, o grupo continua ALCANÇÁVEL pelo Tab (a 1ª opção tem tabindex 0)", () => {
    abrir(compraTeste());
    expect(qa("#compra-pagamento-momento [role=radio]").map((r) => r.getAttribute("tabindex"))).toEqual(["0", "-1"]);
    montado!.desmontar();
    abrir(compraTeste({ pagamentoMomento: "apos_awb" }));
    expect(qa("#compra-pagamento-momento [role=radio]").map((r) => r.getAttribute("tabindex"))).toEqual(["-1", "0"]);
  });

  it("Termo de pagamento posterior: 'n/a' por padrão; 'Sim' mostra a Observação do termo; voltar a 'n/a' esconde (o texto fica guardado)", async () => {
    const f = abrir(compraTeste());
    expect(qa("#compra-termo-posterior [role=radio]").map((r) => texto(r))).toEqual(["Sim", "n/a"]);
    expect(q("#compra-termo-posterior-na")!.getAttribute("aria-checked")).toBe("true");
    expect(q("#compra-termo-observacao")).toBeNull();
    await clicar("#compra-termo-posterior-sim");
    expect(f.compra.value.termoPosterior).toBe(true);
    await digitar("#compra-termo-observacao", "Paga em 30 dias");
    expect(f.compra.value.termoObservacao).toBe("Paga em 30 dias");
    await clicar("#compra-termo-posterior-na");
    expect(f.compra.value.termoPosterior).toBe(false);
    expect(q("#compra-termo-observacao")).toBeNull();
    expect(f.compra.value.termoObservacao).toBe("Paga em 30 dias");
  });

  it("carregar uma compra com termo posterior já mostra o campo preenchido", () => {
    abrir(compraTeste({ termoPosterior: true, termoObservacao: "Obs do termo" }));
    expect(q<HTMLInputElement>("#compra-termo-observacao")!.value).toBe("Obs do termo");
  });

  it("somente leitura: tudo desabilitado", () => {
    abrir(compraTeste({ termoPosterior: true }), { podeEditar: false });
    expect(q<HTMLInputElement>("#compra-alvara")!.disabled).toBe(true);
    expect(qa<HTMLButtonElement>("#compra-pagamento-momento button").every((b) => b.disabled)).toBe(true);
    expect(qa<HTMLButtonElement>("#compra-termo-posterior button").every((b) => b.disabled)).toBe(true);
    expect(q<HTMLInputElement>("#compra-termo-observacao")!.disabled).toBe(true);
  });
});

describe("bloco Despachante", () => {
  it("o select oferece os despachantes ativos; escolher grava o nome; o contato, telefone e e-mail do Cadastro aparecem como apoio", async () => {
    const f = abrir(compraTeste(), { opcoes: { despachantes } });
    expect(q("#compra-despachante-contato")).toBeNull();
    await escolherNoSelect("#compra-despachante", "Despachante Teste");
    expect(f.compra.value.despachante).toBe("Despachante Teste");
    expect(qa("#compra-despachante-contato span").map((e) => texto(e))).toEqual(["Contato: Contato D", "Telefone: 11 90000-0000", "E-mail: d@teste.com"]);
  });

  it("o apoio mostra só o que o Cadastro tem (despachante sem contato não escreve nada); valor antigo fora da lista continua selecionado", async () => {
    abrir(compraTeste({ despachante: "Outro Despachante" }), { opcoes: { despachantes } });
    expect(q("#compra-despachante-contato")).toBeNull();
    montado!.desmontar();
    abrir(compraTeste({ despachante: "Despachante Antigo" }), { opcoes: { despachantes } });
    expect(texto(q("#compra-despachante"))).toBe("Despachante Antigo");
    expect(q("#compra-despachante-contato")).toBeNull();
  });

  it("os mesmos dados que o resumo usa; NUNCA PIX (nem se o objeto trouxer a chave)", async () => {
    const comPix = despachantes.map((d) => ({ ...d, chavePix: "CHAVE-PIX-SECRETA", chave_pix: "CHAVE-PIX-SECRETA" })) as unknown as OpcoesFormulario["despachantes"];
    abrir(compraTeste({ despachante: "Despachante Teste" }), { opcoes: { despachantes: comPix } });
    expect(document.body.textContent).not.toContain("CHAVE-PIX-SECRETA");
    expect(document.body.innerHTML.toLowerCase()).not.toMatch(/chave_?pix|\bpix\b/);
  });

  const ordem = (id: string, envio: string) => ({ id, posicao: 1, fornecedor: "", envio, cia: "", po: "", frete: null, freteReal: null, itens: [] });

  it("TODAS as ordens Courier Simples: o campo some e aparece 'Dispensado: todas as ordens são Courier Simples'", () => {
    abrir(compraTeste({ courierSimples: true, ordens: [ordem("o1", "Courier Simples"), ordem("o2", "Courier Simples")] }), { opcoes: { despachantes } });
    expect(q("#compra-despachante")).toBeNull();
    expect(texto(q("#compra-despachante-dispensado"))).toBe("Dispensado: todas as ordens são Courier Simples");
  });

  it("uma ordem que não é Courier Simples (ou nenhuma ordem): o campo aparece e a nota não", () => {
    abrir(compraTeste({ ordens: [ordem("o1", "Courier Simples"), ordem("o2", "Air Cargo")] }), { opcoes: { despachantes } });
    expect(q("#compra-despachante")).not.toBeNull();
    expect(q("#compra-despachante-dispensado")).toBeNull();
    montado!.desmontar();
    abrir(compraTeste({ ordens: [] }), { opcoes: { despachantes } });
    expect(q("#compra-despachante")).not.toBeNull();
    expect(q("#compra-despachante-dispensado")).toBeNull();
  });

  it("o valor do despachante é mantido (não apagado) quando a nota aparece", () => {
    const f = abrir(compraTeste({ despachante: "Despachante Teste", courierSimples: true, ordens: [ordem("o1", "Courier Simples")] }), { opcoes: { despachantes } });
    expect(f.compra.value.despachante).toBe("Despachante Teste");
  });

  it("somente leitura: o select fica desabilitado", () => {
    abrir(compraTeste(), { opcoes: { despachantes }, podeEditar: false });
    expect(q<HTMLButtonElement>("#compra-despachante")!.disabled).toBe(true);
  });
});

describe("bloco Avisos", () => {
  it("isenção: marcar mostra 'Para (opcional)'; desmarcar esconde (o texto fica guardado)", async () => {
    const f = abrir(compraTeste());
    expect(q("#compra-isencao-para")).toBeNull();
    await marcar("#compra-isencao", true);
    expect(f.compra.value.isencao).toBe(true);
    await digitar("#compra-isencao-para", "Hospital Teste");
    expect(f.compra.value.isencaoPara).toBe("Hospital Teste");
    await marcar("#compra-isencao", false);
    expect(q("#compra-isencao-para")).toBeNull();
    expect(f.compra.value.isencaoPara).toBe("Hospital Teste");
  });

  it("Verificação de documento e assinatura: null sem opção marcada; Pendente = false; Verificado = true", async () => {
    const f = abrir(compraTeste());
    expect(qa("#compra-documentos [role=radio]").map((r) => texto(r))).toEqual(["Pendente", "Verificado"]);
    expect(qa("#compra-documentos [role=radio]").map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    expect(f.compra.value.documentos).toBeNull();
    await clicar("#compra-documentos-verificado");
    expect(f.compra.value.documentos).toBe(true);
    await clicar("#compra-documentos-pendente");
    expect(f.compra.value.documentos).toBe(false);
    expect(qa("#compra-documentos [role=radio]").map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false"]);
  });

  it("carregar com documentos true/false/null marca a opção certa", () => {
    for (const [valor, marcados] of [[true, ["false", "true"]], [false, ["true", "false"]], [null, ["false", "false"]]] as const) {
      abrir(compraTeste({ documentos: valor }));
      expect(qa("#compra-documentos [role=radio]").map((r) => r.getAttribute("aria-checked")), String(valor)).toEqual(marcados);
      montado!.desmontar();
    }
  });

  it("Observações é um textarea", async () => {
    const f = abrir(compraTeste());
    expect(q("#compra-observacoes")!.tagName).toBe("TEXTAREA");
    await digitar("#compra-observacoes", "Obs de teste\ncom duas linhas");
    expect(f.compra.value.observacoes).toBe("Obs de teste\ncom duas linhas");
  });

  it("Recorrente (movido para cá) grava true e false e é o ÚLTIMO campo do bloco", async () => {
    const f = abrir(compraTeste());
    await marcar("#compra-recorrente", true);
    expect(f.compra.value.recorrente).toBe(true);
    await marcar("#compra-recorrente", false);
    expect(f.compra.value.recorrente).toBe(false);
    const campos = qa<HTMLElement>("[data-bloco='avisos'] input, [data-bloco='avisos'] textarea, [data-bloco='avisos'] button");
    expect(campos.at(-1)!.id).toBe("compra-recorrente");
  });
});

describe("pendências em chips", () => {
  const chips = () => qa<HTMLButtonElement>("[id^='compra-pendencia-chip-']");

  it("os 7 chips da lista padrão, na ordem, com aria-pressed", () => {
    abrir(compraTeste());
    expect(chips().map((c) => texto(c))).toEqual([...PENDENCIAS_PADRAO]);
    expect(PENDENCIAS_PADRAO).toEqual([
      "Documentos assinados",
      "Comprovante de endereço",
      "Comprovante atualizado",
      "Decisão judicial nova",
      "Termo de recebimento",
      "Transcrição médica",
      "Receita médica",
    ]);
    expect(chips().every((c) => c.getAttribute("aria-pressed") === "false")).toBe(true);
    expect(texto(q("#compra-pendencias-rotulo"))).toBe("Pendências (clique para marcar)");
  });

  it("marcar e desmarcar chips grava a lista pelo RÓTULO (na ordem da lista padrão)", async () => {
    const f = abrir(compraTeste());
    await clicar("#compra-pendencia-chip-6"); // Receita médica
    await clicar("#compra-pendencia-chip-0"); // Documentos assinados
    expect(f.compra.value.pendencias).toEqual(["Documentos assinados", "Receita médica"]);
    expect(chips()[0]!.getAttribute("aria-pressed")).toBe("true");
    await clicar("#compra-pendencia-chip-6");
    expect(f.compra.value.pendencias).toEqual(["Documentos assinados"]);
    await clicar("#compra-pendencia-chip-0");
    expect(f.compra.value.pendencias).toEqual([]);
  });

  it("o texto livre vira UMA entrada final; some quando o campo esvazia; chips continuam", async () => {
    const f = abrir(compraTeste());
    await clicar("#compra-pendencia-chip-2");
    await digitar("#compra-pendencias-livre", "Falta laudo; falta CPF");
    expect(f.compra.value.pendencias).toEqual(["Comprovante atualizado", "Falta laudo; falta CPF"]);
    await clicar("#compra-pendencia-chip-4");
    expect(f.compra.value.pendencias).toEqual(["Comprovante atualizado", "Termo de recebimento", "Falta laudo; falta CPF"]);
    await digitar("#compra-pendencias-livre", "   ");
    expect(f.compra.value.pendencias).toEqual(["Comprovante atualizado", "Termo de recebimento"]);
  });

  it("digitar um espaço no fim do texto livre não é engolido (o campo guarda o que foi digitado)", async () => {
    abrir(compraTeste());
    await digitar("#compra-pendencias-livre", "Falta ");
    expect(q<HTMLInputElement>("#compra-pendencias-livre")!.value).toBe("Falta ");
    await digitar("#compra-pendencias-livre", "Falta laudo");
    expect(q<HTMLInputElement>("#compra-pendencias-livre")!.value).toBe("Falta laudo");
  });

  it("round-trip: carregar uma compra com chips + entradas soltas mostra os chips marcados e as soltas no campo livre, unidas por '; '", () => {
    abrir(compraTeste({ pendencias: ["Receita médica", "Alguma coisa antiga", "Documentos assinados", "Outra coisa"] }));
    expect(chips().map((c) => c.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false", "false", "false", "true"]);
    expect(q<HTMLInputElement>("#compra-pendencias-livre")!.value).toBe("Alguma coisa antiga; Outra coisa");
  });

  it("round-trip: mexer num chip depois de carregar guarda as soltas como UMA entrada (e depois disso a lista é estável)", async () => {
    const f = abrir(compraTeste({ pendencias: ["Alguma coisa antiga", "Outra coisa"] }));
    await clicar("#compra-pendencia-chip-1");
    expect(f.compra.value.pendencias).toEqual(["Comprovante de endereço", "Alguma coisa antiga; Outra coisa"]);
    // Recarregar o que foi salvo mostra exatamente o mesmo.
    const salvo = f.compra.value.pendencias;
    await f.trocarCompra(compraTeste({ pendencias: salvo }));
    expect(q<HTMLInputElement>("#compra-pendencias-livre")!.value).toBe("Alguma coisa antiga; Outra coisa");
    expect(pendenciasDoFormulario(pendenciasParaFormulario(salvo).marcadas, pendenciasParaFormulario(salvo).livre)).toEqual(salvo);
  });

  it("trocar de compra (ou carregar a versão salva) atualiza o campo livre e os chips", async () => {
    const f = abrir(compraTeste({ pendencias: ["Receita médica", "Texto A"] }));
    expect(q<HTMLInputElement>("#compra-pendencias-livre")!.value).toBe("Texto A");
    await f.trocarCompra(compraTeste({ id: "cmp_2", pendencias: ["Documentos assinados"] }));
    await nextTick();
    expect(q<HTMLInputElement>("#compra-pendencias-livre")!.value).toBe("");
    expect(chips().map((c) => c.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false", "false", "false", "false"]);
  });

  it("o campo livre aceita no máximo 300 caracteres (o limite de cada entrada no servidor)", () => {
    abrir(compraTeste());
    expect(q<HTMLInputElement>("#compra-pendencias-livre")!.maxLength).toBe(300);
  });

  it("somente leitura: chips e campo livre desabilitados", () => {
    abrir(compraTeste({ pendencias: ["Receita médica"] }), { podeEditar: false });
    expect(chips().every((c) => c.disabled)).toBe(true);
    expect(q<HTMLInputElement>("#compra-pendencias-livre")!.disabled).toBe(true);
    expect(q<HTMLTextAreaElement>("#compra-observacoes")!.disabled).toBe(true);
  });
});

describe("pendências: as funções puras (ida e volta)", () => {
  it("lista vazia, só chips, só livre e mistura", () => {
    expect(pendenciasParaFormulario([])).toEqual({ marcadas: [], livre: "" });
    expect(pendenciasParaFormulario(["Receita médica"])).toEqual({ marcadas: ["Receita médica"], livre: "" });
    expect(pendenciasParaFormulario(["xis"])).toEqual({ marcadas: [], livre: "xis" });
    expect(pendenciasParaFormulario(["xis", "Receita médica", "  ", "zê"])).toEqual({ marcadas: ["Receita médica"], livre: "xis; zê" });
  });

  it("a ordem dos chips marcados é a da lista padrão, e o texto livre vai por último", () => {
    expect(pendenciasDoFormulario(["Receita médica", "Documentos assinados"], "texto")).toEqual(["Documentos assinados", "Receita médica", "texto"]);
    expect(pendenciasDoFormulario([], "  ")).toEqual([]);
    expect(pendenciasDoFormulario(["Rótulo que não existe"], "")).toEqual([]); // chip desconhecido não entra
  });
});
