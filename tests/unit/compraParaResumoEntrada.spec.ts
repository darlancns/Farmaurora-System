import { describe, expect, it } from "vitest";
import type { Compra, DespachanteCadastroResumo } from "../../shared/types/compra";
import { compraParaResumoEntrada, montarResumoCompra } from "../../shared/utils/compraResumo";

// A Compra (o que o servidor guarda) → a entrada do resumo → o texto. O despachante vem do Cadastro (telefone, e-mail, contato) e a
// chave PIX NUNCA passa por aqui. Dados fictícios (TESTE).

function compra(extra: Partial<Compra> = {}): Compra {
  return {
    id: "cmp_1",
    anoMes: "2026-11",
    sequencia: 7,
    cancelada: false,
    paciente: "PACIENTE TESTE DA SILVA",
    processoNumero: "0000000-00.0000.0.00.0000/SP",
    medico: "Dr. Teste",
    localAplicacao: "Clínica Teste",
    entrega: "Entrega Teste",
    contatos: "Contato Teste",
    termoObservacao: "",
    despachante: "DESPACHANTE TESTE",
    isencaoPara: "Hospital Teste",
    observacoes: "Obs de teste",
    vendedor: "VENDEDOR TESTE",
    responsavel: "RESPONSAVEL TESTE",
    compraParticular: false,
    localDeclarado: true,
    termoPosterior: true,
    courierSimples: false,
    isencao: true,
    pagamentoAlvara: true,
    pagamentoMomento: "apos_awb",
    documentos: false,
    pendencias: ["Receita", "Laudo"],
    criadoPor: "Cris",
    atualizadoPor: "Bruno",
    createdAt: "2026-11-19T12:00:00.000Z",
    updatedAt: "2026-11-19T12:30:00.000Z",
    ordens: [
      {
        id: "ord_1",
        posicao: 1,
        fornecedor: "FORNECEDOR TESTE",
        envio: "Aéreo",
        cia: "CIA TESTE",
        po: "PO26-11-0001",
        frete: 150,
        freteReal: null,
        dirId: "dir_secreto",
        encaminhadaEm: "2026-11-19T15:00:00.000Z",
        itens: [
          {
            id: "itm_1",
            posicao: 1,
            medicamento: "TESTE MED A",
            medicamentoCadastroId: "med_1",
            preCadastroId: null,
            apresentacao: "500 mg",
            referencia: "REF A",
            laboratorio: "LAB A",
            quantidade: "12 ampolas",
            temperatura: "2°C a 8°C",
            valorUnitario: 1234.5,
            valorReal: 0,
          },
        ],
      },
    ],
    ...extra,
  };
}

const DESPACHANTE: DespachanteCadastroResumo = { nome: "Despachante Teste", telefone: "+00 00 00000-0000", email: "teste@exemplo.invalid", contatoNome: "CONTATO TESTE" };

