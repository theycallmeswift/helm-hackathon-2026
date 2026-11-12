import { describe, expect, test } from 'vitest';

import {
  type Config,
  ConfigError,
  type Environment,
  loadConfig,
  MissingSecretError,
  requireGithubToken,
} from '../../../src/config/load.ts';

const HOME_ONLY: Environment = { HOME: '/home/ada' };

const DEFAULTS: Config = {
  model: 'anthropic/claude-sonnet-5.5',
  cacheDir: '/home/ada/.cache/helm-triage',
  diffTokenBudget: 24_000,
  defaultRepo: 'helm/helm',
  githubApiUrl: 'https://api.github.com',
  openRouterUrl: 'https://openrouter.ai/api/v1',
};

describe('loadConfig', () => {
  test.each<{ name: string; env: Environment; expected: Partial<Config> }>([
    { name: 'uses defaults when nothing is set', env: {}, expected: {} },
    {
      name: 'reads GITHUB_TOKEN',
      env: { GITHUB_TOKEN: 'ghp_x' },
      expected: { githubToken: 'ghp_x' },
    },
    {
      name: 'reads OPENROUTER_API_KEY',
      env: { OPENROUTER_API_KEY: 'sk-or-x' },
      expected: { openRouterApiKey: 'sk-or-x' },
    },
    {
      name: 'reads HELM_TRIAGE_MODEL',
      env: { HELM_TRIAGE_MODEL: 'anthropic/claude-haiku-5.5' },
      expected: { model: 'anthropic/claude-haiku-5.5' },
    },
    {
      name: 'puts the cache under XDG_CACHE_HOME',
      env: { XDG_CACHE_HOME: '/var/cache' },
      expected: { cacheDir: '/var/cache/helm-triage' },
    },
    {
      name: 'prefers HELM_TRIAGE_CACHE_DIR over XDG_CACHE_HOME',
      env: { XDG_CACHE_HOME: '/var/cache', HELM_TRIAGE_CACHE_DIR: '/tmp/triage' },
      expected: { cacheDir: '/tmp/triage' },
    },
    {
      name: 'reads HELM_TRIAGE_DIFF_TOKEN_BUDGET',
      env: { HELM_TRIAGE_DIFF_TOKEN_BUDGET: '8000' },
      expected: { diffTokenBudget: 8000 },
    },
    {
      name: 'reads GITHUB_REPOSITORY',
      env: { GITHUB_REPOSITORY: 'theycallmeswift/helm' },
      expected: { defaultRepo: 'theycallmeswift/helm' },
    },
    {
      name: 'reads HELM_TRIAGE_GITHUB_API_URL without its trailing slash',
      env: { HELM_TRIAGE_GITHUB_API_URL: 'http://127.0.0.1:4000/' },
      expected: { githubApiUrl: 'http://127.0.0.1:4000' },
    },
    {
      name: 'reads HELM_TRIAGE_OPENROUTER_URL',
      env: { HELM_TRIAGE_OPENROUTER_URL: 'http://127.0.0.1:4001/api/v1' },
      expected: { openRouterUrl: 'http://127.0.0.1:4001/api/v1' },
    },
    {
      name: 'treats empty values as unset',
      env: { OPENROUTER_API_KEY: '', HELM_TRIAGE_MODEL: '', GITHUB_REPOSITORY: '' },
      expected: {},
    },
  ])('$name', ({ env, expected }) => {
    const config = loadConfig({ ...HOME_ONLY, ...env });

    expect(config).toEqual({ ...DEFAULTS, ...expected });
  });

  test.each([
    { variable: 'HELM_TRIAGE_DIFF_TOKEN_BUDGET', value: 'lots' },
    { variable: 'HELM_TRIAGE_DIFF_TOKEN_BUDGET', value: '0' },
    { variable: 'HELM_TRIAGE_DIFF_TOKEN_BUDGET', value: '-5' },
    { variable: 'HELM_TRIAGE_DIFF_TOKEN_BUDGET', value: '1.5' },
    { variable: 'GITHUB_REPOSITORY', value: 'helm' },
    { variable: 'GITHUB_REPOSITORY', value: 'helm/helm/extra' },
    { variable: 'HELM_TRIAGE_GITHUB_API_URL', value: 'not a url' },
    { variable: 'HELM_TRIAGE_OPENROUTER_URL', value: 'ftp://example.com' },
  ])('rejects $variable="$value" with a message naming the variable', ({ variable, value }) => {
    const load = () => loadConfig({ ...HOME_ONLY, [variable]: value });

    expect(load).toThrow(ConfigError);
    expect(load).toThrow(`${variable} must`);
  });
});

describe('requireGithubToken', () => {
  test('returns the token when it is set', () => {
    const config = loadConfig({ ...HOME_ONLY, GITHUB_TOKEN: 'ghp_x' });

    expect(requireGithubToken(config)).toBe('ghp_x');
  });

  test('names GITHUB_TOKEN and suggests gh auth token when it is missing', () => {
    const config = loadConfig(HOME_ONLY);

    expect(() => requireGithubToken(config)).toThrow(MissingSecretError);
    expect(() => requireGithubToken(config)).toThrow(/GITHUB_TOKEN.*gh auth token/);
  });
});
