'use strict';

const { resolveConfig } = require('./config');
const { runConditions } = require('./extractors/conditions');
const { runCoverage } = require('./extractors/coverage');
const { runIssues } = require('./extractors/issues');
const { runTests } = require('./extractors/tests');
const { runFullScan } = require('./full-scan');
const { SonarClient } = require('./sonar-client');
const { statusLabel } = require('./reports/markdown');

const COMMANDS = Object.freeze({
  conditions: runConditions,
  coverage: runCoverage,
  tests: runTests,
  issues: runIssues
});

async function runCli(argv = process.argv.slice(2), dependencies = {}) {
  const [command, ...args] = argv;
  if (!command || (!COMMANDS[command] && command !== 'full-scan')) {
    throw new Error('Usage: node src/cli.js <conditions|coverage|tests|issues|full-scan> [--url URL] [--project KEY]');
  }

  const config = (dependencies.resolveConfig || resolveConfig)({
    command,
    args,
    env: dependencies.env,
    envFile: dependencies.envFile
  });
  const client = dependencies.createClient
    ? dependencies.createClient(config)
    : new SonarClient({
      baseUrl: config.url,
      token: config.token,
      project: config.project
    });

  if (command === 'full-scan') {
    const outcome = await (dependencies.runFullScan || runFullScan)({
      client,
      config,
      extractors: dependencies.extractors
    });
    console.log(outcome.summary);
    console.log(`Relatório completo: ${outcome.outputPath}`);
    if (outcome.status !== 'complete') {
      process.exitCode = 1;
    }
    return outcome;
  }

  const runner = dependencies.commandRunners && dependencies.commandRunners[command]
    ? dependencies.commandRunners[command]
    : COMMANDS[command];
  const outcome = await runner({ client, config });
  console.log(`${outcome.title}: ${statusLabel(outcome.status)} - ${outcome.outputPath}`);
  if (outcome.failures.length) {
    for (const failure of outcome.failures) {
      console.error(`- ${failure}`);
    }
  }
  if (outcome.status !== 'complete') {
    process.exitCode = 1;
  }
  return outcome;
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = { COMMANDS, runCli };
