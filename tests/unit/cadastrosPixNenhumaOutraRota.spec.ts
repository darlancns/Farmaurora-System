import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { TABELA_CADASTRO } from "../../shared/constants/cadastros";

// A chave PIX dos Cadastros (colunas chave_pix de cadastro_despachantes e cadastro_transportadoras) só pode sair por
// UMA porta: GET /api/cadastros/:lista, que decide por podeVerPixCadastro. Esta guarda é ESTRUTURAL: nada fora de
// Cadastros lê essas tabelas nem usa o store/mapeadores dos Cadastros — então nenhuma outra rota consegue devolver a
// chave. A ÚNICA exceção é a leitura de Pagamentos (server/utils/cadastroPagamentos.ts): Pagamentos passou a ler a chave
// do Cadastro, só para leitura, por esse módulo (que usa o store dos Cadastros e nunca loga nem repassa a chave); os
// testes do fim deste arquivo travam quem pode usá-lo.

const RAIZ = process.cwd();
const PASTAS = ["server", "app", "shared"];
const EXTENSOES = [".ts", ".vue", ".mjs"];

function arquivos(pasta: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    const info = statSync(caminho);
    if (info.isDirectory()) {
      if (nome === "node_modules" || nome === ".nuxt" || nome === ".output") continue;
      saida.push(...arquivos(caminho));
    } else if (EXTENSOES.some((e) => nome.endsWith(e))) {
      saida.push(caminho);
    }
  }
  return saida;
}

const todos = PASTAS.flatMap((p) => arquivos(join(RAIZ, p))).map((f) => ({
  caminho: relative(RAIZ, f).split(sep).join("/"),
  texto: readFileSync(f, "utf-8"),
}));

// Quem PODE falar das tabelas de Cadastros e do store/mapeadores deles.
//
// As ÚNICAS exceções fora do store são server/utils/consultoresCadastro.ts (lê `cadastro_consultores` de propósito, só `nome, ativo`, para
// a validação do consultor em Follow-Up, Prestação, DIR e contas) e server/utils/comprasCatalogo.ts (a porta das Compras para as
// listas: só LÊ, só colunas explícitas sem PIX, só itens ativos); um teste abaixo trava o que cada uma pode fazer.
const PERMITIDOS = [
  /^server\/api\/cadastros\//,
  /^server\/utils\/cadastro(Acesso|Mappers)\.ts$/,
  /^server\/utils\/cadastrosStore\.ts$/,
  /^shared\/constants\/cadastros\.ts$/,
  /^server\/utils\/cadastroPagamentos\.ts$/,
  /^server\/utils\/consultoresCadastro\.ts$/,
  /^server\/utils\/comprasCatalogo\.ts$/,
];
const permitido = (caminho: string): boolean => PERMITIDOS.some((re) => re.test(caminho));

// TODAS as tabelas `cadastro_*` (qualquer nome com esse prefixo, listas atuais e futuras) e o store/mapeadores dos Cadastros.
const ACESSO_AOS_CADASTROS = /\bcadastro_[a-z_]+|TABELA_CADASTRO|cadastrosStore|cadastroMappers|listarCadastro|criarCadastro|alterarCadastro/;

