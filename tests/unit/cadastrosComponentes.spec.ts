// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";
import type { Cadastro, CiaAerea, Despachante, Fornecedor, ListaCadastro, Transportadora } from "../../shared/types/Cadastro";
import CadastroPainel from "../../app/components/configuracoes/CadastroPainel.vue";
import CadastroSecao from "../../app/components/configuracoes/CadastroSecao.vue";
import CadastroSwitch from "../../app/components/configuracoes/CadastroSwitch.vue";

// Componentes reais no happy-dom: o PAINEL lateral de criar/editar (nome desabilitado ao editar, alerta sem padrão,
// duplicado e "Reativar", chave PIX oculta com Mostrar/Copiar), a SEÇÃO recolhível (cabeçalho, tabela, itens do celular,
// chave Ativo) e a chave Ativo. Valores de PIX fictícios; a chave nunca pode aparecer em texto de tela nem em aviso.

const BASE = { id: "x", ativo: true, atualizadoPor: "", createdAt: "", updatedAt: "" };
const PIX = "chave-ficticia-componente-0001";
const PIX2 = "chave-ficticia-componente-0002";
const forn = (e: Partial<Fornecedor> = {}): Fornecedor => ({ ...BASE, nome: "Poros", pais: "Turquia", prazoAlertaDias: 3, semAlerta: false, ...e });
const desp = (e: Partial<Despachante> = {}): Despachante => ({ ...BASE, nome: "STAR CUSTOMS", contatoNome: "", telefone: "", email: "", ...e });
const transp = (e: Partial<Transportadora> = {}): Transportadora => ({ ...BASE, nome: "DHL", ...e });
const cia = (e: Partial<CiaAerea> = {}): CiaAerea => ({ ...BASE, nome: "Ambiente", ...e });

const montados: Array<{ unmount: () => void; el: HTMLElement }> = [];
function montar(componente: ReturnType<typeof defineComponent>): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(componente);
  app.mount(el);
  montados.push({ unmount: () => app.unmount(), el });
  return el;
}
afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const texto = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const q = <T extends Element>(sel: string) => document.querySelector<T>(sel);

interface Eventos {
  criar: unknown[];
  atualizar: unknown[][];
  reativar: Cadastro[];
  avisos: string[];
  close: number;
}

function abrirPainel(props: { lista: ListaCadastro; editando?: Cadastro | null; existentes?: Cadastro[]; busy?: boolean; podeVerPix?: boolean }): Eventos {
  const ev: Eventos = { criar: [], atualizar: [], reativar: [], avisos: [], close: 0 };
  montar(
    defineComponent({
      render: () =>
        h(CadastroPainel, {
          lista: props.lista,
          editando: props.editando ?? null,
          existentes: props.existentes ?? [],
          busy: props.busy ?? false,
          podeVerPix: props.podeVerPix ?? false,
          onCriar: (p: unknown) => ev.criar.push(p),
          onAtualizar: (...a: unknown[]) => ev.atualizar.push(a),
          onReativar: (i: Cadastro) => ev.reativar.push(i),
          onAviso: (m: string) => ev.avisos.push(m),
          onClose: () => (ev.close += 1),
        }),
    }),
  );
  return ev;
}

async function digitar(sel: string, valor: string): Promise<void> {
  const input = q<HTMLInputElement>(sel)!;
  input.value = valor;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
}

async function marcar(sel: string): Promise<void> {
  const radio = q<HTMLInputElement>(sel)!;
  radio.checked = true;
  radio.dispatchEvent(new Event("change", { bubbles: true }));
  await nextTick();
}

async function enviar(): Promise<void> {
  q<HTMLFormElement>("#cadastro-form")!.dispatchEvent(new Event("submit", { cancelable: true }));
  await nextTick();
}

const textoDaTela = () => document.body.innerHTML;

