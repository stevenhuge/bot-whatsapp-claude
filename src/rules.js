const fs = require('fs');
const path = require('path');

const RULES_PATH = path.join(__dirname, '../config/rules.json');

function getRules() {
  try {
    const data = fs.readFileSync(RULES_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error membaca rules.json:', err.message);
    return { system_prompt: '', rules: [] };
  }
}

function findMatchingRule(text) {
  const config = getRules();
  const rules = config.rules || [];
  const normalizedText = text.toLowerCase().trim();

  for (const rule of rules) {
    if (!rule.active && rule.active === false) continue;
    if (!rule.keywords || !rule.keywords.length) continue;

    for (const keyword of rule.keywords) {
      const normalizedKeyword = keyword.toLowerCase().trim();
      if (normalizedText.includes(normalizedKeyword)) {
        return rule;
      }
    }
  }
  return null;
}

module.exports = { getRules, findMatchingRule };
