import { describe, expect, it } from "vitest";
import {
  COMPRA_LINHA_MAX,
  COMPRA_MAX_ITENS_POR_ORDEM,
  COMPRA_MAX_ORDENS,
  COMPRA_MAX_PENDENCIAS,
  COMPRA_TEXTO_LONGO_MAX,
  COMPRA_VALOR_MAX,
} from "../../shared/constants/compra";
import {
  CAMPOS_TEXTO_COMPRA,
  idDaCompraValido,
  validarAnoMesDaConsulta,
  validarCompraSalvar,
  validarDinheiroCompra,
} from "../../shared/utils/compraValidacao";

// A validação do corpo do salvamento da Compra (o servidor não confia no cliente). Dados fictícios (TESTE).

const VERSAO = "2026-11-19T15:00:00.000Z";
const base = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ atualizadoEm: VERSAO, ...extra });
const item = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id: "itm_000001", ...extra });
const ordem = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id: "ord_000001", itens: [], ...extra });

function erroDe(corpo: unknown): string {
  const r = validarCompraSalvar(corpo);
  if (r.ok) throw new Error(`esperava erro, mas passou: ${JSON.stringify(r.valor)}`);
  return r.erro;
}
function valorDe(corpo: unknown) {
  const r = validarCompraSalvar(corpo);
  if (!r.ok) throw new Error(`esperava passar, mas deu erro: ${r.erro}`);
  return r.valor;
}

describe("o corpo e a versão", () => {
  it("o mínimo: só a versão. Rascunho vazio é válido", () => {
    expect(valorDe(base())).toEqual({ atualizadoEm: VERSAO, campos: {} });
  });

  it("não é objeto: 'Dados inválidos.'", () => {
    for (const ruim of [null, undefined, "x", 7, [], true]) expect(erroDe(ruim), String(ruim)).toBe("Dados inválidos.");
  });

  it("atualizadoEm é obrigatório e precisa ser uma data ISO válida (e vira o formato do servidor)", () => {
    for (const ruim of [undefined, null, "", "  ", 123, "ontem", {}]) expect(validarCompraSalvar({ atualizadoEm: ruim }).ok, String(ruim)).toBe(false);
    expect(erroDe({})).toMatch(/atualizadoEm/);
    expect(valorDe({ atualizadoEm: "2026-11-19T15:00:00.000+00:00" }).atualizadoEm).toBe("2026-11-19T15:00:00.000Z");
    expect(valorDe({ atualizadoEm: "2026-11-19T12:00:00.000-03:00" }).atualizadoEm).toBe("2026-11-19T15:00:00.000Z");
  });

  it("campo desconhecido é recusado com o nome dele (como nos Cadastros); os de numeração e auditoria NÃO são editáveis", () => {
    expect(erroDe(base({ xyz: 1 }))).toBe("Campo desconhecido: xyz.");
    for (const naoEditavel of ["id", "anoMes", "sequencia", "cancelada", "criadoPor", "atualizadoPor", "createdAt", "updatedAt", "chavePix"]) {
      expect(erroDe(base({ [naoEditavel]: "x" })), naoEditavel).toBe(`Campo desconhecido: ${naoEditavel}.`);
    }
  });
});