describe("CadastroPainel — aparência e fechamento", () => {
  it("é um painel à direita: 600px em lg+, tela cheia abaixo, sobre o overlay, com z-index 880 e role dialog", () => {
    abrirPainel({ lista: "cias-aereas" });
    const overlay = q<HTMLElement>("#cadastro-painel-overlay")!;
    expect(overlay.className).toContain("z-[880]");
    expect(overlay.className).toContain("justify-end");
    expect(overlay.className).toContain("bg-ink/40");
    const painel = q<HTMLElement>("#cadastro-painel")!;
    expect(painel.getAttribute("role")).toBe("dialog");
    expect(painel.getAttribute("aria-modal")).toBe("true");
    expect(painel.getAttribute("aria-labelledby")).toBe("cadastro-painel-titulo");
    expect(painel.className).toContain("w-full");
    expect(painel.className).toContain("lg:w-[600px]");
    expect(painel.className).toContain("h-dvh");
  });

  it("título com o gênero certo ao criar e ao editar", () => {
    abrirPainel({ lista: "transportadoras" });
    expect(texto(q("#cadastro-painel-titulo"))).toBe("Nova transportadora");
    document.body.innerHTML = "";
    abrirPainel({ lista: "fornecedores", editando: forn() });
    expect(texto(q("#cadastro-painel-titulo"))).toBe("Editar fornecedor");
  });

  it("fecha pelo X, por Cancelar, pelo overlay e pelo Esc (e o clique DENTRO do painel não fecha)", async () => {
    const ev = abrirPainel({ lista: "cias-aereas" });
    q<HTMLButtonElement>("#btn-painel-cadastro-fechar")!.click();
    q<HTMLButtonElement>("#btn-cadastro-cancelar")!.click();
    q<HTMLElement>("#cadastro-painel-overlay")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(ev.close).toBe(3);
    q<HTMLElement>("#cadastro-painel")!.click();
    expect(ev.close).toBe(3);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(ev.close).toBe(4);
  });

  it("o foco entra no primeiro campo editável (o nome, ao criar)", async () => {
    abrirPainel({ lista: "cias-aereas" });
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement?.id).toBe("cadastro-form-nome");
  });

  it("foco preso: Tab no último elemento volta ao primeiro; Shift+Tab no primeiro vai ao último", async () => {
    abrirPainel({ lista: "cias-aereas" });
    const focaveis = [...document.querySelectorAll<HTMLElement>("#cadastro-painel button, #cadastro-painel input")].filter(
      (el) => !(el as HTMLButtonElement).disabled,
    );
    const primeiro = focaveis[0]!;
    const ultimo = focaveis[focaveis.length - 1]!;
    ultimo.focus();
    ultimo.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(primeiro);
    primeiro.focus();
    primeiro.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(ultimo);
  });
});

describe("CadastroPainel — criar fornecedor", () => {
  it("o alerta nasce SEM nada selecionado e o formulário não salva sem decidir", async () => {
    const ev = abrirPainel({ lista: "fornecedores" });
    expect(q<HTMLInputElement>("#cadastro-form-alerta-dias")!.checked).toBe(false);
    expect(q<HTMLInputElement>("#cadastro-form-alerta-sem")!.checked).toBe(false);
    expect(q("#cadastro-form-prazo")).toBeNull(); // o campo de dias só aparece ao escolher "Número de dias"
    expect(q("#cadastro-form-alerta-dica")).not.toBeNull();

    await digitar("#cadastro-form-nome", "Matsun");
    await enviar();
    expect(ev.criar).toHaveLength(0);
    expect(ev.avisos[0]).toMatch(/Defina o alerta/);
  });

  it("'Número de dias' mostra o campo; dias fora de 1–365 são recusados; válidos criam o item", async () => {
    const ev = abrirPainel({ lista: "fornecedores" });
    await digitar("#cadastro-form-nome", "Matsun");
    await marcar("#cadastro-form-alerta-dias");
    const prazo = q<HTMLInputElement>("#cadastro-form-prazo")!;
    expect(prazo.min).toBe("1");
    expect(prazo.max).toBe("365");

    await digitar("#cadastro-form-prazo", "400");
    await enviar();
    expect(ev.criar).toHaveLength(0);
    expect(ev.avisos.at(-1)).toMatch(/1 a 365/);

    await digitar("#cadastro-form-prazo", "7");
    await enviar();
    expect(ev.criar).toEqual([{ nome: "Matsun", pais: "", semAlerta: false, prazoAlertaDias: 7 }]);
  });

  it("'Sem alerta' (marcado de propósito) cria com prazo vazio; o país é opcional", async () => {
    const ev = abrirPainel({ lista: "fornecedores" });
    await digitar("#cadastro-form-nome", "Matsun");
    await digitar("#cadastro-form-pais", "Japão");
    await marcar("#cadastro-form-alerta-sem");
    await enviar();
    expect(ev.criar).toEqual([{ nome: "Matsun", pais: "Japão", semAlerta: true, prazoAlertaDias: null }]);
    expect(ev.avisos).toEqual([]);
  });
});

describe("CadastroPainel — nome repetido e reservado", () => {
  it("duplicado ATIVO: aviso e botão de criar desabilitado", async () => {
    const ev = abrirPainel({ lista: "cias-aereas", existentes: [cia({ id: "a", nome: "Ambiente" })] });
    await digitar("#cadastro-form-nome", "  ambiente ");
    expect(texto(q("#cadastro-form-aviso-duplicado"))).toMatch(/Já existe "Ambiente"/);
    expect(q("#btn-cadastro-reativar-duplicado")).toBeNull();
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
    await enviar();
    expect(ev.criar).toHaveLength(0);
  });

  it("duplicado INATIVO: oferece 'Reativar' (emite reativar com o item) e não deixa criar outro", async () => {
    const inativo = cia({ id: "b", nome: "Congelado", ativo: false });
    const ev = abrirPainel({ lista: "cias-aereas", existentes: [inativo] });
    await digitar("#cadastro-form-nome", "CONGELADO");
    expect(texto(q("#cadastro-form-aviso-duplicado"))).toMatch(/\(inativo\).*Reative/);
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
    q<HTMLButtonElement>("#btn-cadastro-reativar-duplicado")!.click();
    expect(ev.reativar).toEqual([inativo]);
    expect(ev.criar).toHaveLength(0);
  });

  it('"Outro" é nome reservado: aviso e criar desabilitado', async () => {
    abrirPainel({ lista: "transportadoras" });
    await digitar("#cadastro-form-nome", "outro");
    expect(q("#cadastro-form-aviso-reservado")).not.toBeNull();
    expect(q<HTMLButtonElement>("#btn-cadastro-salvar")!.disabled).toBe(true);
  });

  it("transportadora duplicada (outra grafia) também avisa", async () => {
    abrirPainel({ lista: "transportadoras", existentes: [transp({ id: "t1", nome: "FedEx" })] });
    await digitar("#cadastro-form-nome", "fedex");
    expect(texto(q("#cadastro-form-aviso-duplicado"))).toMatch(/Já existe "FedEx"/);
  });
});

