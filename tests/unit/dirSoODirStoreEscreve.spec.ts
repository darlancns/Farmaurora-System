import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Guarda ESTRUTURAL: na tabela `dir`, só server/utils/dirStore.ts ESCREVE (insert, update, upsert, delete). O Encaminhar para a DIR
// (server/utils/comprasEncaminhar.ts) cria as linhas passando por `inserirLinhasDaCompra` do dirStore, nunca pelo banco direto; o resto do servidor
// só lê (ou conta). A função SQL do renomear de consultor escreve em dir.vendedor, mas é SQL, fora destes arquivos.

const RAIZ = process.cwd();

function arquivos(pasta: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === "node_modules" || nome === ".nuxt" || nome === ".output") continue;
      saida.push(...arquivos(caminho));
    } else if (nome.endsWith(".ts")) {
      saida.push(caminho);
    }
  }
  return saida;
}

const semComentarios = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const servidor = arquivos(join(RAIZ, "server")).map((f) => ({
  caminho: relative(RAIZ, f).split(sep).join("/"),
  texto: semComentarios(readFileSync(f, "utf-8")),
}));

// `.from("dir")` (ou a constante da tabela) seguido, na mesma cadeia, de uma escrita.
const ESCRITA_NA_DIR = /\.from\(\s*(?:["']dir["']|TABELA_DIR)\s*\)[^;]*?\.(?:insert|update|upsert|delete)\(/;

describe("na tabela dir, só o dirStore escreve", () => {
  it("o scanner enxerga os arquivos esperados (a guarda não é vazia)", () => {
    expect(servidor.length).toBeGreaterThan(50);
    expect(servidor.some((a) => a.caminho === "server/utils/dirStore.ts")).toBe(true);
    expect(servidor.some((a) => a.caminho === "server/utils/comprasEncaminhar.ts")).toBe(true);
  });

  it("nenhum outro arquivo do servidor escreve em dir", () => {
    const violacoes = servidor.filter((a) => a.caminho !== "server/utils/dirStore.ts" && ESCRITA_NA_DIR.test(a.texto)).map((a) => a.caminho);
    expect(violacoes).toEqual([]);
  });

  it("o dirStore escreve em dir (a regra enxerga o caso verdadeiro)", () => {
    const store = servidor.find((a) => a.caminho === "server/utils/dirStore.ts")!.texto;
    expect(store).toMatch(/\.from\(TABELA\)\s*\.(?:insert|update|upsert|delete)\(/);
    expect(ESCRITA_NA_DIR.test('db.from("dir").insert(row)')).toBe(true);
    expect(ESCRITA_NA_DIR.test('db.from("dir").select("id").eq("po", x)')).toBe(false);
  });

  it("o Encaminhar não toca a tabela dir direto: usa as funções do dirStore", () => {
    const enc = servidor.find((a) => a.caminho === "server/utils/comprasEncaminhar.ts")!.texto;
    expect(enc).not.toMatch(/from\(\s*["']dir["']\s*\)/);
    expect(enc).toContain("inserirLinhasDaCompra");
    expect(enc).toContain("listarLinhasDaDirPorPo");
  });

  it("só o Encaminhar usa inserirLinhasDaCompra (a criação na DIR por outro caminho exige decidir aqui)", () => {
    const usam = servidor.filter((a) => /\binserirLinhasDaCompra\b/.test(a.texto)).map((a) => a.caminho).sort();
    expect(usam).toEqual(["server/utils/comprasEncaminhar.ts", "server/utils/dirStore.ts"]);
  });
});