describe("compraParaResumoEntrada", () => {
  it("converte todos os campos (número, mês e ano do ano_mes; ordens e itens; pagamento; termo; avisos; processo)", () => {
    const e = compraParaResumoEntrada(compra(), DESPACHANTE);
    expect(e).toMatchObject({
      numero: 7,
      mes: 11,
      ano: 2026,
      paciente: "PACIENTE TESTE DA SILVA",
      vendedor: "VENDEDOR TESTE",
      responsavel: "RESPONSAVEL TESTE",
      medico: "Dr. Teste",
      localAplicacao: "Clínica Teste",
      localDeclarado: true,
      entrega: "Entrega Teste",
      contatos: "Contato Teste",
      pagamento: { alvara: true, momento: "apos_awb" },
      termoPosterior: { sim: true, observacao: "" },
      processo: { particular: false, numero: "0000000-00.0000.0.00.0000/SP" },
      avisos: { isencao: true, isencaoPara: "Hospital Teste", documentos: false, pendencias: ["Receita", "Laudo"], observacoes: "Obs de teste" },
    });
    expect(e.ordens).toEqual([
      {
        fornecedor: "FORNECEDOR TESTE",
        envio: "Aéreo",
        frete: 150,
        freteReal: null,
        medicamentos: [
          {
            nome: "TESTE MED A",
            apresentacao: "500 mg",
            referencia: "REF A",
            laboratorio: "LAB A",
            quantidade: "12 ampolas",
            valorUnitario: 1234.5,
            valorReal: 0,
            temperatura: "2°C a 8°C",
          },
        ],
      },
    ]);
  });

  it("o despachante do Cadastro traz telefone, e-mail e contato (o nome vem da compra)", () => {
    expect(compraParaResumoEntrada(compra(), DESPACHANTE).despachante).toEqual({
      courierSimples: false,
      nome: "DESPACHANTE TESTE",
      telefone: "+00 00 00000-0000",
      email: "teste@exemplo.invalid",
      contato: "CONTATO TESTE",
    });
  });

  it("sem os dados do Cadastro, ou com os de OUTRO despachante, só o nome entra (não mistura contatos)", () => {
    expect(compraParaResumoEntrada(compra(), null).despachante).toEqual({ courierSimples: false, nome: "DESPACHANTE TESTE" });
    expect(compraParaResumoEntrada(compra(), { ...DESPACHANTE, nome: "Outro Despachante Teste" }).despachante).toEqual({
      courierSimples: false,
      nome: "DESPACHANTE TESTE",
    });
  });

  it("a comparação do nome é pela chave (sem acento, caixa nem espaços repetidos)", () => {
    const e = compraParaResumoEntrada(compra({ despachante: "Despachante  Ação Teste" }), { ...DESPACHANTE, nome: "DESPACHANTE AÇÃO TESTE" });
    expect(e.despachante).toMatchObject({ telefone: "+00 00 00000-0000" });
  });

  it("Courier Simples: 'Despachante: N/A' e nenhum contato; sem despachante escolhido: o bloco some", () => {
    expect(compraParaResumoEntrada(compra({ courierSimples: true }), DESPACHANTE).despachante).toEqual({ courierSimples: true });
    expect(compraParaResumoEntrada(compra({ despachante: "" }), DESPACHANTE).despachante).toBeNull();
    expect(compraParaResumoEntrada(compra({ despachante: "   " }), DESPACHANTE).despachante).toBeNull();
    expect(montarResumoCompra(compraParaResumoEntrada(compra({ courierSimples: true }), DESPACHANTE))).toContain("Despachante: N/A");
    expect(montarResumoCompra(compraParaResumoEntrada(compra({ despachante: "" }), DESPACHANTE))).not.toContain("Despachante");
  });

  it("a CHAVE PIX nunca passa: um objeto do Cadastro com chavePix/chave_pix a mais é copiado só campo a campo", () => {
    const comPix = { ...DESPACHANTE, chavePix: "chave-ficticia-nao-pode-sair", chave_pix: "chave-ficticia-2" } as DespachanteCadastroResumo;
    const e = compraParaResumoEntrada(compra(), comPix);
    const texto = JSON.stringify(e) + montarResumoCompra(e);
    expect(texto).not.toContain("chave-ficticia");
    expect(texto).not.toMatch(/chave_?pix/i);
    expect(Object.keys(e.despachante!).sort()).toEqual(["contato", "courierSimples", "email", "nome", "telefone"]);
  });

  it("não vaza dados que o resumo não usa (po, cia, ids de DIR, ids de cadastro, auditoria)", () => {
    const texto = JSON.stringify(compraParaResumoEntrada(compra(), DESPACHANTE)) + montarResumoCompra(compraParaResumoEntrada(compra(), DESPACHANTE));
    for (const nao of ["dir_secreto", "PO26-11-0001", "CIA TESTE", "med_1", "itm_1", "ord_1", "cmp_1", "Bruno", "criadoPor"]) expect(texto, nao).not.toContain(nao);
  });

  it("o texto do resumo sai da compra: título pelo ano_mes e sequência, e o despachante com o Broker", () => {
    const texto = montarResumoCompra(compraParaResumoEntrada(compra(), DESPACHANTE));
    expect(texto.split("\n")[0]).toBe("*Compra 07 - Novembro/2026*");
    expect(texto).toContain("Despachante: DESPACHANTE TESTE\nBroker\nPhone: +00 00 00000-0000\nEmail: teste@exemplo.invalid\nContact: CONTATO TESTE");
    expect(texto).toContain("Valor Unitário: US$ 1.234,50");
    expect(texto).toContain("Valor Real: US$ 0,00");
    expect(texto).toContain("Frete: US$ 150,00");
    expect(texto).toContain("Pagamento: alvará na conta, após o envio da AWB");
    expect(texto).toContain("Verificação de documento e validação de assinatura ❌");
  });

  it("compra vazia (rascunho recém-criado): gera um resumo mínimo, sem quebrar", () => {
    const vazia = compra({
      sequencia: 1,
      paciente: "",
      processoNumero: "",
      medico: "",
      localAplicacao: "",
      entrega: "",
      contatos: "",
      despachante: "",
      isencao: false,
      isencaoPara: "",
      observacoes: "",
      vendedor: "",
      responsavel: "",
      termoPosterior: false,
      pagamentoAlvara: null,
      pagamentoMomento: null,
      documentos: null,
      pendencias: [],
      localDeclarado: false,
      ordens: [],
    });
    expect(montarResumoCompra(compraParaResumoEntrada(vazia, null))).toBe(
      ["*Compra 01 - Novembro/2026*", "", "CNPJ: Farmaurora", "", "Termo de pagamento posterior: n/a", "", "Local de aplicação: pendente ⏳", "Entrega (Doctor/AJC): pendente ⏳"].join("\n"),
    );
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
