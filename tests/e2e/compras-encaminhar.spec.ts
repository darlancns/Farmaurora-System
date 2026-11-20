import { test, expect, type Page } from "@playwright/test";

// O "Encaminhar para a DIR" da página Compras (7b): o botão e as permissões, o painel (conferência, linhas, temperatura mista), os bloqueios
// (campos faltando, PO que já existe na DIR), o Encaminhar de verdade, o PO travado e o aviso ao cancelar.
//
// ESCRITO, NÃO EXECUTADO (só foi conferido com `npx playwright test --list`). A e2e só roda no Supabase LOCAL (a guarda em tests/e2e/_guards
// aborta fora de loopback). O Encaminhar de verdade CRIA linhas na DIR do banco local (paciente "TESTE E2E ENCAMINHAR ...", POs PO26-12-xxxx):
// o teste as remove no fim pela API (DELETE /api/dir/:id); as compras ficam (o app não apaga compras): recrie o banco local para limpar.
// NUNCA rode contra produção. Ver tests/e2e/README.md.
//
// A compra do teste é montada pela API (POST /api/compras e PATCH com o estado completo), que é muito mais estável do que preencher o formulário;
// a tela é usada para o que é da tela. O fornecedor, o despachante e o vendedor precisam ser itens ATIVOS dos Cadastros do banco local (o servidor
// recusa os outros), então vêm de variáveis de ambiente; sem elas, o teste do Encaminhar de verdade é pulado.

const cred = (prefixo: string) => ({
  email: process.env[`E2E_${prefixo}_EMAIL`] ?? "",
  password: process.env[`E2E_${prefixo}_PASSWORD`] ?? "",
});
const admin = cred("ADMIN");
const operacional = cred("OPERACIONAL");
const socio = cred("SOCIO");
// Uma conta operacional com mapa de permissões: compras = editar e dir = ver (precisa ser criada à mão no banco local).
const editaComprasVeDir = cred("COMPRAS_EDITA_DIR_VE");
const tem = (c: { email: string; password: string }) => Boolean(c.email && c.password);

const FORNECEDOR = process.env.E2E_ENCAMINHAR_FORNECEDOR ?? "";
const DESPACHANTE = process.env.E2E_ENCAMINHAR_DESPACHANTE ?? "";
const VENDEDOR = process.env.E2E_ENCAMINHAR_VENDEDOR ?? "";
const temCadastros = Boolean(FORNECEDOR && DESPACHANTE && VENDEDOR);

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

interface CompraApi {
  id: string;
  anoMes: string;
  updatedAt: string;
}

const unico = (): string => `${Date.now()}`;
/** Um PO fictício do mês de teste (4 dígitos pelo relógio); se já existir na DIR do banco local, o teste de PO existente o usa de propósito. */
const poFicticio = (deslocamento = 0): string => `PO26-12-${String((Date.now() + deslocamento) % 10000).padStart(4, "0")}`;

async function criarCompraPelaApi(page: Page): Promise<CompraApi> {
  const r = await page.request.post("/api/compras");
  expect(r.ok()).toBe(true);
  return (await r.json()) as CompraApi;
}

interface OrdemDeTeste {
  sufixo: string;
  envio: "Air Cargo" | "Courier Simples" | "Courier Formal";
  po: string;
  temperaturas: string[];
}

/** O estado completo de uma compra PRONTA (nada pendente na checagem), com as ordens pedidas. */
function estadoCompleto(compra: CompraApi, paciente: string, ordens: OrdemDeTeste[]): Record<string, unknown> {
  return {
    atualizadoEm: compra.updatedAt,
    paciente,
    processoNumero: "123456",
    medico: "Dr. Teste E2E",
    localAplicacao: "Local Teste E2E",
    entrega: "Entrega Teste E2E",
    despachante: DESPACHANTE,
    vendedor: VENDEDOR,
    responsavel: "Rebeca",
    pagamentoMomento: "vamos_pagar",
    documentos: true,
    ordens: ordens.map((o) => ({
      id: `ord_e2e_${o.sufixo}`,
      fornecedor: FORNECEDOR,
      envio: o.envio,
      cia: "",
      po: o.po,
      frete: null,
      freteReal: null,
      itens: o.temperaturas.map((t, i) => ({
        id: `itm_e2e_${o.sufixo}_${i + 1}`,
        medicamento: `TESTE MED ${o.sufixo} ${i + 1}`,
        medicamentoCadastroId: null,
        preCadastroId: null,
        apresentacao: "10 mg",
        referencia: "",
        laboratorio: "",
        quantidade: "2 caixas",
        temperatura: t,
        valorUnitario: null,
        valorReal: null,
      })),
    })),
  };
}