describe("CadastroPainel — editar (o nome fica desabilitado)", () => {
  it("o campo de nome existe, desabilitado, com o valor e a dica de que não muda", () => {
    abrirPainel({ lista: "fornecedores", editando: forn() });
    const nome = q<HTMLInputElement>("#cadastro-form-nome")!;
    expect(nome.disabled).toBe(true);
    expect(nome.value).toBe("Poros");
    expect(nome.getAttribute("aria-describedby")).toBe("cadastro-form-nome-dica");
    expect(texto(q("#cadastro-form-nome-dica"))).toMatch(/O nome não pode ser alterado/);
  });

  it("carrega país e alerta do item e o PATCH não leva o nome", async () => {
    const ev = abrirPainel({ lista: "fornecedores", editando: forn({ id: "f1" }) });
    expect(q<HTMLInputElement>("#cadastro-form-pais")!.value).toBe("Turquia");
    expect(q<HTMLInputElement>("#cadastro-form-alerta-dias")!.checked).toBe(true);
    expect(q<HTMLInputElement>("#cadastro-form-prazo")!.value).toBe("3");

    await digitar("#cadastro-form-prazo", "10");
    await enviar();
    expect(ev.atualizar).toEqual([["f1", { pais: "Turquia", semAlerta: false, prazoAlertaDias: 10 }]]);
  });

  it("item inativo mostra (inativo) na dica e nome igual a outro item não dá aviso de duplicado ao editar", () => {
    abrirPainel({ lista: "fornecedores", editando: forn({ ativo: false }), existentes: [forn()] });
    expect(texto(q("#cadastro-form-nome-dica"))).toContain("(inativo)");
    expect(q("#cadastro-form-aviso-duplicado")).toBeNull();
  });

  it("despachante: contato, telefone e e-mail (formato validado só se preenchido)", async () => {
    const ev = abrirPainel({ lista: "despachantes", editando: desp({ id: "d1" }) });
    expect(q("#cadastro-form-contato")).not.toBeNull();
    await digitar("#cadastro-form-email", "ruim");
    await enviar();
    expect(ev.atualizar).toHaveLength(0);
    expect(ev.avisos.at(-1)).toMatch(/e-mail/i);
    await digitar("#cadastro-form-email", "");
    await digitar("#cadastro-form-telefone", "11 3333-4444");
    await enviar();
    expect(ev.atualizar).toEqual([["d1", { contatoNome: "", telefone: "11 3333-4444", email: "" }]]);
  });

  it("cia aérea: só o nome. Editar mostra a nota, sem Salvar, e o botão vira 'Fechar'", () => {
    const ev = abrirPainel({ lista: "cias-aereas", editando: cia({ id: "c1" }) });
    expect(q("#cadastro-form-pais")).toBeNull();
    expect(q("#cadastro-form-contato")).toBeNull();
    expect(q("#cadastro-form-alerta")).toBeNull();
    expect(q("#cadastro-form-pix-bloco")).toBeNull();
    expect(texto(q("#cadastro-form-so-nome"))).toMatch(/chave Ativo/);
    expect(q("#btn-cadastro-salvar")).toBeNull();
    expect(texto(q("#btn-cadastro-cancelar"))).toBe("Fechar");
    q<HTMLButtonElement>("#btn-cadastro-cancelar")!.click();
    expect(ev.close).toBe(1);
  });

  it("temperatura (ponto silencioso 5): só o nome, que não muda. Editar mostra a nota, nome travado, sem Salvar; criar é o painel do nome", () => {
    const ev = abrirPainel({ lista: "temperaturas", editando: cia({ id: "p1", nome: "2°C a 8°C" }) });
    expect(texto(q("#cadastro-painel-titulo"))).toBe("Editar temperatura");
    expect(q<HTMLInputElement>("#cadastro-form-nome")!.disabled).toBe(true);
    expect(q("#cadastro-form-pais")).toBeNull();
    expect(q("#cadastro-form-pix-bloco")).toBeNull();
    expect(texto(q("#cadastro-form-so-nome"))).toMatch(/ele não muda.*chave Ativo/);
    expect(q("#btn-cadastro-salvar")).toBeNull();
    expect(texto(q("#btn-cadastro-cancelar"))).toBe("Fechar");
    q<HTMLButtonElement>("#btn-cadastro-cancelar")!.click();
    expect(ev.close).toBe(1);
  });

  it("temperatura nova: título 'Nova temperatura', nome editável e 'Criar'", () => {
    abrirPainel({ lista: "temperaturas" });
    expect(texto(q("#cadastro-painel-titulo"))).toBe("Nova temperatura");
    expect(q<HTMLInputElement>("#cadastro-form-nome")!.disabled).toBe(false);
    expect(texto(q("#btn-cadastro-salvar"))).toBe("Criar");
  });
});

