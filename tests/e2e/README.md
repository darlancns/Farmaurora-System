# Testes e2e (Playwright)

## Compras (`compras.spec.ts`, `compras-pagina.spec.ts` e `compras-celular.spec.ts`)

**Estado: escritos para o formulário ÚNICO (uma compra por fornecedor) e NÃO EXECUTADOS.** Foram conferidos só com `npx playwright test --list` (os testes aparecem e o TypeScript carrega). Nenhum rodou contra um navegador nem contra um banco, e nenhum seletor foi validado numa tela de verdade. Ao rodar pela primeira vez, espere ajustes de seletor e de tempo.

**Ponto de sincronia do salvamento:** a tela NÃO mostra texto de "salvo". Os testes esperam `#compra-formulario[data-salvamento="salvo"]` (o atributo vai por `ocioso`, `pendente`, `salvando`, `salvo`, `erro` e `conflito`). O erro de salvamento aparece numa linha abaixo do cabeçalho (`#compra-salvamento-regiao`) e o conflito tem a faixa `#compra-faixa-conflito`.

### Onde rodar (importante)

- **Só no Supabase LOCAL** (`supabase start`). O `playwright.config.ts` carrega `.env.e2e` (nunca o `.env`, que aponta para PRODUÇÃO) e a guarda em `tests/e2e/_guards/` aborta se a URL não for loopback (localhost, 127.0.0.1 ou [::1]).
- O banco local precisa ter as migrations aplicadas, incluindo `supabase/migrations/20261119190000_compras.sql` (depois de `20261119160000_cadastro_temperaturas_medicamentos.sql`) e as duas que a seguem, `20261120120000_renomear_consultor_compras.sql` e `20261121130000_compras_uma_por_fornecedor.sql` (esta troca o desenho para uma compra por fornecedor, que é o que o app de Compras desta branch conhece).
- Os testes de `compras-pagina.spec.ts` **criam compras de verdade** no banco local (paciente "TESTE E2E <hora>") e cada "+ Nova compra" usa o número que a caixinha sugere (o maior do mês + 1). Não apagam nada, a não ser o teste de "Apagar compra" (que apaga só a compra que ele mesmo criou). Para limpar, recrie o banco local.

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
- `compras-pagina.spec.ts`: as três colunas e a rolagem por coluna, o seletor de mês e a URL (`?mes`, `?id`, `?canceladas`; um `?status=` antigo é ignorado), criar (foco no Medicamento do Med. 1), digitar e salvar sozinho, resumo ao vivo (modelo, com os vazios tracejados), recarregar e voltar ao mesmo lugar, Compra particular e Recorrente, Copiar resumo (texto da cópia, com "pendente ⏳"), Encaminhar desabilitado ao lado de Copiar, Duplicar, Cancelar com confirmação e selo "Cancelada", "Mostrar canceladas", teclado nos cartões, trocar de compra sem perder o que foi digitado, o conflito (409) com duas abas e as duas saídas, o empilhamento abaixo de `lg` e o sócio somente leitura.

### Formulário único

O grupo "formulário único" de `compras-pagina.spec.ts` confere: as 29 linhas (`data-linha`) na mesma ordem das linhas do resumo no modo "modelo" e o Tab seguindo essa ordem (sem fieldsets nem títulos de seção); a compra nascendo com UM medicamento, o "+" ao lado do input do último medicamento criando o Med. 2 (as linhas por medicamento ganham "Med. 1" e "Med. 2") e remover sem trocar o que foi digitado em outra linha; o stepper de Ordens de 1 a 10 (11 mostra o erro); Brand como select; dinheiro em US$; trocar o Envio limpando a cia que não vale; Courier Simples dispensando o despachante ("Despachante: N/A" na cópia); temperatura nova ("TESTE TEMP") e o pedido de cadastro do medicamento fora do Cadastro ("TESTE MED PRE-CADASTRO") feito SÓ pelo botão "Pedir cadastro" (desabilitado sem temperatura); pendências em chips, isenção (sem "para quem"), verificação, pagamento, termo posterior e "Mesmo local" persistindo ao recarregar.

Esses testes só usam o que existe em qualquer banco local: os envios são constantes, a temperatura é criada na hora e o medicamento é novo. Escolher fornecedor, cia aérea, despachante, consultor ou um medicamento do Cadastro depende dos Cadastros do banco local e **não** está coberto aqui. Os Cadastros, as temperaturas e os pré-cadastros criados ficam no banco local (o app não apaga), então recrie o banco para limpar.

### Celular e tela larga: `compras-celular.spec.ts`

Dois grupos: **celular (375x667)** e **tela larga (1280x800 e 2130x1200)**. No celular: as 3 abas (Compras, Formulário, Resumo, coladas no topo), criar ou escolher uma compra levando ao Formulário, "‹ Compras" voltando à lista, `?aba=` na URL e recarregar voltando à mesma aba, a barra fixa de "Copiar resumo" e "Encaminhar para a DIR" lado a lado acima da barra de navegação, o cabeçalho de duas linhas com o menu "…", campos de 16px e 44px, o rótulo acima do controle, os controles por medicamento empilhados com ✕ de 44px, a lista de sugestões sem corte e a aba Resumo com o resumo ao vivo. Em tela larga: as três colunas juntas e o `?aba=` ignorado, lista sem chips de status, estado vazio sem botão, o resumo da direita acompanhando o formulário e o foco depois de remover um medicamento.

**Atenção ao interpretar:** o que depende do teclado do celular e da barra do iPhone (o teclado cobrindo a lista, o safe-area) não é reproduzido pelo Chromium de teste; esses pontos precisam do teste manual em aparelho real. Os testes de componente cobrem a lógica (posição da lista, rolagem ao focar) com `visualViewport` simulado.

### Pré-cadastros de medicamento (8): `cadastros-pre-medicamentos.spec.ts`

**Estado: escrito, NÃO executado** (só `--list`). Cobre a seção "Pendentes de aprovação" da aba Medicamentos (acima da lista, com a etiqueta "N pendentes" no título; nome, temperatura, a compra do pedido sem paciente, quem pediu), **aprovar** (o pendente some, o medicamento passa a existir no Cadastro, o item da compra fica ligado e a versão da compra sobe), **rejeitar** (confirmação: cancelar não envia; depois a compra mostra o aviso "Pré-cadastro rejeitado…" com o texto livre intacto), **nome que já existe** ("Já existe no Cadastro" e "Vincular ao cadastro existente", sem linha nova), duas abas decidindo o mesmo pendente (409) e a barreira do operacional (a lista e as decisões respondem 403; a aba Cadastros não existe).

- Só o **administrador** decide (a mesma regra de escrever nos Cadastros). Use `E2E_ADMIN_*` e, para a barreira, `E2E_OPERACIONAL_*`.
- Os dados são montados pela **API**: uma compra, um pré-cadastro "TESTE E2E PRE ..." e a temperatura "TESTE E2E TEMP" (`POST /api/compras/temperaturas`); nenhum cadastro prévio além das contas.
- Cada teste **cria dados no banco local** (compra, pré-cadastro e, ao aprovar, um medicamento no Cadastro). O app não apaga nada: recrie o banco local para limpar.