async function preencherCompra(page: Page, compra: CompraApi, paciente: string, ordens: OrdemDeTeste[]): Promise<CompraApi> {
  const r = await page.request.patch(`/api/compras/${compra.id}`, { data: estadoCompleto(compra, paciente, ordens) });
  expect(r.ok(), await r.text()).toBe(true);
  return (await r.json()) as CompraApi;
}

async function abrirCompra(page: Page, compra: CompraApi, aba = ""): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/compras?mes=${compra.anoMes}&id=${compra.id}${aba}`, { waitUntil: "networkidle" });
  await expect(page.locator("#compra-formulario")).toBeVisible();
}

for (const [rotulo, conta] of [
  ["administrador", admin],
  ["operacional", operacional],
] as const) {
  test.describe(`Encaminhar para a DIR — ${rotulo}`, () => {
    test.describe.configure({ retries: 1 });
    test.skip(!tem(conta), `defina E2E_${rotulo.toUpperCase()}_EMAIL / _PASSWORD`);

    test.beforeEach(async ({ page }) => {
      await login(page, conta.email, conta.password);
    });

    test("compra incompleta: o painel abre com a conferência, o botão fica desabilitado com o motivo e o erro clicável leva ao campo (o painel continua)", async ({ page }) => {
      const compra = await criarCompraPelaApi(page);
      await abrirCompra(page, compra);
      await page.locator("#compra-paciente").fill(`TESTE E2E ENCAMINHAR ${unico()}`);
      await expect(page.locator("#compra-salvamento")).toContainText("Salvo automaticamente às");

      await page.locator("#btn-encaminhar-dir").click();
      await expect(page.locator("#compra-encaminhar")).toBeVisible();
      await expect(page.locator("#compra-resumo")).toHaveCount(0); // o painel está no lugar do resumo
      await expect(page.locator("#compra-formulario")).toBeVisible(); // e o formulário segue na tela
      await expect(page.locator("#btn-encaminhar-confirmar")).toBeDisabled();
      await expect(page.locator("#encaminhar-apoio")).toHaveText("Resolva os itens em vermelho para encaminhar.");

      await page.locator('#compra-checklist-erros [data-ir-campo="medico"]').click();
      await expect(page.locator('[data-campo="medico"]')).toBeFocused();
      await expect(page.locator("#compra-encaminhar")).toBeVisible();

      await page.locator("#btn-encaminhar-voltar").click();
      await expect(page.locator("#compra-encaminhar")).toHaveCount(0);
      await expect(page.locator("#compra-resumo")).toBeVisible();
    });

    test("PO que já existe na DIR: o painel mostra o erro, o botão fica desabilitado e o erro leva ao campo PO da ordem", async ({ page }) => {
      const po = poFicticio(1);
      // Uma linha da DIR com esse PO (banco local; removida no fim).
      const dir = await page.request.post("/api/dir", {
        data: {
          po, paciente: "TESTE E2E DIR EXISTENTE", conferido: false, vendedor: VENDEDOR || "Teste", responsavel: "", exigencia: false, dataEmissao: "2026-12-01", dataCobrancaFornecedores: "", receita: "", medicamento: "", temperatura: "", fornecedor: "", envio: "", companhiaAerea: "", awb: "", despachante: "",
          status: null, dataEntrega: "", contratoCambio: "", observacao: "", banco: "", dataPagamento: "", operacaoEncerrada: false, fechamentoRestante: false, dactes: false, dsiDirDuimp: false, logger: false, fechamento: false, numerario: false, protocoloAssinado: false, swift: false, termometro: false,
        },
      });
      test.skip(!dir.ok(), "o vendedor de teste não é um consultor ativo do banco local (defina E2E_ENCAMINHAR_VENDEDOR)");
      const linha = (await dir.json()) as { id: string };
      try {
        const compra = await criarCompraPelaApi(page);
        const preenchida = await page.request.patch(`/api/compras/${compra.id}`, {
          data: { atualizadoEm: compra.updatedAt, paciente: `TESTE E2E ENCAMINHAR ${unico()}`, ordens: [{ id: `ord_e2e_${unico()}`, fornecedor: "", envio: "", cia: "", po, frete: null, freteReal: null, itens: [] }] },
        });
        expect(preenchida.ok()).toBe(true);
        await abrirCompra(page, compra);
        await page.locator("#btn-encaminhar-dir").click();
        const erro = page.locator("#compra-checklist-erros").getByRole("button", { name: `${po} já existe na DIR` });
        await expect(erro).toBeVisible();
        await expect(page.locator("#btn-encaminhar-confirmar")).toBeDisabled();
        await erro.click();
        await expect(page.locator("[id^='ordem-'][id$='-po']").first()).toBeFocused();
        // O "N pendências" do cabeçalho do formulário também conta o PO na DIR.
        await expect(page.locator("#compra-pendencias")).toContainText("pendência");
      } finally {
        await page.request.delete(`/api/dir/${linha.id}`);
      }
    });

    test("o formulário continua editável com o painel aberto, e a conferência acompanha o que foi salvo", async ({ page }) => {
      const compra = await criarCompraPelaApi(page);
      await abrirCompra(page, compra);
      await page.locator("#btn-encaminhar-dir").click();
      await expect(page.locator("#compra-encaminhar")).toBeVisible();
      await expect(page.locator("#compra-checklist-erros")).toContainText("Paciente não preenchido");
      await page.locator("#compra-paciente").fill(`TESTE E2E ENCAMINHAR ${unico()}`);
      await expect(page.locator("#compra-salvamento")).toContainText("Salvo automaticamente às");
      await expect(page.locator("#compra-checklist-erros")).not.toContainText("Paciente não preenchido");
    });

    test("celular: o painel ocupa a aba Resumo e a barra do pé tem 'Voltar' e 'Encaminhar N linha(s)'", async ({ page }) => {
      const compra = await criarCompraPelaApi(page);
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(`/compras?mes=${compra.anoMes}&id=${compra.id}&aba=resumo`, { waitUntil: "networkidle" });
      await page.locator("#btn-encaminhar-dir").click();
      await expect(page.locator("#compra-encaminhar")).toBeVisible();
      await expect(page.locator("#btn-encaminhar-voltar-celular")).toBeVisible();
      await expect(page.locator("#btn-encaminhar-confirmar-celular")).toBeVisible();
      await expect(page.locator("#btn-encaminhar-confirmar-celular")).toBeDisabled();
      await expect(page.locator("#btn-encaminhar-confirmar")).toBeHidden(); // o do painel só existe em lg+
      await page.locator("#btn-encaminhar-voltar-celular").click();
      await expect(page.locator("#compra-encaminhar")).toHaveCount(0);
      await expect(page.locator("#btn-copiar-resumo")).toBeVisible();
    });

    test("Encaminhar de verdade: 2 ordens (Courier Simples e Air Cargo), temperatura mista confirmada, resultado, link para a DIR, PO travado, remover travado e aviso ao cancelar", async ({ page }) => {
      test.skip(!temCadastros, "defina E2E_ENCAMINHAR_FORNECEDOR, _DESPACHANTE e _VENDEDOR (itens ativos dos Cadastros do banco local)");
      const t = unico();
      const paciente = `TESTE E2E ENCAMINHAR ${t}`;
      const poSimples = poFicticio(2);
      const poCargo = poFicticio(3);
      const compra = await criarCompraPelaApi(page);
      await preencherCompra(page, compra, paciente, [
        { sufixo: `${t}_1`, envio: "Courier Simples", po: poSimples, temperaturas: ["TESTE TEMP A"] },
        { sufixo: `${t}_2`, envio: "Air Cargo", po: poCargo, temperaturas: ["TESTE TEMP A", "TESTE TEMP B"] }, // mista
      ]);
      const dirIds = [`dir_ord_e2e_${t}_1`, `dir_ord_e2e_${t}_2`];
      try {
        await abrirCompra(page, compra);
        await page.locator("#btn-encaminhar-dir").click();
        await expect(page.locator("#encaminhar-intro")).toContainText("Serão criadas 2 linhas");

        // Linha 1: Courier Simples → o despachante que a DIR vai receber.
        const linha1 = page.locator(`[data-linha="ord_e2e_${t}_1"]`);
        await expect(linha1.locator('[data-valor="Despachante"]')).toHaveText("COURIER I N/A");
        await expect(linha1.locator('[data-valor="Paciente"]')).toHaveText(paciente);
        await expect(linha1.locator('[data-valor="Status"]')).toHaveText("on_going");
        // Linha 2: temperatura mista → caixa obrigatória.
        const linha2 = page.locator(`[data-linha="ord_e2e_${t}_2"]`);
        await expect(linha2.locator(`#encaminhar-temperatura-ord_e2e_${t}_2`)).toHaveText("TESTE TEMP A / TESTE TEMP B");
        const botao = page.locator("#btn-encaminhar-confirmar");
        await expect(botao).toBeDisabled();
        await expect(page.locator("#encaminhar-apoio")).toHaveText("Confirme a temperatura das linhas marcadas.");
        await linha2.getByLabel("Confirmo a temperatura desta linha: TESTE TEMP A / TESTE TEMP B").check();
        await expect(botao).toBeEnabled();
        await expect(botao).toHaveText("Encaminhar 2 linhas");

        // Dois cliques seguidos criam UMA vez só.
        await botao.dblclick();
        await expect(page.locator("#encaminhar-resultado-titulo")).toHaveText("Encaminhada: 2 linhas criadas na DIR");
        await expect(page.locator("#encaminhar-resultado-pos li")).toHaveText([poSimples, poCargo]);

        // O formulário mostra as ordens encaminhadas: PO travado e remover travado.
        await expect(page.locator(`#ordem-ord_e2e_${t}_1-po`)).toBeDisabled();
        await expect(page.locator(`#ordem-ord_e2e_${t}_1-po-apoio`)).toHaveText("PO já encaminhado: altere na DIR");
        await expect(page.locator(`#ordem-ord_e2e_${t}_2-encaminhada`)).toContainText("Encaminhada em");
        await expect(page.locator(`#ordem-ord_e2e_${t}_2-remover`)).toBeDisabled();

        // A DIR tem exatamente as duas linhas.
        const noServidor = await page.request.get("/api/dir");
        const linhas = ((await noServidor.json()) as Array<{ id: string; po: string }>).filter((d) => dirIds.includes(d.id));
        expect(linhas.map((d) => d.po).sort()).toEqual([poSimples, poCargo].sort());

        // O link leva à DIR, e a linha nova aparece (o cache foi invalidado).
        await page.locator("#link-abrir-dir").click();
        await expect(page).toHaveURL(/\/dir$/);
        await expect(page.getByText(poCargo).first()).toBeVisible();

        // Voltar e repetir é inofensivo: o botão fica desabilitado ("Todas as ordens já foram encaminhadas").
        await abrirCompra(page, compra);
        await expect(page.locator("#btn-encaminhar-dir")).toBeDisabled();
        await expect(page.locator("#encaminhar-dir-aviso")).toHaveText("Todas as ordens já foram encaminhadas");

        // Cancelar avisa que as linhas da DIR continuam.
        await page.locator("#btn-cancelar-compra").click();
        await expect(page.getByText("Há ordens já encaminhadas para a DIR. As linhas da DIR continuam existindo e não são alteradas.")).toBeVisible();
      } finally {
        for (const id of dirIds) await page.request.delete(`/api/dir/${id}`);
      }
    });
  });
}

