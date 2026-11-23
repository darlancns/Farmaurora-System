// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, type App } from "vue";
import { SECOES_COM_PERMISSAO, type Permissoes } from "../../shared/utils/permissoesPagina";
import { definirSecoesDesligadas, religarTodasAsSecoes } from "../../shared/utils/secoesDesligadas";
import {
  estaTudoNenhum,
  padraoDoCargo,
  permissoesParaEnvio,
  secoesNaTela,
  valoresDoMapa,
  valoresTudoNenhum,
} from "../../app/utils/contaPermissoesForm";
import { resumoImpactoRenomear, mensagemConfirmarRenomear, textoOndeRenomeiaConsultor } from "../../app/utils/cadastroConsultor";
import CompraColunaDireita from "../../app/components/compras/CompraColunaDireita.vue";
import PermissoesContaTabela from "../../app/components/configuracoes/PermissoesContaTabela.vue";
import { compraDeTeste } from "./helpers/montarFormulario";

// As telas com a DIR DESLIGADA (padrão do app sem NUXT_PUBLIC_DIR_HABILITADA=true). Cada teste desliga a chave e o afterEach religa
// (o padrão do módulo é "tudo ligado", por isso os specs antigos continuam valendo sem mudança). Dados fictícios (TESTE).

const montados: Array<{ app: App; el: HTMLElement }> = [];
function montar(render: () => ReturnType<typeof h>): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const app = createApp(defineComponent({ render }));
  app.mount(el);
  montados.push({ app, el });
  return el;
}

afterEach(() => {
  while (montados.length) {
    const m = montados.pop()!;
    m.app.unmount();
    m.el.remove();
  }
  document.body.innerHTML = "";
  religarTodasAsSecoes();
});

const desligarDir = (): void => definirSecoesDesligadas(["dir"]);
const botoes = (el: HTMLElement): string[] => [...el.querySelectorAll("#compra-barra-acoes button")].map((b) => (b.textContent ?? "").trim());

describe("Compras: botão 'Encaminhar para a DIR'", () => {
  it("LIGADA (padrão): 'Copiar resumo' e 'Encaminhar para a DIR' (desabilitado), como sempre", () => {
    const el = montar(() => h(CompraColunaDireita, { compra: compraDeTeste(), despachanteCadastro: null }));
    expect(botoes(el)).toEqual(["Copiar resumo", "Encaminhar para a DIR"]);
    expect((el.querySelector("#btn-encaminhar-dir") as HTMLButtonElement).disabled).toBe(true);
  });

  it("DESLIGADA: o botão não existe; só 'Copiar resumo', que continua funcionando e ocupando a barra", () => {
    desligarDir();
    const el = montar(() => h(CompraColunaDireita, { compra: compraDeTeste(), despachanteCadastro: null }));
    expect(el.querySelector("#btn-encaminhar-dir")).toBeNull();
    expect(botoes(el)).toEqual(["Copiar resumo"]);
    expect(el.querySelector("#btn-copiar-resumo")!.className).toContain("flex-1");
    expect(el.textContent).not.toContain("Encaminhar");
    expect(el.textContent).not.toContain("migração da DIR");
    expect(el.querySelector("#compra-resumo")).not.toBeNull(); // o resumo segue no lugar
  });
});

describe("Contas: tabela de permissões por página", () => {
  const valores = (): ReturnType<typeof valoresTudoNenhum> => ({ ...valoresTudoNenhum(), processos: "editar", dir: "editar", compras: "ver" });
  const tabela = (v: ReturnType<typeof valoresTudoNenhum>): HTMLElement => montar(() => h(PermissoesContaTabela, { valores: v }));
  const grupos = (el: HTMLElement): string[] => [...el.querySelectorAll("fieldset")].map((f) => f.id);

  it("LIGADA (padrão): uma linha por seção, inclusive a DIR", () => {
    expect(grupos(tabela(valores()))).toEqual(["perm-grupo-processos", "perm-grupo-pagamentos", "perm-grupo-dir", "perm-grupo-patients", "perm-grupo-compras"]);
  });

  it("DESLIGADA: a linha 'DIR' some (as outras ficam, na mesma ordem) e o texto 'DIR' não aparece na tela", () => {
    desligarDir();
    const el = tabela(valores());
    expect(grupos(el)).toEqual(["perm-grupo-processos", "perm-grupo-pagamentos", "perm-grupo-patients", "perm-grupo-compras"]);
    expect(el.querySelector("#perm-dir-editar")).toBeNull();
    expect(el.textContent).not.toMatch(/\bDIR\b/);
  });

  it("secoesNaTela acompanha a chave; SECOES_COM_PERMISSAO (o que o servidor aceita) NÃO muda", () => {
    expect(secoesNaTela()).toEqual([...SECOES_COM_PERMISSAO]);
    desligarDir();
    expect(secoesNaTela()).toEqual(["processos", "pagamentos", "patients", "compras"]);
    expect(SECOES_COM_PERMISSAO).toContain("dir");
  });
});

