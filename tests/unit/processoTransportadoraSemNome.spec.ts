import { describe, expect, it } from "vitest";
import type { Processo } from "#shared/types/processo";
import { useProcessoForm } from "../../app/composables/useProcessoForm";
import {
  blocoTransportadoraTocado,
  montarPatchDiferencial,
  validarProcessoForm,
  type EstadoEdicao,
  type ProcessoFormState,
} from "../../app/utils/processoFormPayload";
import { colunasDeDTO, montarProcesso, type FollowUpRow } from "../../server/utils/processoMappers";
import { editado, estadoCompleto, formCompleto, linhaCompleta } from "./helpers/processoEdicaoFixtures";

// Item 1b — cotação ou valor da transportadora não podem ficar sem o NOME (dado órfão no banco: a tela só
// mostra a transportadora quando há nome). A regra vale só se o usuário TOCOU o bloco e ele está VISÍVEL.

const MENSAGEM = "Informe o nome da transportadora ou limpe a cotação e o valor.";

// Processo sem nenhuma transportadora (ponto de partida mais comum).
function semTransportadora(): EstadoEdicao {
  const e = estadoCompleto();
  Object.assign(e.form, { transportadoraNome: "", transportadoraCotacao: "", transportadoraValor: "" });
  return e;
}

function validar(inicial: EstadoEdicao, atual: EstadoEdicao) {
  return validarProcessoForm(atual.form, atual.medicamentos, atual.pendencias, atual.fornecedor, inicial.form);
}

function comBloco(
  inicial: EstadoEdicao,
  bloco: Partial<Pick<ProcessoFormState, "transportadoraNome" | "transportadoraCotacao" | "transportadoraValor">> &
    Partial<Pick<ProcessoFormState, "modalEnvio">>,
): EstadoEdicao {
  const e = { ...inicial, form: { ...inicial.form, ...bloco } };
  return e;
}

describe("(a)(b)(c) cotação ou valor sem nome, bloco tocado: erro", () => {
  it("(a) cotação sem nome", () => {
    const r = validar(semTransportadora(), comBloco(semTransportadora(), { transportadoraCotacao: "COT-1" }));
    expect(r).toEqual({ valido: false, erro: MENSAGEM });
  });

  it("(b) valor sem nome (texto e número, como o input type=number entrega)", () => {
    const base = semTransportadora();
    expect(validar(base, comBloco(base, { transportadoraValor: "100" }))).toEqual({ valido: false, erro: MENSAGEM });
    expect(validar(base, comBloco(base, { transportadoraValor: 100 as unknown as string }))).toEqual({
      valido: false,
      erro: MENSAGEM,
    });
  });

  it("(c) valor 0 sem nome conta como preenchido: erro (texto '0' e número 0)", () => {
    const base = semTransportadora();
    expect(validar(base, comBloco(base, { transportadoraValor: "0" }))).toEqual({ valido: false, erro: MENSAGEM });
    expect(validar(base, comBloco(base, { transportadoraValor: 0 as unknown as string }))).toEqual({
      valido: false,
      erro: MENSAGEM,
    });
  });

  it("nome só com espaços é nome vazio", () => {
    const base = semTransportadora();
    expect(validar(base, comBloco(base, { transportadoraNome: "   ", transportadoraCotacao: "COT-1" }))).toEqual({
      valido: false,
      erro: MENSAGEM,
    });
  });

  it("apagar só o nome de uma transportadora completa (cotação e valor ficam): erro", () => {
    const base = estadoCompleto();
    expect(validar(base, comBloco(base, { transportadoraNome: "" }))).toEqual({ valido: false, erro: MENSAGEM });
  });

  it("apagar o nome e a cotação, mas o valor continua: erro", () => {
    const base = estadoCompleto();
    expect(validar(base, comBloco(base, { transportadoraNome: "", transportadoraCotacao: "" }))).toEqual({
      valido: false,
      erro: MENSAGEM,
    });
  });
});

