# ARCHITECTURE_REPORT — Farmaurora CRM

> Auditoria de **saúde arquitetural e código morto** (Rodada 2). Somente análise —
> **nenhum arquivo, export ou dependência foi removido, renomeado ou movido.**
> Data: 2026-09-09.
>
> Ferramentas rodadas via `npx --yes <pkg>@latest` (sem instalar nada no projeto):
> `knip`, `ts-prune`, `depcheck`, `madge`. Todo achado bruto de ferramenta foi
> reverificado com `grep` manual antes de ser classificado.

---

## 1. Resumo executivo

### Contagem por categoria (severidade = risco de **manutenção**, não de segurança)

| Categoria | Alto | Médio | Baixo | Total |
|---|---|---|---|---|
| Export / tipo morto confirmado | 0 | 1 | 2 | **3** |
| Dependência órfã / não declarada | 1 | 0 | 0 | **1** |
| Dependência circular | 0 | 0 | 0 | **0** ✅ |
| Rota "gorda" (`server/api`) | 0 | 0 | 1 | **1** |
| Componente "gordo" (`.vue`) | 0 | 2 | 1 | **3** |
| God-file (`server/utils`) | 0 | 1 | 0 | **1** |
| Duplicação de lógica | 0 | 2 | 1 | **3** |
| Organização / convenção | 0 | 0 | 3 | **3** |
| Arquivos aposentados (dead weight) | 0 | 0 | 1 | **1** |

### Achados que merecem atenção primeiro

- **[A1] `h3` é importado em ~40 arquivos `server/**` mas não está declarado no `package.json`** —
  funciona hoje só por *hoisting* do Nuxt/nitro. Um upgrade que mude a versão ou o layout de
  `node_modules` quebra toda a camada de API de uma vez, sem aviso.
- **[M1] `server/utils/pagamentosStore.ts` tem 692 linhas** misturando dois subdomínios
  (Banco/Câmbio e Grupos Despachante/Transportadora).
- **[M2] Bloco anti-lockout (proteção do último admin) duplicado** em `[id].delete.ts` e
  `[id].patch.ts` — invariante de segurança em dois lugares.
- **[M3] Extração de erro de `Response` HTTP** reimplementada em 3 variantes + 4 cópias inline
  nos 5 composables de dados, com drift comportamental (`useContas` trata `body.message`, os
  outros não).

### Achado positivo

- **Sem nenhuma dependência circular** no grafo de módulos (`server`, `shared`,
  `app/composables`, `app/middleware` via `madge`; `app/utils` verificado manualmente).

---

## 2. Área 1 — Código e exports não usados

### 2.1 `knip` — arquivos não usados (saída bruta + verificação)

```
scripts/integration/smoke-pagamentos-supabase.mjs
scripts/integration/smoke-patients-supabase.mjs
scripts/integration/smoke-processos-supabase.mjs
scripts/migration/migrate-follow-up.mjs
scripts/migration/migrate-pagamentos-grupos-to-supabase.mjs
scripts/migration/migrate-patients-to-supabase.mjs
scripts/migration/migrate-processos-to-supabase.mjs
tests/e2e/_aposentados/notificacaoFornecedor.skip.ts
tests/e2e/_aposentados/pagamentos.skip.ts
tests/e2e/_aposentados/processos.skip.ts
```

| Arquivo(s) | Verificação | Veredito |
|---|---|---|
| `scripts/integration/smoke-*.mjs` (3) | `scripts/integration/run-all.mjs` os executa via `spawnSync(process.execPath, [join(HERE, arquivo)])` — caminho montado por string, que o knip não rastreia. Rodam por `npm run test:integration`. | **Falso positivo** |
| `scripts/migration/*.mjs` (4) | Rodados manualmente (`node scripts/migration/X.mjs`), one-time. Não importados por nada. Consomem `data/*.json` (mantidos na Rodada 1 por causa deles). | **Órfãos por design** — histórico. Não são "mortos" no sentido nocivo. |
| `tests/e2e/_aposentados/*.skip.ts` (3) | Não varridos pelo Playwright (`testMatch **/*.spec.ts` + extensão `.skip.ts`). Cada arquivo importa **só** `@playwright/test` e `node:*` — self-contained, sem helper/fixture compartilhado (não há `tests/e2e/helpers/`). Os headers dos próprios arquivos dizem "APOSENTADO... mantido só como referência". | **Morto confirmado** — mantido de propósito. Remover não orfana nada. |

