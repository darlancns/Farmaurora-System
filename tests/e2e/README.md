# Testes e2e (Playwright)

## Compras (`compras.spec.ts` e `compras-pagina.spec.ts`)

**Estado: escritos, NÃO executados.** Foram conferidos só com `npx playwright test --list` (os testes aparecem e o TypeScript carrega). Nenhum rodou contra um navegador nem contra um banco. Ao rodar pela primeira vez, espere ajustes de seletor e de tempo.

### Onde rodar (importante)

- **Só no Supabase LOCAL** (`supabase start`). O `playwright.config.ts` carrega `.env.e2e` (nunca o `.env`, que aponta para PRODUÇÃO) e a guarda em `tests/e2e/_guards/` aborta se a URL não for loopback (localhost, 127.0.0.1 ou [::1]).
- O banco local precisa ter as migrations aplicadas, incluindo `supabase/migrations/20261119190000_compras.sql` (depois de `20261119160000_cadastro_temperaturas_medicamentos.sql`).
- Os testes de `compras-pagina.spec.ts` **criam compras de verdade** no banco local (paciente "TESTE E2E <hora>") e o contador do mês avança a cada "+ Nova compra". Não apagam nada (o app não apaga compras). Para limpar, recrie o banco local.

### Contas

Os testes leem as credenciais por variável de ambiente (as mesmas de `rbac.spec.ts`); sem elas, o grupo é pulado. Nenhuma conta é criada pelos testes (use `npm run e2e:setup-users` no banco local).

| Variável | Quem |
| --- | --- |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | administrador (lê e escreve) |
| `E2E_OPERACIONAL_EMAIL` / `E2E_OPERACIONAL_PASSWORD` | operacional (lê e escreve) |
| `E2E_SOCIO_EMAIL` / `E2E_SOCIO_PASSWORD` | sócio (só lê) |
| `E2E_CONSULTOR_EMAIL` / `E2E_CONSULTOR_PASSWORD` | consultor (não entra em Compras) |

### Como rodar

```bash
npx playwright test compras --project=chromium            # só Compras
npx playwright test compras-pagina --project=chromium -g "duas abas"   # um teste
npx playwright test --list                                 # só listar (não executa)
```

### O que cada arquivo cobre

- `compras.spec.ts`: o item no menu (3º, depois de DIR e Follow-Up; "Mais" no celular), a barreira da página (consultor redirecionado) e a barreira da API (consultor 403; sócio lê e não escreve; administrador lê; sem sessão 401).
- `compras-pagina.spec.ts`: as três colunas e a rolagem por coluna, o seletor de mês e a URL (`?mes`, `?id`, `?status`, `?canceladas`), criar, digitar e salvar sozinho, resumo e checklist ao vivo, recarregar e voltar ao mesmo lugar, Compra particular e Recorrente, Copiar resumo (texto idêntico ao da tela), Encaminhar desabilitado, Duplicar, Cancelar com confirmação, filtros, teclado nos cartões, trocar de compra sem perder o que foi digitado, o conflito (409) com duas abas e as duas saídas, o empilhamento abaixo de `lg` e o sócio somente leitura.
