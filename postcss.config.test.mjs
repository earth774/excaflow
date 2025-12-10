import { describe, it, expect } from 'vitest';
import config from './postcss.config.mjs';

describe('postcss.config.mjs', () => {
  it('should export correct postcss configuration', () => {
    expect(config).toBeDefined();
    expect(config.plugins).toBeDefined();
    expect(config.plugins['@tailwindcss/postcss']).toBeDefined();
    expect(config.plugins['@tailwindcss/postcss']).toEqual({});
  });
});
