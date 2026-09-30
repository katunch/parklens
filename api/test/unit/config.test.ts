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

  it('reads TRUST_PROXY_HOPS (default 1)', () => {
    expect(loadConfig({}).trustProxyHops).toBe(1);
    expect(loadConfig({ TRUST_PROXY_HOPS: '2' }).trustProxyHops).toBe(2);
    expect(loadConfig({ TRUST_PROXY_HOPS: '0' }).trustProxyHops).toBe(0);
  });

  it.each(['-1', '11', '1.5', 'nginx'])('rejects TRUST_PROXY_HOPS=%j', (v) => {
    expect(() => loadConfig({ TRUST_PROXY_HOPS: v })).toThrow(/TRUST_PROXY_HOPS/);
  });
});
