// Cria (ou atualiza) as 4 contas dedicadas de teste e2e — administrador, operacional, sócio e
// consultor — no Supabase LOCAL, e grava as credenciais no `.env.e2e` (nunca no `.env`).
//
//   node scripts/setup-e2e-local-users.mjs [--arquivo .env.e2e] [--rotate] [--dry-run]
//   npm run e2e:setup-users
//
// Segurança:
// - SÓ roda contra loopback (localhost / 127.0.0.1 / [::1]); qualquer outra URL aborta ANTES de abrir
//   conexão. O `.env` de produção nunca é lido.
// - Contas criadas pela Admin API (`auth.admin.createUser`), nunca por SQL, com o mesmo app_metadata
//   que o app usa (`{ role, consultorNome, nome }` — ver server/utils/authUser.ts).
// - Idempotente: conta que já existe só tem senha e app_metadata reaplicados. A senha gravada em
//   `.env.e2e` é reaproveitada; `--rotate` gera novas.
// - Senhas nunca são impressas. O script só confirma o login de cada conta.
//
// Existe e está versionado de propósito: a ausência dele, numa rodada anterior, foi o que fez as
// credenciais e2e se perderem sem registro de como recriá-las.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  CONTAS_E2E,
  appMetadataDe,
  definirNoEnvTexto,
  emailDe,
  lerEnvTexto,
  planejarVariaveis,
  urlEhLoopback,
} from "./lib/e2eUsuarios.mjs";

function falhar(mensagem) {
  console.error(`✖ ${mensagem}`);
  process.exit(1);
}

function argumento(nome) {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? (process.argv[i + 1] ?? "") : undefined;
}

const arquivo = argumento("--arquivo") || process.env.E2E_ENV_FILE?.trim() || ".env.e2e";
const rotacionar = process.argv.includes("--rotate");
const dryRun = process.argv.includes("--dry-run");
const caminho = resolve(process.cwd(), arquivo);

if (!existsSync(caminho)) {
  falhar(
    `${arquivo} não existe. Copie .env.e2e.example para .env.e2e e preencha com as chaves do ` +
      "`supabase status` (Supabase LOCAL).",
  );
}

const textoEnv = readFileSync(caminho, "utf-8");
const env = lerEnvTexto(textoEnv);
const url = env.NUXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = env.NUXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = env.NUXT_SUPABASE_SERVICE_ROLE_KEY ?? "";

// Trava de loopback ANTES de qualquer conexão.
if (!urlEhLoopback(url)) {
  let alvo = "(não definida)";
  try {
    if (url) alvo = new URL(url).host;
  } catch {
    alvo = "(inválida)";
  }
  falhar(
    `NUXT_PUBLIC_SUPABASE_URL em ${arquivo} é ${alvo}, que não é local. Este script cria contas e ` +
      "só roda contra o Supabase LOCAL (localhost / 127.0.0.1 / [::1]). Nada foi feito.",
  );
}
if (!anonKey || !serviceKey) {
  falhar(`${arquivo} precisa de NUXT_PUBLIC_SUPABASE_ANON_KEY e NUXT_SUPABASE_SERVICE_ROLE_KEY.`);
}

const dominio = env.E2E_EMAIL_DOMAIN || undefined;
const { pares, senhas } = planejarVariaveis(env, { dominio, rotacionar });

if (dryRun) {
  console.log(`(dry-run) Supabase local: ${new URL(url).host} — nada será criado nem gravado.`);
  for (const conta of CONTAS_E2E) {
    const extra = conta.consultorNome ? ` · consultorNome=${conta.consultorNome}` : "";
    console.log(`  ${conta.chave.padEnd(11)} ${emailDe(conta, dominio)} · role=${conta.role}${extra}`);
  }
  process.exit(0);
}

// Grava as credenciais ANTES de aplicar: o arquivo sempre tem a senha que será definida. Se algo
// falhar no meio, rodar de novo reaproveita essas senhas (o script é idempotente).
writeFileSync(caminho, definirNoEnvTexto(textoEnv, pares), "utf-8");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function listarContas() {
  const todas = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) falhar(`não consegui listar as contas do Supabase local: ${error.message}`);
    todas.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return todas;
}

const existentes = new Map((await listarContas()).map((u) => [(u.email ?? "").toLowerCase(), u]));
let erros = 0;

for (const conta of CONTAS_E2E) {
  const email = emailDe(conta, dominio);
  const password = senhas[conta.chave];
  const app_metadata = appMetadataDe(conta);
  const atual = existentes.get(email.toLowerCase());

  const resposta = atual
    ? await admin.auth.admin.updateUserById(atual.id, { password, app_metadata, email_confirm: true })
    : await admin.auth.admin.createUser({ email, password, app_metadata, email_confirm: true });

  if (resposta.error) {
    erros++;
    console.error(`✖ ${conta.chave}: ${atual ? "atualizar" : "criar"} falhou — ${resposta.error.message}`);
    continue;
  }
  console.log(`• ${conta.chave.padEnd(11)} ${atual ? "atualizada" : "criada"} (${conta.role})`);
}

// Login real de cada conta, com a chave anon (como o navegador faz).
for (const conta of CONTAS_E2E) {
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({
    email: emailDe(conta, dominio),
    password: senhas[conta.chave],
  });
  if (error || !data.user) {
    erros++;
    console.error(`✖ ${conta.chave}: login falhou — ${error?.message ?? "sem usuário"}`);
    continue;
  }
  const roleGravado = data.user.app_metadata?.role;
  if (roleGravado !== conta.role) {
    erros++;
    console.error(`✖ ${conta.chave}: autenticou, mas app_metadata.role é "${roleGravado}" (esperado "${conta.role}")`);
  } else {
    console.log(`✔ ${conta.chave.padEnd(11)} login ok · role=${roleGravado}`);
  }
  await anon.auth.signOut({ scope: "local" }).catch(() => undefined);
}

if (erros > 0) falhar(`${erros} problema(s). Veja as mensagens acima.`);
console.log(`\nCredenciais E2E_* gravadas em ${arquivo} (senhas não impressas).`);
