import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Página /recados (Fase D1): criar/editar/excluir, visibilidade por
// destinatário (público/cargo/pessoa), fixar, concluir, filtro de tipo e
// integração com o sino global (Fase C). Aba "Meus" fica pra D2.
//
// Cria 4 contas de teste via admin API (autor administrador + 2 operacional
// + 1 sócio, pra provar independência entre destinatários do mesmo cargo) e
// 3 recados com tipos diferentes — reaproveitados entre os testes na ordem
// certa (o que precisa sobreviver até o fim só é editado/excluído por
// último). Tudo com prefixo RUN único, apagado no afterAll (recados,
// notificações de fan-out pras contas REAIS que têm esse cargo, e as 4
// contas de teste).

function lerEnv(): { url: string; serviceKey: string } {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf-8");
    const map = Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }),
    );
    return { url: map.NUXT_PUBLIC_SUPABASE_URL ?? "", serviceKey: map.NUXT_SUPABASE_SERVICE_ROLE_KEY ?? "" };
  } catch {
    return { url: "", serviceKey: "" };
  }
}

const env = lerEnv();
const runnable = Boolean(env.url && env.serviceKey);
const RUN = Date.now().toString(36);
const SENHA = `RecadosE2e${RUN}!aB`;

interface ContaTeste {
  id: string;
  email: string;
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

async function selectOption(page: Page, triggerId: string, optionText: string): Promise<void> {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole("option", { name: optionText, exact: true }).click();
}

test.describe.serial("Recados", () => {
  test.describe.configure({ retries: 2 });
  test.skip(!runnable, "defina o .env com NUXT_PUBLIC_SUPABASE_URL + NUXT_SUPABASE_SERVICE_ROLE_KEY");

  const db = runnable
    ? createClient(env.url, env.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  let autor: ContaTeste;
  let operacionalA: ContaTeste;
  let operacionalB: ContaTeste;
  let socio: ContaTeste;

  let idPublico = "";
  let idCargo = "";
  let idPessoa = "";

  const TITULO_PUBLICO = `RUN${RUN} Aviso público`;
  const TITULO_CARGO = `RUN${RUN} Aviso operacional`;
  const TITULO_PESSOA = `RUN${RUN} Aviso pessoal`;

  test.beforeAll(async () => {
    if (!db) return;
    async function criarConta(key: string, role: string, nome: string): Promise<ContaTeste> {
      const email = `e2e-recados-${key}-${RUN}@teste.local`;
      const { data, error } = await db!.auth.admin.createUser({
        email,
        password: SENHA,
        email_confirm: true,
        app_metadata: { role, nome },
      });
      if (error) throw new Error(`Falha ao criar conta ${key}: ${error.message}`);
      return { id: data.user.id, email };
    }
    autor = await criarConta("autor", "administrador", "RUN Autor");
    operacionalA = await criarConta("operacional-a", "operacional", "RUN Operacional A");
    operacionalB = await criarConta("operacional-b", "operacional", "RUN Operacional B");
    socio = await criarConta("socio", "socio", "RUN Socio");
  });

  test.afterAll(async () => {
    if (!db) return;
    for (const id of [idPublico, idCargo, idPessoa]) {
      if (id) {
        await db.from("notificacoes").delete().eq("recado_id", id);
        await db.from("recados").delete().eq("id", id);
      }
    }
    // Fan-out de "cargo" notifica TODAS as contas reais com esse cargo, não
    // só as de teste — limpa por conteúdo da mensagem (tem o RUN, único).
    await db.from("notificacoes").delete().like("mensagem", `%RUN${RUN}%`);
    for (const conta of [autor, operacionalA, operacionalB, socio]) {
      if (conta?.id) await db.auth.admin.deleteUser(conta.id);
    }
  });

  test("1 · cria público/cargo/pessoa — cada um visível só pra quem deveria", async ({ page }) => {
    await login(page, autor.email, SENHA);
    await page.goto("/recados", { waitUntil: "networkidle" });

    // Público, tipo Urgente.
    await page.locator("#btn-novo-recado").click();
    await page.locator("#recado-titulo").fill(TITULO_PUBLICO);
    await page.locator("#recado-mensagem").fill("Mensagem pública de teste.");
    await selectOption(page, "recado-tipo", "Urgente");
    await page.locator("#btn-recado-salvar").click();
    await expect(page.getByText(TITULO_PUBLICO, { exact: false }).first()).toBeVisible();

    // Cargo = Operacional, tipo Atenção.
    await page.locator("#btn-novo-recado").click();
    await page.locator("#recado-titulo").fill(TITULO_CARGO);
    await page.locator("#recado-mensagem").fill("Mensagem de cargo de teste.");
    await selectOption(page, "recado-tipo", "Atenção");
    await selectOption(page, "recado-destinatario-tipo", "Cargo");
    await selectOption(page, "recado-destinatario-cargo", "Operacional");
    await page.locator("#btn-recado-salvar").click();
    await expect(page.getByText(TITULO_CARGO, { exact: false }).first()).toBeVisible();

    // Pessoa = Operacional A, tipo Informação.
    await page.locator("#btn-novo-recado").click();
    await page.locator("#recado-titulo").fill(TITULO_PESSOA);
    await page.locator("#recado-mensagem").fill("Mensagem pessoal de teste.");
    await selectOption(page, "recado-tipo", "Informação");
    await selectOption(page, "recado-destinatario-tipo", "Pessoa específica");
    await selectOption(page, "recado-destinatario-pessoa", "RUN Operacional A");
    await page.locator("#btn-recado-salvar").click();
    await expect(page.getByText(TITULO_PESSOA, { exact: false }).first()).toBeVisible();

    // Captura os ids via API (autor autenticado) pra usar no resto da suíte.
    const lista = (await (await page.request.get("/api/recados")).json()) as Array<{ id: string; titulo: string }>;
    idPublico = lista.find((r) => r.titulo === TITULO_PUBLICO)?.id ?? "";
    idCargo = lista.find((r) => r.titulo === TITULO_CARGO)?.id ?? "";
    idPessoa = lista.find((r) => r.titulo === TITULO_PESSOA)?.id ?? "";
    expect(idPublico).toBeTruthy();
    expect(idCargo).toBeTruthy();
    expect(idPessoa).toBeTruthy();

    // Operacional A: vê os 3 (público + é o cargo + é a pessoa).
    await login(page, operacionalA.email, SENHA);
    await page.goto("/recados", { waitUntil: "networkidle" });
    await expect(page.locator(`#recado-card-${idPublico}`)).toBeVisible();
    await expect(page.locator(`#recado-card-${idCargo}`)).toBeVisible();
    await expect(page.locator(`#recado-card-${idPessoa}`)).toBeVisible();

    // Sócio: só vê o público — não é o cargo, não é a pessoa, não é o autor.
    await login(page, socio.email, SENHA);
    await page.goto("/recados", { waitUntil: "networkidle" });
    await expect(page.locator(`#recado-card-${idPublico}`)).toBeVisible();
    await expect(page.locator(`#recado-card-${idCargo}`)).toHaveCount(0);
    await expect(page.locator(`#recado-card-${idPessoa}`)).toHaveCount(0);

    // E o sócio não vê editar/excluir no recado público (não é autor).
    await expect(page.locator(`#btn-editar-recado-${idPublico}`)).toHaveCount(0);
    await expect(page.locator(`#btn-excluir-recado-${idPublico}`)).toHaveCount(0);
  });

  test("2 · fixar persiste após reload", async ({ page }) => {
    await login(page, operacionalA.email, SENHA);
    await page.goto("/recados", { waitUntil: "networkidle" });

    const btnFixar = page.locator(`#btn-fixar-recado-${idCargo}`);
    await expect(btnFixar).toHaveAttribute("title", "Fixar");
    await btnFixar.click();
    await expect(btnFixar).toHaveAttribute("title", "Desfixar");

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(`#btn-fixar-recado-${idCargo}`)).toHaveAttribute("title", "Desfixar");

    // Desfixa de volta, também persistindo.
    await page.locator(`#btn-fixar-recado-${idCargo}`).click();
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(`#btn-fixar-recado-${idCargo}`)).toHaveAttribute("title", "Fixar");
  });

  test("4 · concluir some da lista só pra quem concluiu — outro destinatário do mesmo cargo continua vendo", async ({
    page,
  }) => {
    await login(page, operacionalA.email, SENHA);
    await page.goto("/recados", { waitUntil: "networkidle" });

    await page.locator(`#btn-concluir-recado-${idCargo}`).click();
    await page.locator("#btn-confirm-dialog-confirm").click();
    await expect(page.locator(`#recado-card-${idCargo}`)).toHaveCount(0, { timeout: 10000 });

    // Persistiu — recarregar não traz de volta.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(`#recado-card-${idCargo}`)).toHaveCount(0);

    // Operacional B (mesmo cargo, não concluiu) continua vendo normalmente.
    await login(page, operacionalB.email, SENHA);
    await page.goto("/recados", { waitUntil: "networkidle" });
    await expect(page.locator(`#recado-card-${idCargo}`)).toBeVisible();
  });

  test("5 · recado direcionado gera notificação visível no sino global", async ({ page }) => {
    await login(page, operacionalA.email, SENHA);
    // Página sem relação direta com Recados — confirma integração real com o
    // sino global (Fase C), não só a tabela no banco.
    await page.goto("/pagamentos", { waitUntil: "networkidle" });

    await page.locator("#btn-notificacoes-fornecedor").click();
    const painel = page.locator("#painel-notificacoes-fornecedor");
    await expect(painel).toBeVisible();
    await expect(painel.getByText(TITULO_PESSOA, { exact: false })).toBeVisible();
  });

  test("6 · editar como autor reflete na lista; excluir some da lista", async ({ page }) => {
    const TITULO_EDITADO = `${TITULO_PUBLICO} (editado)`;

    await login(page, autor.email, SENHA);
    await page.goto("/recados", { waitUntil: "networkidle" });

    await page.locator(`#btn-editar-recado-${idPublico}`).click();
    await expect(page.locator("#recado-titulo")).toHaveValue(TITULO_PUBLICO);
    await page.locator("#recado-titulo").fill(TITULO_EDITADO);
    await page.locator("#btn-recado-salvar").click();
    await expect(page.locator(`#recado-card-${idPublico}`)).toContainText(TITULO_EDITADO);

    await page.locator(`#btn-excluir-recado-${idPublico}`).click();
    await page.locator("#btn-confirm-dialog-confirm").click();
    await expect(page.locator(`#recado-card-${idPublico}`)).toHaveCount(0);
  });
});
