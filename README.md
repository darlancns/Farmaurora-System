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
- **Rota de entrada por cargo** (`defaultRouteForRole`): `consultor` e `operacional` caem em
  `/processos`; `socio` e `administrador` em `/inicio`.
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
| Chave PIX padrão por despachante / transportadora | **Arquivo local** — `data/pagamentos-despachante-pix.json`, `data/pagamentos-transportadora-pix.json` |
| Anexos de paciente (invoice, câmbio, despachante, transporte, serviço) | **Arquivo local** — `public/uploads/attachments/<patientId>/<slot>.png` |

Todo acesso ao Postgres é feito com a **service role key** (sem RLS) — ver seção "Como
funciona". Os `data/*.json` e `public/uploads/` estão no `.gitignore` (contêm dados reais de
pacientes e CPF/CNPJ).

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
npm run test:e2e           # Playwright, contra o dev server. A maior parte dos casos (RBAC,
                           # Configurações) é test.skip sem as env vars E2E_* (contas de teste)
npm run test:integration   # smoke tests em Node puro CONTRA O SUPABASE REAL do .env
                           # (criam e apagam registros com id de prefixo TESTE_)
```

---

## Build de produção

```bash
npm run build
node .output/server/index.mjs
```

Por padrão sobe na porta 3000 (`PORT=8080 node .output/server/index.mjs` para mudar).

### Deploy

O build em `.output/` é um servidor Node standalone — roda em qualquer host que rode Node (VPS,
Render, Railway, Fly.io, container Docker, PM2, etc.). Não precisa de nada específico da
Nuxt/Vercel.

```bash
pm2 start .output/server/index.mjs --name farmaurora-crm
```

**Sobre persistência em produção:**

- **Pacientes, Processos e Pagamentos** ficam no Postgres do Supabase — **não** dependem de
  volume local.
- **Ainda dependem de disco local** (portanto exigem volume persistente e **não** funcionam bem
  com múltiplos containers / servidores):
  - as chaves PIX (`data/pagamentos-*-pix.json`);
  - os anexos de paciente (`public/uploads/attachments/`), que hoje também são **servidos como
    estático** por essa pasta — a leitura de um anexo não passa por checagem de cargo.
- Variáveis de ambiente: ver `.env.example`. A `NUXT_SUPABASE_SERVICE_ROLE_KEY` é server-only e
  nunca vai para o bundle do browser.

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

> **Nota:** MainzFarma existe como empresa em Processos e Pagamentos, mas **por design não
> gera prestação de contas** — a tela de Prestações trabalha só com Farmaurora. Por isso não há
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
│  ├─ inicio.vue                      # landing pós-login (banner); "/" redireciona p/ cá
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
└─ utils/                             # rbac.ts (política de acesso), attachments.ts

server/
├─ api/
│  ├─ auth/me.get.ts                  # identidade + cargo resolvido
│  ├─ admin/users*                    # CRUD de contas (admin only) + reset-password + anti-lockout
│  ├─ patients/                       # index.get / index.post / [id].put / [id].delete
│  ├─ attachments/                    # index.post (upload) / index.delete   (seção RBAC: patients)
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
   └─ attachmentPaths.ts              # caminhos seguros dos anexos (regex anti path-traversal)

public/
├─ templates/                         # template_farmaurora.docx, template_farmaurora_completo.docx
├─ images/                            # logo, placeholder de anexo pendente
└─ uploads/attachments/               # anexos enviados (arquivo local, .gitignore)

data/                                 # .gitignore — dados locais
├─ pagamentos-despachante-pix.json    # override de chave PIX (em uso)
└─ pagamentos-transportadora-pix.json # override de chave PIX (em uso)

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
- **Tirar anexos e PIX do disco local** — mover os anexos de paciente para Supabase Storage
  (bucket privado + signed URLs) e as chaves PIX para uma tabela, para suportar deploy
  multi-instância. Hoje os anexos em `public/uploads/` também são servidos como estático, sem
  checagem de cargo na leitura.
- **Cobertura de testes** — geração do `.docx`, ciclo de cotação de câmbio (`montarCotacao` /
  `calcularTotalReais`) e cálculo de nota cheia (`calculations.ts`) não têm teste automatizado.
- **E2E de RBAC em CI** — as suítes `tests/e2e/rbac.spec.ts` e `configuracoes.spec.ts` só rodam
  com as env vars `E2E_*` (contas de teste no Supabase); hoje não há pipeline que as forneça.
- **Anexar automaticamente os arquivos de invoice/câmbio/nota de serviço** — hoje o upload é
  manual pelo `AttachmentsModal`; confirmado como objetivo futuro, ainda não implementado.
- **NFS-e (Focus NFe)** e **importar dados do Google Sheets** — ambas seguem no radar; nenhum
  código para elas ainda hoje (decisões pendentes: certificado A1 da Farmaurora para NFS-e;
  arquitetura de service account read-only para o Sheets).