### 2.2 `knip` + `ts-prune` — exports não usados (cruzados + `grep` manual)

| Export | knip | ts-prune | `grep` em app/server/shared/tests | Veredito | Sev |
|---|---|---|---|---|---|
| `EMPRESA_LABEL` — `shared/constants/empresas.ts:8` | ✔ | ✔ | **0 referências** (só a linha da declaração) | **Morto confirmado** | Baixo |
| `LoteBancoView` — `shared/types/Pagamento.ts:93` | — | — | **0 referências** em qualquer arquivo, nem dentro de `Pagamento.ts` | **Morto confirmado** (tipo de contrato morto — ver §5.4) | Médio-Baixo |
| `CONSULTORES` re-export — `server/utils/patientValidation.ts:6` (`export { CONSULTORES }`) | ✔ | — | Ninguém importa `CONSULTORES` **de** `patientValidation`; todos importam de `#shared/constants/consultores`. Só `isValidPatientPayload` é consumido desse arquivo. | **Re-export morto** | Baixo |
| `isConsultorNome` (export) — `server/utils/authUser.ts:15` | ✔ | — | Usado **3×** dentro do próprio `authUser.ts` (linhas 40, 99, 135); **0 imports externos** | **Falso positivo como "morto"**, mas o `export` é desnecessário (poderia ser função local) | Cosmético |
| `RoleOption` (export) — `shared/constants/roles.ts:12` | — | ✔ (`used in module`) | Usado só dentro de `roles.ts` (tipo de `ROLE_OPTIONS`) | `export` poderia ser local | Cosmético |
| `MOEDA_SIMBOLO` — `shared/constants/pagamentos.ts:28` | — | ✔ | Usado em `BancoTab.vue`, `CotacaoBancoCard.vue`, `LancamentoBancoCard.vue`, `LoteBancoExportCard.vue` | **Falso positivo** (ts-prune não parseia `.vue`) | — |
| `TIPO_GRUPO_PAGAMENTO_LABEL` — `pagamentos.ts:100` | — | ✔ | Usado em `GrupoPagamentoTab.vue`, `NovoGrupoPagamentoModal.vue` | **Falso positivo** | — |
| `ROLE_OPTIONS` — `roles.ts:17` | — | ✔ | Usado em `ContaFormModal.vue:148` | **Falso positivo** | — |
| `ROLE_LABEL` — `roles.ts:5` | — | ✔ (`used in module`) | Usado em `ContasTab.vue:226` (+ internamente) | **Falso positivo** | — |
| `AttachmentSlotKey` — `shared/types/Patient.ts:12` | — | — | Usado em `Patient.ts:37` (`attachedSlots: AttachmentSlotKey[]`) | **Falso positivo** — alias trivial `= string` | Cosmético |

**Impacto:** `EMPRESA_LABEL`, `LoteBancoView` e o re-export de `CONSULTORES` são peso morto real —
não quebram nada, mas confundem quem lê (`EMPRESA_LABEL` parece o par de `EMPRESA_PAGAMENTO_LABEL`,
que **é** usado; `LoteBancoView` tem um comentário dizendo "como a UI consome", o que é falso).

**Sugestão de fix (proposta):** remover as 3 declarações mortas. `isConsultorNome` e `RoleOption`:
trocar `export function`/`export interface` por versão local (ou deixar — custo zero).

### 2.3 Componentes `.vue`

