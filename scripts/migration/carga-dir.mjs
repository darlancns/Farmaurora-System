// CARGA one-time da DIR: lê o CSV da planilha (padrão: scratch/dir.csv), roda o MESMO parser do
// dry-run e insere os registros na tabela `dir` do Supabase com a service role, num ÚNICO INSERT
// (um comando = atômico: ou entram todos ou nenhum). Script único — NÃO é importado por nenhuma
// rota/botão da aplicação.
//
// Uso:
//   ALLOW_REAL_DB=1 node scripts/migration/carga-dir.mjs [csv]            → só valida (não grava)
//   ALLOW_REAL_DB=1 node scripts/migration/carga-dir.mjs [csv] --commit   → executa a carga
//
// Pré-condições checadas antes de gravar (qualquer falha → aborta, nada muda):
//   * ALLOW_REAL_DB=1 (a checagem vem antes de ler o .env ou abrir qualquer conexão);
//   * o parser não reporta coluna ausente nem linha com erro, e gera exatamente ESPERADO registros;
//   * a lista FECHAMENTOS RESTANTES dá exatamente os POs marcados / entradas ambíguas / não encontradas
//     do dry-run aprovado (ESPERADO_MARCADOS, ESPERADO_AMBIGUAS, ESPERADO_NAO_ENCONTRADAS);
//   * a tabela `dir` JÁ EXISTE (o SQL de supabase/migrations/20261026000000_dir.sql é aplicado
//     manualmente) e está VAZIA — a carga nunca mistura com dados existentes.
// Os ids são determinísticos (dir_carga_<linha da planilha>), então rodar de novo com a tabela
// preenchida não duplica nada (a pré-condição "vazia" já barra; o id repetido barraria também).
// Os POs marcados na lista entram NO MESMO insert em lote atômico, com
// fechamento_restante_por = "importação da planilha" e fechamento_restante_em = hora da carga.
// Entradas ambíguas ou não encontradas NÃO marcam nada (nunca se escolhe um PO por conta própria).
// Se o INSERT falhar, NÃO há retry: o erro é impresso e o script termina.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parseDirCsv } from "../../shared/utils/dirParser.ts";
import { hojeBrasilia } from "../../shared/utils/dataBrasilia.ts";
import { FECHAMENTO_RESTANTE_POR_IMPORTACAO } from "../../shared/constants/dir.ts";
import { colunasDeDir } from "../../server/utils/dirMappers.ts";
import { exigirAllowRealDbOuSair } from "../integration/_guardBancoReal.mjs";

// Script de migração de dados REAIS (produção): só roda com ALLOW_REAL_DB=1, e a checagem vem
// antes de ler o .env ou abrir qualquer conexão (sai com código 1 e mensagem clara).
exigirAllowRealDbOuSair("carga-dir");

// Registros esperados na planilha atual (linhas 2–505). Se a planilha mudar, o dry-run mostra o
// novo total e este número é atualizado junto, de propósito, na revisão.
const ESPERADO = 504;
// Lista FECHAMENTOS RESTANTES (97 entradas, linhas 2–98) como no dry-run aprovado: 95 POs marcados
// (77 por texto idêntico a 1 PO + 18 pelo único PO em aberto com FECHAMENTO falso), 2 ambíguas
// (linhas 32 e 43 da lista, a decidir à mão) e nenhuma não encontrada.
const ESPERADO_MARCADOS = 95;
const ESPERADO_AMBIGUAS = 2;
const ESPERADO_NAO_ENCONTRADAS = 0;

const COMMIT = process.argv.includes("--commit");
const CRM = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argCsv = process.argv.slice(2).find((a) => !a.startsWith("--"));
const CAMINHO = resolve(argCsv ?? join(CRM, "scratch", "dir.csv"));
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

function falha(msg) {
  console.error(`\nABORTADO: ${msg}\nNada foi alterado no banco.`);
  process.exit(1);
}

