// Smoke test do pagamentosPixStore (tabela pagamento_pix_chaves). Espelha
// readPixOverrides / getPixEfetivo / salvarPix do store e roda contra o banco
// real.
//
// ⚠ Diferente dos outros smokes, este mexe em nomes REAIS (Bruno Lopes /
// Doctor) — a tabela só reconhece nomes conhecidos (getPixEfetivo filtra por
// cfg.nomes), então não dá pra usar prefixo TESTE_. Solução: snapshot da linha
// de cada nome-alvo no começo, e restauração exata no finally (igual ao
// snapshot/restore dos JSON que o antigo unit test fazia).

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Raiz do projeto (crm/) — 2 níveis acima de scripts/integration/.
const CRM = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const env = Object.fromEntries(
  readFileSync(`${CRM}/.env`, "utf-8")
    .split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const db = createClient(env.NUXT_PUBLIC_SUPABASE_URL, env.NUXT_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const T_PIX = "pagamento_pix_chaves";

// Espelho de shared/constants/pagamentos.ts (mesma tática dos outros smokes:
// as constantes são reproduzidas aqui porque .mjs não importa .ts).
const DESPACHANTES_PAGAMENTO = ["Andreza Faconi", "Bruno Lopes", "Marcelo Lima"];
const DESPACHANTE_PIX_PADRAO = {
  "Andreza Faconi": "67.592.120/0001-04",
  "Bruno Lopes": "036.223.838-36",
  "Marcelo Lima": "05.342.805/0001-37",
};
const TRANSPORTADORAS_PAGAMENTO = ["AJC", "Doctor"];
const TRANSPORTADORA_PIX_PADRAO = {
  AJC: "09.614.254/0001-74",
  Doctor: "22.095.367/0001-79",
};

const PIX_DESPACHANTE = { tipo: "DESPACHANTE", nomes: DESPACHANTES_PAGAMENTO, padrao: DESPACHANTE_PIX_PADRAO };
const PIX_TRANSPORTADORA = { tipo: "TRANSPORTADORA", nomes: TRANSPORTADORAS_PAGAMENTO, padrao: TRANSPORTADORA_PIX_PADRAO };

let failures = 0;
const check = (label, cond) => { console.log(`${cond ? "  ok " : "FAIL"} ${label}`); if (!cond) failures++; };
function must(label, { error }) {
  if (error) { console.log(`FAIL ${label}: ${error.message}`); failures++; throw new Error(error.message); }
}

// ── espelho de readPixOverrides / getPixEfetivo / salvarPix ───────────────

async function readPixOverrides(tipo) {
  const { data, error } = await db.from(T_PIX).select("nome, chave_pix").eq("tipo", tipo);
  must("select overrides", { error });
  const overrides = {};
  for (const row of data ?? []) {
    if (typeof row.chave_pix === "string" && row.chave_pix) overrides[row.nome] = row.chave_pix;
  }
  return overrides;
}

async function getPixEfetivo(cfg) {
  const overrides = await readPixOverrides(cfg.tipo);
  const efetivo = { ...cfg.padrao };
  for (const nome of cfg.nomes) {
    if (typeof overrides[nome] === "string" && overrides[nome]) efetivo[nome] = overrides[nome];
  }
  return efetivo;
}

async function salvarPix(cfg, nome, chavePix) {
  if (!cfg.nomes.includes(nome)) throw new Error("Nome desconhecido.");
  const chave = String(chavePix).trim();
  if (!chave) throw new Error("Chave PIX vazia.");
  must("upsert pix", await db.from(T_PIX).upsert(
    { tipo: cfg.tipo, nome, chave_pix: chave, updated_at: new Date().toISOString() },
    { onConflict: "tipo,nome" },
  ));
  return await getPixEfetivo(cfg);
}

// ── snapshot / restore dos nomes-alvo ────────────────────────────────────

const ALVOS = [
  { tipo: "DESPACHANTE", nome: "Bruno Lopes" },
  { tipo: "TRANSPORTADORA", nome: "Doctor" },
];
const baks = new Map(); // "tipo|nome" -> row | null

async function snapshot() {
  for (const { tipo, nome } of ALVOS) {
    const { data, error } = await db.from(T_PIX).select("*").eq("tipo", tipo).eq("nome", nome).maybeSingle();
    must(`snapshot ${tipo}/${nome}`, { error });
    baks.set(`${tipo}|${nome}`, data ?? null);
    must(`limpar ${tipo}/${nome}`, await db.from(T_PIX).delete().eq("tipo", tipo).eq("nome", nome));
  }
}

async function restore() {
  for (const { tipo, nome } of ALVOS) {
    await db.from(T_PIX).delete().eq("tipo", tipo).eq("nome", nome);
    const bak = baks.get(`${tipo}|${nome}`);
    if (bak) await db.from(T_PIX).insert(bak);
  }
}

// ── testes ───────────────────────────────────────────────────────────────

try {
  await snapshot();

  // 1. sem override → padrão
  let d = await getPixEfetivo(PIX_DESPACHANTE);
  let t = await getPixEfetivo(PIX_TRANSPORTADORA);
  check("1. sem override: Bruno Lopes = padrão", d["Bruno Lopes"] === DESPACHANTE_PIX_PADRAO["Bruno Lopes"]);
  check("1. sem override: Doctor = padrão", t["Doctor"] === TRANSPORTADORA_PIX_PADRAO["Doctor"]);
  check("1. sem override: todos os despachantes presentes", DESPACHANTES_PAGAMENTO.every((n) => typeof d[n] === "string" && d[n]));

  // 2. salvar persiste e é relido (despachante), sem tocar nos outros nomes
  let ef = await salvarPix(PIX_DESPACHANTE, "Bruno Lopes", "chave-nova-do-bruno");
  check("2. salvar retorna efetivo com a chave nova", ef["Bruno Lopes"] === "chave-nova-do-bruno");
  check("2. Andreza Faconi continua no padrão", ef["Andreza Faconi"] === DESPACHANTE_PIX_PADRAO["Andreza Faconi"]);
  d = await getPixEfetivo(PIX_DESPACHANTE);
  check("2. relido do banco: Bruno Lopes = chave nova", d["Bruno Lopes"] === "chave-nova-do-bruno");

  // 3. salvar persiste e é relido (transportadora) + isolamento despachante × transportadora
  ef = await salvarPix(PIX_TRANSPORTADORA, "Doctor", "22.095.367/0001-79-editada");
  check("3. Doctor = chave editada", ef["Doctor"] === "22.095.367/0001-79-editada");
  check("3. AJC continua no padrão", ef["AJC"] === TRANSPORTADORA_PIX_PADRAO["AJC"]);
  t = await getPixEfetivo(PIX_TRANSPORTADORA);
  check("3. relido do banco: Doctor = chave editada", t["Doctor"] === "22.095.367/0001-79-editada");
  d = await getPixEfetivo(PIX_DESPACHANTE);
  check("3. não vaza pro mapa de despachante (sem 'Doctor')", !("Doctor" in d));
  check("3. despachante intacto (Bruno Lopes ainda = chave nova)", d["Bruno Lopes"] === "chave-nova-do-bruno");

  // 4. upsert por (tipo,nome) é update — não duplica linha
  await salvarPix(PIX_DESPACHANTE, "Bruno Lopes", "bruno-v2");
  d = await getPixEfetivo(PIX_DESPACHANTE);
  check("4. update sobrescreve (Bruno Lopes = bruno-v2)", d["Bruno Lopes"] === "bruno-v2");
  const linhas = await db.from(T_PIX).select("nome", { count: "exact", head: true })
    .eq("tipo", "DESPACHANTE").eq("nome", "Bruno Lopes");
  must("4. contar linhas", linhas);
  check("4. só 1 linha para (DESPACHANTE, Bruno Lopes)", linhas.count === 1);

  // 5. rejeita nome desconhecido e chave vazia
  let e1 = null, e2 = null, e3 = null;
  try { await salvarPix(PIX_DESPACHANTE, "Fulano de Tal", "x"); } catch (e) { e1 = e.message; }
  try { await salvarPix(PIX_DESPACHANTE, "Marcelo Lima", "   "); } catch (e) { e2 = e.message; }
  try { await salvarPix(PIX_TRANSPORTADORA, "Fretes Zé", "x"); } catch (e) { e3 = e.message; }
  check("5. rejeita nome desconhecido (despachante)", e1 === "Nome desconhecido.");
  check("5. rejeita chave vazia (só espaços)", e2 === "Chave PIX vazia.");
  check("5. rejeita nome desconhecido (transportadora)", e3 === "Nome desconhecido.");
} catch (e) {
  console.log("EXCEÇÃO:", e.message);
  failures++;
} finally {
  await restore();
}

// confere que a restauração deixou cada alvo idêntico ao snapshot
for (const { tipo, nome } of ALVOS) {
  const { data } = await db.from(T_PIX).select("*").eq("tipo", tipo).eq("nome", nome).maybeSingle();
  const bak = baks.get(`${tipo}|${nome}`);
  const ok = bak
    ? data && data.chave_pix === bak.chave_pix
    : data === null;
  check(`restauração de ${tipo}/${nome} bate com o snapshot`, ok);
}

console.log(failures === 0 ? "\nTODOS OS CHECKS PASSARAM" : `\n${failures} CHECK(S) FALHARAM`);
process.exitCode = failures === 0 ? 0 : 1;
