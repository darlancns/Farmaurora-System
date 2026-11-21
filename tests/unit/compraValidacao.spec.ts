import { describe, expect, it } from "vitest";
import {
  COMPRA_LINHA_MAX,
  COMPRA_MAX_ITENS,
  COMPRA_MAX_ORDENS,
  COMPRA_MAX_PENDENCIAS,
  COMPRA_MEDICAMENTO_MAX,
  COMPRA_TEXTO_LONGO_MAX,
  COMPRA_VALOR_MAX,
} from "../../shared/constants/compra";
import { NUMERO_REMESSA_ERRO } from "../../shared/utils/numeroRemessa";
import {
  CAMPOS_TEXTO_COMPRA,
  idDaCompraValido,
  validarAnoMesDaConsulta,
  validarCompraSalvar,
  validarConsultaListaCompras,
  validarDinheiroCompra,
} from "../../shared/utils/compraValidacao";

// A validação do corpo do salvamento da Compra (o servidor não confia no cliente). Só a FORMA: o que depende dos Cadastros e das
// constantes (consultor, envio, cia, empresa, brand...) é 422 no servidor (comprasCatalogo.spec / comprasRotas.spec). Dados fictícios (TESTE).

const VERSAO = "2026-11-19T15:00:00.000Z";
const base = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ atualizadoEm: VERSAO, ...extra });
const item = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ id: "itm_000001", ...extra });

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

  it("campo desconhecido é recusado com o nome dele; numeração, auditoria e o que saiu do modelo NÃO são editáveis", () => {
    expect(erroDe(base({ xyz: 1 }))).toBe("Campo desconhecido: xyz.");
    const naoEditavel = [
      "id", "anoMes", "sequencia", "cancelada", "criadoPor", "atualizadoPor", "createdAt", "updatedAt", "chavePix",
      // saíram do modelo da compra:
      "ordens", "vendedor", "courierSimples", "localDeclarado", "isencaoPara", "po", "dirId", "encaminhadaEm",
    ];
    for (const campo of naoEditavel) expect(erroDe(base({ [campo]: "x" })), campo).toBe(`Campo desconhecido: ${campo}.`);
  });
});

