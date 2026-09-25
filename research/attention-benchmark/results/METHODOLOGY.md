# Attention benchmark methodology

This branch preserves the existing B1, B2, and B3 replay results. B3C (B3 Conservative Attention-State Transition) is an offline benchmark-only variant; it does not change production behavior.

## B3C rule

WATCH is machine-only memory and never interrupts. B3C interrupts only on these deterministic transitions: SILENT to MATERIAL or STRUCTURAL, WATCH to MATERIAL or STRUCTURAL, and MATERIAL to STRUCTURAL. It does not interrupt repeatedly while the state is unchanged. A regulatory 5% crossing is measured but cannot bypass the state-transition rule. Episodes reset on first observation, ambiguous same-source timestamps, a gap over 30 days, direction change or an others transaction, prior exit, or discontinuous ownership.

## Sensitivity

The existing magnitude, episode-gap, regulatory, and push-origin variants are retained. They are descriptive sensitivity checks, not threshold tuning against B1. No threshold was selected because it minimized or beat B1 interruptions.

## Human annotation

human-annotation.csv contains 117 persisted filings and only contemporaneously available filing facts. human-annotations-template.csv adds blank columns for three independent reviewers. No baseline decisions, engine states, reasons, episode identifiers, or future information are included. Labels must be entered later as 0 (no immediate interruption), 1 (review later), or 2 (immediate attention).

ingestAnnotations() validates reviewer labels; evaluateAnnotations() reports precision, class-2 recall, urgency-weighted recall, interruptions, duplicate episode alerts, and pairwise Cohen kappa. Until labels are supplied, all human-performance metrics remain unavailable.

## Weaknesses

The persisted snapshot is small and selected by availability, holder history is partial, payload revisions are unavailable, and archived daily liquidity observations are absent. Source-time replay assumes availability at source time; first-persisted replay is the stricter contemporaneous clock. There are no human labels, market outcomes, or adjudicated ground truth, so the results support comparison of decision behavior, not claims of investment significance.
