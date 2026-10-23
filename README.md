# Farmaurora CRM

CRM interno da equipe Farmaurora. Cobre quatro áreas:

- **Prestações de Contas** — lança os dados de cada alvará, calcula automaticamente o valor da
  nota e o imposto, gera o Word de prestação (editando o `.docx` real da empresa) e copia a
  mensagem de resumo para a contabilidade / WhatsApp.
- **Follow-Up (Processos)** — acompanhamento dos processos de importação, agrupados por
  consultor, com timeline de atualizações, filtros e alerta de prazo de fornecedor.
- **Pagamentos** — controle de pagamentos ao banco (lançamentos em moeda + cotação de câmbio
  entre XP / Rendimento / Intex) e a despachantes / transportadoras (grupos de pagamento por
  paciente, com recibo exportável em imagem).
- **Configurações → Contas** — gestão das contas da equipe e dos cargos (RBAC).

Construído em **Nuxt 4 + Vue 3 + Tailwind v4 + TypeScript**, seguindo as convenções do
`CLAUDE.md` (imports explícitos — sem auto-import; camadas UI → composables → API).

---

## Como funciona

- **Frontend (Vue/Nuxt/Tailwind)** — páginas em `app/pages/`, componentes em `app/components/`,
  toda a lógica de dados nos composables `app/composables/use*.ts`. Sem auto-import: cada
  arquivo importa o que usa.

- **Backend (Nitro/Node, dentro do próprio Nuxt)** — API REST em `server/api/`. A persistência
  dos dados de negócio (Pacientes, Processos, Pagamentos) é feita em **tabelas Postgres do
  projeto Supabase**, acessadas **só no server com a service role key** (`server/utils/
  supabaseServerClient.ts` → `createSupabaseAdminClient`). **Não há RLS** nessas tabelas: todo o
  controle de acesso vive na camada de API — `server/middleware/auth.ts` (sessão + cargo) mais a
  política central em `shared/utils/rbac.ts`. O middleware **nega por padrão** qualquer rota
  `/api/**` que não esteja mapeada para uma seção (única exceção: `/api/auth/*`).

- **Autenticação** — Supabase Auth (e-mail + senha). Cada conta tem um cargo
  (`consultor` / `socio` / `operacional` / `administrador`) em `app_metadata`, **gravável só
  server-side** com a service role key — o client não consegue se auto-promover. Não existe
  cadastro público: um administrador cria as contas em **/configuracoes**. O client descobre o
  próprio cargo por `GET /api/auth/me` (nunca decodificando o JWT localmente).

- **Geração do Word** — acontece **no navegador**, com `docxtemplater` + `pizzip` (e
  `docxtemplater-image-module-free` para embutir os anexos como imagem) sobre o `.docx` real em
  `public/templates/`. Não precisa de LibreOffice nem de serviço externo. A empresa Farmaurora
  usa dois modelos: `template_farmaurora_completo.docx` quando há despesa de despachante e/ou
  transporte (`isFarmauroraModeloCompleto`), e `template_farmaurora.docx` caso contrário.

- **Exportar recibo (Pagamentos)** — `html-to-image` gera um PNG de um cartão montado fora da
  tela; tenta colar na área de transferência e, se não der, baixa o arquivo. 100% client-side.

---

## Cálculo da nota e do imposto

Implementado em `app/utils/calculations.ts`. **Regra de negócio já confirmada e revisada 3× com
o responsável — não reinterpretar nem alterar sem confirmação** (ver o comentário no topo do
arquivo, que registra o histórico das revisões).

Transcrição exata do que está implementado hoje:

- **Critério de "nota cheia"** (`isNotaCheia`):

  ```
  se alvara <= 0            → nunca é cheia
  senão, é cheia quando:    (custoImportacao + despesaTotal + transporteTotal) / alvara < 0.5
  ```

- **Valor da nota** (`calculateValorNota`):

  ```
  quando É cheia:      valorNota = alvara
  quando NÃO é cheia:  valorNota = alvara - custoImportacao - despesaTotal - transporteTotal
  ```

- **Imposto** (`calculateImposto`), nos dois casos:

  ```
  imposto = valorNota * taxaImposto[empresa]
  taxaImposto:  FARMAURORA = 0,16   ·   MAINZFARMA = 0,135   (shared/constants/empresas.ts)
  ```

- Campos derivados expostos por `withComputedFields`: `valorNota`, `imposto`,
  `taxaImposto`, `valorTotal` (= `alvara`) e `isNotaCheia`.

---

## Papéis e permissões (RBAC)

