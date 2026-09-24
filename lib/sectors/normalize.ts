import 'server-only';
import { createHash } from 'node:crypto';
import { filingSchema, type Filing } from './schemas.ts';

export function normalizeHolder(name: string | null | undefined): string | null {
  // ponytail: conservative name matching; legal aliases need a reviewed mapping later.
  return name?.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase() || null;
}

export function normalizeSymbol(symbol: string): string {
  return `${symbol.toUpperCase().replace(/\.JK$/, '')}.JK`;
}

export function filingFingerprint(filing: Filing): string {
  const holder = normalizeHolder(filing.holder_name);
  if (!holder || !filing.transaction_type ||
      (filing.amount_transaction == null && filing.holding_after == null)) {
    throw new Error('INSUFFICIENT_FILING_IDENTITY');
  }
  // Source URLs can describe multiple events (see supplied KETR/ARCI examples).
  // Use the packet's fallback tuple; JSON encoding prevents delimiter collisions.
  const identity = [normalizeSymbol(filing.symbol), filing.timestamp, holder,
    filing.transaction_type, filing.amount_transaction ?? null, filing.holding_after ?? null];
  return `v1:${createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`;
}

export function normalizeFiling(input: unknown) {
  const filing = filingSchema.parse(input);
  const before = filing.share_percentage_before ?? null;
  const after = filing.share_percentage_after ?? null;
  // Preserve the reported change separately; only before/after proves a signed delta.
  return {
    fingerprint: filingFingerprint(filing),
    symbol: normalizeSymbol(filing.symbol),
    source_url: filing.source ?? null,
    source_timestamp: filing.timestamp,
    source_date: filing.timestamp.slice(0, 10),
    holder_name: filing.holder_name ?? null,
    normalized_holder_name: normalizeHolder(filing.holder_name),
    holder_type: filing.holder_type ?? null,
    transaction_type: filing.transaction_type ?? null,
    holding_before: filing.holding_before ?? null,
    holding_after: filing.holding_after ?? null,
    shares_transacted: filing.amount_transaction ?? null,
    ownership_before_pct: before,
    ownership_after_pct: after,
    ownership_delta_pp: before !== null && after !== null ? after - before : null,
    reported_ownership_change_pp: filing.share_percentage_transaction ?? null,
    transaction_value_idr: filing.transaction_value ?? null,
    raw_payload_json: filing,
  };
}

export type OwnershipEvent = ReturnType<typeof normalizeFiling>;
