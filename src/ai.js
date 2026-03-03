import Anthropic from '@anthropic-ai/sdk';
import { getRules } from './rules.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function askClaude(userMessage, extraContext = '') {
  const config = getRules();
  const basePrompt = config.system_prompt
    || 'Kamu adalah asisten WhatsApp yang membantu dan ramah. Jawab dengan singkat dan jelas dalam Bahasa Indonesia.';

  const systemPrompt = extraContext
    ? basePrompt + '\n\nKonteks tambahan: ' + extraContext
    : basePrompt;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: parseInt(process.env.MAX_TOKENS || '1024'),
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  return response.content[0].text;
}