describe("campos de texto da compra", () => {
  const CAMPOS = Object.keys(CAMPOS_TEXTO_COMPRA);

  it("aparados; ausente = não muda (não entra em `campos`); vazio é válido", () => {
    const v = valorDe(base({ paciente: "  PACIENTE TESTE  ", medico: "" }));
    expect(v.campos).toEqual({ paciente: "PACIENTE TESTE", medico: "" });
    expect(Object.keys(valorDe(base({})).campos)).toEqual([]);
  });

  it("todos os campos de texto existem e aceitam texto", () => {
    expect(CAMPOS.sort()).toEqual(
      ["contatos", "despachante", "entrega", "isencaoPara", "localAplicacao", "medico", "observacoes", "paciente", "processoNumero", "responsavel", "termoObservacao", "vendedor"].sort(),
    );
    const corpo = Object.fromEntries(CAMPOS.map((c) => [c, `${c} TESTE`]));
    expect(valorDe(base(corpo)).campos).toEqual(corpo);
  });

  it("número, nulo, lista ou objeto no lugar do texto: erro com o rótulo do campo", () => {
    for (const ruim of [7, null, [], {}, true]) expect(erroDe(base({ paciente: ruim })), String(ruim)).toBe("Paciente: informe um texto.");
  });

  it("linhas: até 300 caracteres (depois de aparar); 301 é recusado", () => {
    const linhas = CAMPOS.filter((c) => CAMPOS_TEXTO_COMPRA[c as keyof typeof CAMPOS_TEXTO_COMPRA].max === COMPRA_LINHA_MAX);
    expect(linhas.length).toBeGreaterThan(5);
    for (const campo of linhas) {
      expect(validarCompraSalvar(base({ [campo]: `  ${"a".repeat(COMPRA_LINHA_MAX)}  ` })).ok, campo).toBe(true);
      expect(validarCompraSalvar(base({ [campo]: "a".repeat(COMPRA_LINHA_MAX + 1) })).ok, campo).toBe(false);
    }
    expect(erroDe(base({ paciente: "a".repeat(301) }))).toBe("Paciente pode ter no máximo 300 caracteres.");
  });

  it("observações e observação do termo: até 2000; 2001 é recusado", () => {
    for (const campo of ["observacoes", "termoObservacao"]) {
      expect(validarCompraSalvar(base({ [campo]: "a".repeat(COMPRA_TEXTO_LONGO_MAX) })).ok, campo).toBe(true);
      expect(validarCompraSalvar(base({ [campo]: "a".repeat(COMPRA_TEXTO_LONGO_MAX + 1) })).ok, campo).toBe(false);
    }
  });
});

describe("booleanos, pagamento e pendências", () => {
  it("booleanos estritos: só true/false (texto 'true' e número são recusados)", () => {
    for (const campo of ["compraParticular", "localDeclarado", "termoPosterior", "courierSimples", "isencao", "recorrente"]) {
      expect(valorDe(base({ [campo]: true })).campos).toEqual({ [campo]: true });
      expect(valorDe(base({ [campo]: false })).campos).toEqual({ [campo]: false });
      for (const ruim of ["true", 1, 0, null, "sim"]) expect(validarCompraSalvar(base({ [campo]: ruim })).ok, `${campo}=${String(ruim)}`).toBe(false);
    }
  });

  it("alvará e documentos: true, false ou null (ainda não decidido)", () => {
    for (const campo of ["pagamentoAlvara", "documentos"]) {
      for (const bom of [true, false, null]) expect(valorDe(base({ [campo]: bom })).campos).toEqual({ [campo]: bom });
      for (const ruim of ["true", 1, 0, "sim"]) expect(validarCompraSalvar(base({ [campo]: ruim })).ok, `${campo}=${String(ruim)}`).toBe(false);
    }
  });

  it("momento do pagamento: só 'vamos_pagar', 'apos_awb' ou null", () => {
    for (const bom of ["vamos_pagar", "apos_awb", null]) expect(valorDe(base({ pagamentoMomento: bom })).campos).toEqual({ pagamentoMomento: bom });
    for (const ruim of ["depois", "", "VAMOS_PAGAR", 1, true]) expect(validarCompraSalvar(base({ pagamentoMomento: ruim })).ok, String(ruim)).toBe(false);
  });

  it("pendências: lista de textos aparados; até 50, 300 cada e 2000 no total", () => {
    expect(valorDe(base({ pendencias: [" Receita ", "Laudo", ""] })).campos).toEqual({ pendencias: ["Receita", "Laudo", ""] });
    expect(valorDe(base({ pendencias: [] })).campos).toEqual({ pendencias: [] });
    expect(erroDe(base({ pendencias: "Receita" }))).toMatch(/lista/);
    expect(erroDe(base({ pendencias: [1] }))).toMatch(/Pendência 1/);
    expect(validarCompraSalvar(base({ pendencias: Array.from({ length: COMPRA_MAX_PENDENCIAS }, () => "a") })).ok).toBe(true);
    expect(validarCompraSalvar(base({ pendencias: Array.from({ length: COMPRA_MAX_PENDENCIAS + 1 }, () => "a") })).ok).toBe(false);
    expect(validarCompraSalvar(base({ pendencias: ["a".repeat(301)] })).ok).toBe(false);
    expect(erroDe(base({ pendencias: Array.from({ length: 10 }, () => "a".repeat(300)) }))).toMatch(/2000/); // 10 × 300 + separadores passa de 2000
  });
});

