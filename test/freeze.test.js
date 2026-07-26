// test/freeze.test.js
import { describe, it, expect } from 'vitest';
import { freezeWindow } from '../src/main.js';

describe('freezeWindow', () => {
  it('brackets the trigger with pre/post roll', () => {
    expect(freezeWindow(1000, 100, 400)).toEqual([900, 1400]);
  });
});
