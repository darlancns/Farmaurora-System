import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  NUMERO_PO_ERRO,
  NUMERO_PO_EXEMPLO,
  NUMERO_PO_LIMITE,
  NUMERO_PO_REGEX,
  NUMERO_PO_REGEX_PARTES,
  formatarNumeroPo,
  mascararNumeroPo,
  normalizarNumeroPo,
  numeroPoValido,
} from "#shared/utils/numeroPo";
import { erroNumeroPo, numeroPoCanonico } from "../../server/utils/processoValidation";

// PO — UMA fonte do formato (shared/utils/numeroPo.ts) para o Follow-Up: PO + ano(2) - mês(2) - sequência(4), ex.:
// PO26-10-0471. Aqui: a regra, a normalização, a máscara e a colagem, e a trava que impede o Follow-Up de ter uma regex
// própria.

const lerFonte = (caminho: string): string =>
  readFileSync(fileURLToPath(new URL(`../../${caminho}`, import.meta.url)), "utf-8");

// ── Travas ─────────────────────────────────────────────────────────────────────────────────────────

describe("trava: o Follow-Up usa a fonte única do formato", () => {
  it("o Follow-Up (servidor e formulário) importa de numeroPo.ts e não define regex de PO própria", () => {
    for (const arquivo of ["server/utils/processoValidation.ts", "app/utils/processoFormPayload.ts", "app/composables/useProcessoForm.ts"]) {
      const fonte = lerFonte(arquivo);
      expect(fonte, arquivo).toMatch(/from "[^"]*numeroPo"/);
      expect(fonte, `${arquivo}: sem regex local de PO`).not.toMatch(/\/\^PO/);
    }
  });

  it("o módulo antigo (formato PO-00-0000/n) não existe mais", () => {
    expect(() => lerFonte("shared/utils/numeroOrdem.ts")).toThrow();
  });

  it("a variante com grupos é o MESMO formato (só acrescenta parênteses)", () => {
    expect(NUMERO_PO_REGEX_PARTES.source.replace(/[()]/g, "")).toBe(NUMERO_PO_REGEX.source);
    expect(NUMERO_PO_REGEX_PARTES.exec("PO26-10-0471")?.slice(1)).toEqual(["26", "10", "0471"]);
  });

  it("o formato pronto para o usuário é o do exemplo (o mesmo do placeholder)", () => {
    expect(NUMERO_PO_REGEX.test(NUMERO_PO_EXEMPLO)).toBe(true);
    expect(NUMERO_PO_EXEMPLO.length).toBe(NUMERO_PO_LIMITE);
    expect(lerFonte("app/components/processos/ProcessoFormModal.vue")).toContain(`placeholder="${NUMERO_PO_EXEMPLO}"`);
  });
});

// ── Normalização e validação ───────────────────────────────────────────────────────────────────────

describe("normalizarNumeroPo", () => {
  it("maiúsculas e sem espaços (nas pontas e no meio)", () => {
    expect(normalizarNumeroPo("po26-10-0471")).toBe("PO26-10-0471");
    expect(normalizarNumeroPo("  PO26-10-0471  ")).toBe("PO26-10-0471");
    expect(normalizarNumeroPo("PO 26-10 - 0471")).toBe("PO26-10-0471");
  });

  it("vazio, só espaços, null, undefined e 'PO' sozinho viram null", () => {
    for (const v of ["", "   ", null, undefined, "PO", "po", " Po "]) expect(normalizarNumeroPo(v), String(v)).toBeNull();
  });

  it("é idempotente e não completa nada: incompleto continua incompleto", () => {
    for (const v of ["PO26-10-0471", "PO26", "PO26-1", "PO-25-2652/3"]) {
      const uma = normalizarNumeroPo(v);
      expect(normalizarNumeroPo(uma)).toBe(uma);
    }
    expect(normalizarNumeroPo("po26")).toBe("PO26");
  });
});