describe("dinheiro (numeric(14,2): >= 0, 2 casas)", () => {
  it("aceita 0, centavos e null; recusa negativo, mais de 2 casas, texto e acima do teto", () => {
    const v = (x: unknown) => validarDinheiroCompra(x, "Valor");
    expect(v(0)).toEqual({ ok: true, valor: 0 });
    expect(v(12.34)).toEqual({ ok: true, valor: 12.34 });
    expect(v(1234.5)).toEqual({ ok: true, valor: 1234.5 });
    expect(v(null)).toEqual({ ok: true, valor: null });
    expect(v(undefined)).toEqual({ ok: true, valor: null });
    expect(v(COMPRA_VALOR_MAX)).toEqual({ ok: true, valor: COMPRA_VALOR_MAX });
    expect(v(-0.01)).toMatchObject({ ok: false, erro: "Valor não pode ser negativo." });
    expect(v(12.345)).toMatchObject({ ok: false });
    expect(v(0.001)).toMatchObject({ ok: false });
    expect(v("10")).toMatchObject({ ok: false });
    expect(v(Number.NaN)).toMatchObject({ ok: false });
    expect(v(Number.POSITIVE_INFINITY)).toMatchObject({ ok: false });
    expect(v(COMPRA_VALOR_MAX + 1)).toMatchObject({ ok: false });
    expect(v({})).toMatchObject({ ok: false });
  });

  it("0.1 + 0.2 (ponto flutuante) conta como 2 casas", () => {
    expect(validarDinheiroCompra(0.1 + 0.2, "Valor")).toEqual({ ok: true, valor: 0.3 });
  });
});