Política única em `shared/utils/rbac.ts`, aplicada **tanto no server** (autorização da API, por
seção + método) **quanto no client** (guarda de rota + visibilidade da UI). Esconder um botão
nunca é a única proteção — a API rejeita a operação de qualquer forma (401 sem sessão, 403 sem
permissão).

| Área | `consultor` | `socio` | `operacional` | `administrador` |
|---|---|---|---|---|
| Prestações / Pacientes (`/prestacao`) | — | leitura | — | leitura + escrita |
| Follow-Up / Processos (`/processos`) | leitura, **só os próprios** | leitura (tudo) | leitura + escrita | leitura + escrita |
| Pagamentos (`/pagamentos`) | — | leitura | leitura + escrita | leitura + escrita |
| Configurações / Contas (`/configuracoes`, `/api/admin/**`) | — | — | — | leitura + escrita |

Detalhes:

- **`consultor` é *row-scoped*** — só enxerga Processos cujo `consultor` bate com o
  `consultorNome` gravado no seu `app_metadata`. O filtro é aplicado **na query da API**
  (`server/api/processos/index.get.ts` e `[id].get.ts` respondem 404 para processo de outro),
  não só na UI. Sem `consultorNome` definido, não vê nada.
- **Rota de entrada por cargo** (`defaultRouteForRole`): todos os cargos caem em `/processos`;
  `"/"` redireciona pra lá.
- **Rede de segurança de migração**: uma conta sem `app_metadata.role` definido, cujo e-mail
  esteja em `NUXT_ADMIN_EMAILS`, é tratada como `administrador` (para não travar a conta antes
  de os metadados serem gravados).
- **Trava anti-lockout**: não é possível excluir nem demover a **única** conta `administrador`
  restante (`server/api/admin/users/[id].delete.ts` e `[id].patch.ts`).

---

## Onde cada dado vive

| Dado | Local |
|---|---|
| Autenticação e cargos (`role`, `consultorNome`) | Supabase Auth (`app_metadata`) |
| Pacientes / Prestações | Supabase Postgres — tabela `prestacao_pacientes` |
| Processos / Follow-Up | Supabase Postgres — tabela `follow_up` |
| Pagamentos (lotes de banco, lançamentos, grupos) | Supabase Postgres — `pagamento_lotes_banco`, `pagamento_lancamentos_banco`, `pagamento_grupos` |
| Chave PIX por despachante / transportadora (overrides) | Supabase Postgres — `pagamento_pix_chaves` |
| Anexos de paciente (invoice, câmbio, despachante, transporte, serviço) | **Supabase Storage** — bucket privado `attachments`, `<patientId>/<slot>.png` (ver "Anexos de prestação") |

Todo acesso ao Postgres é feito com a **service role key** (sem RLS) — ver seção "Como
funciona". `data/*.json` e `public/uploads/` (resíduo local de antes do Storage) estão no
`.gitignore` — contêm dados reais de pacientes e CPF/CNPJ.

---

## Rodando localmente

Pré-requisitos: **Node.js 22.19+** (ou 24.11+, ou ≥ 26) — requisito do Nuxt 4.5 — e **npm**.
(A máquina de desenvolvimento atual usa Node v24.)

```bash
npm install                 # roda "nuxt prepare" no postinstall
cp .env.example .env        # e preencha as chaves do Supabase (ver .env.example)
npm run dev                 # http://localhost:3000
```

Sem um `.env` válido (URL + anon key do Supabase), só a tela de **/login** fica acessível — o
resto redireciona para lá.

### Testes

```bash
npm run test:unit          # vitest — unitários (rbac, prazo de fornecedor, formatação de
                           # valores, PIX store, validação de status de item de pagamento)
npm run test:e2e           # Playwright, contra o dev server. SÓ no harness local: os specs criam e
                           # APAGAM dados e abortam (globalSetup + guarda em cada spec) se a URL do
                           # Supabase em uso não for loopback. A maior parte dos casos é test.skip
                           # sem as env vars E2E_* (contas de teste)
ALLOW_REAL_DB=1 npm run test:integration
                           # smoke tests em Node puro CONTRA O SUPABASE REAL do .env (criam e apagam
                           # registros com id de prefixo TESTE_). Sem ALLOW_REAL_DB=1 saem antes de
                           # qualquer conexão
```

> **O `.env` aponta para produção.** Nunca rode e2e, smoke ou migração contra ele sem ter
> certeza. Para e2e/visual use um Supabase falso local (`NUXT_PUBLIC_SUPABASE_URL=http://localhost:…`);
> a guarda de `tests/e2e/_guards/supabaseLocal.ts` recusa qualquer outra URL.