describe("numeroPoValido: SÓ vazio ou PO completo", () => {
  it("vazio (e 'PO' sozinho, que é vazio) é válido: o campo é opcional", () => {
    for (const v of ["", "  ", null, undefined, "PO"]) expect(numeroPoValido(v), String(v)).toBe(true);
  });

  it("o PO completo é válido, inclusive em minúsculas ou com espaços (normaliza antes)", () => {
    for (const v of ["PO26-10-0471", "po26-10-0471", " PO26-10-0471 ", "PO 26-10-0471"]) expect(numeroPoValido(v), v).toBe(true);
  });

  it("incompleto é INVÁLIDO", () => {
    for (const v of ["PO2", "PO26", "PO26-", "PO26-1", "PO26-10", "PO26-10-", "PO26-10-0", "PO26-10-047", "PO26100471", "26-10-0471"]) {
      expect(numeroPoValido(v), v).toBe(false);
    }
  });

  it("o formato antigo do Follow-Up (hífen depois de PO, sufixo /n) é INVÁLIDO", () => {
    for (const v of ["PO-25-2652", "PO-25-2652/3", "PO-25", "PO-", "PO-25-11/", "PO26-10-0471/1"]) {
      expect(numeroPoValido(v), v).toBe(false);
    }
  });

  it("a mensagem cita o formato certo", () => {
    expect(NUMERO_PO_ERRO).toBe("PO inválido. Use o formato PO26-10-0471 (PO, ano, mês e sequência de 4 números).");
    expect(NUMERO_PO_ERRO).not.toContain("PO-00-0000");
    expect(NUMERO_PO_ERRO).not.toContain("/");
  });

  it("servidor: erroNumeroPo e numeroPoCanonico seguem a mesma regra", () => {
    expect(erroNumeroPo({ numeroPo: "po26-10-0471" })).toBeNull();
    expect(erroNumeroPo({ numeroPo: "PO26-10" })).toBe(NUMERO_PO_ERRO);
    expect(erroNumeroPo({ numeroPo: 7 })).toBe(NUMERO_PO_ERRO);
    expect(erroNumeroPo({})).toBeNull();
    expect(erroNumeroPo({ numeroPo: null })).toBeNull();
    expect(numeroPoCanonico(" po26-10-0471 ")).toBe("PO26-10-0471");
    expect(numeroPoCanonico("")).toBeNull();
    expect(numeroPoCanonico(undefined)).toBeUndefined();
  });
});

// ── Máscara de digitação ───────────────────────────────────────────────────────────────────────────

// Simula o campo: a pessoa digita caractere a caractere (cursor sempre no fim), cada edição passa pela máscara.
function digitar(texto: string, inicial = ""): string {
  let atual = inicial;
  for (const ch of texto) atual = formatarNumeroPo(atual + ch, atual);
  return atual;
}

// Uma edição no meio do campo: troca [inicio, fim) de `valor` por `inserido`, cursor depois do inserido.
function editar(valor: string, inicio: number, fim: number, inserido = "") {
  const texto = valor.slice(0, inicio) + inserido + valor.slice(fim);
  return mascararNumeroPo(texto, { anterior: valor, cursor: inicio + inserido.length });
}

// Apaga com backspace no fim, até esvaziar; devolve todos os estados.
function apagarAteOFim(valor: string): string[] {
  const estados: string[] = [];
  let v = valor;
  while (v !== "") {
    const depois = formatarNumeroPo(v.slice(0, -1), v);
    expect(depois.length, `de "${v}"`).toBeLessThan(v.length); // sempre avança: nunca trava
    estados.push(depois);
    v = depois;
  }
  return estados;
}

describe("máscara: digitação tecla a tecla", () => {
  it("o prefixo PO entra sozinho", () => {
    expect(formatarNumeroPo("p")).toBe("PO");
    expect(formatarNumeroPo("po")).toBe("PO");
    expect(formatarNumeroPo("PO")).toBe("PO");
    expect(formatarNumeroPo("2")).toBe("PO2");
    expect(digitar("po")).toBe("PO");
  });

  it("os hífens são automáticos e nunca ficam pendurados no fim", () => {
    expect(digitar("po2")).toBe("PO2");
    expect(digitar("po26")).toBe("PO26");
    expect(digitar("po261")).toBe("PO26-1");
    expect(digitar("po2610")).toBe("PO26-10");
    expect(digitar("po26100")).toBe("PO26-10-0");
    expect(digitar("po26100471")).toBe("PO26-10-0471");
    expect(formatarNumeroPo("po26-")).toBe("PO26"); // "-" digitado antes do próximo dígito não fica
    expect(formatarNumeroPo("PO26-10-")).toBe("PO26-10");
  });

  it("digitar com os hífens já dá o mesmo resultado", () => {
    expect(digitar("po26-10-0471")).toBe("PO26-10-0471");
    expect(digitar("PO26-10-0471")).toBe("PO26-10-0471");
  });

  it("no máximo 8 dígitos: o que passa é descartado", () => {
    expect(digitar("po2610047199")).toBe("PO26-10-0471");
    expect(digitar("po26-10-0471", "")).toHaveLength(NUMERO_PO_LIMITE);
  });

  it("depois do prefixo só dígitos são aceitos: letras e símbolos são ignorados", () => {
    expect(digitar("po26x10y-0471z")).toBe("PO26-10-0471");
    expect(digitar("poab")).toBe("PO");
    expect(formatarNumeroPo("POx", "PO")).toBe("PO");
  });

  it("o resultado completo é um PO válido", () => {
    expect(NUMERO_PO_REGEX.test(digitar("po26100471"))).toBe(true);
    expect(numeroPoValido(digitar("po261004"))).toBe(false); // faltam dígitos
  });
});

