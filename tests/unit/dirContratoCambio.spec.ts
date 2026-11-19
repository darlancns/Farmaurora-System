import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTRATO_CAMBIO_ERRO,
  CONTRATO_CAMBIO_REGEX,
  contratoCambioValido,
  filtrarContratoCambio,
  normalizarContratoCambio,
} from "#shared/utils/contratoCambio";
import { useDirForm } from "../../app/composables/useDirForm";
import { aplicarTransformacaoNoCampo } from "../../app/utils/aplicarTransformacaoNoCampo";
import { erroContratoCambio, isValidDirPatch, isValidDirPayload } from "../../server/utils/dirValidation";
import { FakeSupabase } from "./helpers/fakeSupabase";
import { semearConsultores } from "./helpers/consultoresFixtures";
import { novoDir, novoDirDTO } from "./helpers/dirFixtures";

// Contrato de câmbio da DIR: só números separados por espaço, vírgula ou barra (ou vazio). UMA regra
// (shared/utils/contratoCambio.ts) para o formulário (digitação, colagem, validação) e o servidor (POST e PATCH).

const fake = new FakeSupabase();
// O dirStore confere o consultor contra os ativos do Cadastro (cadastro_consultores).
semearConsultores(fake);
vi.mock("../../server/utils/supabaseServerClient", () => ({
  createSupabaseAdminClient: () => fake.asClient(),
}));

const { createDir, patchDir } = await import("../../server/utils/dirStore");
const { DirRegraError } = await import("../../server/utils/dirValidation");

const lerFonte = (caminho: string): string => readFileSync(resolve(process.cwd(), caminho), "utf-8");

const ACEITOS = [
  "",
  "   ",
  "1",
  "123456",
  "123456789",
  "123456 789012",
  "123456, 789012",
  "123456,789012",
  "123456/789012",
  "123456 / 789012",
  "123456 , 789012",
  "1 2 3",
  "1//2",
  "1, ,2",
  "  123456  ", // espaços nas pontas: a gravação os tira
  "00123",
];

const RECUSADOS = [
  "ABC123",
  "123ABC",
  "123-456",
  "123.456",
  "Venda a prazo",
  "FALECIMENTO",
  "23/out.",
  "123,",
  "123 /",
  "123/",
  ",123",
  "/123",
  "- 123",
  "1.5",
  "1e5",
  "１２３", // algarismos de largura total
  "12\n34",
  "12\t34",
];

describe("regra única (shared/utils/contratoCambio.ts)", () => {
  it("a regex é exatamente a combinada", () => {
    expect(CONTRATO_CAMBIO_REGEX.source).toBe("^[0-9]+([ ,/]+[0-9]+)*$");
  });

  it.each(ACEITOS)("aceita %j", (v) => {
    expect(contratoCambioValido(v)).toBe(true);
  });

  it.each(RECUSADOS)("recusa %j", (v) => {
    expect(contratoCambioValido(v)).toBe(false);
  });

  it("o que não é texto nunca é válido", () => {
    for (const v of [null, undefined, 123, true, {}, []]) expect(contratoCambioValido(v), String(v)).toBe(false);
  });

  it("normalizar só tira os espaços das pontas", () => {
    expect(normalizarContratoCambio("  123  456 ")).toBe("123  456");
  });

  it("a mensagem de erro é clara e dá um exemplo", () => {
    expect(CONTRATO_CAMBIO_ERRO).toContain("Contrato de câmbio inválido");
    expect(CONTRATO_CAMBIO_ERRO).toContain("espaço, vírgula ou barra");
    expect(CONTRATO_CAMBIO_ERRO).toContain("123456 789012");
  });
});

