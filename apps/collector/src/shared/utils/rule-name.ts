export type RuleNameInput = {
  rule: string;
  rulePayload: string;
  chains: string[];
};

export function buildRuleName(input: RuleNameInput): string {
  const rule = input.rule.trim();
  const rulePayload = input.rulePayload.trim();
  const lastChain = input.chains[input.chains.length - 1]?.trim() || '';

  // Product contract: rule stats and the flow-graph entry column key on the
  // top-level policy group (the last chain hop). The frontend matches these
  // names against gateway rule targets (rule.proxy), so the raw rule type
  // mihomo reports in `rule` (RuleSet/IPCIDR/Match...) must not become the
  // aggregation key for multi-hop chains. Surge resolves the real rule name
  // into `rule` and mirrors it as the last hop, so this preserves Surge
  // naming as well. The matched rule detail (rule + payload) is only used
  // when the chain has no group hop (e.g. rules targeting DIRECT/REJECT).
  if (input.chains.length > 1 && lastChain) {
    return lastChain;
  }

  if (rule) {
    return rulePayload ? `${rule}(${rulePayload})` : rule;
  }

  return lastChain || 'DIRECT';
}
