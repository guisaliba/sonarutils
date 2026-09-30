'use strict';

const fs = require('node:fs');
const path = require('node:path');

class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function parseEnvFile(contents) {
  const values = {};

  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      throw new ConfigurationError(`Invalid .env entry on line ${index + 1}.`);
    }

    const [, key] = match;
    let value = match[2].trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      let end = -1;
      for (let cursor = 1; cursor < value.length; cursor += 1) {
        let precedingSlashes = 0;
        for (let previous = cursor - 1; previous >= 0 && value[previous] === '\\'; previous -= 1) {
          precedingSlashes += 1;
        }
        if (value[cursor] === quote && (quote === "'" || precedingSlashes % 2 === 0)) {
          end = cursor;
          break;
        }
      }
      if (end < 0 || !/^(?:\s*#.*)?$/.test(value.slice(end + 1))) {
        throw new ConfigurationError(`Invalid quoted .env value on line ${index + 1}.`);
      }
      value = value.slice(1, end);
      if (quote === '"') {
        value = value.replace(/\\(["\\nrt])/g, (_, escaped) => {
          const replacements = { '"': '"', '\\': '\\', n: '\n', r: '\r', t: '\t' };
          return replacements[escaped];
        });
      }
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    values[key] = value;
  }

  return values;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return parseEnvFile(fs.readFileSync(filePath, 'utf8'));
}

function parseCliOptions(args, command) {
  const allowed = new Set(['--url', '--project']);
  if (command === 'conditions') {
    allowed.add('--top');
  }

  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const equalsIndex = argument.indexOf('=');
    const name = equalsIndex < 0 ? argument : argument.slice(0, equalsIndex);
    if (!allowed.has(name)) {
      throw new ConfigurationError(`Unknown option for ${command}: ${name}`);
    }
    if (Object.prototype.hasOwnProperty.call(options, name)) {
      throw new ConfigurationError(`Option ${name} may only be specified once.`);
    }

    let value;
    if (equalsIndex >= 0) {
      value = argument.slice(equalsIndex + 1);
    } else {
      index += 1;
      value = args[index];
    }
    if (value === undefined || value.startsWith('--')) {
      throw new ConfigurationError(`Option ${name} requires a value.`);
    }
    options[name] = value;
  }
  return options;
}

function chooseValue(cliOptions, environment, dotEnv, cliName, envName) {
  if (Object.prototype.hasOwnProperty.call(cliOptions, cliName)) {
    return cliOptions[cliName];
  }
  if (Object.prototype.hasOwnProperty.call(environment, envName)) {
    return environment[envName];
  }
  return dotEnv[envName];
}

function normalizeBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ConfigurationError('SONAR_URL is required. Set it in .env or the process environment, or pass --url.');
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new ConfigurationError('SONAR_URL must be a valid absolute HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ConfigurationError('SONAR_URL must use HTTP(S) and must not contain credentials, a query, or a fragment.');
  }
  return parsed.href.replace(/\/+$/, '');
}

function resolveConfig({
  command,
  args = [],
  env = process.env,
  envFile = path.resolve(__dirname, '..', '.env')
}) {
  const cliOptions = parseCliOptions(args, command);
  const dotEnv = readEnvFile(envFile);
  const url = normalizeBaseUrl(chooseValue(cliOptions, env, dotEnv, '--url', 'SONAR_URL'));
  const rawProject = chooseValue(cliOptions, env, dotEnv, '--project', 'SONAR_PROJECT');
  if (typeof rawProject !== 'string' || !rawProject.trim()) {
    throw new ConfigurationError('SONAR_PROJECT is required. Set it in .env or the process environment, or pass --project.');
  }

  const tokenValue = Object.prototype.hasOwnProperty.call(env, 'SONAR_TOKEN')
    ? env.SONAR_TOKEN
    : dotEnv.SONAR_TOKEN;
  const config = {
    url,
    project: rawProject.trim(),
    token: typeof tokenValue === 'string' && tokenValue.length > 0 ? tokenValue : undefined
  };

  if (command === 'conditions' || command === 'full-scan') {
    const topValue = chooseValue(cliOptions, env, dotEnv, '--top', 'SONAR_TOP_N');
    const topText = topValue === undefined ? '30' : String(topValue).trim();
    config.top = Number(topText);
    if (!/^\d+$/.test(topText) || !Number.isSafeInteger(config.top) || config.top <= 0) {
      throw new ConfigurationError('Top N must be a positive integer (--top or SONAR_TOP_N).');
    }
  }
  return config;
}

module.exports = {
  ConfigurationError,
  normalizeBaseUrl,
  parseCliOptions,
  parseEnvFile,
  resolveConfig
};
