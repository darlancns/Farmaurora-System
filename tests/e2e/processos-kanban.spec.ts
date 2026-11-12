import { test, expect, type Page } from "@playwright/test";
import { assertSupabaseLocal } from "./_guards/supabaseLocal";
import { fixarVisao } from "./_helpers/visaoProcessos";

// Kanban do Follow-Up (Etapas B–F): visão padrão de quem pode editar, 5 colunas, painel lateral, mover de coluna
// com confirmação (menu e arrastar) e conflito de versão (409). Cria processos de teste via API (com um RUN no
// nome) e SEMPRE apaga no afterAll. Só roda contra o Supabase falso local (a guarda aborta fora de loopback).
//
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (preferido) ou E2E_OPERACIONAL_EMAIL / E2E_OPERACIONAL_PASSWORD
//   E2E_CONSULTOR_EMAIL / E2E_CONSULTOR_PASSWORD (opcional: confere que o consultor não vê o Kanban)

assertSupabaseLocal();

const writer = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_OPERACIONAL_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_OPERACIONAL_PASSWORD ?? "",
};
const consultor = {
  email: process.env.E2E_CONSULTOR_EMAIL ?? "",
  password: process.env.E2E_CONSULTOR_PASSWORD ?? "",
};
const hasWriter = Boolean(writer.email && writer.password);

const RUN = String(Date.now()).slice(-9);

function dados(paciente: string, pasta: string, status: string, extra: object = {}): object {
  return {
    paciente: `${paciente} ${RUN}`,
    pasta,
    empresa: "FARMAURORA",
    consultor: "Dani",
    responsavelOperacional: "Rebeca",
    modalEnvio: "Air Cargo",
    despachante: "Andreza Faconi",
    medicamentos: [{ nome: "PEMBROLIZUMABE", quantidade: "4 cx" }],
    status,
    statusPagamento: "pago",
    datas: {},
    pendencias: ["Enviar laudo"],
    atualizacoes: [],
    ...extra,
  };
}

async function login(page: Page, conta = writer): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(async () => {
    await page.locator("#login-email").fill(conta.email);
    await page.locator("#login-password").fill(conta.password);
    await page.locator("#login-submit").click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 3000 });
  }).toPass({ timeout: 45000 });
}

async function criar(page: Page, corpo: object): Promise<string> {
  const res = await page.request.post("/api/processos", { data: corpo });
  expect(res.ok(), `POST /api/processos: ${res.status()}`).toBe(true);
  return ((await res.json()) as { id: string }).id;
}

async function buscar(page: Page, id: string): Promise<{ status: string; updatedAt: string; atualizacoes: { texto: string }[] }> {
  const res = await page.request.get(`/api/processos/${id}`);
  expect(res.ok()).toBe(true);
  return res.json();
}

async function abrirKanban(page: Page): Promise<void> {
  await page.goto("/processos", { waitUntil: "networkidle" });
  await expect(page.locator("#processo-kanban")).toBeVisible();
  await page.locator("#processo-search").fill(RUN);
}

const coluna = (page: Page, id: string) => page.locator(`#kanban-coluna-${id}`);

// Mover pelo painel (o card não tem mais botão próprio): abre o card, "Mover para…" no cabeçalho do painel, escolhe.
async function pedirMoverPeloPainel(page: Page, id: string, colunaDestino: string): Promise<void> {
  await page.locator(`#processo-card-${id}`).click();
  await expect(page.locator("[data-testid='processo-painel']")).toBeVisible();
  await page.locator(`#btn-mover-painel-${id}`).click();
  await page.locator(`#mover-painel-${id}-${colunaDestino}`).click();
}

let ids: { transito: string; origem: string; conflito: string; arrastar: string } | null = null;