describe("filtro da digitação e da colagem", () => {
  it.each([
    ["123456", "123456"],
    ["abc123def456", "123456"],
    ["123-456", "123456"],
    ["123.456", "123456"],
    ["123 456", "123 456"],
    ["123, 456", "123, 456"],
    ["123/456", "123/456"],
    ["Venda a prazo", ""],
    ["Contrato nº 123456 / 789012", "123456 / 789012"],
    ["  123456", "123456"], // nunca começa por separador
    [",/ 123", "123"],
    ["123 456", "123 456"], // espaço inseparável de documento vira espaço comum
    ["123\t456\n789", "123 456 789"],
    ["123456 ", "123456 "], // separador no fim é permitido enquanto se digita
    ["", ""],
    ["abc", ""],
    ["１２３", ""],
  ])("%j → %j", (colado, esperado) => {
    expect(filtrarContratoCambio(colado)).toBe(esperado);
  });

  it("o resultado do filtro, depois de aparado, é sempre válido (ou termina em separador)", () => {
    for (const texto of ["a1b2/c3", "12 - 34", "x", "  ,9", "1 2 3 ,"]) {
      const f = normalizarContratoCambio(filtrarContratoCambio(texto));
      if (f && !/[ ,/]$/.test(f)) expect(contratoCambioValido(f), texto).toBe(true);
    }
  });

  it("é idempotente", () => {
    for (const texto of ["a1b2/c3", "Venda 123, 456", "  ,/9 8"]) {
      const uma = filtrarContratoCambio(texto);
      expect(filtrarContratoCambio(uma)).toBe(uma);
    }
  });
});

describe("campo: digitar e colar (aplicarTransformacaoNoCampo + useDirForm.onContratoCambioInput)", () => {
  function campo(valor: string, cursor: number | null = valor.length) {
    const c = {
      value: valor,
      selectionStart: cursor,
      setSelectionRange(a: number, b: number) {
        c.selectionStart = a;
        void b;
      },
    };
    return c;
  }
  type Campo = ReturnType<typeof campo>;
  const evento = (c: Campo) => ({ target: c }) as unknown as Event;

  function digitar(f: ReturnType<typeof useDirForm>, texto: string): Campo {
    const c = campo(f.form.contratoCambio);
    for (const ch of texto) {
      const inicio = c.selectionStart ?? c.value.length;
      c.value = c.value.slice(0, inicio) + ch + c.value.slice(inicio);
      c.selectionStart = inicio + 1;
      f.onContratoCambioInput(evento(c));
    }
    return c;
  }

  it("digitar tecla a tecla: letras e símbolos nunca entram", () => {
    const f = useDirForm(() => null);
    const c = digitar(f, "ab123-456 / x789.");
    expect(f.form.contratoCambio).toBe("123456 / 789");
    expect(c.value).toBe("123456 / 789");
    expect(c.selectionStart).toBe(12);
  });

  it("colar: filtra tudo de uma vez e o cursor vai para o fim", () => {
    for (const [colado, esperado] of [
      ["Contrato 123456/789012", "123456/789012"],
      ["123-456", "123456"],
      ["Venda a prazo", ""],
      ["  123456 789012  ", "123456 789012  "],
    ]) {
      const f = useDirForm(() => null);
      const c = campo(colado);
      f.onContratoCambioInput(evento(c));
      expect(f.form.contratoCambio, colado).toBe(esperado);
      expect(c.value, colado).toBe(esperado);
      expect(c.selectionStart, colado).toBe(esperado.length);
    }
  });

  it("digitar uma letra no meio: some e o cursor fica onde estava", () => {
    const f = useDirForm(() => null);
    f.form.contratoCambio = "123456";
    const c = campo("123a456", 4); // digitou "a" depois do "3"
    f.onContratoCambioInput(evento(c));
    expect(f.form.contratoCambio).toBe("123456");
    expect(c.selectionStart).toBe(3);
  });

  it("texto já válido: não mexe no campo nem no cursor", () => {
    const c = campo("123 456", 2);
    c.setSelectionRange = () => {
      throw new Error("não devia mexer na seleção");
    };
    expect(aplicarTransformacaoNoCampo(c as unknown as HTMLInputElement, filtrarContratoCambio)).toBe("123 456");
    expect(c.selectionStart).toBe(2);
  });
});