describe("CadastroPainel — chave PIX (dado financeiro)", () => {
  it("quem NÃO recebe a chave não vê o campo, nem em despachante nem em transportadora, e o corpo não a leva", async () => {
    const ev = abrirPainel({ lista: "despachantes", podeVerPix: false });
    expect(q("#cadastro-form-pix-bloco")).toBeNull();
    expect(q("#cadastro-form-pix")).toBeNull();
    await digitar("#cadastro-form-nome", "STAR CUSTOMS");
    await enviar();
    expect(JSON.stringify(ev.criar)).not.toContain("chavePix\":\"" + PIX);
    document.body.innerHTML = "";
    abrirPainel({ lista: "transportadoras", podeVerPix: false });
    expect(q("#cadastro-form-pix-bloco")).toBeNull();
  });

  it("fornecedor e cia aérea nunca têm o campo, mesmo com permissão", () => {
    abrirPainel({ lista: "fornecedores", podeVerPix: true });
    expect(q("#cadastro-form-pix-bloco")).toBeNull();
    document.body.innerHTML = "";
    abrirPainel({ lista: "cias-aereas", podeVerPix: true });
    expect(q("#cadastro-form-pix-bloco")).toBeNull();
  });

  it("o campo vem OCULTO (password), sem maiúscula automática, sem preenchimento do navegador e com limite de 140", () => {
    abrirPainel({ lista: "transportadoras", editando: transp({ id: "t1", chavePix: PIX }), podeVerPix: true });
    const campo = q<HTMLInputElement>("#cadastro-form-pix")!;
    expect(campo.type).toBe("password");
    expect(campo.value).toBe(PIX);
    expect(campo.hasAttribute("data-sem-maiuscula")).toBe(true);
    expect(campo.getAttribute("autocomplete")).toBe("off");
    expect(campo.maxLength).toBe(140);
    // Nada na tela mostra a chave em texto (o valor fica só no value do input oculto).
    expect(texto(q("#cadastro-painel"))).not.toContain(PIX);
  });

  it("Mostrar/Ocultar alterna o tipo do campo, o texto do botão e o aria-pressed", async () => {
    abrirPainel({ lista: "despachantes", editando: desp({ id: "d1", chavePix: PIX }), podeVerPix: true });
    const botao = q<HTMLButtonElement>("#btn-cadastro-pix-mostrar")!;
    expect(texto(botao)).toBe("Mostrar");
    expect(botao.getAttribute("aria-pressed")).toBe("false");
    expect(botao.getAttribute("aria-controls")).toBe("cadastro-form-pix");
    botao.click();
    await nextTick();
    expect(q<HTMLInputElement>("#cadastro-form-pix")!.type).toBe("text");
    expect(texto(botao)).toBe("Ocultar");
    expect(botao.getAttribute("aria-pressed")).toBe("true");
    botao.click();
    await nextTick();
    expect(q<HTMLInputElement>("#cadastro-form-pix")!.type).toBe("password");
    expect(texto(botao)).toBe("Mostrar");
  });

  it("Copiar põe a chave na área de transferência e avisa SEM repetir a chave; vazio, o botão fica desabilitado", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const ev = abrirPainel({ lista: "transportadoras", editando: transp({ id: "t1", chavePix: PIX }), podeVerPix: true });
    q<HTMLButtonElement>("#btn-cadastro-pix-copiar")!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(writeText).toHaveBeenCalledWith(PIX);
    expect(ev.avisos).toEqual(["Chave PIX copiada."]);
    expect(ev.avisos.join(" ")).not.toContain(PIX);

    await digitar("#cadastro-form-pix", "");
    expect(q<HTMLButtonElement>("#btn-cadastro-pix-copiar")!.disabled).toBe(true);
  });

  it("falha ao copiar: aviso genérico, sem a chave", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error(`negado ${PIX}`)) } });
    const ev = abrirPainel({ lista: "transportadoras", editando: transp({ id: "t1", chavePix: PIX }), podeVerPix: true });
    q<HTMLButtonElement>("#btn-cadastro-pix-copiar")!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(ev.avisos).toHaveLength(1);
    expect(ev.avisos[0]).toMatch(/Não foi possível copiar/);
    expect(ev.avisos[0]).not.toContain(PIX);
  });

  it("sem área de transferência (navegador sem clipboard): mesmo aviso", async () => {
    vi.stubGlobal("navigator", {});
    const ev = abrirPainel({ lista: "despachantes", editando: desp({ id: "d1", chavePix: PIX }), podeVerPix: true });
    q<HTMLButtonElement>("#btn-cadastro-pix-copiar")!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(ev.avisos[0]).toMatch(/Não foi possível copiar/);
  });

  it("criar transportadora com chave: a chave aparada vai no corpo", async () => {
    const ev = abrirPainel({ lista: "transportadoras", podeVerPix: true });
    await digitar("#cadastro-form-nome", "Fast Log");
    await digitar("#cadastro-form-pix", `  ${PIX}  `);
    await enviar();
    expect(ev.criar).toEqual([{ nome: "Fast Log", chavePix: PIX }]);
  });

  it("chave com mais de 140 caracteres: recusada, e o aviso NÃO cita a chave", async () => {
    const ev = abrirPainel({ lista: "transportadoras", podeVerPix: true });
    await digitar("#cadastro-form-nome", "Fast Log");
    // O maxlength do input corta na digitação do usuário; aqui o valor é injetado direto para provar a validação.
    q<HTMLInputElement>("#cadastro-form-pix")!.removeAttribute("maxlength");
    await digitar("#cadastro-form-pix", `${PIX}-${"q".repeat(150)}`);
    await enviar();
    expect(ev.criar).toHaveLength(0);
    expect(ev.avisos).toHaveLength(1);
    expect(ev.avisos[0]).not.toContain("qqqq");
    expect(ev.avisos[0]).not.toContain(PIX);
  });

  it("editar transportadora: só a chave muda; igual ao que está gravado não envia nada; vazio limpa", async () => {
    const ev = abrirPainel({ lista: "transportadoras", editando: transp({ id: "t1", chavePix: PIX }), podeVerPix: true });
    await enviar(); // nada mudou
    expect(ev.atualizar).toHaveLength(0);
    expect(ev.avisos.at(-1)).toMatch(/Nenhuma alteração/);

    await digitar("#cadastro-form-pix", PIX2);
    await enviar();
    expect(ev.atualizar).toEqual([["t1", { chavePix: PIX2 }]]);

    await digitar("#cadastro-form-pix", "");
    await enviar();
    expect(ev.atualizar.at(-1)).toEqual(["t1", { chavePix: "" }]);
  });

  it("editar despachante: a chave só vai no PATCH quando muda", async () => {
    const original = desp({ id: "d1", contatoNome: "Fulano", chavePix: PIX });
    const ev = abrirPainel({ lista: "despachantes", editando: original, podeVerPix: true });
    await enviar();
    expect(ev.atualizar).toEqual([["d1", { contatoNome: "Fulano", telefone: "", email: "" }]]);
    await digitar("#cadastro-form-pix", PIX2);
    await enviar();
    expect(ev.atualizar.at(-1)).toEqual(["d1", { contatoNome: "Fulano", telefone: "", email: "", chavePix: PIX2 }]);
  });

  it("transportadora para quem NÃO vê a chave: editar é só leitura (nota, sem Salvar)", () => {
    abrirPainel({ lista: "transportadoras", editando: transp({ id: "t1" }), podeVerPix: false });
    expect(q("#cadastro-form-pix-bloco")).toBeNull();
    expect(q("#btn-cadastro-salvar")).toBeNull();
    expect(texto(q("#cadastro-form-so-nome"))).toMatch(/chave Ativo/);
  });

  it("a chave não aparece em nenhum lugar do HTML do painel como texto (só no value do input)", () => {
    abrirPainel({ lista: "despachantes", editando: desp({ id: "d1", chavePix: PIX }), podeVerPix: true });
    const html = textoDaTela().replace(/value="[^"]*"/g, "");
    expect(html).not.toContain(PIX);
  });
});

