import { test, expect } from "@playwright/test";

// Cobre o redesign visual do /login (Parte A) e o fluxo de recuperação de
// senha (Parte B). O login "de verdade" (credenciais válidas/inválidas,
// redirect, logout) já é coberto em auth.spec.ts reaproveitando os mesmos
// ids (#login-email, #login-password, #login-submit, #login-error) — este
// arquivo não duplica esses casos.

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "notebook", width: 1280, height: 800 },
  { name: "desktop", width: 1600, height: 900 },
] as const;

test.describe("Login — redesign visual", () => {
  for (const { name, width, height } of VIEWPORTS) {
    test(`sem overflow horizontal em ${name} (${width}x${height})`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/login", { waitUntil: "domcontentloaded" });

      await expect(page.locator("#login-page")).toBeVisible();
      await expect(page.locator("#login-email")).toBeVisible();
      await expect(page.locator("#login-password")).toBeVisible();
      await expect(page.locator("#login-submit")).toBeVisible();

      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(hasOverflow).toBe(false);
    });
  }
});

// O Nuxt pode ainda estar hidratando quando o Playwright clica em
// "Esqueceu a senha?" — sem hidratação o @click não faz nada e o form de
// login continua na tela (mesma causa documentada em auth.spec.ts pro
// @submit.prevent do login). Repete o clique até o modo forgot aparecer.
async function openForgotMode(page: import("@playwright/test").Page): Promise<void> {
  await expect(async () => {
    await page.locator("#forgot-password-link").click();
    await expect(page.locator("#forgot-email")).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15000 });
}

test.describe("Login — recuperação de senha", () => {
  test("'Esqueceu a senha?' troca pro modo forgot sem navegar, e volta com 'Voltar para o login'", async ({
    page,
  }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await page.locator("#login-email").fill("alguem@farmaurora.com.br");
    await openForgotMode(page);

    // Mesma rota (não navegou) — só trocou o conteúdo do card.
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.locator("#login-email")).toHaveCount(0);

    await expect(async () => {
      await page.locator("#back-to-login").click();
      await expect(page.locator("#login-email")).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 15000 });
    await expect(page.locator("#forgot-email")).toHaveCount(0);
  });

  test("submeter o modo forgot mostra mensagem de sucesso genérica", async ({ page }) => {
    // Intercepta a chamada ao Supabase Auth (resetPasswordForEmail) — não
    // depende de receber e-mail de verdade nem de credenciais de teste.
    await page.route("**/auth/v1/recover*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
    );

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await openForgotMode(page);

    await page.locator("#forgot-email").fill("qualquer@farmaurora.com.br");
    await page.locator("#forgot-submit").click();

    await expect(page.locator("#forgot-success")).toBeVisible();
    await expect(page.locator("#forgot-success")).toContainText(
      "Se esse e-mail estiver cadastrado",
    );
    await expect(page.locator("#forgot-error")).toHaveCount(0);
  });

  test("acessar /redefinir-senha sem token de recovery mostra link inválido/expirado", async ({
    page,
  }) => {
    await page.goto("/redefinir-senha", { waitUntil: "domcontentloaded" });

    await expect(page.locator("#redefinir-checking")).toBeVisible();
    await expect(page.locator("#request-new-link")).toBeVisible({ timeout: 8000 });
    await expect(page.locator("#new-password")).toHaveCount(0);

    await page.locator("#request-new-link").click();
    await expect(page).toHaveURL(/\/login\?forgot=1/);
    await expect(page.locator("#forgot-email")).toBeVisible();
  });
});