describe("máscara: colar", () => {
  it.each([
    ["po26100471", "PO26-10-0471"],
    ["PO26100471", "PO26-10-0471"],
    ["PO26-10-0471", "PO26-10-0471"],
    ["po26-10-0471", "PO26-10-0471"],
    ["26-10-0471", "PO26-10-0471"],
    ["26100471", "PO26-10-0471"],
    ["po 26 10 0471", "PO26-10-0471"],
    ["PO26/10/0471", "PO26-10-0471"],
    ["  PO26-10-0471  ", "PO26-10-0471"],
    ["PO 26-10 - 0471", "PO26-10-0471"],
    ["PO26–10–0471", "PO26-10-0471"], // travessões de quem copia de um documento
    ["PO26-10-04711", "PO26-10-0471"], // sobra descartada
    ["PO26-10", "PO26-10"], // incompleto: a máscara só formata, quem recusa é a validação
    ["26", "PO26"],
    ["po", "PO"],
    ["abc", ""],
    ["", ""],
    ["  ", ""],
  ])("cola %j → %j", (colado, esperado) => {
    expect(formatarNumeroPo(colado)).toBe(esperado);
  });

  it("colar em cima de um valor já preenchido troca o campo inteiro", () => {
    expect(formatarNumeroPo("po26100471", "PO25-01-0001")).toBe("PO26-10-0471");
  });

  it("o formato antigo (PO-25-2652/1) NÃO é convertido: a máscara só reaproveita os dígitos", () => {
    expect(formatarNumeroPo("PO-25-2652/1")).toBe("PO25-26-521");
    expect(numeroPoValido(formatarNumeroPo("PO-25-2652/1"))).toBe(false); // incompleto: a validação recusa
  });
});

describe("máscara: apagar", () => {
  it("no fim: passa por todos os estados sem travar", () => {
    expect(apagarAteOFim("PO26-10-0471")).toEqual([
      "PO26-10-047",
      "PO26-10-04",
      "PO26-10-0",
      "PO26-10",
      "PO26-1",
      "PO26",
      "PO2",
      "PO",
      "",
    ]);
  });

  it("'PO' sozinho: apagar o 'O' limpa o campo", () => {
    expect(formatarNumeroPo("P", "PO")).toBe("");
  });

  it("apagar tudo (selecionar e apagar) deixa o campo vazio", () => {
    expect(formatarNumeroPo("", "PO26-10-0471")).toBe("");
  });

  it("apagar no meio mantém o cursor no ponto (não vai para o fim)", () => {
    const r = editar("PO26-10-0471", 3, 4); // apagou o "6" do ano
    expect(r.valor).toBe("PO21-00-471");
    expect(r.cursor).toBe(3);
  });

  it("apagar a última casa do mês: o cursor fica depois do que sobrou antes dele", () => {
    const r = editar("PO26-10-0471", 5, 6); // apagou o "1" do mês
    expect(r.valor).toBe("PO26-00-471");
    expect(r.cursor).toBe(4);
  });
});

describe("máscara: cursor", () => {
  it("digitando no fim, o cursor fica no fim (inclusive depois de um hífen automático)", () => {
    expect(mascararNumeroPo("PO261", { anterior: "PO26", cursor: 5 })).toEqual({ valor: "PO26-1", cursor: 6 });
    expect(mascararNumeroPo("PO26100", { anterior: "PO26-10", cursor: 7 })).toEqual({ valor: "PO26-10-0", cursor: 9 });
  });

  it("colar: o cursor vai para o fim do valor mascarado", () => {
    const r = mascararNumeroPo("po26100471");
    expect(r).toEqual({ valor: "PO26-10-0471", cursor: 12 });
  });

  it("inserir um dígito no meio empurra o resto e o cursor fica logo depois dele", () => {
    const r = editar("PO26-10-0471", 5, 5, "9"); // digitou "9" antes do "1" do mês
    expect(r.valor).toBe("PO26-91-0047");
    expect(r.cursor).toBe(6);
  });

  it("sem cursor informado, vai para o fim", () => {
    expect(mascararNumeroPo("po2610").cursor).toBe(7);
  });
});