test.describe("Encaminhar para a DIR — permissões (o botão nunca some sem explicação)", () => {
  test("operacional com compras = editar e dir = VER: o botão fica desabilitado com 'Sem permissão para escrever na DIR'", async ({ page }) => {
    test.skip(!tem(editaComprasVeDir) || !tem(admin), "defina E2E_COMPRAS_EDITA_DIR_VE_* (conta operacional com compras = editar e dir = ver) e E2E_ADMIN_*");
    await login(page, admin.email, admin.password);
    const compra = await criarCompraPelaApi(page);
    await login(page, editaComprasVeDir.email, editaComprasVeDir.password);
    await abrirCompra(page, compra);
    await expect(page.locator("#btn-encaminhar-dir")).toBeDisabled();
    await expect(page.locator("#encaminhar-dir-aviso")).toHaveText("Sem permissão para escrever na DIR");
  });

  test("sócio (só lê Compras): o botão fica desabilitado com 'Sem permissão para editar Compras' e Copiar resumo continua", async ({ page }) => {
    test.skip(!tem(socio) || !tem(admin), "defina E2E_SOCIO_* e E2E_ADMIN_*");
    await login(page, admin.email, admin.password);
    const compra = await criarCompraPelaApi(page);
    await login(page, socio.email, socio.password);
    await abrirCompra(page, compra);
    await expect(page.locator("#btn-encaminhar-dir")).toBeDisabled();
    await expect(page.locator("#encaminhar-dir-aviso")).toHaveText("Sem permissão para editar Compras");
    await expect(page.locator("#btn-copiar-resumo")).toBeEnabled();
  });
});