test.describe("/processos — Kanban", () => {
  test.describe.configure({ mode: "serial", retries: 1 });
  test.skip(!hasWriter, "defina E2E_ADMIN_EMAIL/PASSWORD ou E2E_OPERACIONAL_EMAIL/PASSWORD");

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await login(page);
      ids = {
        transito: await criar(page, dados("Kanban Transito", "2026 - 901", "em_transito")),
        origem: await criar(page, dados("Kanban Origem", "2026 - 902", "elaboracao_fornecedores", { statusPagamento: "pendente" })),
        conflito: await criar(page, dados("Kanban Conflito", "2026 - 903", "liberado")),
        arrastar: await criar(page, dados("Kanban Arrastar", "2026 - 904", "desembaraco")),
      };
    } finally {
      await page.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await login(page);
      const todos = (await (await page.request.get("/api/processos")).json()) as { id: string; paciente: string }[];
      for (const p of todos.filter((x) => x.paciente.includes(RUN))) {
        expect((await page.request.delete(`/api/processos/${p.id}`)).ok(), `DELETE ${p.id}`).toBe(true);
      }
    } finally {
      await page.close();
      ids = null;
    }
  });

  test.describe("desktop (1280x800)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await login(page);
    });

    test("Kanban é o padrão de quem edita: 5 colunas, contadores, sem abas; a Lista continua a um clique", async ({ page }) => {
      await abrirKanban(page);
      const nomes = await page.locator("section[id^='kanban-coluna-']").evaluateAll((els) => els.map((e) => e.id));
      expect(nomes).toEqual([
        "kanban-coluna-na-origem",
        "kanban-coluna-em-transito",
        "kanban-coluna-desembaraco",
        "kanban-coluna-liberado",
        "kanban-coluna-entregue",
      ]);
      await expect(page.locator("#tab-andamento")).toHaveCount(0);
      await expect(page.locator("#filtro-status")).toHaveCount(0);
      await expect(coluna(page, "em-transito").locator(`#processo-card-${ids!.transito}`)).toBeVisible();
      await expect(coluna(page, "na-origem").locator(`#processo-card-${ids!.origem}`)).toBeVisible();
      await expect(page.locator("#kanban-contador-em-transito")).toHaveText("1");
      await expect(page.locator(`#card-pagamento-${ids!.origem}`)).toHaveText("Pendente");
      await expect(page.locator(`#card-pendencias-${ids!.transito}`)).toContainText("1");

      // Cabeçalho em faixa da cor do projeto, igual em todas: "[ícone] Em trânsito (1)".
      await expect(page.locator("#kanban-cabecalho-em-transito")).toHaveText(/Em trânsito \(1\)/);
      expect(await page.locator("#kanban-cabecalho-em-transito").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
        "rgb(11, 57, 86)",
      );

      // Colunas com no mínimo 312px; só o QUADRO rola de lado (a página não); sem rolagem vertical própria do quadro.
      const larguras = await page.locator("section[id^='kanban-coluna-']").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
      for (const w of larguras) expect(w).toBeGreaterThanOrEqual(312 - 0.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      const main = await page.locator("#app-main-content").evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
      expect(main, "o <main> não rola de lado").toBe(true);
      const quadroRola = await page.locator("#processo-kanban").evaluate((el) => ({
        horizontal: el.scrollWidth > el.clientWidth,
        vertical: el.scrollHeight > el.clientHeight + 1,
      }));
      expect(quadroRola.vertical, "o quadro não tem rolagem vertical própria").toBe(false);
      for (const lista of await page.locator("[id^='kanban-lista-']").all()) {
        expect(await lista.evaluate((el) => getComputedStyle(el).overflowY)).toBe("visible");
      }

      // Pior caso da linha 1 do card inteiro (sem reticências) com a etiqueta ao lado.
      const pastaPo = page.locator(`#card-pasta-po-${ids!.origem}`);
      expect(await pastaPo.evaluate((el) => el.scrollWidth <= el.clientWidth + 0.5)).toBe(true);

      // Botões ‹ ›: em 1280px as 5 colunas não cabem → só o › no começo; rola ~1 coluna e aparece o ‹.
      if (quadroRola.horizontal) {
        await expect(page.locator("#btn-kanban-rolar-esquerda")).toHaveCount(0);
        const antes = await page.locator("#processo-kanban").evaluate((el) => el.scrollLeft);
        await page.getByRole("button", { name: "Rolar quadro para a direita" }).click();
        await expect.poll(() => page.locator("#processo-kanban").evaluate((el) => el.scrollLeft)).toBeGreaterThan(antes + 200);
        await expect(page.getByRole("button", { name: "Rolar quadro para a esquerda" })).toBeVisible();
      }

      await page.locator("#processo-visao-toggle-lista").click();
      await expect(page.locator("#tab-andamento")).toBeVisible();
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator("#tab-andamento")).toBeVisible(); // preferência lembrada
      await page.locator("#processo-visao-toggle-kanban").click();
      await expect(page.locator("#processo-kanban")).toBeVisible();
    });

    test("painel: abre pelo card, blocos na ordem, Esc fecha e devolve o foco ao card", async ({ page }) => {
      await fixarVisao(page, "kanban");
      await abrirKanban(page);
      const abrir = page.locator(`#processo-card-${ids!.transito}`);
      await expect(abrir).toHaveAttribute("role", "button");
      expect(await abrir.locator("button").count(), "card sem botão dentro").toBe(0);
      // Teclado: foco no card e Enter abre o painel.
      await abrir.focus();
      await page.keyboard.press("Enter");
      const painel = page.locator("[data-testid='processo-painel']");
      await expect(painel).toBeVisible();
      const blocos = await painel.locator("[id^='painel-bloco-']").evaluateAll((els) => els.map((e) => e.id.replace("painel-bloco-", "")));
      expect(blocos).toEqual([
        "cabecalho", "pasta", "medicamentos", "fornecedor", "envio", "transportadora",
        "numero-processo", "datas", "pendencias", "atualizacoes", "rodape",
      ]);
      await expect(page.locator("#painel-status")).toHaveText("Em trânsito");
      // Editar abre o formulário POR CIMA do painel.
      await page.locator("#btn-painel-editar").click();
      await expect(page.locator("#processo-form")).toBeVisible();
      await page.locator("#btn-close-processo-form").click();
      await expect(painel).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(painel).toHaveCount(0);
      await expect(abrir).toBeFocused();
    });

    test("Mover para… (painel) com confirmação: cancelar não grava; confirmar muda a coluna e registra a atualização", async ({ page }) => {
      await fixarVisao(page, "kanban");
      await abrirKanban(page);
      const id = ids!.transito;

      await pedirMoverPeloPainel(page, id, "desembaraco");
      const dialogo = page.locator("[role='alertdialog']");
      await expect(dialogo).toContainText(`de Em trânsito para Desembaraço? A mudança fica registrada nas atualizações e o consultor é avisado.`);
      await dialogo.getByRole("button", { name: "Cancelar" }).click();
      expect((await buscar(page, id)).status).toBe("em_transito");

      await page.locator(`#btn-mover-painel-${id}`).click();
      await page.locator(`#mover-painel-${id}-desembaraco`).click();
      await page.locator("[role='alertdialog']").getByRole("button", { name: "Mover" }).click();
      await expect(page.locator("#toast-notice")).toHaveText("Processo movido para Desembaraço");
      await expect(page.locator("#painel-status")).toHaveText("Desembaraço");
      await page.locator("#btn-painel-fechar").click();
      await expect(coluna(page, "desembaraco").locator(`#processo-card-${id}`)).toBeVisible();
      const depois = await buscar(page, id);
      expect(depois.status).toBe("desembaraco");
      expect(depois.atualizacoes.at(-1)?.texto).toMatch(/^Status alterado de Em trânsito para Desembaraço em \d{2}\/\d{2}\.$/);
    });

    test("arrastar (mouse) para outra coluna pede a confirmação e move", async ({ page }) => {
      await fixarVisao(page, "kanban");
      await abrirKanban(page);
      const id = ids!.arrastar;
      await page.locator(`#processo-card-${id}`).dragTo(page.locator("#kanban-lista-liberado"));
      const dialogo = page.locator("[role='alertdialog']");
      await expect(dialogo).toContainText("de Desembaraço para Liberado?");
      await dialogo.getByRole("button", { name: "Mover" }).click();
      await expect(coluna(page, "liberado").locator(`#processo-card-${id}`)).toBeVisible();
      expect((await buscar(page, id)).status).toBe("liberado");
    });

    test("409: o processo mudou entre abrir a tela e confirmar → aviso, nada gravado, card atualizado", async ({ page }) => {
      await fixarVisao(page, "kanban");
      await abrirKanban(page);
      const id = ids!.conflito;
      await pedirMoverPeloPainel(page, id, "entregue");
      // Outra pessoa grava o processo agora (PATCH simples, sem versão): o updated_at muda.
      const patch = await page.request.patch(`/api/processos/${id}`, { data: { localEntrega: "Mudou no meio", parcial: true } });
      expect(patch.ok()).toBe(true);
      await page.locator("[role='alertdialog']").getByRole("button", { name: "Mover" }).click();
      await expect(page.locator("#toast-notice")).toHaveText("Este processo foi alterado por outra pessoa. Confira e tente de novo.");
      expect((await buscar(page, id)).status).toBe("liberado");
      await expect(coluna(page, "liberado").locator(`#processo-card-${id}`)).toBeVisible();
    });

    test("?processo=<id> abre o painel e rola até o card", async ({ page }) => {
      await fixarVisao(page, "kanban");
      await page.goto(`/processos?processo=${ids!.origem}`, { waitUntil: "networkidle" });
      await expect(page.locator(`#processo-painel-${ids!.origem}`)).toBeVisible();
      await expect(page).not.toHaveURL(/processo=/);
    });
  });

  test.describe("celular (390x844)", () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await login(page);
    });

    test("Kanban com snap e gutter, sem arrastar; card inteiro abre o painel em tela cheia (fechar e Mover para… visíveis)", async ({ page }) => {
      await fixarVisao(page, "kanban");
      await abrirKanban(page);
      const card = page.locator(`#processo-card-${ids!.origem}`);
      await expect(card).toBeVisible();
      expect(await card.getAttribute("draggable")).toBeNull(); // toque: arrastar desligado
      const primeira = await coluna(page, "na-origem").boundingBox();
      expect(primeira!.x).toBeGreaterThanOrEqual(15); // gutter de 16px
      expect(primeira!.width).toBeGreaterThan(390 * 0.8);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

      const caixaCard = await card.boundingBox();
      expect(caixaCard!.height).toBeGreaterThanOrEqual(44); // o card inteiro é a área de toque
      expect(await card.locator("button").count(), "card sem botão de mover").toBe(0);

      await card.click();
      const painel = page.locator("[data-testid='processo-painel']");
      const caixa = await painel.boundingBox();
      expect(caixa!.width).toBeCloseTo(390, 0);
      await painel.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
      const fechar = await page.locator("#btn-painel-fechar").boundingBox();
      expect(fechar!.y).toBeGreaterThanOrEqual(0);
      expect(fechar!.height).toBeGreaterThanOrEqual(44);
      // Em toque, mover é pelo menu do painel.
      const menuPainel = await page.locator(`#btn-mover-painel-${ids!.origem}`).boundingBox();
      expect(menuPainel!.height).toBeGreaterThanOrEqual(44);
      await page.locator("#btn-painel-fechar").click();
      await expect(painel).toHaveCount(0);
    });

    test("filtros no sheet: sem Status e com Cotações ASD no Kanban", async ({ page }) => {
      await fixarVisao(page, "kanban");
      await abrirKanban(page);
      await page.locator("#btn-filtros-processo").click();
      await expect(page.locator("#sheet-filtro-status")).toHaveCount(0);
      await expect(page.locator("#sheet-filtro-cotacao")).toBeVisible();
    });
  });

  test("consultor nunca vê a alternância nem o Kanban", async ({ page }) => {
    test.skip(!consultor.email || !consultor.password, "defina E2E_CONSULTOR_EMAIL/PASSWORD");
    await fixarVisao(page, "kanban");
    await login(page, consultor);
    await page.goto("/processos", { waitUntil: "networkidle" });
    await expect(page.locator("#processo-visao-toggle")).toHaveCount(0);
    await expect(page.locator("#processo-kanban")).toHaveCount(0);
  });
});