### Datas e fuso

"Hoje" é a **data de Brasília** (`America/Sao_Paulo`), no servidor (Vercel roda em UTC) e no
navegador: `shared/utils/dataBrasilia.ts` (`hojeBrasilia`, `dataBrasiliaDe`, `parseDataISO`,
`formatarDataBR`, `ehDataFutura`, `somarDiasISO`…), via `Intl` com `timeZone`, sem depender do fuso
da máquina. Datas civis circulam como `"YYYY-MM-DD"` e a aritmética é de calendário (nunca
`new Date("YYYY-MM-DD")`, que lê em UTC). Usado em: data do lote do Banco, data do grupo de
Despachante/Transportadora (calculada quando o modal abre), validação "pagamento não pode ser
posterior a hoje" (cliente e servidor), exibição de datas de pagamento, nome/data das fotos de
exportação e contagem de dias dos alertas de fornecedor. Timestamps (`created_at`, `pago_em`)
continuam sendo instantes UTC. Os testes de data rodam iguais com `TZ=UTC`,
`TZ=America/Sao_Paulo` e `TZ=Pacific/Honolulu`.

---

## Build de produção

```bash
npm run build
node .output/server/index.mjs
```

Por padrão sobe na porta 3000 (`PORT=8080 node .output/server/index.mjs` para mudar).

### Deploy

**Produção roda na Vercel** (`system.farmaurora.com.br`): funções serverless, **sem disco
gravável e sem estado entre requisições**. Por isso nada de negócio pode depender de arquivo
local — pacientes, processos, pagamentos, chaves PIX e anexos ficam no Supabase (Postgres e
Storage).

O mesmo build também roda como servidor Node standalone (`npm run build` →
`node .output/server/index.mjs`) em qualquer host que rode Node, mas esse não é o deploy de
produção.

**Variáveis de ambiente exigidas** (Vercel → Settings → Environment Variables; modelo em
`.env.example`):

| Variável | Onde é lida | Observação |
|---|---|---|
| `NUXT_PUBLIC_SUPABASE_URL` | server **e** browser | URL do projeto (pública por natureza) |
| `NUXT_PUBLIC_SUPABASE_ANON_KEY` | server **e** browser | chave anon (login e envio de anexo com signed URL) |
| `NUXT_SUPABASE_SERVICE_ROLE_KEY` | **só server** | sem prefixo público; gera as signed URLs de anexo e acessa o Postgres. Nunca vai pro bundle |
| `NUXT_ADMIN_EMAILS` | só server | e-mails com fallback de administrador |

O código de anexos não exige nenhuma variável além dessas quatro.

### Anexos de prestação (Supabase Storage)

- **Bucket privado** `attachments`, um PNG por slot: `<patientId>/<slotKey>.png`, máx. 20 MB.
  Criado pela migration `supabase/migrations/20261021000000_attachments_bucket.sql`, que
  também define as policies de RLS (cargos `socio` e `administrador`, espelhando a seção
  `patients` de `shared/utils/rbac.ts`; um teste Vitest falha se divergirem). **A migration é
  aplicada manualmente** (Supabase → SQL Editor).
- **Envio** (o arquivo não passa pela função da Vercel, então não há o limite de ~4,5 MB):
  `POST /api/attachments/upload-url` gera a signed upload URL com a service role → o browser
  sobe o PNG direto ao Storage → `POST /api/attachments` confere que o arquivo chegou e só
  então marca o slot em `attached_slots`. Se o upload falhar, o banco não muda.
- **Leitura** (preview no formulário e geração do Word): `GET /api/attachments/signed-urls`
  devolve links assinados de curta duração (5 min no preview, renovados automaticamente; 60 s
  no Word). Nada é público.
- **Exclusão**: remover um anexo desmarca o slot e apaga o arquivo; excluir uma prestação
  apaga a linha e, depois, a pasta no Storage (falha do Storage só vai pro log do servidor,
  nunca trava a exclusão).
- **Word**: slot nunca anexado → placeholder (`anexo_pendente.png`); slot marcado como anexado
  cujo arquivo não carrega → o Word **não** é gerado e o erro cita o slot.

---

## Trocando o template `.docx`

Os modelos ficam em `public/templates/`. Hoje o repositório tem:

- `template_farmaurora.docx` — prestação Farmaurora simples (sem despachante/transporte).
- `template_farmaurora_completo.docx` — prestação Farmaurora com seções de despachante,
  transporte e anexos.