describe("cotação/valor que o formulário descarta contam como NÃO preenchidos", () => {
  it("cotação só com espaços: sem erro", () => {
    const base = semTransportadora();
    expect(validar(base, comBloco(base, { transportadoraCotacao: "   " })).valido).toBe(true);
  });

  it("valor não numérico (descartado ao montar o payload): sem erro", () => {
    const base = semTransportadora();
    expect(validar(base, comBloco(base, { transportadoraValor: "abc" })).valido).toBe(true);
    expect(validar(base, comBloco(base, { transportadoraValor: "  " })).valido).toBe(true);
    expect(validar(base, comBloco(base, { transportadoraValor: Number.NaN as unknown as string })).valido).toBe(true);
  });

  it("com nome, o valor 0 é válido (e o payload o descarta como sempre)", () => {
    const base = semTransportadora();
    const r = validar(base, comBloco(base, { transportadoraNome: "Doctor", transportadoraValor: "0" }));
    expect(r.valido).toBe(true);
    if (r.valido) expect(r.payload.transportadoraNacional).toEqual({ nome: "Doctor", cotacao: undefined, valor: undefined });
  });
});

describe("(d)(e)(f) casos válidos", () => {
  it("(d) nome sem cotação e sem valor: válido, e vai só o nome", () => {
    const base = semTransportadora();
    const atual = comBloco(base, { transportadoraNome: "Doctor" });
    expect(validar(base, atual).valido).toBe(true);
    expect(montarPatchDiferencial(base, atual)).toEqual({
      transportadoraNacional: { nome: "Doctor" },
      parcial: true,
    });
  });

  it("(e) nome + cotação + valor: válido", () => {
    const base = semTransportadora();
    const atual = comBloco(base, { transportadoraNome: "Doctor", transportadoraCotacao: "COT-1", transportadoraValor: "250.5" });
    expect(validar(base, atual).valido).toBe(true);
    expect(montarPatchDiferencial(base, atual)).toEqual({
      transportadoraNacional: { nome: "Doctor", cotacao: "COT-1", valor: 250.5 },
      parcial: true,
    });
  });

  it("(f) nome, cotação e valor todos esvaziados: válido e limpa as 3 colunas (transportadoraNacional: null)", () => {
    const base = estadoCompleto();
    const atual = comBloco(base, { transportadoraNome: "", transportadoraCotacao: "", transportadoraValor: "" });
    expect(validar(base, atual).valido).toBe(true);

    const patch = montarPatchDiferencial(base, atual);
    expect(patch).toEqual({ transportadoraNacional: null, parcial: true });
    expect(colunasDeDTO(patch!, { parcial: true })).toEqual({
      transportadora_nacional_nome: null,
      transportadora_nacional_cotacao: null,
      transportadora_nacional_valor: null,
    });
  });
});

describe("(g) bloco NÃO tocado: nunca valida (cotação/valor órfãos no banco não travam outro salvamento)", () => {
  it("órfão visível no estado inicial e intocado: válido e o patch não contém transportadora", () => {
    const base = estadoCompleto();
    Object.assign(base.form, { transportadoraNome: "", transportadoraCotacao: "COT-ORFA", transportadoraValor: "99" });
    const atual = comBloco(base, {});
    atual.form.localEntrega = "Outro lugar";

    expect(blocoTransportadoraTocado(base.form, atual.form)).toBe(false);
    expect(validar(base, atual).valido).toBe(true);
    const patch = montarPatchDiferencial(base, atual);
    expect(patch).toEqual({ localEntrega: "Outro lugar", parcial: true });
    expect(patch).not.toHaveProperty("transportadoraNacional");
  });

  it("pelo carregador real: linha com cotação e valor órfãos (sem nome), usuário altera só o local de entrega", () => {
    const linha = linhaCompleta({
      transportadora_nacional_nome: null,
      transportadora_nacional_cotacao: "COT-ORFA",
      transportadora_nacional_valor: 99,
    });
    const processo: Processo = montarProcesso(linha as unknown as FollowUpRow);
    expect(processo.transportadoraNacional).toBeUndefined(); // a tela não mostra o órfão

    const f = useProcessoForm(() => processo);
    f.form.localEntrega = "Outro lugar";
    const r = f.validarEdicao();

    expect(r.valido).toBe(true);
    if (!r.valido) return;
    expect(r.patch).toEqual({ localEntrega: "Outro lugar", parcial: true });
    expect(r.patch).not.toHaveProperty("transportadoraNacional");
  });

  it("órfão visível e o usuário mexe só no VALOR: aí o bloco foi tocado e exige o nome", () => {
    const base = estadoCompleto();
    Object.assign(base.form, { transportadoraNome: "", transportadoraCotacao: "COT-ORFA", transportadoraValor: "99" });
    expect(validar(base, comBloco(base, { transportadoraValor: "100" }))).toEqual({ valido: false, erro: MENSAGEM });
  });

  it("digitou e voltou ao valor inicial (mesmo normalizado): não conta como tocado", () => {
    const base = estadoCompleto();
    Object.assign(base.form, { transportadoraNome: "", transportadoraCotacao: "COT-ORFA", transportadoraValor: "99" });
    expect(blocoTransportadoraTocado(base.form, { ...base.form, transportadoraValor: "99.0", transportadoraCotacao: "COT-ORFA " })).toBe(false);
  });
});