describe("CadastroSwitch", () => {
  function chave(props: { valor: boolean; disabled?: boolean }): { eventos: boolean[] } {
    const eventos: boolean[] = [];
    montar(
      defineComponent({
        render: () =>
          h(CadastroSwitch, {
            id: "sw",
            modelValue: props.valor,
            label: "Ativo: Poros",
            disabled: props.disabled ?? false,
            onAlternar: (v: boolean) => eventos.push(v),
          }),
      }),
    );
    return { eventos };
  }

  it("role switch, aria-checked e aria-label com o nome; o clique pede o valor oposto", () => {
    const ligado = chave({ valor: true });
    const botao = q<HTMLButtonElement>("#sw")!;
    expect(botao.getAttribute("role")).toBe("switch");
    expect(botao.getAttribute("aria-checked")).toBe("true");
    expect(botao.getAttribute("aria-label")).toBe("Ativo: Poros");
    botao.click();
    expect(ligado.eventos).toEqual([false]);
    document.body.innerHTML = "";
    const desligado = chave({ valor: false });
    const b2 = q<HTMLButtonElement>("#sw")!;
    expect(b2.getAttribute("aria-checked")).toBe("false");
    b2.click();
    expect(desligado.eventos).toEqual([true]);
  });

  it("desabilitado não emite; o clique não sobe para o elemento de fora", () => {
    const { eventos } = chave({ valor: true, disabled: true });
    q<HTMLButtonElement>("#sw")!.click();
    expect(eventos).toEqual([]);

    document.body.innerHTML = "";
    let subiu = 0;
    const el = document.createElement("div");
    el.addEventListener("click", () => (subiu += 1));
    document.body.appendChild(el);
    const app = createApp(defineComponent({ render: () => h(CadastroSwitch, { id: "sw2", modelValue: true, label: "Ativo: X" }) }));
    app.mount(el);
    montados.push({ unmount: () => app.unmount(), el });
    q<HTMLButtonElement>("#sw2")!.click();
    expect(subiu).toBe(0);
  });
});

