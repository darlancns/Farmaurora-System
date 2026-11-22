import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// TESTES DE ARQUITETURA da tela nova da Compra: o código da tela antiga (checklist, blocos, ordens, foco por campo, status) foi APAGADO e
// nada pode voltar a usá-lo; e a palavra "vendedor" não existe na Compra (o Consultor; o Vendedor continua só na DIR e no Cadastro).

const RAIZ = join(__dirname, "..", "..");

function arquivos(dir: string, extensoes: readonly string[]): string[] {
  const base = join(RAIZ, dir);
  if (!existsSync(base)) return [];
  const saida: string[] = [];
  const andar = (d: string): void => {
    for (const nome of readdirSync(d)) {
      const caminho = join(d, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (extensoes.some((e) => nome.endsWith(e))) saida.push(caminho);
    }
  };
  andar(base);
  return saida;
}

const ler = (caminho: string): string => readFileSync(caminho, "utf-8");
const rel = (caminho: string): string => relative(RAIZ, caminho).split("\\").join("/");

const DA_TELA = [...arquivos("app/components/compras", [".vue", ".ts"]), join(RAIZ, "app/pages/compras.vue")];

describe("o código da tela antiga foi apagado", () => {
  it.each([
    "app/components/compras/blocos",
    "app/components/compras/blocosRegistro.ts",
    "app/components/compras/CompraOrdemCartao.vue",
    "app/components/compras/CompraItemLinha.vue",
    "app/components/compras/CompraChecklistPainel.vue",
    "app/components/compras/CompraStatusChip.vue",
    "app/utils/comprasBlocos.ts",
    "app/utils/comprasCampos.ts",
    "app/utils/comprasFoco.ts",
    "shared/utils/compraChecklist.ts",
    "shared/constants/compraChecklist.ts",
    "shared/utils/compraDir.ts",
    "tests/unit/helpers/compraCompletaFixtures.ts",
    "tests/unit/helpers/formularioCompra.ts",
  ])("%s não existe mais", (caminho) => {
    expect(existsSync(join(RAIZ, caminho)), caminho).toBe(false);
  });

  it("nenhum arquivo de app/components/compras (nem a página) importa compraChecklist, comprasFoco, comprasCampos nem comprasBlocos", () => {
    expect(DA_TELA.length).toBeGreaterThan(15);
    for (const arquivo of DA_TELA) {
      const texto = ler(arquivo);
      for (const proibido of ["compraChecklist", "comprasFoco", "comprasCampos", "comprasBlocos", "blocosRegistro", "StatusDaCompra", "CompraOrdemCartao", "BlocoOrdens"]) {
        expect(texto.includes(proibido), `${rel(arquivo)} menciona ${proibido}`).toBe(false);
      }
    }
  });

  it("nada da Compra usa mais data-campo (ir ao campo), o destaque do checklist nem o texto 'antes de encaminhar'; o CSS global também não tem o destaque", () => {
    const daCompra = [...DA_TELA, ...arquivos("app/utils", [".ts"]).filter((a) => /utils[\/]compras[A-Z]/.test(a)), ...arquivos("shared", [".ts"]).filter((a) => /compra/i.test(a))];
    for (const arquivo of daCompra) {
      const texto = ler(arquivo);
      expect(/data-campo(?!-)/.test(texto), `${rel(arquivo)}: data-campo`).toBe(false);
      expect(texto.includes("data-destaque"), `${rel(arquivo)}: data-destaque`).toBe(false);
      expect(/antes de encaminhar/i.test(texto), `${rel(arquivo)}: antes de encaminhar`).toBe(false);
    }
    expect(ler(join(RAIZ, "app/assets/css/main.css")).includes("data-destaque")).toBe(false);
  });

  it("os componentes da tela não têm 'Dicas', checklist, courierSimples nem ordens como objetos", () => {
    for (const arquivo of DA_TELA) {
      const texto = ler(arquivo);
      expect(/Dicas/.test(texto), `${rel(arquivo)}: Dicas`).toBe(false);
      expect(/checklist/i.test(texto), `${rel(arquivo)}: checklist`).toBe(false);
      expect(texto.includes("courierSimples"), `${rel(arquivo)}: courierSimples`).toBe(false);
      expect(/compra\.ordens|\.ordens\.(map|find|length|filter|some)/.test(texto), `${rel(arquivo)}: ordens`).toBe(false);
    }
  });
});

describe("'vendedor' não existe na Compra (é Consultor)", () => {
  const DA_COMPRA = [
    ...DA_TELA,
    join(RAIZ, "app/composables/useCompraAcoes.ts"),
    join(RAIZ, "app/composables/useCompraEditor.ts"),
    join(RAIZ, "app/composables/useCompraOpcoes.ts"),
    join(RAIZ, "app/composables/useComprasMes.ts"),
    join(RAIZ, "app/composables/useComprasPagina.ts"),
    ...arquivos("app/utils", [".ts"]).filter((a) => /utils[\\/]compras[A-Z]/.test(a)),
  ];

  it("app/components/compras, app/pages/compras.vue e os composables e utils de Compra não têm a palavra (em qualquer caixa)", () => {
    expect(DA_COMPRA.length).toBeGreaterThan(20);
    for (const arquivo of DA_COMPRA) expect(/vendedor/i.test(ler(arquivo)), rel(arquivo)).toBe(false);
  });

  it("os arquivos de Compra em shared/ e server/ também não (o Vendedor só aparece na DIR, no Cadastro e no renomear consultor)", () => {
    const compra = [...arquivos("shared", [".ts"]), ...arquivos("server", [".ts"])].filter((a) => /(^|[\\/])compra[^\\/]*\.ts$|[\\/]compras[^\\/]*\.ts$/.test(a));
    expect(compra.length).toBeGreaterThan(8);
    for (const arquivo of compra) expect(/vendedor/i.test(ler(arquivo)), rel(arquivo)).toBe(false);
  });
});

describe("módulos do servidor: sem ciclo comprasStore ↔ comprasCatalogo", () => {
  it("o erro de regra vive em comprasErro.ts e quem o store importa (catálogo, erro) não importa o store de volta", () => {
    const store = ler(join(RAIZ, "server/utils/comprasStore.ts"));
    expect(store).toContain('from "./comprasErro"');
    expect(store).not.toMatch(/export class ComprasRegraError/);
    for (const dependencia of ["comprasCatalogo", "comprasErro"]) {
      expect(store).toContain(`from "./${dependencia}"`);
      const texto = ler(join(RAIZ, `server/utils/${dependencia}.ts`));
      expect(/from "\.\/comprasStore"/.test(texto), `${dependencia} importa comprasStore (ciclo)`).toBe(false);
    }
    // comprasTemperatura e preCadastroStore também lançam o erro a partir do arquivo próprio, não do store.
    for (const nome of ["comprasTemperatura", "preCadastroStore", "preCadastroDecisao"]) {
      const texto = ler(join(RAIZ, `server/utils/${nome}.ts`));
      expect(texto, nome).toContain('from "./comprasErro"');
      expect(/import\s*\{[^}]*ComprasRegraError[^}]*\}\s*from "\.\/comprasStore"/.test(texto), `${nome}: ComprasRegraError vindo do store`).toBe(false);
    }
  });
});
