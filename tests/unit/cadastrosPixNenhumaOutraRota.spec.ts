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
// listas: só LÊ, só colunas explícitas sem PIX, só itens ativos), server/utils/comprasTemperatura.ts (criar temperatura passando
// pelo store dos Cadastros, só a lista sem PIX) e server/utils/preCadastroStore.ts (a tabela pre_cadastro_medicamentos tem uma COLUNA
// `cadastro_id`, que a regra confundiria com tabela; não toca em nenhuma cadastro_*) e server/utils/dirOpcoes.ts (as temperaturas ATIVAS do
// Cadastro para o formulário da DIR: só `listarCadastro("temperaturas")`); um teste abaixo trava o que cada uma pode fazer.
const PERMITIDOS = [
  /^server\/api\/cadastros\//,
  /^server\/utils\/cadastro(Acesso|Mappers)\.ts$/,
  /^server\/utils\/cadastrosStore\.ts$/,
  /^shared\/constants\/cadastros\.ts$/,
  /^server\/utils\/cadastroPagamentos\.ts$/,
  /^server\/utils\/consultoresCadastro\.ts$/,
  /^server\/utils\/comprasCatalogo\.ts$/,
  /^server\/utils\/comprasTemperatura\.ts$/,
  /^server\/utils\/preCadastroStore\.ts$/,
  /^server\/utils\/dirOpcoes\.ts$/,
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

  it("a exceção comprasCatalogo.ts só LÊ, só colunas explícitas, só itens ativos: sem escrita, sem `*`, sem PIX (nem na lista de transportadoras)", () => {
    const texto = todos.find((a) => a.caminho === "server/utils/comprasCatalogo.ts")!.texto;
    const semComentarios = texto.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    // As listas que as Compras leem dos Cadastros (consultores vão por consultoresCadastro.ts).
    expect([...new Set(semComentarios.match(/TABELA_CADASTRO(?:\.[a-z]+|\["[a-z-]+"\])/g))].sort()).toEqual(
      [
        'TABELA_CADASTRO.despachantes',
        'TABELA_CADASTRO.fornecedores',
        'TABELA_CADASTRO["cias-aereas"]',
        'TABELA_CADASTRO.transportadoras',
        'TABELA_CADASTRO.temperaturas',
        'TABELA_CADASTRO.medicamentos',
      ].sort(),
    );
    expect(semComentarios).not.toMatch(/\bcadastro_[a-z_]+/); // nenhum nome de tabela escrito à mão
    expect(semComentarios).not.toMatch(/cadastrosStore|cadastroMappers|listarCadastro|criarCadastro|alterarCadastro/);
    expect(semComentarios).not.toMatch(/\.(insert|update|upsert|delete)\(|\.rpc\(/);
    expect(semComentarios).not.toMatch(/chave_?pix/i);
    expect(semComentarios).not.toMatch(/\.select\(\s*["'`]\*["'`]/);
    expect(semComentarios).toContain('.eq("ativo", true)');
    // Dois pontos de leitura, e só: lerAtivos (só ativos) e buscarMedicamentoPorNome (um medicamento pela chave, ativo ou inativo).
    expect(semComentarios.match(/\.from\(/g)).toHaveLength(2);
    expect(semComentarios).toMatch(/\.from\(TABELA_CADASTRO\.medicamentos\)\s*\.select\("id, nome, temperatura, ativo"\)\s*\.eq\("nome_chave", chave\)/);

    // As colunas explícitas de CADA lista (a constante exportada é a que as leituras usam): nenhuma tem PIX.
    const colunas = /export const COLUNAS_OPCOES = \{([\s\S]*?)\} as const;/.exec(semComentarios)?.[1] ?? "";
    expect([...colunas.matchAll(/(\w+):\s*"([^"]*)"/g)].map((m) => `${m[1]}=${m[2]}`)).toEqual([
      "fornecedores=nome, pais, prazo_alerta_dias, sem_alerta",
      "despachantes=nome, contato_nome, telefone, email",
      "ciasAereas=nome",
      "transportadoras=nome",
      "temperaturas=nome",
      "medicamentos=id, nome, temperatura",
    ]);
    // Toda chamada a lerAtivos usa uma dessas colunas (constante) ou "nome": nunca um texto livre com outra coluna.
    const usos = [...semComentarios.matchAll(/lerAtivos<[^>]*>\(\s*(?:createSupabaseAdminClient\(\)|db),\s*([^,]+),\s*([^,]+),/g)].map((m) => m[2]!.trim());
    expect(usos.length).toBeGreaterThanOrEqual(9);
    for (const u of usos) expect(u === '"nome"' || /^COLUNAS_OPCOES\.\w+$/.test(u), u).toBe(true);
  });

  it("a exceção comprasTemperatura.ts só cria e lista a lista `temperaturas` pelo store: sem PIX, sem outra lista, sem banco direto", () => {
    const texto = todos.find((a) => a.caminho === "server/utils/comprasTemperatura.ts")!.texto;
    const semComentarios = texto.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    // Só o que a criação precisa do store: listar e criar (nunca alterar) — e sempre a lista "temperaturas".
    expect([...new Set(semComentarios.match(/\b(listarCadastro|criarCadastro|alterarCadastro)\(\s*"[a-z-]+"/g))].sort()).toEqual(['criarCadastro("temperaturas"', 'listarCadastro("temperaturas"'].sort());
    expect(semComentarios).not.toMatch(/alterarCadastro|renomearConsultor|alterarConsultor/);
    expect(semComentarios).not.toMatch(/incluirPix|chave_?pix|TABELA_CADASTRO|\bcadastro_[a-z_]+|\.from\(|createSupabaseAdminClient/i);
    // Quem usa este módulo: só a rota de temperaturas das Compras.
    const usam = todos.filter((a) => /from\s+["'][^"']*comprasTemperatura["']/.test(a.texto)).map((a) => a.caminho);
    expect(usam).toEqual(["server/api/compras/temperaturas.post.ts"]);
  });

  it("a exceção preCadastroStore.ts não toca em tabela cadastro_*: só `pre_cadastro_medicamentos`, `compras` e a coluna `cadastro_id`; o medicamento do Cadastro vem pela porta das Compras", () => {
    const texto = todos.find((a) => a.caminho === "server/utils/preCadastroStore.ts")!.texto;
    const semComentarios = texto.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect([...new Set(semComentarios.match(/\bcadastro_[a-z_]+/g))]).toEqual(["cadastro_id"]);
    expect([...semComentarios.matchAll(/\.from\(\s*("[^"]*"|[A-Za-z_]+)\s*\)/g)].map((m) => m[1]).sort()).toEqual(['"compras"', "TABELA", "TABELA"].sort());
    expect(semComentarios).toMatch(/const TABELA = "pre_cadastro_medicamentos";/);
    expect(semComentarios).not.toMatch(/cadastrosStore|cadastroMappers|listarCadastro|criarCadastro|alterarCadastro|TABELA_CADASTRO|chave_?pix|incluirPix/i);
    expect(semComentarios).toContain("buscarMedicamentoPorNome");
    // Só a rota de pré-cadastro usa o módulo (a aprovação, quando existir, será outra rota e outra mudança nesta guarda).
    const usam = todos.filter((a) => /from\s+["'][^"']*preCadastroStore["']/.test(a.texto)).map((a) => a.caminho);
    expect(usam).toEqual(["server/api/compras/pre-cadastro-medicamentos.post.ts"]);
  });

  it("a exceção dirOpcoes.ts só LÊ a lista `temperaturas` pelo store: sem escrita, sem PIX, sem outra lista, sem banco direto, e só a rota de opções da DIR a usa", () => {
    const texto = todos.find((a) => a.caminho === "server/utils/dirOpcoes.ts")!.texto;
    const semComentarios = texto.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    // Só `listarCadastro("temperaturas")`: nenhuma outra função do store e nenhuma outra lista.
    expect([...new Set(semComentarios.match(/\b(listarCadastro|criarCadastro|alterarCadastro)\(\s*"[a-z-]+"/g))]).toEqual(['listarCadastro("temperaturas"']);
    expect(semComentarios).not.toMatch(/criarCadastro|alterarCadastro|renomearConsultor|alterarConsultor|incluirPix/);
    expect(semComentarios).not.toMatch(/chave_?pix|TABELA_CADASTRO|\bcadastro_[a-z_]+|\.from\(|\.rpc\(|createSupabaseAdminClient/i);
    const usam = todos.filter((a) => /from\s+["'][^"']*dirOpcoes["']/.test(a.texto)).map((a) => a.caminho);
    expect(usam).toEqual(["server/api/dir/opcoes.get.ts"]);
  });

  it("as exceções FORA do store dos Cadastros são exatamente estas seis (um arquivo novo que fale dos Cadastros falha aqui até ser decidido)", () => {
    const foraDoStore = (c: string): boolean =>
      permitido(c) && !/^server\/api\/cadastros\//.test(c) && !/^server\/utils\/cadastro(Acesso|Mappers)\.ts$/.test(c) && c !== "server/utils/cadastrosStore.ts" && c !== "shared/constants/cadastros.ts";
    const exceções = todos.filter((a) => foraDoStore(a.caminho)).map((a) => a.caminho).sort();
    expect(exceções).toEqual([
      "server/utils/cadastroPagamentos.ts",
      "server/utils/comprasCatalogo.ts",
      "server/utils/comprasTemperatura.ts",
      "server/utils/consultoresCadastro.ts",
      "server/utils/dirOpcoes.ts",
      "server/utils/preCadastroStore.ts",
    ]);
  });

  it("nenhuma rota de /api/compras nem o que elas usam cita chave PIX, e nenhuma importa o store ou os mapeadores dos Cadastros", () => {
    const rotas = todos.filter((a) => a.caminho.startsWith("server/api/compras/"));
    expect(rotas.length).toBeGreaterThanOrEqual(9);
    const semComentarios = (t: string): string => t.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const r of rotas) {
      const texto = semComentarios(r.texto);
      expect(texto, r.caminho).not.toMatch(/chave_?pix/i);
      expect(texto, r.caminho).not.toMatch(/cadastrosStore|cadastroMappers|TABELA_CADASTRO|\bcadastro_[a-z_]+/);
    }
    const utilsDeCompras = todos.filter((a) => /^server\/utils\/(compras[A-Z]\w*|compraMappers|preCadastroStore)\.ts$/.test(a.caminho));
    expect(utilsDeCompras.map((a) => a.caminho).sort()).toEqual([
      "server/utils/compraMappers.ts",
      "server/utils/comprasAcesso.ts",
      "server/utils/comprasCatalogo.ts",
      "server/utils/comprasStore.ts",
      "server/utils/comprasTemperatura.ts",
      "server/utils/preCadastroStore.ts",
    ]);
    for (const u of utilsDeCompras) expect(semComentarios(u.texto), u.caminho).not.toMatch(/chave_?pix|incluirPix/i);
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