describe("ordens", () => {
  it("`ordens: []` é válido (apaga todas); ausente não mexe", () => {
    expect(valorDe(base({ ordens: [] })).ordens).toEqual([]);
    expect(valorDe(base())).not.toHaveProperty("ordens");
  });

  it("uma ordem vazia (só o id e a lista de itens) é um rascunho válido: tudo vazio e null", () => {
    expect(valorDe(base({ ordens: [ordem()] })).ordens).toEqual([
      { id: "ord_000001", fornecedor: "", envio: "", cia: "", po: "", frete: null, freteReal: null, itens: [] },
    ]);
  });

  it("limpa os textos, converte o frete e traz os itens", () => {
    const v = valorDe(base({ ordens: [ordem({ fornecedor: "  FORNECEDOR TESTE ", envio: "Air Cargo", cia: "CIA TESTE", frete: 150, freteReal: 140.5, itens: [item({ medicamento: " TESTE MED ", quantidade: "12 ampolas", valorUnitario: 1234.5, valorReal: 0 })] })] }));
    expect(v.ordens![0]).toMatchObject({ fornecedor: "FORNECEDOR TESTE", envio: "Air Cargo", cia: "CIA TESTE", frete: 150, freteReal: 140.5 });
    expect(v.ordens![0]!.itens[0]).toMatchObject({ id: "itm_000001", medicamento: "TESTE MED", quantidade: "12 ampolas", valorUnitario: 1234.5, valorReal: 0 });
  });

  it("até 10 ordens; 11 é recusado; não-lista e item que não é objeto também", () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ordem({ id: `ord_${String(i).padStart(6, "0")}` }));
    expect(validarCompraSalvar(base({ ordens: mk(COMPRA_MAX_ORDENS) })).ok).toBe(true);
    expect(erroDe(base({ ordens: mk(COMPRA_MAX_ORDENS + 1) }))).toBe("No máximo 10 ordens por compra.");
    expect(erroDe(base({ ordens: "x" }))).toBe("Ordens: informe uma lista.");
    expect(erroDe(base({ ordens: [null] }))).toMatch(/Ordem 1/);
  });

  it("até 30 itens por ordem; 31 é recusado; `itens` é obrigatório e precisa ser lista", () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => item({ id: `itm_${String(i).padStart(6, "0")}` }));
    expect(validarCompraSalvar(base({ ordens: [ordem({ itens: mk(COMPRA_MAX_ITENS_POR_ORDEM) })] })).ok).toBe(true);
    expect(erroDe(base({ ordens: [ordem({ itens: mk(COMPRA_MAX_ITENS_POR_ORDEM + 1) })] }))).toBe("Ordem 1: no máximo 30 medicamentos por ordem.");
    expect(erroDe(base({ ordens: [{ id: "ord_000001" }] }))).toMatch(/itens/);
    expect(erroDe(base({ ordens: [ordem({ itens: "x" })] }))).toMatch(/itens/);
  });

  it("dirId e encaminhadaEm são aceitos e IGNORADOS (só o Encaminhar os grava); outra chave desconhecida é recusada", () => {
    const v = valorDe(base({ ordens: [ordem({ dirId: "dir_forjado", encaminhadaEm: "2026-11-19T10:00:00Z" })] }));
    expect(v.ordens![0]).not.toHaveProperty("dirId");
    expect(v.ordens![0]).not.toHaveProperty("encaminhadaEm");
    expect(JSON.stringify(v)).not.toContain("dir_forjado");
    expect(erroDe(base({ ordens: [ordem({ posicao: 3 })] }))).toBe("Campo desconhecido (Ordem 1): posicao.");
    expect(erroDe(base({ ordens: [ordem({ itens: [item({ posicao: 2 })] })] }))).toBe("Campo desconhecido (Ordem 1, medicamento 1): posicao.");
    expect(erroDe(base({ ordens: [ordem({ itens: [item({ chavePix: "x" })] })] }))).toMatch(/chavePix/);
  });

  it("PO: vazio ou o PO completo; minúsculas e espaços viram o formato certo; incompleto é recusado", () => {
    const po = (valor: unknown) => validarCompraSalvar(base({ ordens: [ordem({ po: valor })] }));
    expect(po("")).toMatchObject({ ok: true });
    expect(po(undefined)).toMatchObject({ ok: true });
    expect(po("PO26-11-0001")).toMatchObject({ ok: true });
    const normalizado = po("  po26 -11-0001 ");
    expect(normalizado.ok && normalizado.valor.ordens![0]!.po).toBe("PO26-11-0001");
    for (const ruim of ["PO26-11-1", "PO26-11-00012", "26-11-0001", "PO26/11/0001", "PO", "x", 5]) {
      // "PO" sozinho é o prefixo da máscara: vira vazio (válido); o resto é erro.
      if (ruim === "PO") expect(po(ruim)).toMatchObject({ ok: true });
      else expect(po(ruim), String(ruim)).toMatchObject({ ok: false });
    }
  });

  it("ids: formato seguro (6 a 64 letras, números, _ e -); repetidos entre ordens ou entre itens (de ordens diferentes) são recusados", () => {
    for (const bom of ["ord_000001", "123e4567-e89b-12d3-a456-426614174000", "a".repeat(64), "abcdef"]) {
      expect(validarCompraSalvar(base({ ordens: [ordem({ id: bom })] })).ok, bom).toBe(true);
    }
    for (const ruim of ["", "abc", "a".repeat(65), "ord 000001", "ord/000001", "../x", "_ord0001", undefined, 5, null]) {
      expect(validarCompraSalvar(base({ ordens: [ordem({ id: ruim })] })).ok, String(ruim)).toBe(false);
    }
    expect(erroDe(base({ ordens: [ordem(), ordem()] }))).toBe("Há ordens com o mesmo identificador.");
    expect(erroDe(base({ ordens: [ordem({ id: "ord_000001", itens: [item()] }), ordem({ id: "ord_000002", itens: [item()] })] }))).toBe("Há medicamentos com o mesmo identificador.");
  });

  it("item: textos até 300; o medicamento é do Cadastro OU do pré-cadastro (não os dois); referências com formato seguro", () => {
    const it = (extra: Record<string, unknown>) => validarCompraSalvar(base({ ordens: [ordem({ itens: [item(extra)] })] }));
    expect(it({ medicamento: "a".repeat(300), quantidade: "a".repeat(300) })).toMatchObject({ ok: true });
    for (const campo of ["medicamento", "apresentacao", "referencia", "laboratorio", "quantidade", "temperatura"]) {
      expect(it({ [campo]: "a".repeat(301) }), campo).toMatchObject({ ok: false });
      expect(it({ [campo]: 5 }), campo).toMatchObject({ ok: false });
    }
    expect(it({ medicamentoCadastroId: "med_1731000000_ab12cd" })).toMatchObject({ ok: true });
    expect(it({ preCadastroId: "pre_1731000000_ab12cd" })).toMatchObject({ ok: true });
    expect(it({ medicamentoCadastroId: null, preCadastroId: null })).toMatchObject({ ok: true });
    expect(it({ medicamentoCadastroId: "med_1", preCadastroId: "pre_1" })).toMatchObject({ ok: false });
    for (const ruim of ["a b", "x/y", "", 7]) expect(it({ medicamentoCadastroId: ruim }), String(ruim)).toMatchObject({ ok: false });
  });

  it("dinheiro de ordem e item: negativo, 3 casas e texto são recusados com o lugar do erro", () => {
    expect(erroDe(base({ ordens: [ordem({ frete: -1 })] }))).toBe("Ordem 1: frete não pode ser negativo.");
    expect(erroDe(base({ ordens: [ordem({ freteReal: 1.005 })] }))).toMatch(/Ordem 1: valor real do frete/);
    expect(erroDe(base({ ordens: [ordem({ itens: [item({ valorUnitario: "10" })] })] }))).toMatch(/Ordem 1, medicamento 1: valor unitário/);
    expect(erroDe(base({ ordens: [ordem({ itens: [item({}), item({ id: "itm_000002", valorReal: -5 })] })] }))).toMatch(/medicamento 2: valor real/);
  });
});

