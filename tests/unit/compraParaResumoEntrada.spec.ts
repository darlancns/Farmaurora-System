import { describe, expect, it } from "vitest";
import type { Compra, DespachanteCadastroResumo } from "../../shared/types/compra";
import { compraParaResumoEntrada, montarResumo, montarResumoCompra } from "../../shared/utils/compraResumo";
import { compraVaziaDeTeste, itemDeTeste } from "./helpers/compraFixtures";

// A Compra (o que o servidor guarda) → a entrada do resumo → o texto. O despachante vem do Cadastro (telefone, e-mail, contato) e a
// chave PIX NUNCA passa por aqui. Courier Simples é o ENVIO. Dados fictícios (TESTE).

function compra(extra: Partial<Compra> = {}): Compra {
  return compraVaziaDeTeste({
    id: "cmp_1",
    anoMes: "2026-11",
    sequencia: 7,
    paciente: "PACIENTE TESTE DA SILVA",
    processoNumero: "0000000-00.0000.0.00.0000/SP",
    medico: "Dr. Teste",
    localAplicacao: "Clínica Teste",
    entrega: "Entrega Teste",
    contatos: "Contato Teste",
    despachante: "DESPACHANTE TESTE",
    observacoes: "Obs de teste",
    consultor: "CONSULTOR TESTE",
    responsavel: "RESPONSAVEL TESTE",
    fornecedor: "FORNECEDOR TESTE",
    envio: "Air Cargo",
    cia: "Emirates",
    empresa: "MAINZFARMA",
    numeroOrdens: 3,
    frete: 150,
    freteReal: null,
    termoPosterior: true,
    termoObservacao: "confirmar",
    isencao: true,
    recorrente: true,
    pagamentoAlvara: true,
    pagamentoMomento: "apos_awb",
    documentos: false,
    pendencias: ["Receita", "Laudo"],
    criadoPor: "Cris",
    atualizadoPor: "Bruno",
    itens: [
      itemDeTeste(1, {
        medicamento: "TESTE MED A 500 mg",
        medicamentoCadastroId: "med_1",
        medicamentoCadastroNome: "TESTE MED A",
        laboratorio: "LAB A",
        brand: "referencia",
        quantidade: "12 ampolas",
        temperatura: "2°C a 8°C",
        valorUnitario: 1234.5,
        valorReal: 0,
      }),
    ],
    ...extra,
  });
}

const DESPACHANTE: DespachanteCadastroResumo = { nome: "Despachante Teste", telefone: "+00 00 00000-0000", email: "teste@exemplo.invalid", contatoNome: "CONTATO TESTE" };

