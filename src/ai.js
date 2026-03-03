const Anthropic = require('@anthropic-ai/sdk');
const { getRules } = require('./rules');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Cache percakapan per user (simpan 10 pesan terakhir per user)
const conversationHistory = new Map();
const MAX_HISTORY = 10;

async function askClaude(userMessage, extraContext = '', userId = null) {
  const config = getRules();
  const basePrompt = config.system_prompt
    || 'Kamu adalah asisten WhatsApp yang membantu dan ramah. Jawab dengan singkat dan jelas dalam Bahasa Indonesia.';

  const systemPrompt = extraContext
    ? basePrompt + '\n\nKonteks: ' + extraContext
    : basePrompt;

  // Ambil atau buat history percakapan
  let history = [];
  if (userId && config.enable_conversation_history) {
    history = conversationHistory.get(userId) || [];
  }

  const messages = [
    ...history,
    { role: 'user', content: userMessage }
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: parseInt(process.env.MAX_TOKENS || '1024'),
    system: systemPrompt,
    messages,
  });

  const reply = response.content[0].text;

  // Simpan history jika diaktifkan
  if (userId && config.enable_conversation_history) {
    history.push({ role: 'user', content: userMessage });
    history.push({ role: 'assistant', content: reply });
    // Batasi history
    if (history.length > MAX_HISTORY * 2) {
      history = history.slice(-MAX_HISTORY * 2);
    }
    conversationHistory.set(userId, history);
  }

  return reply;
}

module.exports = { askClaude };