describe("não altera o corpo recebido", () => {
  it("um corpo congelado (Object.freeze profundo) valida sem erro e continua igual", () => {
    const congelar = <T>(v: T): T => {
      if (v !== null && typeof v === "object") for (const f of Object.values(v as object)) congelar(f);
      return Object.freeze(v);
    };
    const corpo = congelar(base({ paciente: " X ", pendencias: [" a "], ordens: [ordem({ po: "po26-11-0001", itens: [item({ medicamento: " M " })] })] }));
    const copia = JSON.stringify(corpo);
    expect(validarCompraSalvar(corpo).ok).toBe(true);
    expect(JSON.stringify(corpo)).toBe(copia);
  });
});

describe("consulta e rota", () => {
  it("?ano_mes=AAAA-MM; ausente ou vazio = o padrão; fora do formato é erro", () => {
    expect(validarAnoMesDaConsulta("2026-11", "2026-12")).toEqual({ ok: true, valor: "2026-11" });
    expect(validarAnoMesDaConsulta(undefined, "2026-12")).toEqual({ ok: true, valor: "2026-12" });
    expect(validarAnoMesDaConsulta("", "2026-12")).toEqual({ ok: true, valor: "2026-12" });
    for (const ruim of ["2026-13", "2026-00", "2026-1", "26-11", "novembro", ["2026-11"], 202611]) {
      expect(validarAnoMesDaConsulta(ruim, "2026-12"), String(ruim)).toMatchObject({ ok: false, erro: "Mês inválido: use AAAA-MM." });
    }
  });

  it("o id da compra na rota: letras, números, _ e -, até 64", () => {
    for (const bom of ["cmp_1731000000_ab12cd", "a", "ABC-123_x"]) expect(idDaCompraValido(bom), bom).toBe(true);
    for (const ruim of ["", " ", "a b", "../x", "a/b", "a".repeat(65), undefined, null, 5, "x%20y", "x;y"]) expect(idDaCompraValido(ruim), String(ruim)).toBe(false);
  });
});
