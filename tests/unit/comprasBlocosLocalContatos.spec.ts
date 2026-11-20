// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { compraTeste, clicar, digitar, marcar, montarFormulario, q, qa, texto, type FormularioMontado } from "./helpers/formularioCompra";

// Os blocos Local e entrega e Contatos no formulário REAL, com "Entrega no mesmo local" (sem coluna no banco). Dados fictícios (TESTE).

let montado: FormularioMontado | null = null;
afterEach(() => {
  montado?.desmontar();
  montado = null;
  document.body.innerHTML = "";
});
const abrir = (...args: Parameters<typeof montarFormulario>): FormularioMontado => (montado = montarFormulario(...args));

describe("bloco Local e entrega", () => {
  it("os campos e os rótulos", () => {
    abrir(compraTeste());
    const rotulos = Object.fromEntries(qa<HTMLLabelElement>("[data-bloco='local_entrega'] label").map((l) => [l.htmlFor, texto(l)]));
    expect(rotulos).toEqual({
      "compra-local": "Local de aplicação",
      "compra-local-declarado": "Declarado",
      "compra-entrega-mesmo-local": "Entrega no mesmo local",
      "compra-entrega": "Entrega (Doctor/AJC)",
    });
  });

  it("Local de aplicação e Declarado gravam", async () => {
    const f = abrir(compraTeste());
    await digitar("#compra-local", "Clínica Teste, Rua 1");
    expect(f.compra.value.localAplicacao).toBe("Clínica Teste, Rua 1");
    await marcar("#compra-local-declarado", true);
    expect(f.compra.value.localDeclarado).toBe(true);
    await marcar("#compra-local-declarado", false);
    expect(f.compra.value.localDeclarado).toBe(false);
  });

  it("estado inicial: 'Entrega no mesmo local' MARCADA quando a entrega é igual ao local e não vazia; desmarcada nos outros casos", () => {
    abrir(compraTeste({ localAplicacao: "Clínica Teste", entrega: "Clínica Teste" }));
    expect(q<HTMLInputElement>("#compra-entrega-mesmo-local")!.checked).toBe(true);
    expect(q<HTMLInputElement>("#compra-entrega")!.disabled).toBe(true);
    montado!.desmontar();
    abrir(compraTeste({ localAplicacao: "Clínica Teste", entrega: "Outro lugar" }));
    expect(q<HTMLInputElement>("#compra-entrega-mesmo-local")!.checked).toBe(false);
    expect(q<HTMLInputElement>("#compra-entrega")!.disabled).toBe(false);
    montado!.desmontar();
    abrir(compraTeste({ localAplicacao: "", entrega: "" })); // os dois vazios NÃO contam como "iguais"
    expect(q<HTMLInputElement>("#compra-entrega-mesmo-local")!.checked).toBe(false);
  });

  it("marcar copia o local para a entrega e desabilita o campo; cada digitação no local acompanha a entrega", async () => {
    const f = abrir(compraTeste({ localAplicacao: "Clínica A" }));
    await marcar("#compra-entrega-mesmo-local", true);
    expect(f.compra.value.entrega).toBe("Clínica A");
    expect(q<HTMLInputElement>("#compra-entrega")!.disabled).toBe(true);
    await digitar("#compra-local", "Clínica Teste");
    expect(f.compra.value).toMatchObject({ localAplicacao: "Clínica Teste", entrega: "Clínica Teste" });
    await digitar("#compra-local", "Clínica Teste Nova");
    expect(f.compra.value.entrega).toBe("Clínica Teste Nova");
    expect(q<HTMLInputElement>("#compra-entrega")!.value).toBe("Clínica Teste Nova");
  });

  it("desmarcar libera o campo e mantém a entrega como está; depois o local não mexe mais nela", async () => {
    const f = abrir(compraTeste({ localAplicacao: "Clínica A", entrega: "Clínica A" }));
    await marcar("#compra-entrega-mesmo-local", false);
    expect(q<HTMLInputElement>("#compra-entrega")!.disabled).toBe(false);
    expect(f.compra.value.entrega).toBe("Clínica A");
    await digitar("#compra-entrega", "Doctor Teste");
    await digitar("#compra-local", "Clínica B");
    expect(f.compra.value).toMatchObject({ localAplicacao: "Clínica B", entrega: "Doctor Teste" });
  });

  it("depois de desmarcar, uma nova versão salva (mesmos valores iguais) NÃO religa a caixa sozinha", async () => {
    const f = abrir(compraTeste({ localAplicacao: "X", entrega: "X" }));
    await marcar("#compra-entrega-mesmo-local", false);
    // O autosave devolve a compra com outra versão (updatedAt) mas o mesmo conteúdo.
    await f.trocarCompra({ ...f.compra.value, updatedAt: "2026-11-19T13:00:00.000Z" });
    expect(q<HTMLInputElement>("#compra-entrega-mesmo-local")!.checked).toBe(false);
  });

  it("outra compra aberta: o estado inicial dela vale", async () => {
    const f = abrir(compraTeste({ localAplicacao: "X", entrega: "X" }));
    expect(q<HTMLInputElement>("#compra-entrega-mesmo-local")!.checked).toBe(true);
    await f.trocarCompra(compraTeste({ id: "cmp_2", localAplicacao: "A", entrega: "B" }));
    expect(q<HTMLInputElement>("#compra-entrega-mesmo-local")!.checked).toBe(false);
    await f.trocarCompra(compraTeste({ id: "cmp_3", localAplicacao: "C", entrega: "C" }));
    expect(q<HTMLInputElement>("#compra-entrega-mesmo-local")!.checked).toBe(true);
  });

  it("se a entrega mudar por fora e deixar de ser igual ao local (carregar a versão salva), a caixa desmarca (não mente)", async () => {
    const f = abrir(compraTeste({ localAplicacao: "X", entrega: "X" }));
    await f.trocarCompra(compraTeste({ localAplicacao: "X", entrega: "Y" }));
    expect(q<HTMLInputElement>("#compra-entrega-mesmo-local")!.checked).toBe(false);
    expect(q<HTMLInputElement>("#compra-entrega")!.disabled).toBe(false);
  });

  it("os limites do servidor (300) valem nos campos", () => {
    abrir(compraTeste());
    expect(q<HTMLInputElement>("#compra-local")!.maxLength).toBe(300);
    expect(q<HTMLInputElement>("#compra-entrega")!.maxLength).toBe(300);
  });

  it("somente leitura: todos desabilitados", () => {
    abrir(compraTeste({ localAplicacao: "X", entrega: "X" }), { podeEditar: false });
    for (const id of ["#compra-local", "#compra-local-declarado", "#compra-entrega-mesmo-local", "#compra-entrega", "#compra-contatos"]) {
      expect(q<HTMLInputElement>(id)!.disabled, id).toBe(true);
    }
  });

  it("clicar na caixa pelo rótulo funciona (a caixa tem rótulo ligado)", async () => {
    const f = abrir(compraTeste({ localAplicacao: "Clínica A" }));
    await clicar("#compra-entrega-mesmo-local");
    expect(f.compra.value.entrega).toBe("Clínica A");
  });
});

describe("bloco Contatos", () => {
  it("é um textarea, grava o texto e respeita o limite do servidor", async () => {
    const f = abrir(compraTeste());
    const campo = q<HTMLTextAreaElement>("#compra-contatos")!;
    expect(campo.tagName).toBe("TEXTAREA");
    expect(campo.maxLength).toBe(300);
    await digitar("#compra-contatos", "Fulano 11 90000-0000\nciclana@teste.com");
    expect(f.compra.value.contatos).toBe("Fulano 11 90000-0000\nciclana@teste.com");
  });

  it("é o ÚLTIMO bloco do formulário", () => {
    abrir(compraTeste());
    const ids = qa("[data-bloco]").map((b) => b.getAttribute("data-bloco"));
    expect(ids.at(-1)).toBe("contatos");
    expect(ids.at(-2)).toBe("local_entrega");
  });
});
