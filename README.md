# sonarutils

[Português](#português) | [English](#english)

## 🇧🇷

Utilitários independentes para extração **somente leitura** de métricas, issues e condições não cobertas do SonarQube. Cada comando faz requisições HTTP `GET`; nenhum registro do SonarQube é criado ou alterado.

Inspirado pelo projeto [`mkazimoto/ExtrairCondicoesNaoCobertasSonar`](https://github.com/mkazimoto/ExtrairCondicoesNaoCobertasSonar). Esta é uma reimplementação independente, baseada no comportamento documentado, sem cópia de código-fonte.

### Requisitos e configuração

- Node.js 18 ou superior; não há dependências externas de execução ou teste.
- Configure as variáveis abaixo no ambiente do processo ou no arquivo `.env` da raiz. Copie `.env.example` e preencha os valores obrigatórios com os dados da sua própria instância:

| Variável        | Valor a configurar                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `SONAR_URL`     | URL base acessível da sua instância SonarQube (`http://` ou `https://`); obrigatória, sem valor predefinido. |
| `SONAR_PROJECT` | Chave exata do projeto no SonarQube; obrigatória, sem valor predefinido.                                     |
| `SONAR_TOKEN`   | Token SonarQube, se necessário; opcional. Deixe vazio para acesso anônimo.                                   |
| `SONAR_TOP_N`   | Quantidade de arquivos do ranking Conditions; inteiro positivo. O valor predefinido é `30`.                  |

```env
SONAR_URL=
SONAR_PROJECT=
SONAR_TOKEN=
SONAR_TOP_N=30
```

Substitua os valores vazios de `SONAR_URL` e `SONAR_PROJECT` antes de executar; não há URL ou projeto de exemplo embutidos. A precedência é: `--url`/`--project` (e `--top` em Conditions), ambiente do processo e, por último, `.env`.

```sh
npm start
npm run conditions -- --top 15
npm run coverage -- --url https://sonar.example --project projeto
```

Não há dependências para instalar. As opções `--url` e `--project` estão disponíveis em todos os comandos. `--top` é exclusivo de `conditions`. O comando legado `npm start` continua executando esse mesmo fluxo detalhado.

### Comandos e catálogo

| Comando                             | Conteúdo                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm start` ou `npm run conditions` | Ranking de arquivos por `new_uncovered_conditions` e detalhes das linhas novas não cobertas                                                                                                                                                                                                                                          |
| `npm run coverage`                  | `new_coverage`, `new_lines_to_cover`, `new_uncovered_lines`, `new_line_coverage`, `new_conditions_to_cover`, `new_uncovered_conditions`, `new_branch_coverage`; e as métricas equivalentes gerais `coverage`, `lines_to_cover`, `uncovered_lines`, `line_coverage`, `conditions_to_cover`, `uncovered_conditions`, `branch_coverage` |
| `npm run tests`                     | `tests`, `test_errors`, `test_failures`, `skipped_tests`, `test_execution_time`                                                                                                                                                                                                                                                      |
| `npm run issues`                    | Issues não resolvidos de todos os tipos; code smells não resolvidos em código novo; bugs não resolvidos; vulnerabilidades não resolvidas                                                                                                                                                                                             |
| `npm run full-scan`                 | Executa Conditions, Coverage, Tests e Issues em sequência, continua após falhas e retorna código de saída diferente de zero se qualquer consulta falhar                                                                                                                                                                              |
| `npm test`                          | Suíte automatizada usando `node:test`                                                                                                                                                                                                                                                                                                |

Cada métrica de Coverage e Tests é consultada em uma requisição própria. `branch_coverage` aparece somente no grupo Geral; `new_branch_coverage` é a métrica do código novo. Issues são paginados até o total informado pela API; as quatro seções preservam sobreposições. O filtro do catálogo de code smells é exatamente `resolved=false`, `types=CODE_SMELL` e `inNewCodePeriod=true`; se a versão do servidor não aceitar esse filtro, a consulta será reportada como erro, sem remover filtros nem ampliar silenciosamente o resultado.

Conditions percorre todas as páginas da árvore de componentes, usa a medida de código novo, seleciona até 30 arquivos por padrão e consulta as linhas de cada arquivo selecionado. O padrão 30 corrige a divergência entre o antigo contrato documentado (30) e o fallback implementado anteriormente (10). `--top` e `SONAR_TOP_N` aceitam somente inteiros positivos. A extração de membro é heurística e identifica métodos e propriedades quando detectáveis, sem analisar integralmente a linguagem.

### Relatórios e estados

Os relatórios são gerados em português e sobrescritos a cada execução:

- `reports/conditions/report.md`
- `reports/coverage/report.md`
- `reports/tests/report.md`
- `reports/issues/report.md`
- `reports/full/report.md`

Cada domínio informa timestamp UTC, projeto, escopo e status **Completo** ou **Incompleto**. Cada métrica/consulta informa **Retornado**, **Sem medida** ou **Erro**. Ausência de medida em resposta bem-sucedida não torna o domínio incompleto; falhas reais tornam o relatório incompleto e não escondem os resultados de consultas irmãs bem-sucedidas. Uma consulta paginada com falha não publica linhas parciais. Mensagens de issues permanecem no idioma original fornecido pelo SonarQube.

O scanner usa as APIs REST `/api/measures/component`, `/api/measures/component_tree`, `/api/sources/lines` e `/api/issues/search`. A compatibilidade de filtros e métricas depende da versão/configuração do SonarQube de destino; erros de endpoint ou filtros são preservados no relatório, não tratados como ausência de medida.

### Segurança

Somente requisições `GET` são enviadas. O token opcional usa Basic auth do SonarQube e não é impresso. `.env`, logs, `node_modules` e o conteúdo de `reports/` são ignorados pelo Git; relatórios podem conter dados internos e mensagens de issues e não devem ser versionados. Não há publicação no npm.

## 🇬🇧

Standalone utilities for **read-only** extraction of SonarQube metrics, issues, and uncovered conditions. Every SonarQube request uses HTTP `GET`; no SonarQube record is created or changed.

Inspired by [`mkazimoto/ExtrairCondicoesNaoCobertasSonar`](https://github.com/mkazimoto/ExtrairCondicoesNaoCobertasSonar). This is an independent reimplementation based on documented behavior and contains no copied source code.

### Requirements and configuration

- Node.js 18 or newer; there are no external runtime or test dependencies.
- Set the variables below in the process environment or in the root `.env` file. Copy `.env.example` and fill the required values with details from your own instance:

| Variable        | Value to configure                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------- |
| `SONAR_URL`     | Reachable base URL of your SonarQube instance (`http://` or `https://`); required, with no default. |
| `SONAR_PROJECT` | Exact project key in SonarQube; required, with no default.                                          |
| `SONAR_TOKEN`   | SonarQube token if needed; optional. Leave blank for anonymous access.                              |
| `SONAR_TOP_N`   | Number of files in the Conditions ranking; positive integer. Default: `30`.                         |

```env
SONAR_URL=
SONAR_PROJECT=
SONAR_TOKEN=
SONAR_TOP_N=30
```

Fill in the blank `SONAR_URL` and `SONAR_PROJECT` values before running; no example server URL or project is embedded. Precedence is `--url`/`--project` (and `--top` for Conditions), process environment, then `.env`.

```sh
npm start
npm run conditions -- --top 15
npm run coverage -- --url https://sonar.example --project project-key
```

There are no dependencies to install. `--url` and `--project` are available on every command. `--top` is exclusive to `conditions`. The legacy `npm start` command still runs the same detailed workflow.

### Commands and catalog

| Command                             | Contents                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm start` or `npm run conditions` | File ranking by `new_uncovered_conditions` and details for uncovered new-code lines                                                                                                                                                                                                                            |
| `npm run coverage`                  | `new_coverage`, `new_lines_to_cover`, `new_uncovered_lines`, `new_line_coverage`, `new_conditions_to_cover`, `new_uncovered_conditions`, `new_branch_coverage`; and overall `coverage`, `lines_to_cover`, `uncovered_lines`, `line_coverage`, `conditions_to_cover`, `uncovered_conditions`, `branch_coverage` |
| `npm run tests`                     | `tests`, `test_errors`, `test_failures`, `skipped_tests`, `test_execution_time`                                                                                                                                                                                                                                |
| `npm run issues`                    | All unresolved issue types; unresolved new-code code smells; unresolved bugs; unresolved vulnerabilities                                                                                                                                                                                                       |
| `npm run full-scan`                 | Runs Conditions, Coverage, Tests, and Issues sequentially, continues after failures, and exits nonzero if any query fails                                                                                                                                                                                      |
| `npm test`                          | Automated suite using `node:test`                                                                                                                                                                                                                                                                              |

Every Coverage and Tests metric is queried independently. `branch_coverage` appears only under Overall; `new_branch_coverage` is the new-code metric. Issues are paginated through the API-reported total, and the four sections preserve overlapping results. The code-smell catalog filter is exactly `resolved=false`, `types=CODE_SMELL`, and `inNewCodePeriod=true`; if the server version rejects it, the query is reported as an error rather than weakening the filter or silently broadening its results.

Conditions follows every component-tree page, uses the new-code measure, selects up to 30 files by default, and fetches source lines for each selected file. The default of 30 corrects the mismatch between the old documented contract (30) and its previously implemented fallback (10). `--top` and `SONAR_TOP_N` accept positive integers only. Member detection is heuristic and identifies methods and properties where detectable; it is not a full language parser.

### Reports and statuses

Reports are generated in Portuguese and overwritten on each run:

- `reports/conditions/report.md`
- `reports/coverage/report.md`
- `reports/tests/report.md`
- `reports/issues/report.md`
- `reports/full/report.md`

Each domain reports a UTC timestamp, project, scope, and **Completo** or **Incompleto** status. Each metric/query reports **Retornado**, **Sem medida**, or **Erro**. A missing measure in a successful response does not make a domain incomplete; actual failures do, without discarding successful sibling queries. A failed paginated query publishes no partial rows. Issue messages remain in the language returned by SonarQube.

The extractors use REST APIs `/api/measures/component`, `/api/measures/component_tree`, `/api/sources/lines`, and `/api/issues/search`. Filter and metric compatibility depends on the target SonarQube version and configuration; endpoint/filter failures are reported, not treated as missing measures.

### Security

Only `GET` requests are sent. The optional token uses SonarQube Basic authentication and is never printed. `.env`, logs, `node_modules`, and `reports/` contents are Git-ignored; reports may contain internal data and issue messages and must not be committed. This project is not published to npm.