describe("CadastroSecao", () => {
  interface EventosSecao {
    alternar: number;
    adicionar: number;
    abrir: Cadastro[];
    ativo: Array<[Cadastro, boolean]>;
  }

  function secao(
    lista: ListaCadastro,
    itens: Cadastro[],
    opcoes: {
      aberta?: boolean;
      visiveis?: Cadastro[];
      buscaAtiva?: boolean;
      podeEditar?: boolean;
      podeVerPix?: boolean;
      carregando?: boolean;
      pendentes?: Record<string, boolean>;
    } = {},
  ): EventosSecao {
    const ev: EventosSecao = { alternar: 0, adicionar: 0, abrir: [], ativo: [] };
    montar(
      defineComponent({
        render: () =>
          h(CadastroSecao, {
            lista,
            itens,
            visiveis: opcoes.visiveis ?? itens,
            aberta: opcoes.aberta ?? true,
            buscaAtiva: opcoes.buscaAtiva ?? false,
            carregando: opcoes.carregando ?? false,
            podeEditar: opcoes.podeEditar ?? true,
            podeVerPix: opcoes.podeVerPix ?? false,
            pendentes: opcoes.pendentes ?? {},
            onAlternar: () => (ev.alternar += 1),
            onAdicionar: () => (ev.adicionar += 1),
            onAbrir: (i: Cadastro) => ev.abrir.push(i),
            onAtivo: (i: Cadastro, v: boolean) => ev.ativo.push([i, v]),
          }),
      }),
    );
    return ev;
  }

  it("cabeçalho: título, contagem '13 · 13 ativos', '+ Adicionar' e a seta; o botão do título tem aria-expanded e aria-controls", () => {
    const treze = Array.from({ length: 13 }, (_, i) => forn({ id: `f${i}`, nome: `Forn ${i}` }));
    secao("fornecedores", treze, { aberta: false });
    expect(texto(q("#cadastro-titulo-fornecedores"))).toBe("Fornecedores");
    expect(texto(q("#cadastro-contagem-fornecedores"))).toBe("13 · 13 ativos");
    expect(texto(q("#btn-adicionar-cadastro-fornecedores"))).toBe("+ Adicionar");
    const titulo = q<HTMLButtonElement>("#btn-secao-fornecedores")!;
    expect(titulo.getAttribute("aria-expanded")).toBe("false");
    expect(titulo.getAttribute("aria-controls")).toBe("cadastro-corpo-fornecedores");
    expect(q<HTMLElement>("#cadastro-corpo-fornecedores")!.hasAttribute("hidden")).toBe(true);
    expect(q("#cadastro-corpo-fornecedores")!.id).toBe(titulo.getAttribute("aria-controls"));
  });

  it("aberta: aria-expanded true e o corpo sem hidden; o título e a seta emitem alternar; adicionar não alterna", () => {
    const ev = secao("cias-aereas", [cia({ id: "c1" })], { aberta: true });
    expect(q("#btn-secao-cias-aereas")!.getAttribute("aria-expanded")).toBe("true");
    expect(q<HTMLElement>("#cadastro-corpo-cias-aereas")!.hasAttribute("hidden")).toBe(false);
    q<HTMLButtonElement>("#btn-secao-cias-aereas")!.click();
    expect(ev.alternar).toBe(1);
    q<HTMLButtonElement>("#cadastro-secao-cias-aereas header button[aria-hidden='true']")!.click();
    expect(ev.alternar).toBe(2);
    q<HTMLButtonElement>("#btn-adicionar-cadastro-cias-aereas")!.click();
    expect(ev.adicionar).toBe(1);
    expect(ev.alternar).toBe(2);
  });

  it("o título é um h2 com o botão DENTRO (padrão de acordeão); a contagem descreve o botão; a seta não é focável", () => {
    secao("fornecedores", [forn({ id: "f1" })], { aberta: false });
    const titulo = q<HTMLElement>("#cadastro-titulo-fornecedores")!;
    expect(titulo.tagName).toBe("H2");
    expect(titulo.querySelector("#btn-secao-fornecedores")).not.toBeNull();
    expect(texto(titulo)).toBe("Fornecedores"); // só o título: a contagem fica fora do h2
    expect(q("#btn-secao-fornecedores")!.getAttribute("aria-describedby")).toBe("cadastro-contagem-fornecedores");
    expect(q("#btn-secao-fornecedores")!.closest("button button")).toBeNull(); // nenhum botão dentro de botão
    expect(q("#btn-secao-fornecedores h2")).toBeNull(); // nenhum h2 dentro do botão
  });

  it("clicar na contagem ou no espaço do cabeçalho também alterna (atalho do mouse)", () => {
    const ev = secao("fornecedores", [forn({ id: "f1" })], { aberta: false });
    q<HTMLElement>("#cadastro-contagem-fornecedores")!.click();
    expect(ev.alternar).toBe(1);
    q<HTMLElement>("#cadastro-secao-fornecedores header div[aria-hidden='true']")!.click();
    expect(ev.alternar).toBe(2);
  });

  it("a seta é só um atalho do mouse: fora da ordem do Tab e escondida do leitor de tela", () => {
    secao("cias-aereas", []);
    const seta = q<HTMLButtonElement>("#cadastro-secao-cias-aereas header button[aria-hidden='true']")!;
    expect(seta.getAttribute("tabindex")).toBe("-1");
  });

  it("contagem com inativos e com busca ('N encontrados', destacada)", () => {
    const itens = [cia({ id: "a", nome: "A" }), cia({ id: "b", nome: "B", ativo: false }), cia({ id: "c", nome: "C" })];
    secao("cias-aereas", itens);
    expect(texto(q("#cadastro-contagem-cias-aereas"))).toBe("3 · 2 ativos");
    document.body.innerHTML = "";
    secao("cias-aereas", itens, { buscaAtiva: true, visiveis: [itens[0]!] });
    const contagem = q<HTMLElement>("#cadastro-contagem-cias-aereas")!;
    expect(texto(contagem)).toBe("1 encontrado");
    expect(contagem.className).toContain("font-semibold");
    expect(contagem.className).toContain("bg-farm-blue-soft");
  });

  it("colunas da tabela por lista", () => {
    const titulos = (lista: string) => [...document.querySelectorAll(`#cadastro-lista-${lista} thead th`)].map((th) => texto(th));
    secao("fornecedores", [forn({ id: "f1" })]);
    expect(titulos("fornecedores")).toEqual(["Nome", "País", "Prazo de alerta", "Ativo"]);
    document.body.innerHTML = "";
    secao("despachantes", [desp({ id: "d1" })], { podeVerPix: true });
    expect(titulos("despachantes")).toEqual(["Nome", "Contato", "Telefone", "E-mail", "PIX", "Ativo"]);
    document.body.innerHTML = "";
    secao("despachantes", [desp({ id: "d1" })], { podeVerPix: false });
    expect(titulos("despachantes")).toEqual(["Nome", "Contato", "Telefone", "E-mail", "Ativo"]);
    document.body.innerHTML = "";
    secao("transportadoras", [transp({ id: "t1" })], { podeVerPix: true });
    expect(titulos("transportadoras")).toEqual(["Nome", "PIX", "Ativo"]);
    document.body.innerHTML = "";
    secao("transportadoras", [transp({ id: "t1" })], { podeVerPix: false });
    expect(titulos("transportadoras")).toEqual(["Nome", "Ativo"]);
    document.body.innerHTML = "";
    secao("cias-aereas", [cia({ id: "c1" })], { podeVerPix: true });
    expect(titulos("cias-aereas")).toEqual(["Nome", "Ativo"]);
  });

  it("linhas: dados do fornecedor; inativo ao final com (inativo) e esmaecido", () => {
    secao("fornecedores", [forn({ id: "f1" }), forn({ id: "f2", nome: "Zeta", ativo: false, semAlerta: true, prazoAlertaDias: null, pais: "" })]);
    const f1 = texto(q("#cadastro-row-fornecedores-f1"));
    expect(f1).toContain("Poros");
    expect(f1).toContain("Turquia");
    expect(f1).toContain("3 dias");
    const f2 = q("#cadastro-row-fornecedores-f2")!;
    expect(texto(f2)).toContain("(inativo)");
    expect(texto(f2)).toContain("Sem alerta");
    expect(f2.querySelector("td")!.className).toContain("opacity-60");
    expect(q("#cadastro-row-fornecedores-f1 td")!.className).not.toContain("opacity-60");
    const ordem = [...document.querySelectorAll("#cadastro-lista-fornecedores tbody tr")].map((tr) => tr.id);
    expect(ordem).toEqual(["cadastro-row-fornecedores-f1", "cadastro-row-fornecedores-f2"]);
  });

  it("coluna PIX: 'Cadastrada' ou '—', NUNCA a chave", () => {
    secao("despachantes", [desp({ id: "d1", nome: "Com", chavePix: PIX }), desp({ id: "d2", nome: "Sem", chavePix: "" })], { podeVerPix: true });
    expect(texto(q("#cadastro-row-despachantes-d1"))).toContain("Cadastrada");
    expect(texto(q("#cadastro-row-despachantes-d2"))).not.toContain("Cadastrada");
    expect(texto(q("#cadastro-row-despachantes-d2"))).toContain("—");
    expect(textoDaTela()).not.toContain(PIX);
  });

  it("sem permissão para ver a chave: nenhuma coluna PIX e nenhum 'PIX cadastrada' no celular", () => {
    secao("transportadoras", [transp({ id: "t1", chavePix: PIX })], { podeVerPix: false });
    expect(texto(q("#cadastro-corpo-transportadoras"))).not.toContain("Cadastrada");
    expect(texto(q("#cadastro-corpo-transportadoras"))).not.toContain("PIX");
    expect(textoDaTela()).not.toContain(PIX);
  });

  it("celular: item de duas linhas (nome; país/prazo, contato ou 'PIX cadastrada') com a chave Ativo à direita", () => {
    secao("fornecedores", [forn({ id: "f1" })]);
    const card = q("#cadastro-card-fornecedores-f1")!;
    expect(texto(card)).toContain("Poros");
    expect(texto(card)).toContain("Turquia · 3 dias");
    expect(card.querySelector("[role='switch']")).not.toBeNull();
    document.body.innerHTML = "";
    secao("despachantes", [desp({ id: "d1", contatoNome: "Fulano", chavePix: PIX })], { podeVerPix: true });
    expect(texto(q("#cadastro-card-despachantes-d1"))).toContain("Fulano · PIX cadastrada");
    document.body.innerHTML = "";
    secao("transportadoras", [transp({ id: "t1", chavePix: PIX })], { podeVerPix: true });
    expect(texto(q("#cadastro-card-transportadoras-t1"))).toContain("PIX cadastrada");
    expect(textoDaTela()).not.toContain(PIX);
  });

  it("tabela e celular em contêiner por largura (700px): a tabela só aparece a partir dele; a lista some a partir dele", () => {
    secao("cias-aereas", [cia({ id: "c1" })]);
    expect(q("#cadastro-corpo-cias-aereas")!.className).toContain("@container");
    expect(q("#cadastro-lista-cias-aereas")!.className).toContain("hidden");
    expect(q("#cadastro-lista-cias-aereas")!.className).toContain("@[700px]:table");
    expect(q("#cadastro-corpo-cias-aereas ul")!.className).toContain("@[700px]:hidden");
  });

  it("chave Ativo: aria-label com o nome do item, aria-checked do estado, e o clique emite 'ativo' SEM abrir a linha", () => {
    const ev = secao("fornecedores", [forn({ id: "f1" })]);
    const chave = q<HTMLButtonElement>("#cadastro-switch-fornecedores-f1")!;
    expect(chave.getAttribute("aria-label")).toBe("Ativo: Poros");
    expect(chave.getAttribute("aria-checked")).toBe("true");
    chave.click();
    expect(ev.ativo.map(([i, v]) => [i.id, v])).toEqual([["f1", false]]);
    expect(ev.abrir).toEqual([]);
    const chaveCard = q<HTMLButtonElement>("#cadastro-switch-card-fornecedores-f1")!;
    expect(chaveCard.getAttribute("aria-label")).toBe("Ativo: Poros");
  });

  it("a chave responde na hora ao pedido pendente (otimista) e mostra o item inativo como desligado", () => {
    secao("fornecedores", [forn({ id: "f1" }), forn({ id: "f2", nome: "Zeta", ativo: false })], { pendentes: { "fornecedores:f1": false, "fornecedores:f2": true } });
    expect(q("#cadastro-switch-fornecedores-f1")!.getAttribute("aria-checked")).toBe("false"); // pedido: desativar
    expect(q("#cadastro-switch-fornecedores-f2")!.getAttribute("aria-checked")).toBe("true"); // pedido: reativar
    document.body.innerHTML = "";
    secao("fornecedores", [forn({ id: "f2", nome: "Zeta", ativo: false })]);
    expect(q("#cadastro-switch-fornecedores-f2")!.getAttribute("aria-checked")).toBe("false");
  });

  it("clicar na linha (ou no nome) abre o painel daquele item; o nome é um botão focável", () => {
    const item = forn({ id: "f1" });
    const ev = secao("fornecedores", [item]);
    q<HTMLElement>("#cadastro-row-fornecedores-f1")!.click();
    expect(ev.abrir).toEqual([item]);
    const nome = q<HTMLButtonElement>("#cadastro-abrir-fornecedores-f1")!;
    expect(nome.tagName).toBe("BUTTON");
    nome.click(); // o clique do botão sobe para a linha: uma abertura, não duas
    expect(ev.abrir).toHaveLength(2);
    q<HTMLElement>("#cadastro-card-fornecedores-f1")!.click();
    expect(ev.abrir).toHaveLength(3);
  });

  it("quem não edita: sem '+ Adicionar', sem chave Ativo, sem botão de abrir e a linha não abre nada", () => {
    const ev = secao("cias-aereas", [cia({ id: "c1" })], { podeEditar: false });
    expect(q("#btn-adicionar-cadastro-cias-aereas")).toBeNull();
    expect(q("[role='switch']")).toBeNull();
    expect(q("#cadastro-abrir-cias-aereas-c1")).toBeNull();
    q<HTMLElement>("#cadastro-row-cias-aereas-c1")!.click();
    expect(ev.abrir).toEqual([]);
    expect(texto(q("#cadastro-row-cias-aereas-c1"))).toContain("Ativo");
  });

  it("vazio, vazio com busca e carregando", () => {
    secao("cias-aereas", []);
    expect(texto(q("#cadastro-corpo-cias-aereas"))).toContain("Nenhum item cadastrado.");
    document.body.innerHTML = "";
    secao("cias-aereas", [cia({ id: "a" })], { buscaAtiva: true, visiveis: [] });
    expect(texto(q("#cadastro-corpo-cias-aereas"))).toContain("Nenhum item encontrado.");
    document.body.innerHTML = "";
    secao("cias-aereas", [], { carregando: true });
    expect(texto(q("#cadastro-contagem-cias-aereas"))).toBe("Carregando…");
    expect(texto(q("#cadastro-corpo-cias-aereas"))).toContain("Carregando…");
  });
});