Com auto-import desabilitado (`components: false` no `nuxt.config.ts`), todo uso de componente é
`import` explícito. **Os 28 componentes em `app/components/**` têm ao menos 1 import** — o `knip`
não listou nenhum `.vue` em "unused files", e `grep` de cada nome encontra o import.
**Nenhum componente morto.**

### 2.4 `devDependencies`

| Dep | knip | depcheck | Verificação | Veredito |
|---|---|---|---|---|
| `vue-tsc` | ✔ | ✔ | Rodado só como `npx vue-tsc --noEmit` (fluxo de verificação manual). **Não está wired a nenhum script do `package.json`.** | **Falso positivo como "morto"** — mas falta o script |
| `tailwindcss` | — | ✔ | Usado via `@tailwindcss/vite` (`nuxt.config.ts`) + `@import "tailwindcss"` em `app/assets/css/main.css` (`@theme {}` — Tailwind v4 CSS-first) | **Falso positivo** |

**Sugestão de fix (proposta):** adicionar `"typecheck": "vue-tsc --noEmit"` ao `package.json`
(já era o achado **B-04** da 1ª auditoria) — torna `vue-tsc` uma devDependency com uso rastreável
e dá um comando de CI.

---

## 3. Área 2 — Dependências órfãs

### 3.1 [A1] `h3` importado mas não declarado — **Alto**

