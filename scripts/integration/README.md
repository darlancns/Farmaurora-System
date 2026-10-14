# Smoke tests de integração

Testes de fumaça que exercitam os **stores do servidor** (`server/utils/*Store.ts`)
ponta a ponta contra o Supabase, reproduzindo a mesma sequência de queries que
os endpoints fazem. Substituem os antigos specs e2e de Processos e Pagamentos
(aposentados em `tests/e2e/_aposentados/`), que dependiam da persistência em
arquivo JSON — hoje só as chaves PIX ficam em arquivo.

## Como rodar

```bash
npm run test:integration
```

Roda os smoke tests e a integração do store real em sequência
(`scripts/integration/run-all.mjs`). Exit code `!= 0` se qualquer um falhar.

Também dá pra rodar um isolado:

```bash
node scripts/integration/smoke-processos-supabase.mjs
npm run test:integration:store   # só o câmbio com o store REAL (vitest)
```

## ⚠️ Rodam contra o banco REAL

Não existe um banco Supabase de teste separado — **decisão consciente** (projeto
de operador único, baixo volume, e manter um segundo projeto Supabase
sincronizado daria mais manutenção do que valor). Os scripts leem o `.env` deste
diretório (`NUXT_PUBLIC_SUPABASE_URL` + `NUXT_SUPABASE_SERVICE_ROLE_KEY`, via
`createSupabaseAdminClient`, service role) e escrevem no mesmo projeto que a
aplicação usa.

Para **nunca encostar em dado real**, todo registro criado usa um **prefixo de
teste** no `id`:

| Entidade | Prefixo do id de teste |
|---|---|
| Paciente (`prestacao_pacientes`) | `TESTE_...` |
| Processo (`follow_up`) | `TESTE_...` |
| Lote de banco (`pagamento_lotes_banco`) | `TESTE_lote_...` |
| Lançamento de banco (`pagamento_lancamentos_banco`) | `TESTE_lanc_...` |
| Grupo de pagamento (`pagamento_grupos`) | `TESTE_grp_...` |

Cada suíte apaga o que criou num bloco `finally` e, no fim, faz um
`select ... like 'TESTE_%'` e falha se sobrou qualquer coisa. Os IDs reais dos
stores usam prefixos `p_`, `proc_`, `lote_`, `lanc_`, `grp_` (sem `TESTE_`), então
não há colisão possível.

## O que cada script cobre

### `smoke-patients-supabase.mjs` — `patientsStore.ts`
Tabela única `prestacao_pacientes` com `medicamentos` / `remessas_itens` em jsonb.
- create com 3 medicamentos + 2 remessas; `consultor "" → NULL`; `attachedSlots []`
- update mudando a quantidade de itens (2 medicamentos, 3 remessas) → arrays
  substituídos sem sobra, pareados na ordem, num único `UPDATE`
- `attachedSlots` add/remove
- delete + delete de id inexistente → `false`

### `smoke-processos-supabase.mjs` — `processosStore.ts`
Tabela única `follow_up`; `datas` achatada em 9 colunas, `transportadoraNacional`
em 3, `medicamentos`/`atualizacoes` jsonb.
- create com `datas` parcial, `transportadoraNacional`, 2+ medicamentos, 2+
  atualizações, 1 pendência
- edição (patch quase completo) → reabrir idêntico; `atualizacoes` preservada
  quando fora do patch
- patch esparso (`{ alertaFornecedorResolvido: true }`) → só essa coluna muda
- registro sem `transportadoraNacional` e sem nenhuma data → volta sem essas
  chaves (não `{}` nem `null`)
- delete

### `smoke-pagamentos-supabase.mjs` — espelho do `pagamentosStore.ts`
> ⚠️ Reimplementa as queries do store (não importa o código real). Serve de
> verificação do schema/constraints; a lógica real é coberta por
> `pagamentos-store-real.spec.ts`. O ramo Rendimento daqui NÃO reflete a trava 409
> de lote já cotado.

`pagamento_lotes_banco` + `pagamento_lancamentos_banco` (FK cascade) +
`pagamento_grupos` (itens jsonb). Cobre o fluxo completo do lado Banco e as
regras 3a–3d:
- 1º lançamento sem lote aberto → cria lote; 2º da mesma empresa+moeda → entra
  no mesmo lote
- cotar + escolher banco → `valorReais = valorMoeda * taxa` nos pendentes
- lançamento novo em lote cotado → invalida (banco/taxa/3 taxas → null,
  `taxaCorretagem` preservada, `valorReais` → null)
- escolher banco com taxa null → erro 400
- remover lançamento de lote cotado não realizado → invalida de novo
- fechar lote → `realizado`/`pagoEm`, sem recalcular `valorReais`
- grupos: status por item é gravação direta (não move o grupo); `pagarGrupo`
  promove `NAO_PAGO → PAGO` e deixa `COMPLEMENTO`

### `pagamentos-store-real.spec.ts` — `bancoStore.ts` / `pagamentosStore.ts` REAIS
Diferente dos `smoke-*.mjs` (que **reimplementam** o store — "espelho" — e por isso
passam mesmo que o store real quebre), este roda o **código de verdade** do
servidor: o handler `PATCH /api/pagamentos/cotacao` (validação + 400/409 reais),
`criarLancamentoBanco`/`atualizarCotacaoLote`/`atualizarLancamentoBanco`, e as
funções reais do cliente que definem os números (`parseTaxa`,
`calcularTotalReaisLote`, `montarCotacaoDoLote`). Roda no vitest com
`vitest.integration.config.ts` (fora do `npm run test:unit` de propósito) e um stub
de `#imports` em `_stubs/nuxtImports.ts` que lê o `.env`.
- taxa com ponto e com vírgula → mesmo `valorReais`
- taxa fora de `[TAXA_MIN, TAXA_MAX]` (1 a 20) → 400 com mensagem, nada gravado
- Rendimento com 1 ordem (`taxaEscolhida` real) e com 3 ordens (`taxaEscolhida`
  null, taxa por linha)
- total do lote com corretagem (uma vez só) = número do card da Cotação
- lote já cotado → 409 (nova escolha e edição de taxas)
- lançamento novo/editado em lote cotado → invalida e libera a escolha
- dois lotes abertos da mesma empresa+moeda sem vazamento entre eles

Segurança extra (escreve no banco real):
- ids ganham o prefixo `TESTE_RS_` (mock de `randomId`; o resto do store roda sem
  alteração);
- lotes só são criados com `forcarLoteNovo` ou `loteId` explícito, nunca pelo
  roteamento automático;
- escolhe uma combinação empresa+moeda **sem lote real aberto**; se todas tiverem,
  **pula com aviso** (não escreve nada);
- `afterAll` apaga tudo (mesmo com teste falhando) e exige 0 registros `TESTE_%`.

## Quando rodar

- **Antes e depois de mexer em qualquer `*Store.ts`** do servidor.
- Depois de mudanças de schema no Supabase que afetem essas tabelas.
- Não roda no CI (precisa das credenciais reais e escreve no banco de produção);
  é uma verificação manual local.
