import { Fragment, type ReactNode } from 'react';
import type { TFunction } from 'i18next';

/**
 * Translate with React nodes as interpolation values (e.g. a PlateChip inside a sentence)
 * without concatenating translated fragments: placeholders keep the translator's word order.
 */
export function tNode(t: TFunction, key: string, nodes: Record<string, ReactNode>, values: Record<string, unknown> = {}): ReactNode {
  const markers: Record<string, string> = {};
  const names = Object.keys(nodes);
  names.forEach((name, i) => {
    markers[name] = `\u0000${i}\u0000`;
  });
  const text = t(key, { ...values, ...markers }) as string;
  const parts = text.split(/\u0000(\d+)\u0000/);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const name = names[Number(part)];
      return <Fragment key={i}>{name !== undefined ? nodes[name] : null}</Fragment>;
    }
    return part ? <Fragment key={i}>{part}</Fragment> : null;
  });
}
