// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copiarTexto, useCopiarTexto } from "../../app/composables/useCopiarTexto";

// copiarTexto: clipboard disponível, plano B (textarea + execCommand) e falha. Texto fictício (TESTE).

const RESUMO = "*Compra 01 - Novembro/2026*\n\nPaciente: PACIENTE TESTE\n\nLocal de aplicação: pendente ⏳\n<b>não é html</b> & 'aspas' \"duplas\"";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  // @ts-expect-error: remove o stub de execCommand entre os testes
  delete document.execCommand;
});

function comExecCommand(retorno: boolean | "lanca"): { chamadas: string[]; textoCopiado: () => string | null } {
  const chamadas: string[] = [];
  let copiado: string | null = null;
  document.execCommand = vi.fn((comando: string) => {
    chamadas.push(comando);
    if (retorno === "lanca") throw new Error("bloqueado");
    // O que está selecionado no textarea de apoio é o que o navegador copiaria.
    const area = document.querySelector("textarea");
    copiado = area ? area.value : null;
    return retorno;
  });
  return { chamadas, textoCopiado: () => copiado };
}

describe("com navigator.clipboard", () => {
  it("copia pelo clipboard, EXATAMENTE a string (sem HTML, sem mexer em quebras de linha), e devolve true", async () => {
    const writeText = vi.fn(async () => undefined);
    const exec = comExecCommand(true);
    const ok = await copiarTexto(RESUMO, { clipboard: { writeText }, documento: document });
    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]![0]).toBe(RESUMO);
    expect(exec.chamadas).toEqual([]); // o plano B nem foi usado
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("o clipboard recusa: cai no plano B e, se copiou, devolve true", async () => {
    const writeText = vi.fn(async () => {
      throw new DOMException("negado", "NotAllowedError");
    });
    const exec = comExecCommand(true);
    expect(await copiarTexto(RESUMO, { clipboard: { writeText }, documento: document })).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(exec.chamadas).toEqual(["copy"]);
    expect(exec.textoCopiado()).toBe(RESUMO);
  });
});

describe("plano B (sem navigator.clipboard)", () => {
  it("textarea oculto + execCommand('copy') com o texto exato; o textarea some e o foco volta", async () => {
    const exec = comExecCommand(true);
    const botao = document.createElement("button");
    document.body.appendChild(botao);
    botao.focus();
    expect(document.activeElement).toBe(botao);

    expect(await copiarTexto(RESUMO, { clipboard: null, documento: document })).toBe(true);
    expect(exec.chamadas).toEqual(["copy"]);
    expect(exec.textoCopiado()).toBe(RESUMO);
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(botao);
  });

  it("o textarea de apoio é invisível e não atrapalha (fora da tela, sem tab, escondido de leitor de tela)", async () => {
    let atributos = "";
    document.execCommand = vi.fn(() => {
      const a = document.querySelector("textarea")!;
      atributos = `${a.getAttribute("aria-hidden")}|${a.tabIndex}|${a.style.position}|${a.style.left}|${a.readOnly}`;
      return true;
    });
    await copiarTexto("x", { clipboard: null, documento: document });
    expect(atributos).toBe("true|-1|fixed|-9999px|true");
  });
});

describe("falhas", () => {
  it("execCommand devolve false: devolve false e limpa o textarea", async () => {
    comExecCommand(false);
    expect(await copiarTexto(RESUMO, { clipboard: null, documento: document })).toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("execCommand lança: devolve false (nunca lança) e limpa o textarea", async () => {
    comExecCommand("lanca");
    await expect(copiarTexto(RESUMO, { clipboard: null, documento: document })).resolves.toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("sem execCommand no navegador: false", async () => {
    expect(await copiarTexto(RESUMO, { clipboard: null, documento: document })).toBe(false);
  });

  it("clipboard recusa e o plano B também falha: false", async () => {
    comExecCommand(false);
    const writeText = vi.fn(async () => {
      throw new Error("negado");
    });
    expect(await copiarTexto(RESUMO, { clipboard: { writeText }, documento: document })).toBe(false);
  });

  it("sem clipboard e sem documento (fora do navegador): false", async () => {
    expect(await copiarTexto(RESUMO, { clipboard: null, documento: null })).toBe(false);
  });
});

describe("useCopiarTexto (o ambiente real do navegador)", () => {
  it("usa navigator.clipboard quando existe", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await useCopiarTexto().copiar(RESUMO)).toBe(true);
    expect(writeText).toHaveBeenCalledWith(RESUMO);
  });

  it("sem navigator.clipboard usa o plano B", async () => {
    vi.stubGlobal("navigator", {});
    const exec = comExecCommand(true);
    expect(await useCopiarTexto().copiar(RESUMO)).toBe(true);
    expect(exec.textoCopiado()).toBe(RESUMO);
  });
});
