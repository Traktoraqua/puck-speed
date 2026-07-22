import { describe, it, expect } from 'vitest';
import { appName } from '../src/main.js';

describe('scaffold', () => {
  it('exposes the app name', () => {
    expect(appName()).toBe('puck-speed');
  });
});