describe("Contas: nada se perde com a DIR desligada (o servidor continua aceitando a chave 'dir')", () => {
  const mapa: Permissoes = { processos: "ver", pagamentos: "nenhum", dir: "editar", patients: "nenhum", compras: "editar" };

  it("o valor da DIR de um mapa gravado fica nos valores e vai de volta no envio, mesmo sem linha na tela", () => {
    desligarDir();
    const v = valoresDoMapa(mapa);
    expect(v.dir).toBe("editar");
    const envio = permissoesParaEnvio({ modo: "edicao", role: "operacional", valores: v, tocada: true, restaurar: false });
    expect(envio).toEqual({ incluir: true, valor: { processos: "ver", pagamentos: "nenhum", dir: "editar", patients: "nenhum", compras: "editar" } });
  });

  it("padraoDoCargo é o MESMO ligada ou desligada (senão salvar uma conta sem mapa tiraria a DIR do operacional para sempre)", () => {
    const antes = { operacional: padraoDoCargo("operacional"), administrador: padraoDoCargo("administrador"), socio: padraoDoCargo("socio"), consultor: padraoDoCargo("consultor") };
    desligarDir();
    expect(padraoDoCargo("operacional")).toEqual(antes.operacional);
    expect(padraoDoCargo("administrador")).toEqual(antes.administrador);
    expect(padraoDoCargo("socio")).toEqual(antes.socio);
    expect(padraoDoCargo("consultor")).toEqual(antes.consultor);
    expect(padraoDoCargo("operacional").dir).toBe("editar");
  });

  it("estaTudoNenhum ignora a seção desligada: conta que só tem a DIR é 'só Recados e Minha conta'", () => {
    const soDir = { ...valoresTudoNenhum(), dir: "editar" as const };
    expect(estaTudoNenhum(soDir)).toBe(false);
    desligarDir();
    expect(estaTudoNenhum(soDir)).toBe(true);
    expect(estaTudoNenhum({ ...soDir, compras: "ver" })).toBe(false);
  });
});

describe("Cadastros: textos do renomear de consultor", () => {
  const impacto = { processos: 3, pacientes: 1, dir: 2, compras: 4, contas: 2 };

  it("LIGADA (padrão): a contagem inclui os POs da DIR", () => {
    expect(resumoImpactoRenomear(impacto)).toBe("3 processos do Follow-Up, 1 prestação, 2 POs da DIR, 4 compras e 2 contas de login");
    expect(textoOndeRenomeiaConsultor()).toBe("Follow-Up, Prestação, DIR e contas de login");
  });

  it("DESLIGADA: 'POs da DIR' some da contagem, da confirmação e da dica; o resto fica igual", () => {
    desligarDir();
    expect(resumoImpactoRenomear(impacto)).toBe("3 processos do Follow-Up, 1 prestação, 4 compras e 2 contas de login");
    expect(resumoImpactoRenomear({ ...impacto, dir: 0 })).not.toContain("DIR");
    const mensagem = mensagemConfirmarRenomear("Antigo Teste", "Novo Teste", impacto);
    expect(mensagem).not.toContain("DIR");
    expect(mensagem).toContain('Renomear "Antigo Teste" para "Novo Teste"?');
    expect(textoOndeRenomeiaConsultor()).toBe("Follow-Up, Prestação e contas de login");
  });

  it("o painel de Cadastros usa a função (a frase da DIR não está escrita fixa no template)", () => {
    const painel = readFileSync(join(__dirname, "..", "..", "app/components/configuracoes/CadastroPainel.vue"), "utf-8");
    expect(painel).toContain("textoOndeRenomeiaConsultor()");
    expect(painel).not.toContain("Follow-Up, Prestação, DIR e contas de login");
  });
});

describe("não sobrou menção fixa à DIR nas telas fora da DIR", () => {
  it("fora de app/components/dir, app/pages/dir.vue e dos nomes de seção, os textos que citam a DIR passam pela chave", () => {
    const leitura = (c: string): string => readFileSync(join(__dirname, "..", "..", c), "utf-8");
    // Compras: o botão só existe com v-if da chave.
    expect(leitura("app/components/compras/CompraColunaDireita.vue")).toMatch(/v-if="dirLigada"[^>]*id="btn-encaminhar-dir"/);
    // Cadastros: o resumo da contagem testa a chave.
    expect(leitura("app/utils/cadastroConsultor.ts")).toContain('secaoDesligada("dir")');
    // Contas: a tabela itera as seções visíveis, não a lista inteira.
    const tabela = leitura("app/components/configuracoes/PermissoesContaTabela.vue");
    expect(tabela).toContain("secoesNaTela()");
    expect(tabela).not.toContain("SECOES_NA_TELA");
  });
});
