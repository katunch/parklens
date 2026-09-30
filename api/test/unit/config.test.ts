import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  it('reads LOT_CAPACITY (default 40)', () => {
    expect(loadConfig({}).lotCapacity).toBe(40);
    expect(loadConfig({ LOT_CAPACITY: '75' }).lotCapacity).toBe(75);
    expect(loadConfig({ LOT_CAPACITY: ' ' }).lotCapacity).toBe(40);
  });

  it.each(['0', '5001', '12.5', 'many'])('rejects LOT_CAPACITY=%j', (v) => {
    expect(() => loadConfig({ LOT_CAPACITY: v })).toThrow(/LOT_CAPACITY/);
  });
});