describe("formulário: validar()", () => {
  function pronto(contratoCambio: string, gravado = "") {
    const dir = gravado === "" ? null : novoDir({ contratoCambio: gravado });
    const f = useDirForm(() => dir);
    f.form.po = "PO26-10-0471";
    f.form.paciente = "Fulano";
    f.form.vendedor = "Mateus Morais";
    f.form.contratoCambio = contratoCambio;
    return f;
  }

  it.each(ACEITOS)("aceita %j (e grava sem espaços nas pontas)", (v) => {
    const r = pronto(v).validar();
    expect(r.valido, v).toBe(true);
    expect(r.valido && r.payload.contratoCambio).toBe(v.trim());
  });

  it.each(RECUSADOS)("recusa %j com a mensagem do contrato", (v) => {
    expect(pronto(v).validar()).toEqual({ valido: false, erro: CONTRATO_CAMBIO_ERRO });
  });

  it("criação: texto antigo digitado à mão (sem registro gravado) é recusado", () => {
    expect(pronto("Venda a prazo").validar()).toEqual({ valido: false, erro: CONTRATO_CAMBIO_ERRO });
  });

  it("edição: valor antigo IGUAL ao gravado não impede salvar os outros campos", () => {
    const f = pronto("Venda a prazo", "Venda a prazo");
    f.form.paciente = "Outro nome";
    const r = f.validar();
    expect(r.valido).toBe(true);
    expect(r.valido && r.atualizacao.contratoCambio).toBe("Venda a prazo"); // não é alterado
  });

  it("edição: o valor antigo com espaços nas pontas, igual ao gravado, também passa", () => {
    expect(pronto("  Venda a prazo ", "Venda a prazo").validar().valido).toBe(true);
  });

  it("edição: MUDAR o valor antigo para outro inválido é recusado; para um número ou vazio, passa", () => {
    expect(pronto("Venda a vista", "Venda a prazo").validar()).toEqual({ valido: false, erro: CONTRATO_CAMBIO_ERRO });
    expect(pronto("123456", "Venda a prazo").validar().valido).toBe(true);
    const vazio = pronto("", "Venda a prazo").validar();
    expect(vazio.valido && vazio.atualizacao.contratoCambio).toBe("");
  });

  it("a ordem das mensagens não mudou: PO, paciente e consultor vêm antes do contrato", () => {
    const f = useDirForm(() => null);
    f.form.contratoCambio = "ABC";
    expect(f.validar()).toEqual({ valido: false, erro: "Informe o PO no padrão PO26-MM-NNNN." });
    f.form.po = "PO26-10-0471";
    expect(f.validar()).toEqual({ valido: false, erro: "Informe o nome do paciente." });
    f.form.paciente = "Fulano";
    expect(f.validar()).toEqual({ valido: false, erro: "Informe o consultor." });
    f.form.vendedor = "Mateus Morais";
    expect(f.validar()).toEqual({ valido: false, erro: CONTRATO_CAMBIO_ERRO });
  });
});

describe("servidor: erroContratoCambio (regra pura)", () => {
  it("corpo sem a chave não é conferido, nem com o gravado inválido", () => {
    expect(erroContratoCambio({ banco: "XP" }, { contratoCambio: "Venda a prazo" })).toBeNull();
    expect(erroContratoCambio({})).toBeNull();
  });

  it("válido ou vazio: sem erro", () => {
    for (const v of ACEITOS) expect(erroContratoCambio({ contratoCambio: v }), v).toBeNull();
  });

  it("inválido: a mensagem do contrato", () => {
    for (const v of RECUSADOS) expect(erroContratoCambio({ contratoCambio: v }), v).toBe(CONTRATO_CAMBIO_ERRO);
  });

  it("inválido IGUAL ao gravado: tolerado; diferente: erro; gravado nulo: erro", () => {
    expect(erroContratoCambio({ contratoCambio: "Venda a prazo" }, { contratoCambio: "Venda a prazo" })).toBeNull();
    expect(erroContratoCambio({ contratoCambio: " Venda a prazo " }, { contratoCambio: "Venda a prazo" })).toBeNull();
    expect(erroContratoCambio({ contratoCambio: "Venda a vista" }, { contratoCambio: "Venda a prazo" })).toBe(CONTRATO_CAMBIO_ERRO);
    expect(erroContratoCambio({ contratoCambio: "Venda a prazo" }, { contratoCambio: null })).toBe(CONTRATO_CAMBIO_ERRO);
  });

  it("valor que não é texto nunca passa pela exceção", () => {
    expect(erroContratoCambio({ contratoCambio: 7 as unknown as string }, { contratoCambio: "7" })).toBe(CONTRATO_CAMBIO_ERRO);
  });
});

