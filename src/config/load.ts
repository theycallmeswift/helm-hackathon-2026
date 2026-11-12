/**
 * Runtime configuration read from environment variables. Loading never needs
 * a secret, so commands that work without one still run; code that needs a
 * secret asks for it with a helper that names the variable to set.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import type { RepoName } from '../pr/types.ts';

/** The OpenRouter model used when `HELM_TRIAGE_MODEL` is unset. */
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5.5';

/** The diff token budget used when `HELM_TRIAGE_DIFF_TOKEN_BUDGET` is unset. */
export const DEFAULT_DIFF_TOKEN_BUDGET = 24_000;

/** The repository used when `GITHUB_REPOSITORY` is unset. */
export const DEFAULT_REPO: RepoName = 'helm/helm';

/** The GitHub REST API used when `HELM_TRIAGE_GITHUB_API_URL` is unset. */
export const DEFAULT_GITHUB_API_URL = 'https://api.github.com';

/** The OpenRouter API used when `HELM_TRIAGE_OPENROUTER_URL` is unset. */
export const DEFAULT_OPENROUTER_URL = 'https://openrouter.ai/api/v1';

/** Settings for one run of the tool. */
export interface Config {
  /** From `GITHUB_TOKEN`; read it with `requireGithubToken`. */
  githubToken?: string;
  /** From `OPENROUTER_API_KEY`; without it the AI flags are skipped. */
  openRouterApiKey?: string;
  /** OpenRouter model id, from `HELM_TRIAGE_MODEL`. */
  model: string;
  /** Where AI results are cached, from `HELM_TRIAGE_CACHE_DIR`, else `$XDG_CACHE_HOME/helm-triage`, else `~/.cache/helm-triage`. */
  cacheDir: string;
  /** Most diff tokens sent to the model, from `HELM_TRIAGE_DIFF_TOKEN_BUDGET`. */
  diffTokenBudget: number;
  /** Repository used when a command gets no `--repo`, from `GITHUB_REPOSITORY`. */
  defaultRepo: RepoName;
  /** GitHub REST API base URL with no trailing slash, from `HELM_TRIAGE_GITHUB_API_URL`. */
  githubApiUrl: string;
  /** OpenRouter API base URL with no trailing slash, from `HELM_TRIAGE_OPENROUTER_URL`. */
  openRouterUrl: string;
}

/** The environment variables a configuration is read from. */
export type Environment = Readonly<Record<string, string | undefined>>;

/** A configuration value is malformed. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** A secret the current command needs is not set. */
export class MissingSecretError extends Error {
  override name = 'MissingSecretError';
}

/**
 * Reads the configuration from `env`. Empty values count as unset, because
 * CI passes unset secrets as empty strings.
 *
 * @throws {ConfigError} when a value is malformed, naming the variable.
 */
export function loadConfig(env: Environment): Config {
  const githubToken = readVariable(env, 'GITHUB_TOKEN');
  const openRouterApiKey = readVariable(env, 'OPENROUTER_API_KEY');
  const repo = readVariable(env, 'GITHUB_REPOSITORY');

  return {
    ...(githubToken === undefined ? {} : { githubToken }),
    ...(openRouterApiKey === undefined ? {} : { openRouterApiKey }),
    model: readVariable(env, 'HELM_TRIAGE_MODEL') ?? DEFAULT_MODEL,
    cacheDir: readVariable(env, 'HELM_TRIAGE_CACHE_DIR') ?? defaultCacheDir(env),
    diffTokenBudget: readTokenBudget(env),
    defaultRepo: repo === undefined ? DEFAULT_REPO : parseRepoName(repo, 'GITHUB_REPOSITORY'),
    githubApiUrl: readBaseUrl(env, 'HELM_TRIAGE_GITHUB_API_URL', DEFAULT_GITHUB_API_URL),
    openRouterUrl: readBaseUrl(env, 'HELM_TRIAGE_OPENROUTER_URL', DEFAULT_OPENROUTER_URL),
  };
}

/**
 * Returns the GitHub token for code that calls the GitHub API.
 *
 * @throws {MissingSecretError} when `GITHUB_TOKEN` is unset, suggesting `gh auth token`.
 */
export function requireGithubToken(config: Config): string {
  if (config.githubToken === undefined) {
    throw new MissingSecretError(
      'GITHUB_TOKEN is not set; set it to a GitHub token, for example GITHUB_TOKEN=$(gh auth token)',
    );
  }

  return config.githubToken;
}

/**
 * Checks that `value` looks like `owner/name`.
 *
 * @param source - What the value came from, such as a variable or flag name, for the error.
 * @throws {ConfigError} when it does not.
 */
export function parseRepoName(value: string, source: string): RepoName {
  const [owner, name, ...rest] = value.split('/');
  if (!owner || !name || rest.length > 0) {
    throw new ConfigError(`${source} must look like owner/name, got "${value}"`);
  }

  return `${owner}/${name}`;
}

/** Returns the variable's value, or undefined when it is unset or empty. */
function readVariable(env: Environment, variable: string): string | undefined {
  const value = env[variable];

  return value === '' ? undefined : value;
}

/** The cache directory under `XDG_CACHE_HOME`, else under the home directory. */
function defaultCacheDir(env: Environment): string {
  const cacheHome =
    readVariable(env, 'XDG_CACHE_HOME') ?? join(readVariable(env, 'HOME') ?? homedir(), '.cache');

  return join(cacheHome, 'helm-triage');
}

/**
 * Reads `HELM_TRIAGE_DIFF_TOKEN_BUDGET` as a positive whole number.
 *
 * @throws {ConfigError} when it is anything else.
 */
function readTokenBudget(env: Environment): number {
  const variable = 'HELM_TRIAGE_DIFF_TOKEN_BUDGET';
  const value = readVariable(env, variable);
  if (value === undefined) {
    return DEFAULT_DIFF_TOKEN_BUDGET;
  }

  const budget = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(budget) || budget === 0) {
    throw new ConfigError(`${variable} must be a positive whole number of tokens, got "${value}"`);
  }

  return budget;
}

/**
 * Reads an http or https base URL, dropping any trailing slash.
 *
 * @throws {ConfigError} when the value is not one.
 */
function readBaseUrl(env: Environment, variable: string, fallback: string): string {
  const value = readVariable(env, variable);
  if (value === undefined) {
    return fallback;
  }

  if (!URL.canParse(value) || !/^https?:$/.test(new URL(value).protocol)) {
    throw new ConfigError(`${variable} must be an http or https URL, got "${value}"`);
  }

  return value.replace(/\/+$/, '');
}
