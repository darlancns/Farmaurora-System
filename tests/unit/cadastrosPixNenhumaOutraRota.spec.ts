import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// A chave PIX dos Cadastros (colunas chave_pix de cadastro_despachantes e cadastro_transportadoras) só pode sair por
// UMA porta: GET /api/cadastros/:lista, que decide por podeVerPixCadastro. Esta guarda é ESTRUTURAL: nada fora de
// Cadastros lê essas tabelas nem usa o store/mapeadores dos Cadastros — então nenhuma outra rota consegue devolver a
// chave. (O PIX de Pagamentos é outra tabela, pagamento_pix_chaves, e outro código: não é tocado nem coberto aqui.)

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
const PERMITIDOS = [
  /^server\/api\/cadastros\//,
  /^server\/utils\/cadastro(Acesso|Mappers)\.ts$/,
  /^server\/utils\/cadastrosStore\.ts$/,
  /^shared\/constants\/cadastros\.ts$/,
];
const permitido = (caminho: string): boolean => PERMITIDOS.some((re) => re.test(caminho));

const ACESSO_AOS_CADASTROS = /cadastro_(despachantes|transportadoras|fornecedores|cias_aereas)|TABELA_CADASTRO|cadastrosStore|cadastroMappers|listarCadastro|criarCadastro|alterarCadastro/;

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

  it("só três rotas de API usam o store dos Cadastros: GET, POST e PATCH de /api/cadastros/:lista", () => {
    const usam = todos
      .filter((a) => a.caminho.startsWith("server/api/") && /cadastrosStore/.test(a.texto))
      .map((a) => a.caminho)
      .sort();
    expect(usam).toEqual([
      "server/api/cadastros/[lista]/[id].patch.ts",
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