Os placeholders (marcadores `{...}`) usados pelo `app/composables/useDocxGenerator.ts` são, no
modelo simples: `{paciente}`, `{descricao_compra}`, `{remessas}`, `{remessa_label}`,
`{valor_compra}`, `{valor_nota}`, `{taxa_imposto}`, `{imposto}`, `{valor_total}`, mais a lista
`{#remessasList}…{/remessasList}` com as imagens `{%anexo_invoice}` / `{%anexo_cambio}` e
`{%anexo_servico}`. O modelo completo adiciona `{despesa}`, `{transporte}`, os qualificadores
`{despachante_qualifier}` / `{transporte_qualifier}` e as listas `{#despachanteList}` /
`{#transporteList}` com `{%anexo_despachante}` / `{%anexo_transporte}`.

Para substituir um modelo: abrir o `.docx` no Word/Google Docs, trocar os valores de exemplo
pelos marcadores acima, salvar por cima do arquivo em `public/templates/`. Nenhum código muda.

> **Nota:** MainzFarma existe como empresa só em Processos (Follow-Up) — Pagamentos opera apenas
> com a Farmaurora — e **por design não gera prestação de contas** — a tela de Prestações trabalha só com Farmaurora. Por isso não há
> `template_mainzfarma.docx` no repositório; isso é esperado, não uma lacuna.

---

## Estrutura do projeto

```
app/
├─ assets/css/main.css                # Tailwind v4 + tokens de design
├─ app.vue                            # escolhe o layout (blank em /login, default no resto)
├─ app.config.ts                      # (vazio hoje)
├─ error.vue                          # página de erro global
├─ layouts/
│  ├─ BlankLayout.vue                 # /login — sem sidebar
│  └─ DefaultLayout.vue               # sidebar + área de conteúdo + toasts
├─ middleware/
│  ├─ auth.global.ts                  # guarda de sessão (client-side; redireciona p/ /login)
│  └─ authz.global.ts                 # guarda de cargo (redireciona quem abre área fora do papel)
├─ pages/
│  ├─ login.vue                       # login (e-mail + senha, Supabase Auth)
│  ├─ prestacao.vue                   # Prestações de Contas (form + tabela + Word + WhatsApp)
│  ├─ processos.vue                   # Follow-Up (grupos por consultor, filtros, abas, sino)
│  ├─ pagamentos.vue                  # Pagamentos (abas Banco / Cotação / Despachante / Transporte)
│  └─ configuracoes.vue               # Configurações → aba Contas (admin only)
├─ components/
│  ├─ AppSelect.vue                   # <select> customizado e acessível
│  ├─ ConfirmDialog.vue               # modal genérico de confirmação
│  ├─ ToastNotice.vue                 # renderiza o toast global
│  ├─ SidebarNav.vue                  # menu lateral (links filtrados por cargo)
│  ├─ LogoutButton.vue
│  ├─ prestacao/
│  │  ├─ PatientForm.vue              # formulário de lançamento de paciente
│  │  ├─ PatientTable.vue / PatientRow.vue
│  │  ├─ MonthFilterBar.vue           # filtro por mês
│  │  └─ AttachmentsModal.vue         # anexar invoice / câmbio / despachante / transporte / serviço
│  ├─ processos/
│  │  ├─ ProcessoGroupList.vue        # lista agrupada por consultor
│  │  ├─ ProcessoDeliveredList.vue    # aba "Entregues"
│  │  ├─ ProcessoRow.vue / ProcessoDetail.vue   # linha + detalhe (timeline de atualizações)
│  │  ├─ ProcessoFormModal.vue        # criar / editar processo
│  │  └─ NotificacaoFornecedorBell.vue# sino de alerta de prazo de fornecedor
│  ├─ pagamentos/
│  │  ├─ BancoTab.vue / LancamentoBancoCard.vue / NovoLancamentoBancoModal.vue
│  │  ├─ CotacaoTab.vue / CotacaoBancoCard.vue
│  │  ├─ GrupoPagamentoTab.vue / GrupoPagamentoCard.vue
│  │  ├─ NovoGrupoPagamentoModal.vue / EditarItemGrupoModal.vue
│  │  └─ GrupoPagamentoExportCard.vue / LoteBancoExportCard.vue   # cartões só p/ virar imagem
│  └─ configuracoes/
│     ├─ ContasTab.vue                # tabela de contas + ações
│     └─ ContaFormModal.vue           # criar / editar conta
├─ composables/
│  ├─ useAuth.ts                      # sessão + cargo no client (fonte: /api/auth/me)
│  ├─ useContas.ts                    # CRUD de contas de equipe (/api/admin/users)
│  ├─ usePatients.ts                  # lista/CRUD de pacientes + computedPatients (cálculos)
│  ├─ useProcessos.ts                 # lista/CRUD de processos
│  ├─ usePagamentos.ts                # estado e ações de todas as abas de Pagamentos
│  ├─ useAttachments.ts               # upload de anexos de paciente
│  ├─ useDocxGenerator.ts             # gera o .docx de prestação no browser
│  ├─ useExportarImagem.ts            # gera PNG de um elemento (html-to-image)
│  ├─ useWhatsappShare.ts             # monta e copia a mensagem de resumo
│  └─ useToast.ts
└─ utils/                             # helpers puros (calculations.ts = regra de negócio da nota)

shared/                               # compartilhado entre client e server (alias #shared)
├─ types/                             # Patient.ts, processo.ts, Pagamento.ts, auth.ts
├─ constants/                         # consultores, empresas, processos, pagamentos, roles
└─ utils/                             # rbac.ts (política de acesso), attachments.ts, dataBrasilia.ts (hoje/datas em Brasília)

server/
├─ api/
│  ├─ auth/me.get.ts                  # identidade + cargo resolvido
│  ├─ admin/users*                    # CRUD de contas (admin only) + reset-password + anti-lockout
│  ├─ patients/                       # index.get / index.post / [id].put / [id].delete
│  ├─ attachments/                    # upload-url.post / index.post (confirma) / index.delete / signed-urls.get   (seção RBAC: patients)
│  ├─ processos/                      # index.get (filtra por consultor) / index.post / [id].(get|patch|delete)
│  └─ pagamentos/                     # banco, cotacao, despachante(-pix), transportadora(-pix),
│                                     #   .../[id]/item.(patch|delete), .../[id]/pagar.patch
├─ middleware/auth.ts                 # sessão + RBAC por seção/método; nega rota /api não mapeada
└─ utils/
   ├─ supabaseServerClient.ts         # createSupabaseServerClient (sessão) / createSupabaseAdminClient (service role)
   ├─ authUser.ts                     # resolve cargo do app_metadata; parseRoleInput; countAdmins
   ├─ patientsStore.ts / processosStore.ts / pagamentosStore.ts   # acesso às tabelas Postgres
   ├─ pagamentosPixStore.ts           # chaves PIX (arquivo local)
   ├─ patientValidation.ts / processoValidation.ts / pagamentoValidation.ts
   └─ attachmentStorage.ts            # bucket de anexos: signed URLs, exists, remoção (service role)

public/
├─ templates/                         # template_farmaurora.docx, template_farmaurora_completo.docx
└─ images/                            # logo, placeholder de anexo pendente


supabase/
└─ migrations/                        # SQL versionado (bucket de anexos + RLS) — aplicado manualmente

scripts/
└─ integration/                       # smoke tests contra o Supabase real (npm run test:integration)

tests/
├─ unit/                              # vitest
└─ e2e/                               # Playwright (+ _aposentados/ = specs antigos, não varridos)
```