describe("compraParaResumoEntrada", () => {
  it("converte todos os campos (número, mês e ano do ano_mes; medicamentos; ordens; envio e cia; empresa; pagamento; termo; avisos; processo)", () => {
    const e = compraParaResumoEntrada(compra(), DESPACHANTE);
    expect(e).toMatchObject({
      numero: 7,
      mes: 11,
      ano: 2026,
      numeroOrdens: 3,
      frete: 150,
      freteReal: null,
      envio: "Air Cargo",
      cia: "Emirates",
      fornecedor: "FORNECEDOR TESTE",
      empresa: "MAINZFARMA",
      paciente: "PACIENTE TESTE DA SILVA",
      consultor: "CONSULTOR TESTE",
      responsavel: "RESPONSAVEL TESTE",
      medico: "Dr. Teste",
      localAplicacao: "Clínica Teste",
      entrega: "Entrega Teste",
      contatos: "Contato Teste",
      pagamento: { alvara: true, momento: "apos_awb" },
      termoPosterior: { sim: true, observacao: "confirmar" },
      processo: { particular: false, numero: "0000000-00.0000.0.00.0000/SP" },
      avisos: { isencao: true, documentos: false, pendencias: ["Receita", "Laudo"], observacoes: "Obs de teste", recorrente: true },
    });
    expect(e.medicamentos).toEqual([
      { medicamento: "TESTE MED A 500 mg", laboratorio: "LAB A", brand: "referencia", quantidade: "12 ampolas", temperatura: "2°C a 8°C", valorUnitario: 1234.5, valorReal: 0 },
    ]);
  });

  it("a entrada NÃO tem os campos do modelo antigo (ordens, vendedor, localDeclarado, courierSimples, isencaoPara)", () => {
    const e = compraParaResumoEntrada(compra(), DESPACHANTE);
    for (const velho of ["ordens", "vendedor", "localDeclarado", "courierSimples", "isencaoPara"]) expect(e, velho).not.toHaveProperty(velho);
    expect(e.avisos).not.toHaveProperty("isencaoPara");
    expect(e.despachante).not.toHaveProperty("courierSimples");
  });

  it("os medicamentos seguem a ordem do array de itens da compra", () => {
    const e = compraParaResumoEntrada(compra({ itens: [itemDeTeste(1, { medicamento: "PRIMEIRO TESTE" }), itemDeTeste(2, { medicamento: "SEGUNDO TESTE" })] }), null);
    expect(e.medicamentos.map((m) => m.medicamento)).toEqual(["PRIMEIRO TESTE", "SEGUNDO TESTE"]);
  });

  it("o despachante do Cadastro traz telefone, e-mail e contato (o nome vem da compra)", () => {
    expect(compraParaResumoEntrada(compra(), DESPACHANTE).despachante).toEqual({
      nome: "DESPACHANTE TESTE",
      telefone: "+00 00 00000-0000",
      email: "teste@exemplo.invalid",
      contato: "CONTATO TESTE",
    });
  });

  it("sem os dados do Cadastro, ou com os de OUTRO despachante, só o nome entra (não mistura contatos)", () => {
    expect(compraParaResumoEntrada(compra(), null).despachante).toEqual({ nome: "DESPACHANTE TESTE" });
    expect(compraParaResumoEntrada(compra(), { ...DESPACHANTE, nome: "Outro Despachante Teste" }).despachante).toEqual({ nome: "DESPACHANTE TESTE" });
  });

  it("a comparação do nome é pela chave (sem acento, caixa nem espaços repetidos)", () => {
    const e = compraParaResumoEntrada(compra({ despachante: "Despachante  Ação Teste" }), { ...DESPACHANTE, nome: "DESPACHANTE AÇÃO TESTE" });
    expect(e.despachante).toMatchObject({ telefone: "+00 00 00000-0000" });
  });

  it("Courier Simples = envio 'Courier Simples': 'Despachante: N/A' e nenhum contato; sem despachante escolhido (e outro envio): o bloco some", () => {
    const simples = compra({ envio: "Courier Simples", cia: "DHL" });
    expect(montarResumoCompra(compraParaResumoEntrada(simples, DESPACHANTE))).toContain("Despachante: N/A");
    expect(montarResumoCompra(compraParaResumoEntrada(simples, DESPACHANTE))).not.toContain("Broker");
    expect(compraParaResumoEntrada(compra({ despachante: "" }), DESPACHANTE).despachante).toBeNull();
    expect(compraParaResumoEntrada(compra({ despachante: "   " }), DESPACHANTE).despachante).toBeNull();
    expect(montarResumoCompra(compraParaResumoEntrada(compra({ despachante: "" }), DESPACHANTE))).not.toContain("Despachante");
  });

  it("a CHAVE PIX nunca passa: um objeto do Cadastro com chavePix/chave_pix a mais é copiado só campo a campo", () => {
    const comPix = { ...DESPACHANTE, chavePix: "chave-ficticia-nao-pode-sair", chave_pix: "chave-ficticia-2" } as DespachanteCadastroResumo;
    const e = compraParaResumoEntrada(compra(), comPix);
    const texto = JSON.stringify(e) + montarResumoCompra(e);
    expect(texto).not.toContain("chave-ficticia");
    expect(texto).not.toMatch(/chave_?pix/i);
    expect(Object.keys(e.despachante!).sort()).toEqual(["contato", "email", "nome", "telefone"]);
  });

  it("não vaza dados que o resumo não usa (ids de cadastro, ids dos itens, auditoria, nome do Cadastro)", () => {
    const texto = JSON.stringify(compraParaResumoEntrada(compra(), DESPACHANTE)) + montarResumoCompra(compraParaResumoEntrada(compra(), DESPACHANTE));
    for (const nao of ["med_1", "itm_teste", "cmp_1", "Bruno", "criadoPor", "medicamentoCadastro"]) expect(texto, nao).not.toContain(nao);
  });

  it("o texto do resumo sai da compra: título pelo ano_mes e sequência, empresa em Title Case, envio com cia e o despachante com o Broker", () => {
    const texto = montarResumoCompra(compraParaResumoEntrada(compra(), DESPACHANTE));
    expect(texto.split("\n")[0]).toBe("*Compra 07 - Novembro/2026*");
    expect(texto).toContain("Despachante: DESPACHANTE TESTE\nBroker\nPhone: +00 00 00000-0000\nEmail: teste@exemplo.invalid\nContact: CONTATO TESTE");
    expect(texto).toContain("Brand: Referência");
    expect(texto).toContain("Ordens: 3");
    expect(texto).toContain("Valor Unitário: US$ 1.234,50");
    expect(texto).toContain("Valor Real: US$ 0,00");
    expect(texto).toContain("Frete: US$ 150,00");
    expect(texto).toContain("Envio: Air Cargo (Emirates)");
    expect(texto).toContain("CNPJ: Mainzfarma");
    expect(texto).toContain("Pagamento: alvará na conta, após o envio da AWB");
    expect(texto).toContain("Termo de pagamento posterior: Sim - confirmar");
    expect(texto).toContain("Verificação de documento e validação de assinatura ❌");
    expect(texto).toContain("Consultor: CONSULTOR TESTE");
  });

  it("compra vazia (rascunho recém-criado, sem medicamento): resumo mínimo, sem quebrar", () => {
    expect(montarResumoCompra(compraParaResumoEntrada(compraVaziaDeTeste({ sequencia: 1 }), null))).toBe(
      ["*Compra 01 - Novembro/2026*", "", "Ordens: 1", "CNPJ: Farmaurora", "", "Termo de pagamento posterior: n/a", "", "Local de aplicação: pendente ⏳", "Entrega (Doctor/AJC): pendente ⏳"].join("\n"),
    );
  });

  it("o modelo de uma compra convertida tem os mesmos ids do modelo da entrada vazia (a tela não depende do conteúdo)", () => {
    const ids = (c: Compra) => montarResumo(compraParaResumoEntrada(c, null), "modelo").flatMap((b) => b.linhas.map((l) => l.id));
    expect(ids(compra({ despachante: "" }))).toEqual(ids(compraVaziaDeTeste({ itens: [itemDeTeste(1)] })));
  });

  it("ano_mes fora do formato: o título perde mês e ano, sem quebrar", () => {
    expect(compraParaResumoEntrada(compra({ anoMes: "invalido" }), null)).toMatchObject({ mes: 0, ano: 0 });
    expect(montarResumoCompra(compraParaResumoEntrada(compra({ anoMes: "invalido" }), null)).split("\n")[0]).toBe("*Compra 07*");
  });

  it("não altera a compra recebida (nem as pendências)", () => {
    const c = compra();
    const copia = structuredClone(c);
    const e = compraParaResumoEntrada(c, DESPACHANTE);
    (e.avisos.pendencias as string[]).push("mexeu");
    expect(c).toEqual(copia);
  });
});