describe("campos de texto da compra", () => {
  const CAMPOS = Object.keys(CAMPOS_TEXTO_COMPRA);

  it("aparados; ausente = não muda (não entra em `campos`); vazio é válido", () => {
    const v = valorDe(base({ paciente: "  PACIENTE TESTE  ", medico: "" }));
    expect(v.campos).toEqual({ paciente: "PACIENTE TESTE", medico: "" });
    expect(Object.keys(valorDe(base({})).campos)).toEqual([]);
  });

  it("todos os campos de texto existem (com consultor no lugar de vendedor) e aceitam texto", () => {
    expect([...CAMPOS].sort()).toEqual(
      [
        "cia", "consultor", "contatos", "despachante", "empresa", "entrega", "envio", "fornecedor", "localAplicacao", "medico",
        "observacoes", "paciente", "processoNumero", "responsavel", "termoObservacao",
      ].sort(),
    );
    const corpo = Object.fromEntries(CAMPOS.map((c) => [c, `${c} TESTE`]));
    expect(valorDe(base(corpo)).campos).toEqual(corpo);
  });

  it("número, nulo, lista ou objeto no lugar do texto: erro com o rótulo do campo", () => {
    for (const ruim of [7, null, [], {}, true]) expect(erroDe(base({ paciente: ruim })), String(ruim)).toBe("Paciente: informe um texto.");
    expect(erroDe(base({ consultor: 5 }))).toBe("Consultor: informe um texto.");
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
    for (const campo of ["compraParticular", "termoPosterior", "isencao", "recorrente"]) {
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

  it("frete e valor real do frete são da COMPRA: null limpa, ausente não muda, negativo e 3 casas são recusados", () => {
    expect(valorDe(base({ frete: 150, freteReal: 140.5 })).campos).toEqual({ frete: 150, freteReal: 140.5 });
    expect(valorDe(base({ frete: null, freteReal: null })).campos).toEqual({ frete: null, freteReal: null });
    expect(valorDe(base({ frete: 0 })).campos).toEqual({ frete: 0 });
    expect(Object.keys(valorDe(base()).campos)).not.toContain("frete");
    expect(erroDe(base({ frete: -1 }))).toBe("Frete não pode ser negativo.");
    expect(erroDe(base({ freteReal: 1.005 }))).toMatch(/Valor real do frete/);
    expect(erroDe(base({ frete: "10" }))).toMatch(/Frete: informe um número/);
  });
});

describe("numeroOrdens ('Ordens': só um número, de 1 a 10)", () => {
  it("de 1 a 10 passa; 0, 11, decimal, texto, nulo e negativo são recusados com a mensagem do Nº Ordem", () => {
    for (const n of [1, 2, 9, COMPRA_MAX_ORDENS]) expect(valorDe(base({ numeroOrdens: n })).campos).toEqual({ numeroOrdens: n });
    for (const ruim of [0, COMPRA_MAX_ORDENS + 1, 11, 1.5, "2", null, -1, Number.NaN, true, [], 2147483647]) {
      expect(erroDe(base({ numeroOrdens: ruim })), String(ruim)).toBe(NUMERO_REMESSA_ERRO);
    }
    expect(Object.keys(valorDe(base()).campos)).not.toContain("numeroOrdens");
  });
});

describe("itens (os medicamentos da compra)", () => {
  it("`itens: []` é válido (apaga todos); ausente não mexe", () => {
    expect(valorDe(base({ itens: [] })).itens).toEqual([]);
    expect(valorDe(base())).not.toHaveProperty("itens");
  });

  it("um medicamento só com o id é um rascunho válido: tudo vazio, brand vazio e null", () => {
    expect(valorDe(base({ itens: [item()] })).itens).toEqual([
      {
        id: "itm_000001",
        medicamento: "",
        medicamentoCadastroId: null,
        preCadastroId: null,
        laboratorio: "",
        brand: "",
        quantidade: "",
        temperatura: "",
        valorUnitario: null,
        valorReal: null,
      },
    ]);
  });

  it("limpa os textos (o medicamento é UM texto, gravado como digitado, aparado) e converte os valores", () => {
    const v = valorDe(base({ itens: [item({ medicamento: " KEYTRUDA 100mg - 2 vials per box ", laboratorio: " MSD ", brand: "referencia", quantidade: "12 ampolas", temperatura: "2°C a 8°C", valorUnitario: 1234.5, valorReal: 0 })] }));
    expect(v.itens![0]).toMatchObject({
      id: "itm_000001",
      medicamento: "KEYTRUDA 100mg - 2 vials per box",
      laboratorio: "MSD",
      brand: "referencia",
      quantidade: "12 ampolas",
      temperatura: "2°C a 8°C",
      valorUnitario: 1234.5,
      valorReal: 0,
    });
  });

  it("até 30 itens; 31 é recusado; não-lista e item que não é objeto também", () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => item({ id: `itm_${String(i).padStart(6, "0")}` }));
    expect(validarCompraSalvar(base({ itens: mk(COMPRA_MAX_ITENS) })).ok).toBe(true);
    expect(erroDe(base({ itens: mk(COMPRA_MAX_ITENS + 1) }))).toBe("No máximo 30 medicamentos por compra.");
    expect(erroDe(base({ itens: "x" }))).toBe("Medicamentos: informe uma lista (itens).");
    expect(erroDe(base({ itens: [null] }))).toMatch(/Medicamento 1/);
  });

  it("chave desconhecida no medicamento é recusada: medicamentoCadastroNome (só leitura), apresentacao, referencia, posicao, chavePix", () => {
    expect(erroDe(base({ itens: [item({ medicamentoCadastroNome: "KEYTRUDA" })] }))).toBe("Campo desconhecido (Medicamento 1): medicamentoCadastroNome.");
    expect(erroDe(base({ itens: [item({ preCadastroStatus: "pendente" })] }))).toBe("Campo desconhecido (Medicamento 1): preCadastroStatus.");
    expect(erroDe(base({ itens: [item({ apresentacao: "10 mg" })] }))).toBe("Campo desconhecido (Medicamento 1): apresentacao.");
    expect(erroDe(base({ itens: [item({ referencia: "x" })] }))).toBe("Campo desconhecido (Medicamento 1): referencia.");
    expect(erroDe(base({ itens: [item({ posicao: 2 })] }))).toBe("Campo desconhecido (Medicamento 1): posicao.");
    expect(erroDe(base({ itens: [item({ chavePix: "x" })] }))).toMatch(/chavePix/);
  });

  it("ids: formato seguro (6 a 64 letras, números, _ e -); repetidos entre os itens são recusados", () => {
    for (const bom of ["itm_000001", "123e4567-e89b-12d3-a456-426614174000", "a".repeat(64), "abcdef"]) {
      expect(validarCompraSalvar(base({ itens: [item({ id: bom })] })).ok, bom).toBe(true);
    }
    for (const ruim of ["", "abc", "a".repeat(65), "itm 000001", "itm/000001", "../x", "_itm0001", undefined, 5, null]) {
      expect(validarCompraSalvar(base({ itens: [item({ id: ruim })] })).ok, String(ruim)).toBe(false);
    }
    expect(erroDe(base({ itens: [item(), item()] }))).toBe("Há medicamentos com o mesmo identificador.");
  });

  it("textos: o medicamento até 300; laboratório, brand, quantidade e temperatura até 300; só texto", () => {
    const it = (extra: Record<string, unknown>) => validarCompraSalvar(base({ itens: [item(extra)] }));
    expect(it({ medicamento: "a".repeat(COMPRA_MEDICAMENTO_MAX), quantidade: "a".repeat(300) })).toMatchObject({ ok: true });
    for (const campo of ["medicamento", "laboratorio", "brand", "quantidade", "temperatura"]) {
      expect(it({ [campo]: "a".repeat(301) }), campo).toMatchObject({ ok: false });
      expect(it({ [campo]: 5 }), campo).toMatchObject({ ok: false });
    }
  });

  it("brand: aqui só a FORMA (texto); se é um valor de BRANDS_MEDICAMENTO quem confere é o servidor (422)", () => {
    for (const bom of ["", "bioequivalente", "referencia"]) expect(valorDe(base({ itens: [item({ brand: bom })] })).itens![0]!.brand, bom).toBe(bom);
    expect(validarCompraSalvar(base({ itens: [item({ brand: null })] })).ok).toBe(false);
  });

  it("o medicamento é do Cadastro OU do pré-cadastro (não os dois); referências com formato seguro", () => {
    const it = (extra: Record<string, unknown>) => validarCompraSalvar(base({ itens: [item(extra)] }));
    expect(it({ medicamentoCadastroId: "med_1731000000_ab12cd" })).toMatchObject({ ok: true });
    expect(it({ preCadastroId: "pre_1731000000_ab12cd" })).toMatchObject({ ok: true });
    expect(it({ medicamentoCadastroId: null, preCadastroId: null })).toMatchObject({ ok: true });
    expect(it({ medicamentoCadastroId: "med_1", preCadastroId: "pre_1" })).toMatchObject({ ok: false });
    for (const ruim of ["a b", "x/y", "", 7]) expect(it({ medicamentoCadastroId: ruim }), String(ruim)).toMatchObject({ ok: false });
  });

  it("dinheiro do item: negativo, 3 casas e texto são recusados com o lugar do erro", () => {
    expect(erroDe(base({ itens: [item({ valorUnitario: "10" })] }))).toMatch(/Medicamento 1: valor unitário/);
    expect(erroDe(base({ itens: [item({}), item({ id: "itm_000002", valorReal: -5 })] }))).toMatch(/Medicamento 2: valor real/);
  });
});

describe("não altera o corpo recebido", () => {
  it("um corpo congelado (Object.freeze profundo) valida sem erro e continua igual", () => {
    const congelar = <T>(v: T): T => {
      if (v !== null && typeof v === "object") for (const f of Object.values(v as object)) congelar(f);
      return Object.freeze(v);
    };
    const corpo = congelar(base({ paciente: " X ", pendencias: [" a "], itens: [item({ medicamento: " M " })] }));
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

  it("a lista: padrão (mês atual, página 1, sem canceladas); ?pagina e ?incluir_canceladas=1; o ?status= que saiu é IGNORADO", () => {
    expect(validarConsultaListaCompras({}, "2026-11")).toEqual({ ok: true, valor: { anoMes: "2026-11", incluirCanceladas: false, pagina: 1 } });
    expect(validarConsultaListaCompras({ ano_mes: "2026-10", pagina: "3", incluir_canceladas: "1" }, "2026-11")).toEqual({
      ok: true,
      valor: { anoMes: "2026-10", incluirCanceladas: true, pagina: 3 },
    });
    for (const status of ["pronta", "rascunho", "parcial", "encaminhada", "cancelada", "lixo", ["a", "b"], 1]) {
      expect(validarConsultaListaCompras({ status }, "2026-11"), String(status)).toEqual({ ok: true, valor: { anoMes: "2026-11", incluirCanceladas: false, pagina: 1 } });
    }
    for (const ruim of [{ pagina: "0" }, { pagina: "-1" }, { pagina: "1.5" }, { pagina: "x" }, { pagina: ["1", "2"] }, { ano_mes: "2026-13" }]) {
      expect(validarConsultaListaCompras(ruim, "2026-11").ok, JSON.stringify(ruim)).toBe(false);
    }
  });

  it("o id da compra na rota: letras, números, _ e -, até 64", () => {
    for (const bom of ["cmp_1731000000_ab12cd", "a", "ABC-123_x"]) expect(idDaCompraValido(bom), bom).toBe(true);
    for (const ruim of ["", " ", "a b", "../x", "a/b", "a".repeat(65), undefined, null, 5, "x%20y", "x;y"]) expect(idDaCompraValido(ruim), String(ruim)).toBe(false);
  });
});