- **Localização:** ~40 arquivos `server/**` — todos os handlers de `server/api/`, `server/middleware/auth.ts`, `server/utils/{authUser,pagamentosStore,pagamentosPixStore,supabaseServerClient}.ts`, `server/types/h3.d.ts`.
- **Evidência:**
  ```ts
  // ex.: server/middleware/auth.ts:1
  import { defineEventHandler, createError, getMethod } from "h3";
  ```
  `package.json` → `dependencies` **não** contém `h3`. `npm ls h3` → `h3@1.15.11`, resolvido só
  como transitiva de `@nuxt/nitro-server` / `nitropack`. Tanto `knip` (45 ocorrências "Unlisted
  dependencies") quanto `depcheck` ("Missing dependencies: h3") apontam.
- **Impacto:** a camada de API inteira depende de um pacote que o projeto não declara. Um
  `npm update`, uma troca de gerenciador (pnpm/yarn com `node-linker` estrito), ou um upgrade de
  Nuxt que mude a versão de `h3` — qualquer um pode fazer o import resolver para outra versão ou
  falhar, quebrando **todas** as rotas de uma vez, sem erro em build até rodar.
- **Sugestão de fix (proposta):** adicionar `"h3": "^1.15.11"` a `dependencies` (mesma faixa que
  `nitropack` declara hoje).

### 3.2 Falsos positivos de dependência

| depcheck "Missing" | Verificação |
|---|---|
| `#shared` (`tests/unit/consultores.spec.ts`) | Alias virtual do Nuxt; no vitest resolvido por `vitest.config.ts` (`resolve.alias["#shared"]`). Falso positivo. |
| `#imports` (`server/utils/supabaseServerClient.ts`) | Virtual do Nuxt/nitro. Falso positivo. |
| `#app` (`app/app.vue`) | Virtual do Nuxt. Falso positivo. |

### 3.3 Dependências de `package.json` genuinamente órfãs

**Nenhuma.** Todas as 8 `dependencies` (`@supabase/ssr`, `@supabase/supabase-js`,
`docxtemplater`, `docxtemplater-image-module-free`, `html-to-image`, `nuxt`, `pizzip`, `vue`)
têm import verificado por `grep`. `overrides.xmldom` é config de resolução, não import.

---

## 4. Área 3 — Dependência circular

### 4.1 Resultado

| Escopo | Ferramenta | Resultado |
|---|---|---|
| `server/` + `shared/` (63 arquivos `.ts`) | `madge --circular --extensions ts` | **✔ Nenhum ciclo** |
| `app/composables/` (13) | `madge --circular --extensions ts` | **✔ Nenhum ciclo** |
| `app/middleware/` (4) | `madge --circular --extensions ts` | **✔ Nenhum ciclo** |
| `app/utils/*.ts` | `madge` falhou (erro do parser Babel com sintaxe TS) → **verificado manualmente** | **Sem ciclo** |
| `.vue` (componentes) | `madge` não parseia SFC sem plugin | não coberto por ferramenta; nenhum ciclo evidente por inspeção dos imports |

Verificação manual de `app/utils/`: só há 2 arestas internas —
`anexoSlots.ts → calculations.ts` e `processoOptions.ts → processoStatus.ts` — ambas acíclicas
(`calculations.ts` e `processoStatus.ts` não reimportam a origem).

**ACHADO POSITIVO: o grafo de módulos do projeto não tem dependência circular.**

### 4.2 Observação de camada (não é ciclo) — Baixo

- **Localização:** `app/utils/pagamentoOptions.ts:12` e `app/utils/processoOptions.ts:12`.
- **Evidência:**
  ```ts
  import type { AppSelectOption } from "../components/AppSelect.vue";
  ```
  Um `utils/` "sobe" para `components/` para pegar um tipo. É `import type` (apagado em runtime,
  **não gera ciclo**), mas inverte a direção de camadas do `CLAUDE.md`
  (`components` → `composables` → `utils`, nunca o contrário).
- **Sugestão de fix (proposta):** mover a interface `AppSelectOption<T>` para `app/types/` (ou
  `shared/types/`) e importar de lá tanto no `AppSelect.vue` quanto nos utils.

---

## 5. Área 4 — Coerência arquitetural

### 5.1 Rotas "gordas" (`server/api/**` acima de ~80 linhas)

| Arquivo | Linhas | O que está misturado | Avaliação |
|---|---|---|---|
| `server/api/admin/users.post.ts` | 85 | auth check · parse de e-mail/senha · `parseRoleInput` (**já delegado** a `authUser.ts`) · `admin.auth.admin.createUser` · classificação do erro `alreadyExists` (regex na mensagem) | **Borderline.** O grosso são as 2 interfaces locais + o mapeamento de status de erro. Sem cálculo de negócio. Baixo. |
| `server/api/admin/users/[id].patch.ts` | 74 | idem + **bloco anti-lockout** (ver §5.3) | Abaixo do limite; o problema real é a duplicação, não o tamanho. |

As demais rotas (`patients/`, `processos/`, `pagamentos/**`) têm **10–29 linhas** e seguem o
padrão fino: `parse → valida (util) → store (util) → retorna`. **Camada de API saudável no geral.**

### 5.2 Componentes `.vue` com `<script>` acima de ~300 linhas

| Componente | Linhas de `<script>` / total | Responsabilidades no `<script>` | Avaliação |
|---|---|---|---|
| `app/components/processos/ProcessoFormModal.vue` | **370 / 783** | `FormState` de **32 campos** (espelho de `Processo`) · `emptyForm` · `loadProcessoIntoForm` (32 atribuições) · `loadFornecedorIntoForm` · 6 handlers de máscara de input (`onPacienteInput`, `onPastaInput`, `onMedicamento{Nome,Dosagem,Quantidade}Input`, `onDataFieldInput`) · 4 builders de payload (`buildDatas`, `buildTransportadoraNacional`, `buildFornecedorValue`, `buildBasePayload`) · `handleSubmit` | **Médio.** A complexidade do domínio é real (Processo tem ~30 campos), mas o mapeamento `form ↔ DTO` (load + build, ~200 linhas de boilerplate) daria um `useProcessoForm()`, deixando o `.vue` como template + fiação fina. |
| `app/components/PatientForm.vue` | **341 / 545** | `FormState` · máscaras · `loadPatientIntoForm` · `buildDescricaoCompra`/`buildDescricaoResumo` · **staging de anexos** (`stagedAttachments`, `onStageAttachment`, `onUnstageAttachment`, `requiredSlots` computed, `attachmentPreviews`, `liveAttachmentUrls`) · `handleSubmit` | **Médio.** Mistura duas responsabilidades: o formulário do paciente **e** o staging de anexos pré-submit. Candidato a `usePatientForm()` + `useAttachmentStaging()`. |
| `app/pages/pagamentos.vue` | **299 / 448** | Orquestra 4 abas + 5 modais + 2 export-cards · ~15 handlers, quase todos no formato `try { await composable(); showToast(ok) } catch (e) { showToast(getErrorMessage(e, msg)) }` | **Baixo-Médio.** É um orquestrador de página; a repetição é o wrapper `try/catch/toast`. Um helper `withToast(fn, okMsg, errMsg)` cortaria ~metade. |

### 5.3 [M2] Duplicação — bloco anti-lockout (proteção do último admin) — **Médio**

- **Localização:** `server/api/admin/users/[id].delete.ts:25-37` **e** `server/api/admin/users/[id].patch.ts:43-56`.
- **Evidência:** o mesmo trecho nos dois arquivos (só a mensagem de erro muda):
  ```ts
  const users = await listAllAuthUsers(admin);
  const target = users.find((u) => u.id === id);
  if (!target) throw createError({ statusCode: 404, statusMessage: "Conta não encontrada." });
  const targetIsAdmin = toAdminUserSummary(target).role === "administrador";
  const adminCount = users.filter((u) => toAdminUserSummary(u).role === "administrador").length;
  if (targetIsAdmin && adminCount <= 1) {
    throw createError({ statusCode: 400, statusMessage: /* "excluir" | "remover o cargo" */ });
  }
  ```
- **Impacto:** é o invariante de segurança "não deixar o sistema sem admin", vivendo em dois
  lugares. Uma correção (ex.: tratar a corrida de contagem, já apontada na 1ª auditoria como
  B-07) precisa ser feita em duplicata; esquecer um dos dois reabre o buraco.
- **Sugestão de fix (proposta):** `assertNotLastAdmin(admin, targetId, acao: "excluir" | "demover")`
  em `server/utils/authUser.ts` (que já tem `listAllAuthUsers`, `countAdmins`, `toAdminUserSummary`).

### 5.4 [M3] Duplicação — extração de erro de `Response` HTTP — **Médio**

- **Localização:** 5 composables:
  | Arquivo | Forma |
  |---|---|
  | `app/composables/useContas.ts:13` | `async function readErr(res, fallback): Promise<string>` — também lê `body.message` |
  | `app/composables/usePagamentos.ts:25` | `async function readError(res, fallback): Promise<never>` — só `body.statusMessage` |
  | `app/composables/usePatients.ts:38,53` | inline `res.json().catch(() => ({})); throw new Error(body.statusMessage \|\| "...")` (2×) |
  | `app/composables/useProcessos.ts:30,45` | inline, idêntico (2×) |
- **Impacto:** 3 variantes + 4 cópias inline da mesma ideia. Além do custo de manutenção, há
  **drift**: `useContas` faz fallback para `body.message`, os outros não — então a mesma resposta
  de erro do servidor pode virar mensagem diferente dependendo da tela.
- **Sugestão de fix (proposta):** um `readApiError(res: Response, fallback: string): Promise<string>`
  em `app/utils/errorMessages.ts` (que já é o lar de `getErrorMessage`), usado pelos 5.

### 5.5 Simetria Despachante / Transportadora — achado **positivo** (com nota)

- `diff` dos **8 pares** de arquivos em `server/api/pagamentos/{despachante,transportadora}/`
  (`.get`, `.post`, `/[id].patch`, `/[id]/item.patch`, `/[id]/item.delete`, `/[id]/pagar.patch`,
  `-pix.get`, `-pix.patch`), normalizando o nome do domínio: **byte-idênticos**, exceto **um**
  comentário (`-pix.patch.ts`: "daquele XXX" vs "daquela XXX" — concordância de gênero).
- **Sem divergência funcional.** Nenhum parâmetro a mais, validação a menos, ou comportamento
  diferente.
- **Nota (Baixo):** são **16 arquivos de ~10–20 linhas quase iguais**. O `pagamentosStore.ts` já
  parametriza tudo por `tipo: "DESPACHANTE" | "TRANSPORTADORA"`; as rotas poderiam ser 8 handlers
  em `server/api/pagamentos/grupos/[tipo]/...`. Como os arquivos são triviais e hoje estão
  sincronizados, o custo de manter os 16 é baixo — é uma escolha de estilo, não um defeito.

### 5.6 Tipos de contrato mortos em `shared/types/`

| Tipo | Localização | Situação | Sev |
|---|---|---|---|
| `LoteBancoView` | `shared/types/Pagamento.ts:93` | `interface LoteBancoView extends LoteBanco { lancamentos; cotacao; totalMoeda; totalReais }` — **nunca referenciado** em nenhum arquivo. Comentário diz "Lote + ... como a UI consome", mas `CotacaoTab.vue`/`BancoTab.vue` montam a visão de outro jeito (via `pagamentoCalculations.montarCotacao` + props separados). | Médio-Baixo |
| `AttachmentSlotKey` | `shared/types/Patient.ts:12` | `type AttachmentSlotKey = string` — usado só em `Patient.ts` (`attachedSlots: AttachmentSlotKey[]`). Alias trivial. | Cosmético |

**Sugestão de fix (proposta):** remover `LoteBancoView` (ou implementá-lo de fato na UI se a
intenção original ainda vale — confirmar). `AttachmentSlotKey`: pode inlinar `string[]` ou deixar.

### 5.7 [M1] God-file — `server/utils/pagamentosStore.ts` (692 linhas) — **Médio**

- **Evidência:** um único arquivo contém:
  1. **Banco / Câmbio** — `LoteRow`/`LancRow` mappers, `montarLote`/`loteToRow`/`montarLancamento`/`lancToRow`, `novoLote`, `invalidarCotacao`, `getBancoPayload`, `acharLoteAberto`, `criarLancamentoBanco`, `atualizarLancamentoBanco`, `removerLancamentoBanco`, `atualizarCotacaoLote`, `fecharLoteBanco`.
  2. **Grupos Despachante/Transportadora** — `GrupoRow` mapper, `montarGrupo`, `acharGrupoRow`, `listGruposPagamento`, `criarGrupoPagamento`, `atualizarItemGrupo`, `editarItemGrupo`, `removerItemGrupo`, `pagarGrupoPagamento`.
  3. Re-export das 4 funções de PIX (de `pagamentosPixStore.ts`).
- **Impacto:** os dois subdomínios não têm nada em comum além de "Pagamentos" — mudança num lado
  obriga a rolar por 350 linhas do outro; o arquivo é o maior do `server/` por larga margem
  (2º lugar: `processosStore.ts` com 265).
- **Sugestão de fix (proposta):** quebrar em `pagamentosBancoStore.ts` + `pagamentosGruposStore.ts`;
  manter `pagamentosStore.ts` como barrel que re-exporta os dois (+ o PIX), para os endpoints não
  mudarem nenhum import.

### 5.8 Utils misturando domínios — sem achado

Verificado: `app/utils/*` está prefixado por domínio (`pagamento*` ×5, `processo*` ×3) e o
restante é genérico de verdade (`formatters`, `search`, `generatePassword`, `calculations`,
`monthGroups`, `anexoSlots`, `errorMessages`). `formatters.ts` tem funções usadas por mais de um
domínio (`formatInvoiceAmountBR`, `toTitleCaseName`, `maskDateDdMm`) — mas são formatação
genérica, não lógica de domínio. **OK.**

---

## 6. Área 5 — Organização geral

- `find app server shared tests -type f -empty` → **nenhum arquivo vazio.**
- **Nenhum** `.bak` / `.old` / `.backup` / `.orig` / `*Copy*` / `*Old*` em `app/` / `server/` / `shared/`.
- `server/types/h3.d.ts` (10 linhas — augment de `H3EventContext.user`) e
  `app/types/docxtemplater-image-module-free.d.ts` (11 linhas — shim de tipos da lib) são
  legítimos, não "arquivos triviais a consolidar".

### 6.1 [Baixo] Organização por domínio inconsistente

| Domínio | Componentes ficam em |
|---|---|
| Processos | `app/components/processos/` (subpasta) ✔ |
| Pagamentos | `app/components/pagamentos/` (subpasta) ✔ |
| Configurações | `app/components/configuracoes/` (subpasta) ✔ |
| **Prestações / Pacientes** | **flat em `app/components/`** — `PatientForm`, `PatientTable`, `PatientRow`, `AttachmentsModal`, e `MonthFilterBar` (só a tela de Prestações usa) — misturados com os genéricos de verdade (`AppSelect`, `ConfirmDialog`, `SidebarNav`, `ToastNotice`, `LogoutButton`) |

- **Impacto:** quem abre `app/components/` não distingue "genérico reusável" de "peça da tela de
  Prestações". Os outros 3 domínios já resolveram isso com subpasta.
- **Sugestão de fix (proposta):** `app/components/prestacao/` (ou `patients/`) para
  `PatientForm`, `PatientTable`, `PatientRow`, `AttachmentsModal`, `MonthFilterBar`.

### 6.2 [Baixo] `vue-tsc` sem script npm

Ver §2.4 — `"typecheck": "vue-tsc --noEmit"` no `package.json`.

### 6.3 [Baixo] `CLAUDE.md` × realidade — `tailwind.config.ts`

O `CLAUDE.md` lista `tailwind.config.ts` na árvore de estrutura, mas o projeto usa **Tailwind v4
com `@theme {}`** em `app/assets/css/main.css` (sem arquivo de config). É o guia de doc levemente
à frente da realidade — não é defeito de código, mas vale alinhar o `CLAUDE.md` numa próxima
revisão dele.

---

## 7. Lista de candidatos a remoção

### 7.1 Pode remover com confiança (morto confirmado por ≥2 fontes + `grep` manual)

| Item | Localização | Confirmação |
|---|---|---|
| `export const EMPRESA_LABEL` | `shared/constants/empresas.ts:8` | knip + ts-prune + `grep` = 0 refs |
| `export interface LoteBancoView` | `shared/types/Pagamento.ts:93` | `grep` = 0 refs (nem interno) |
| `export { CONSULTORES }` (re-export) | `server/utils/patientValidation.ts:6` | knip + `grep` = nenhum import desse símbolo desse arquivo |
| `tests/e2e/_aposentados/notificacaoFornecedor.skip.ts` | — | knip; não varrido pelo Playwright; self-contained; header diz "aposentado" |
| `tests/e2e/_aposentados/pagamentos.skip.ts` | — | idem |
| `tests/e2e/_aposentados/processos.skip.ts` | — | idem |

> Os 3 `_aposentados/*.skip.ts` estão sendo mantidos **de propósito** como referência histórica
> (decisão registrada nos próprios headers). "Pode remover" aqui significa "é seguro tecnicamente",
> não "deve remover agora".

### 7.2 Remover só com confirmação do dev (uso indireto, recente, ou decisão de produto)

| Item | Motivo da cautela |
|---|---|
| `scripts/migration/*.mjs` (4) | Órfãos de import, mas são o histórico de como os dados chegaram ao Supabase. Remover só se a migração é considerada definitivamente encerrada e não há valor em manter o passo-a-passo versionado. |
| `export function isConsultorNome` → `function isConsultorNome` | Não é remoção, é tirar o `export`. Confirmar que nenhum teste/script futuro planeja importar. |
| `export interface RoleOption` → local | idem |
| `type AttachmentSlotKey` | Inlinar `string[]` em `Patient.attachedSlots`. Trivial, mas é mudança de contrato público — confirmar que ninguém externo (script, futuro pacote) depende do nome. |
| `LoteBancoView` (alternativa a remover) | Pode ser que a intenção original — a UI consumir uma view pronta em vez de montar na mão — ainda seja desejável. Confirmar antes de deletar vs. implementar. |

### 7.3 NÃO remover (falsos positivos das ferramentas)

`MOEDA_SIMBOLO`, `TIPO_GRUPO_PAGAMENTO_LABEL`, `ROLE_OPTIONS`, `ROLE_LABEL` (usados em `.vue`);
`vue-tsc`, `tailwindcss` (usados como CLI / via plugin+CSS); `scripts/integration/smoke-*.mjs`
(spawnados por `run-all.mjs`); imports `#shared`/`#app`/`#imports` (aliases virtuais do Nuxt).

---

## 8. Lista priorizada de refatorações estruturais

Ordenada por **impacto de manutenção × esforço** (maior valor / menor esforço primeiro).

| # | Refatoração | Categoria | Impacto | Esforço | Nota |
|---|---|---|---|---|---|
| 1 | **Declarar `h3` em `dependencies`** (`^1.15.11`) | Dep órfã | Alto (evita quebra silenciosa de toda a API) | Trivial | 1 linha no `package.json` + `npm i` |
| 2 | **`readApiError(res, fallback)`** único em `app/utils/errorMessages.ts`, adotado nos 5 composables | Duplicação (M3) | Médio (consistência de mensagem de erro + menos código) | Pequeno | Substitui `readErr`/`readError` + 4 blocos inline |
| 3 | **`assertNotLastAdmin(admin, id, acao)`** em `server/utils/authUser.ts`, usado em `delete.ts` e `patch.ts` | Duplicação (M2) | Médio (invariante de segurança num lugar só) | Pequeno | Também facilita corrigir a corrida de contagem (B-07) |
| 4 | **Remover mortos confirmados** (`EMPRESA_LABEL`, `LoteBancoView`, re-export `CONSULTORES`) | Export morto | Baixo-Médio (menos ruído de leitura) | Trivial | §7.1 |
| 5 | **Adicionar `"typecheck"` ao `package.json`** | Organização | Médio (type-check vira comando de CI) | Trivial | §2.4 / B-04 |
| 6 | **Mover `AppSelectOption` para `app/types/`** e ajustar os 2 utils + `AppSelect.vue` | Camada (§4.2) | Baixo (respeita direção de camadas) | Pequeno | Tira `utils → components` |
| 7 | **Quebrar `pagamentosStore.ts`** em `…BancoStore.ts` + `…GruposStore.ts` + barrel | God-file (M1) | Médio (arquivo de 692→~2×350; sub-domínios isolados) | Médio | Contrato para os endpoints não muda (barrel re-exporta) |
| 8 | **Extrair `useProcessoForm()`** de `ProcessoFormModal.vue` (load/build `form ↔ DTO`) | Componente gordo | Médio (script de 370→~120; lógica testável) | Médio | Padrão dos outros forms |
| 9 | **Extrair `usePatientForm()` + `useAttachmentStaging()`** de `PatientForm.vue` | Componente gordo | Médio (separa form de staging de anexo) | Médio | — |
| 10 | **`app/components/prestacao/`** — mover os 5 componentes de Prestações para subpasta | Organização | Baixo (consistência com os outros 3 domínios) | Pequeno | Só mover + ajustar imports |
| 11 | **`withToast(fn, okMsg, errMsg)`** helper em `pagamentos.vue` (e talvez `processos.vue`) | Componente gordo | Baixo (corta ~40% dos handlers repetidos) | Pequeno | — |
| 12 | **Parametrizar rotas Despachante/Transportadora** por `[tipo]` (16 arquivos → 8) | Simetria (§5.5) | Baixo (menos arquivos a sincronizar) | Médio | Opcional — hoje estão idênticos e o custo de manter é baixo |

> Nenhuma dessas refatorações foi aplicada nesta rodada. Números de linha e nomes de arquivo
> conferidos contra o estado atual do repositório.
