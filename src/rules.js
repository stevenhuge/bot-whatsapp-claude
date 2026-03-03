import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_PATH = path.join(__dirname, '../config/rules.json');

export function getRules() {
  try {
    return JSON.parse(fs.readFileSync(RULES_PATH, 'utf-8'));
  } catch (err) {
    console.error('Error membaca rules.json:', err.message);
    return { system_prompt: '', rules: [] };
  }
}

export function findMatchingRule(text) {
  const { rules = [] } = getRules();
  const normalized = text.toLowerCase().trim();
  for (const rule of rules) {
    if (rule.active === false) continue;
    for (const keyword of (rule.keywords || [])) {
      if (normalized.includes(keyword.toLowerCase().trim())) return rule;
    }
  }
  return null;
}