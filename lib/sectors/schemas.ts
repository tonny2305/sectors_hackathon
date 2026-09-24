import { z } from 'zod';

export const symbolSchema = z.string().regex(/^[A-Za-z]{4}(?:\.[Jj][Kk])?$/);
export const dateSchema = z.iso.date();
const text = z.string().nullish();
const number = z.number().finite().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).nullish();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullish();
const percentage = z.number().min(0).max(100).nullish();
const source = z.url().refine(value => /^https?:\/\//i.test(value), 'Expected HTTP(S) source').nullish();

// Unknown fields survive parsing so upstream additions remain in the raw evidence.
export const filingSchema = z.object({
  symbol: symbolSchema,
  timestamp: z.iso.datetime({ local: true, offset: true }),
  title: text,
  body: text,
  source,
  sector: text,
  sub_sector: text,
  tags: z.array(z.string()).nullish(),
  holder_name: text,
  holder_type: text,
  transaction_type: z.enum(['buy', 'sell', 'others']).nullish(),
  holding_before: count,
  holding_after: count,
  amount_transaction: count,
  price: number,
  transaction_value: number,
  price_transaction: z.array(z.object({
    date: dateSchema,
    type: z.enum(['buy', 'sell', 'others']),
    price: number,
    amount_transacted: count,
  }).passthrough()).nullish(),
  share_percentage_before: percentage,
  share_percentage_after: percentage,
  share_percentage_transaction: z.number().min(-100).max(100).nullish(),
  idx_investor_slug: text,
  idx_conglomerates_group_slug: text,
}).passthrough();

export const filingsResponseSchema = z.object({
  results: z.array(filingSchema).max(30),
  pagination: z.object({
    has_next: z.boolean(),
    next_offset: z.number().int().nonnegative().nullable(),
    offset: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(30),
    total_count: z.number().int().nonnegative().optional(),
    showing: z.number().int().nonnegative().optional(),
    has_previous: z.boolean().optional(),
    previous_offset: z.number().int().nonnegative().nullish(),
  }).passthrough(),
}).passthrough().refine(value => !value.pagination.has_next || (
  value.results.length > 0 && value.pagination.next_offset !== null &&
  value.pagination.next_offset > value.pagination.offset
), 'Pagination cannot advance');

export const dailyResponseSchema = z.array(z.object({
  symbol: symbolSchema,
  date: dateSchema,
  close: number,
  open: number,
  high: number,
  low: number,
  volume: count,
  market_cap: number,
}).passthrough());

export const dateRangeSchema = z.object({ start: dateSchema, end: dateSchema })
  .refine(value => value.start <= value.end, 'Start must not follow end');

export type Filing = z.infer<typeof filingSchema>;
export type DailyRecord = z.infer<typeof dailyResponseSchema>[number];