---

## Próximos passos sugeridos

Baseado no estado atual do código:

- **RLS no Supabase** — as tabelas de negócio não têm Row Level Security; o acesso é controlado
  só na camada de API. Avaliar policies de RLS como defesa em profundidade (mesmo com a API
  usando service role).
- **Anexos antigos** — as 48 prestações anteriores à migração para o Storage têm `attached_slots`
  preenchido, mas os arquivos nunca existiram no Storage (só na VPS antiga, se ainda existirem).
  Decidir entre migrar os arquivos ou limpar os slots.
- **Cobertura de testes** — geração do `.docx`, ciclo de cotação de câmbio (`montarCotacao` /
  `calcularTotalReais`) e cálculo de nota cheia (`calculations.ts`) não têm teste automatizado.
- **E2E de RBAC em CI** — as suítes `tests/e2e/rbac.spec.ts` e `configuracoes.spec.ts` só rodam
  com as env vars `E2E_*` (contas de teste no Supabase); hoje não há pipeline que as forneça.
- **Anexar automaticamente os arquivos de invoice/câmbio/nota de serviço** — hoje o upload é
  manual pelo `AttachmentsModal`; confirmado como objetivo futuro, ainda não implementado.
- **NFS-e (Focus NFe)** e **importar dados do Google Sheets** — ambas seguem no radar; nenhum
  código para elas ainda hoje (decisões pendentes: certificado A1 da Farmaurora para NFS-e;
  arquitetura de service account read-only para o Sheets).