function lerEnv() {
  const env = {};
  for (const linha of readFileSync(join(CRM, ".env"), "utf-8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !linha.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

// 1) parser (sem rede)
const resultado = parseDirCsv(readFileSync(CAMINHO, "utf-8"), { hoje: hojeBrasilia() });
if (resultado.colunasAusentes.length) falha(`colunas obrigatórias ausentes no CSV: ${resultado.colunasAusentes.join(", ")}`);
const reais = resultado.linhas.filter((l) => !l.ignorada);
const comErro = reais.filter((l) => l.registro === null);
if (comErro.length) falha(`${comErro.length} linha(s) com erro (rode o dry-run): ${comErro.slice(0, 10).map((l) => l.linha).join(", ")}`);
if (reais.length !== ESPERADO) falha(`o parser gerou ${reais.length} registros, esperado ${ESPERADO}`);

const marcadosParser = reais.filter((l) => l.registro.fechamentoRestante).length;
const ambiguas = resultado.fechamentosRestantes.filter((e) => e.desfecho === "ambigua").length;
const naoEncontradas = resultado.fechamentosRestantes.filter((e) => e.desfecho === "nao_encontrada").length;
if (marcadosParser !== ESPERADO_MARCADOS) falha(`o parser marcou ${marcadosParser} POs em fechamento restante, esperado ${ESPERADO_MARCADOS}`);
if (ambiguas !== ESPERADO_AMBIGUAS) falha(`${ambiguas} entradas ambíguas na lista, esperado ${ESPERADO_AMBIGUAS}`);
if (naoEncontradas !== ESPERADO_NAO_ENCONTRADAS) falha(`${naoEncontradas} entradas não encontradas na lista, esperado ${ESPERADO_NAO_ENCONTRADAS}`);

const agora = new Date().toISOString();
const marca = { em: agora, por: FECHAMENTO_RESTANTE_POR_IMPORTACAO };
const linhas = reais.map((l) => ({
  id: `dir_carga_${String(l.linha).padStart(4, "0")}`,
  // `marca` só vale para o PO marcado; nos demais, fechamento_restante = false e _em/_por = NULL.
  ...colunasDeDir(l.registro, marca),
  created_at: agora,
  updated_at: agora,
}));
console.log(`Parser: ${reais.length} registros válidos (${resultado.linhas.length - reais.length} linhas-casca ignoradas).`);
console.log(`Lista FECHAMENTOS RESTANTES: ${marcadosParser} POs marcados, ${ambiguas} ambíguas e ${naoEncontradas} não encontradas (nada marcado nessas).`);

// 2) estado da tabela (só depois da trava ALLOW_REAL_DB)
const env = lerEnv();
const db = createClient(env.NUXT_PUBLIC_SUPABASE_URL, env.NUXT_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
console.log(`Projeto: ${new URL(env.NUXT_PUBLIC_SUPABASE_URL).hostname}   modo: ${COMMIT ? "COMMIT" : "validação (não grava)"}`);

const { count, error: eCount } = await db.from("dir").select("*", { count: "exact", head: true });
if (eCount) falha(`a tabela dir não pôde ser lida (o SQL da migration já foi aplicado?): ${eCount.message}`);
console.log(`Tabela dir: ${count} registro(s).`);
if (count !== 0) falha(`a tabela dir já tem ${count} registro(s); a carga só roda em tabela vazia`);

if (!COMMIT) {
  console.log("\nValidação OK. Nada foi gravado. Rode de novo com --commit para executar a carga.");
  process.exit(0);
}

// 3) carga: um único INSERT (atômico)
const { error: eInsert } = await db.from("dir").insert(linhas);
if (eInsert) falha(`INSERT falhou (nenhum registro entrou): ${eInsert.message}`);

// 4) conferência pós-carga
const { count: depois, error: eDepois } = await db.from("dir").select("*", { count: "exact", head: true });
if (eDepois) falha(`INSERT feito, mas a contagem final falhou: ${eDepois.message}`);
console.log(`\nCarga concluída: ${depois} registro(s) na tabela dir (esperado ${ESPERADO}).`);
if (depois !== ESPERADO) {
  console.error("ATENÇÃO: a contagem final difere do esperado — investigue antes de usar a página.");
  process.exit(1);
}

// Os POs marcados entraram com quem/quando da importação.
const { count: marcados, error: eMarcados } = await db
  .from("dir")
  .select("*", { count: "exact", head: true })
  .eq("fechamento_restante", true)
  .eq("fechamento_restante_por", FECHAMENTO_RESTANTE_POR_IMPORTACAO);
if (eMarcados) falha(`INSERT feito, mas a contagem dos marcados falhou: ${eMarcados.message}`);
console.log(`POs marcados em fechamento restante (por "${FECHAMENTO_RESTANTE_POR_IMPORTACAO}"): ${marcados} (esperado ${ESPERADO_MARCADOS}).`);
if (marcados !== ESPERADO_MARCADOS) {
  console.error("ATENÇÃO: a contagem de POs marcados difere do esperado — investigue antes de usar a página.");
  process.exit(1);
}
