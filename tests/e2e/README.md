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
- `compras-pagina.spec.ts` (6a e 6b): as três colunas e a rolagem por coluna, o seletor de mês e a URL (`?mes`, `?id`, `?status`, `?canceladas`), criar, digitar e salvar sozinho, resumo e checklist ao vivo, recarregar e voltar ao mesmo lugar, Compra particular e Recorrente, Copiar resumo (texto idêntico ao da tela), Encaminhar desabilitado, Duplicar, Cancelar com confirmação, filtros, teclado nos cartões, trocar de compra sem perder o que foi digitado, o conflito (409) com duas abas e as duas saídas, o empilhamento abaixo de `lg` e o sócio somente leitura.

### Formulário completo (6b)

O grupo "formulário completo (6b)" de `compras-pagina.spec.ts` confere: a ordem dos blocos igual à de `BLOCOS_DA_COMPRA` (menos o `titulo`) e o Tab seguindo essa ordem; a compra nascendo com UMA ordem e UM medicamento (foco no Fornecedor da Ordem 1); adicionar e remover itens e ordens sem trocar o que foi digitado em outra linha; PO em maiúsculas; dinheiro em US$; Courier Simples dispensando o despachante; temperatura nova ("TESTE TEMP") e medicamento fora do Cadastro ("TESTE MED PRE-CADASTRO") no pré-cadastro; pendências em chips, isenção, pagamento, termo posterior e "Entrega no mesmo local" persistindo ao recarregar.

Esses testes só usam o que existe em qualquer banco local: os envios são constantes, a temperatura é criada na hora e o medicamento é novo. Escolher fornecedor, cia aérea, despachante, vendedor ou um medicamento do Cadastro depende dos Cadastros do banco local e **não** está coberto aqui. Os Cadastros, as temperaturas e os pré-cadastros criados ficam no banco local (o app não apaga), então recrie o banco para limpar.

### Celular e tela larga (6c): `compras-celular.spec.ts`

Dois grupos: **celular (375x667)** e **tela larga (1280x800 e 2130x1200)**. No celular: as 3 abas (Compras, Formulário, Resumo, coladas no topo), criar ou escolher uma compra levando ao Formulário, "‹ Compras" voltando à lista, `?aba=` na URL e recarregar voltando à mesma aba, a barra fixa de "Copiar resumo" acima da barra de navegação, o cabeçalho de duas linhas com o menu "…", campos de 16px e 44px, Frete e Frete real lado a lado, o cartão de medicamento empilhado com ✕ de 44px, a lista de sugestões sem corte e o clique no checklist trocando para o Formulário. Em tela larga: as três colunas juntas e o `?aba=` ignorado, chips numa linha só, estado vazio sem botão, clique no checklist rolando a coluna (não a janela) e focando o campo certo em cada tipo de item, e o foco depois de remover um medicamento.

**Atenção ao interpretar:** o que depende do teclado do celular e da barra do iPhone (o teclado cobrindo a lista, o safe-area) não é reproduzido pelo Chromium de teste; esses pontos precisam do teste manual em aparelho real. Os testes de componente cobrem a lógica (posição da lista, rolagem ao focar) com `visualViewport` simulado.