describe("EQUIVALÊNCIA cliente x servidor: a mesma resposta para cada valor", () => {
  const TODOS = [...ACEITOS, ...RECUSADOS, "123456 789012 ", "Venda", "0", "1,2/3 4"];

  it("formulário (validar), servidor (erroContratoCambio) e a regra pura concordam", () => {
    for (const v of TODOS) {
      const f = useDirForm(() => null);
      f.form.po = "PO26-10-0471";
      f.form.paciente = "Fulano";
      f.form.vendedor = "Mateus Morais";
      f.form.contratoCambio = v;
      const cliente = f.validar().valido;
      const servidor = erroContratoCambio({ contratoCambio: v.trim() }) === null;
      expect(servidor, JSON.stringify(v)).toBe(cliente);
      expect(contratoCambioValido(v), JSON.stringify(v)).toBe(cliente);
    }
  });

  it("o filtro do campo só produz o que o servidor aceita depois de aparado e sem separador no fim", () => {
    for (const v of TODOS) {
      const f = normalizarContratoCambio(filtrarContratoCambio(v)).replace(/[ ,/]+$/, "");
      expect(erroContratoCambio({ contratoCambio: f }), JSON.stringify(v)).toBeNull();
    }
  });

  it("UMA definição: cliente e servidor importam de contratoCambio.ts e não têm regex própria", () => {
    for (const arquivo of ["app/composables/useDirForm.ts", "server/utils/dirValidation.ts"]) {
      const fonte = lerFonte(arquivo);
      expect(fonte, arquivo).toMatch(/from "[^"]*contratoCambio"/);
      expect(fonte, `${arquivo}: sem regex local do contrato`).not.toMatch(/\[0-9\]\+\(/);
      expect(fonte, `${arquivo}: sem regex local do contrato`).not.toMatch(/\\d\+\(/);
    }
    const fonteCompartilhada = lerFonte("shared/utils/contratoCambio.ts");
    expect(fonteCompartilhada).not.toMatch(/^import /m); // sem imports
  });

  it("o campo da DIR liga o filtro, mantém data-sem-maiuscula e não usa v-model", () => {
    const fonte = lerFonte("app/components/dir/DirFormModal.vue");
    const campoContrato = /<input\s[^>]*id="df-contrato"[^>]*\/>/s.exec(fonte)?.[0] ?? "";
    expect(campoContrato).toContain('@input="onContratoCambioInput"');
    expect(campoContrato).toContain("data-sem-maiuscula");
    expect(campoContrato).not.toContain("v-model");
  });
});

describe("servidor: validação do corpo (isValidDirPayload / isValidDirPatch) continua só estrutural", () => {
  it("o corpo com contrato em texto ainda passa pela estrutura: a regra roda no store (com o valor gravado)", () => {
    expect(isValidDirPayload(novoDirDTO({ contratoCambio: "Venda a prazo" }))).toBe(true);
    expect(isValidDirPatch({ contratoCambio: "Venda a prazo" })).toBe(true);
    expect(isValidDirPatch({ contratoCambio: 123 })).toBe(false); // não é texto
  });
});

// ── dirStore: POST e PATCH com o banco em memória ──────────────────────────────────────────────────

const T = "dir";
const linha = (id: string) => fake.linhas(T).find((r) => r.id === id)!;

function semear(id: string, extra: Record<string, unknown> = {}): void {
  fake.tabelas[T] = [
    ...(fake.tabelas[T] ?? []),
    {
      id,
      po: "PO26-10-0001",
      paciente: "PACIENTE TESTE UM",
      vendedor: "Mateus Morais",
      conferido: false,
      exigencia: false,
      operacao_encerrada: false,
      fechamento_restante: false,
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
      ...extra,
    },
  ];
}

describe("dirStore.createDir: contrato de câmbio", () => {
  beforeEach(() => {
    fake.tabelas[T] = [];
    fake.chamadas.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("grava os aceitos (aparados); vazio vira NULL", async () => {
    for (const [enviado, gravado] of [
      ["123456 789012", "123456 789012"],
      ["  123456/789012 ", "123456/789012"],
      ["", null],
      ["   ", null],
    ] as const) {
      fake.tabelas[T] = [];
      await createDir(novoDirDTO({ contratoCambio: enviado }), "Rebeca");
      expect(fake.linhas(T)[0]!.contrato_cambio ?? null, JSON.stringify(enviado)).toBe(gravado);
    }
  });

  it("recusa (DirRegraError 400 com a mensagem) e não grava nada", async () => {
    for (const v of ["Venda a prazo", "ABC123", "123-456", "123,"]) {
      await expect(createDir(novoDirDTO({ contratoCambio: v }), "Rebeca"), v).rejects.toMatchObject({
        statusCode: 400,
        message: CONTRATO_CAMBIO_ERRO,
      });
      await expect(createDir(novoDirDTO({ contratoCambio: v }), "Rebeca")).rejects.toBeInstanceOf(DirRegraError);
    }
    expect(fake.linhas(T)).toHaveLength(0);
  });
});

describe("dirStore.patchDir: contrato de câmbio", () => {
  beforeEach(() => {
    fake.tabelas[T] = [];
    fake.chamadas.length = 0;
  });

  it("grava um número válido e limpa com vazio", async () => {
    semear("a", { contrato_cambio: "111" });
    await patchDir("a", { contratoCambio: " 123456/789012 " }, "Rebeca");
    expect(linha("a").contrato_cambio).toBe("123456/789012");
    await patchDir("a", { contratoCambio: "" }, "Rebeca");
    expect(linha("a").contrato_cambio ?? null).toBeNull();
  });

  it("inválido novo: 400 com a mensagem e a linha não muda", async () => {
    semear("a", { contrato_cambio: "111" });
    for (const v of ["ABC", "Venda a prazo", "123-456"]) {
      await expect(patchDir("a", { contratoCambio: v }, "Rebeca"), v).rejects.toMatchObject({
        statusCode: 400,
        message: CONTRATO_CAMBIO_ERRO,
      });
    }
    expect(linha("a").contrato_cambio).toBe("111");
  });

  it("valor antigo IGUAL ao gravado não impede salvar os outros campos (o antigo fica como está)", async () => {
    semear("a", { contrato_cambio: "Venda a prazo" });
    await patchDir("a", { contratoCambio: "Venda a prazo", banco: "XP", paciente: "NOVO NOME" }, "Rebeca");
    expect(linha("a")).toMatchObject({ banco: "XP", paciente: "NOVO NOME", contrato_cambio: "Venda a prazo" });
  });

  it("valor antigo: mudar para outro inválido é recusado; para um número, grava", async () => {
    semear("a", { contrato_cambio: "Venda a prazo" });
    await expect(patchDir("a", { contratoCambio: "Venda a vista" }, "Rebeca")).rejects.toMatchObject({ statusCode: 400 });
    expect(linha("a").contrato_cambio).toBe("Venda a prazo");
    await patchDir("a", { contratoCambio: "123456" }, "Rebeca");
    expect(linha("a").contrato_cambio).toBe("123456");
  });

  it("patch sem a chave não toca o contrato (nem o confere): o antigo continua lá", async () => {
    semear("a", { contrato_cambio: "Venda a prazo" });
    await patchDir("a", { banco: "XP" }, "Rebeca");
    expect(linha("a").contrato_cambio).toBe("Venda a prazo");
    expect(fake.chamadas.filter((c) => c.op === "select")).toHaveLength(0); // nem leu o registro
  });

  it("registro inexistente com contrato inválido: devolve null (404 no endpoint), sem erro de contrato", async () => {
    await expect(patchDir("nao-existe", { contratoCambio: "ABC" }, "Rebeca")).resolves.toBeNull();
  });

  it("válido não custa leitura extra; só se lê o gravado quando o enviado é inválido (uma leitura)", async () => {
    semear("a", { contrato_cambio: "Venda a prazo" });
    fake.chamadas.length = 0;
    await patchDir("a", { contratoCambio: "222" }, "Rebeca");
    expect(fake.chamadas.filter((c) => c.op === "select")).toHaveLength(0);

    semear("b", { contrato_cambio: "Antigo" });
    fake.chamadas.length = 0;
    await patchDir("b", { contratoCambio: "Antigo" }, "Rebeca");
    expect(fake.chamadas.filter((c) => c.op === "select")).toHaveLength(1);
  });
});