describe("a chave PIX dos Cadastros só sai por /api/cadastros", () => {
  it("o scanner enxerga os arquivos esperados (a guarda não é vazia)", () => {
    expect(todos.length).toBeGreaterThan(200);
    expect(todos.some((a) => a.caminho === "server/utils/cadastrosStore.ts")).toBe(true);
    expect(todos.some((a) => a.caminho === "server/api/pagamentos/despachante-pix.get.ts")).toBe(true);
  });

  it("nenhum arquivo fora de Cadastros lê as tabelas cadastro_* nem usa o store ou os mapeadores", () => {
    const violacoes = todos.filter((a) => !permitido(a.caminho) && ACESSO_AOS_CADASTROS.test(a.texto)).map((a) => a.caminho);
    expect(violacoes).toEqual([]);
  });

  it("a regra cobre TODAS as tabelas das listas (nenhuma lista nova fica de fora da guarda)", () => {
    for (const [lista, tabela] of Object.entries(TABELA_CADASTRO)) {
      expect(ACESSO_AOS_CADASTROS.test(`db.from("${tabela}")`), `${lista} → ${tabela}`).toBe(true);
    }
  });

  it("a exceção consultoresCadastro.ts só LÊ cadastro_consultores, só `nome, ativo` e `id`: sem escrita, sem `*`, sem outra tabela e sem PIX", () => {
    const texto = todos.find((a) => a.caminho === "server/utils/consultoresCadastro.ts")!.texto;
    expect([...new Set(texto.match(/\bcadastro_[a-z_]+/g))]).toEqual(["cadastro_consultores"]);
    // (O `.delete(` do Map de acertos em memória não é do banco: só se proíbe escrever depois de `.from(`.)
    expect(texto).not.toMatch(/\.from\([^)]*\)\s*\.(insert|update|upsert|delete)\(|\.rpc\(/);
    expect(texto).not.toMatch(/\.select\(\s*["'`]\*["'`]/);
    expect(texto).not.toMatch(/chave_?pix/i);
    const colunas = [...texto.matchAll(/\.select\(\s*"([^"]*)"/g)].map((m) => m[1]);
    expect(colunas.sort()).toEqual(["id", "nome, ativo", "nome, ativo"]);
  });

  it("a exceção comprasCatalogo.ts só LÊ, só colunas explícitas (`nome`), só itens ativos: sem escrita, sem `*`, sem PIX e sem a lista de transportadoras", () => {
    const texto = todos.find((a) => a.caminho === "server/utils/comprasCatalogo.ts")!.texto;
    // Só os Cadastros de que as Compras precisam (fornecedores, despachantes, cias aéreas; consultores vão por consultoresCadastro.ts).
    expect([...new Set(texto.match(/TABELA_CADASTRO(?:\.[a-z]+|\["[a-z-]+"\])/g))].sort()).toEqual(
      ['TABELA_CADASTRO.despachantes', 'TABELA_CADASTRO.fornecedores', 'TABELA_CADASTRO["cias-aereas"]'].sort(),
    );
    expect(texto).not.toMatch(/cadastro_[a-z_]+/); // nenhum nome de tabela escrito à mão
    expect(texto).not.toMatch(/cadastrosStore|cadastroMappers|listarCadastro|criarCadastro|alterarCadastro/);
    expect(texto).not.toMatch(/\.(insert|update|upsert|delete)\(|\.rpc\(/);
    expect(texto.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/chave_?pix|\.select\(\s*["'`]\*["'`]/i);
    // Toda leitura passa por `lerAtivos` com a coluna "nome" e o filtro de ativos.
    const leituras = [...texto.matchAll(/lerAtivos<[^>]*>\(createSupabaseAdminClient\(\),\s*([^,]+),\s*("[^"]*")/g)].map((m) => `${m[1]}|${m[2]}`);
    expect(leituras.sort()).toEqual(
      ['TABELA_CADASTRO.despachantes|"nome"', 'TABELA_CADASTRO.fornecedores|"nome"', 'TABELA_CADASTRO["cias-aereas"]|"nome"'].sort(),
    );
    expect(texto).toContain('.eq("ativo", true)');
    expect(texto.match(/\.from\(/g)).toHaveLength(1); // um único ponto de leitura
  });

  it("só cinco rotas de API usam o store dos Cadastros: GET, POST e PATCH de /api/cadastros/:lista, mais impacto e renomear-contas dos consultores", () => {
    const usam = todos
      .filter((a) => a.caminho.startsWith("server/api/") && /cadastrosStore/.test(a.texto))
      .map((a) => a.caminho)
      .sort();
    expect(usam).toEqual([
      "server/api/cadastros/[lista]/[id].patch.ts",
      "server/api/cadastros/[lista]/[id]/impacto.get.ts",
      "server/api/cadastros/[lista]/[id]/renomear-contas.post.ts",
      "server/api/cadastros/[lista]/index.get.ts",
      "server/api/cadastros/[lista]/index.post.ts",
    ]);
    const naPasta = todos.filter((a) => a.caminho.startsWith("server/api/cadastros/")).map((a) => a.caminho).sort();
    expect(naPasta).toEqual(usam); // nenhuma rota nova escondida em /api/cadastros
  });

  it("o mapeador é o único lugar que monta `chavePix` num objeto de resposta, e só com o pedido explícito", () => {
    const montam = todos.filter((a) => a.caminho.startsWith("server/") && /chavePix:\s*row\.chave_pix/.test(a.texto)).map((a) => a.caminho);
    expect(montam).toEqual(["server/utils/cadastroMappers.ts"]);
    const mapeador = todos.find((a) => a.caminho === "server/utils/cadastroMappers.ts")!.texto;
    expect(mapeador.match(/incluirPix \? \{ chavePix: row\.chave_pix \?\? "" \} : \{\}/g)).toHaveLength(2); // despachante e transportadora
  });

  it("GET decide pela regra única; POST e PATCH só pedem a chave DEPOIS de exigir o administrador", () => {
    const get = todos.find((a) => a.caminho === "server/api/cadastros/[lista]/index.get.ts")!.texto;
    expect(get).toContain("incluirPix: usuarioVePix(user)");
    expect(get).not.toMatch(/incluirPix:\s*true/);
    for (const rota of ["server/api/cadastros/[lista]/index.post.ts", "server/api/cadastros/[lista]/[id].patch.ts"]) {
      const texto = todos.find((a) => a.caminho === rota)!.texto;
      const exige = texto.indexOf("exigirAdministradorNosCadastros(user)");
      const pede = texto.indexOf("incluirPix: true");
      expect(exige, rota).toBeGreaterThan(-1);
      expect(pede, rota).toBeGreaterThan(exige);
    }
  });

  it("na tela, a chave só existe no value do input do painel: nenhum componente de Cadastros a imprime nem a registra em log", () => {
    const componentes = todos.filter((a) => /^app\/components\/configuracoes\/Cadastro/.test(a.caminho));
    expect(componentes.map((a) => a.caminho).sort()).toEqual([
      "app/components/configuracoes/CadastroDesfazer.vue",
      "app/components/configuracoes/CadastroPainel.vue",
      "app/components/configuracoes/CadastroSecao.vue",
      "app/components/configuracoes/CadastroSwitch.vue",
      "app/components/configuracoes/CadastrosTab.vue",
    ]);
    for (const c of componentes) {
      // Interpolação {{ ... }} que cita a chave: proibida (a coluna usa textoPix: "Cadastrada" ou "—").
      const interpolacoes = [...c.texto.matchAll(/\{\{([^}]*)\}\}/g)].map((m) => m[1] ?? "");
      expect(interpolacoes.filter((i) => /chave_?pix/i.test(i)), c.caminho).toEqual([]);
      // Nenhum console.* nos componentes de Cadastros.
      expect(c.texto, c.caminho).not.toMatch(/console\.(log|info|warn|error|debug)/);
    }
    // O painel liga a chave só a um input (v-model) e a mostra só como o value dele.
    const painel = componentes.find((a) => a.caminho.endsWith("CadastroPainel.vue"))!.texto;
    expect(painel.match(/form\.chavePix/g)!.length).toBeGreaterThan(0);
    expect(painel).toContain('v-model="form.chavePix"');
    expect(painel).toContain(":type=\"pixVisivel ? 'text' : 'password'\"");
    // E as funções de texto da tabela e do celular nunca devolvem a chave.
    const colunas = todos.find((a) => a.caminho === "app/utils/cadastroColunas.ts")!.texto;
    expect(colunas).not.toMatch(/return [^;]*chavePix/);
  });

  it("o store lê a chave só com o pedido: sem ele, uma lista de colunas explícita sem chave_pix", () => {
    const store = todos.find((a) => a.caminho === "server/utils/cadastrosStore.ts")!.texto;
    expect(store).toContain('return incluirPix ? "*" : (COLUNAS_SEM_PIX[lista] ?? "*");');
    const semPix = /const COLUNAS_SEM_PIX[\s\S]*?\};/.exec(store)?.[0] ?? "";
    expect(semPix).toContain("despachantes");
    expect(semPix).toContain("transportadoras");
    expect(semPix).not.toContain("chave_pix");
  });
});

describe("a leitura de Pagamentos (cadastroPagamentos.ts): só leitura, só por poucos lugares, sem log da chave", () => {
  const modulo = (): string => todos.find((a) => a.caminho === "server/utils/cadastroPagamentos.ts")!.texto;

  it("só estes arquivos usam o módulo de leitura", () => {
    const usam = todos
      .filter((a) => /from\s+["'][^"']*cadastroPagamentos["']/.test(a.texto))
      .map((a) => a.caminho)
      .sort();
    expect(usam).toEqual([
      "server/api/pagamentos/banco.post.ts",
      "server/api/pagamentos/cadastros.get.ts",
      "server/utils/grupoPagamentoRouteHandlers.ts",
    ]);
  });

  it("o módulo só LÊ: usa listarCadastro (nunca criar/alterar) e não monta `chavePix` de uma linha do banco", () => {
    const texto = modulo();
    expect(texto).toMatch(/listarCadastro/);
    expect(texto).not.toMatch(/criarCadastro|alterarCadastro|\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(texto).not.toMatch(/chavePix:\s*row\.chave_pix/);
  });

  it("o único console.* do módulo cita só o tipo da lista e os NOMES (nenhuma variável da chave)", () => {
    const linhas = modulo()
      .split("\n")
      .filter((l) => /console\./.test(l));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toContain('sem chave PIX no Cadastro (${LISTA_DO_TIPO[tipo]}): ${nomes.join(", ")}');
    expect(linhas[0]).not.toMatch(/chavePix|\bchave\b(?! PIX)/);
  });

  it("a rota de listas não pede a chave: obterCadastrosDePagamentos lê sem `incluirPix`", () => {
    const trecho = /export async function obterCadastrosDePagamentos[\s\S]*?\n}\n/.exec(modulo())?.[0] ?? "";
    expect(trecho).toContain("listarCadastro(");
    expect(trecho).not.toContain("incluirPix");
  });

  it("nenhuma rota de /api/pagamentos escreve chave PIX (sem PATCH de PIX)", () => {
    const rotasPix = todos
      .filter((a) => a.caminho.startsWith("server/api/pagamentos/") && a.caminho.includes("-pix"))
      .map((a) => a.caminho)
      .sort();
    expect(rotasPix).toEqual(["server/api/pagamentos/despachante-pix.get.ts", "server/api/pagamentos/transportadora-pix.get.ts"]);
  });
});