describe("(h) bloco oculto (Courier Simples): sem erro e sem alteração desses campos", () => {
  it("cotação digitada (sem nome) e depois o modal trocado para Courier Simples: sem erro, nada da transportadora vai", () => {
    const base = semTransportadora();
    const atual = comBloco(base, { transportadoraCotacao: "COT-1", modalEnvio: "Courier Simples" });

    expect(validar(base, atual).valido).toBe(true);
    const patch = montarPatchDiferencial(base, atual);
    expect(patch).toEqual({ modalEnvio: "Courier Simples", parcial: true });
    expect(patch).not.toHaveProperty("transportadoraNacional");
  });

  it("processo Courier Simples com transportadora oculta preenchida e intocada: sem erro e patch vazio", () => {
    const base = estadoCompleto();
    base.form.modalEnvio = "Courier Simples";
    const atual = comBloco(base, {});
    expect(validar(base, atual).valido).toBe(true);
    expect(montarPatchDiferencial(base, atual)).toBeNull();
  });

  it("pelo carregador real: Courier Simples com campos ocultos, só o local muda", () => {
    const processo = montarProcesso(linhaCompleta({ modal_envio: "Courier Simples" }) as unknown as FollowUpRow);
    const f = useProcessoForm(() => processo);
    f.form.localEntrega = "Outro lugar";
    expect(f.validarEdicao()).toEqual({ valido: true, patch: { localEntrega: "Outro lugar", parcial: true } });
  });

  it("modal Courier Simples + cotação sem nome tocada: nenhuma validação (bloco oculto)", () => {
    const base = semTransportadora();
    base.form.modalEnvio = "Courier Simples";
    expect(validar(base, comBloco(base, { transportadoraCotacao: "COT-1" })).valido).toBe(true);
  });
});

describe("ordem das checagens e compatibilidade", () => {
  it("o erro do despachante vem ANTES do da transportadora", () => {
    const base = semTransportadora();
    base.form.despachante = "";
    base.form.modalEnvio = "";
    const atual = comBloco(base, { transportadoraCotacao: "COT-1", modalEnvio: "Air Cargo" });
    expect(validar(base, atual)).toEqual({
      valido: false,
      erro: "Despachante é obrigatório para o modal de envio selecionado.",
    });
  });

  it("modal vazio ou legado ('Courier') mostra o bloco: a regra vale", () => {
    const base = semTransportadora();
    for (const modalEnvio of ["", "Courier", "Courier Formal"]) {
      const atual = comBloco(base, { transportadoraCotacao: "COT-1", modalEnvio });
      expect(validar(base, atual), modalEnvio).toEqual({ valido: false, erro: MENSAGEM });
    }
  });

  it("sem estado inicial (chamada antiga de 4 argumentos), a transportadora não é validada", () => {
    const f = { ...formCompleto(), transportadoraNome: "", transportadoraCotacao: "COT-1" };
    expect(validarProcessoForm(f, [], [], "").valido).toBe(true);
  });

  it("criação: o formulário vazio é o estado inicial — cotação digitada sem nome é erro", () => {
    const f = useProcessoForm(() => null);
    Object.assign(f.form, { paciente: "Fulano", pasta: "2026 - 1", consultor: "Dani", transportadoraCotacao: "COT-1" });
    expect(f.validar()).toEqual({ valido: false, erro: MENSAGEM });

    f.form.transportadoraNome = "Doctor";
    expect(f.validar().valido).toBe(true);
  });

  it("edição pelo carregador real: cotação sem nome (bloco tocado) vira erro em validarEdicao", () => {
    const processo = montarProcesso(
      linhaCompleta({
        transportadora_nacional_nome: null,
        transportadora_nacional_cotacao: null,
        transportadora_nacional_valor: null,
      }) as unknown as FollowUpRow,
    );
    const f = useProcessoForm(() => processo);
    f.form.transportadoraCotacao = "COT-1";
    expect(f.validarEdicao()).toEqual({ valido: false, erro: MENSAGEM });
  });

  it("editado() não altera o estado base (fixture)", () => {
    expect(editado(() => {}).form).toEqual(formCompleto());
  });
});
