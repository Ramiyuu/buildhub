const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("@electric-sql/pglite");
const config = {
  isProd: false, trustProxy: 0, trustRailway: false, trustCloudflare: false,
  sessionSecret: "integration-test-secret",
  openai: { key: "fake-test-key", model: "gpt-6-luna", effort: "none", mock: false, baseUrl: "https://api.openai.com/v1" },
  chat: { cookieName: "test_chat", maxMessageLength: 1000, maxAiRepliesPerConversation: 40, historyForAi: 80 }
};
require.cache[require.resolve("../server/config")] = { exports: config };
let db;
async function query(sql, values) {
  const result = await db.query(sql, values);
  return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
}
require.cache[require.resolve("../server/db")] = { exports: { query } };
const { generateReply } = require("../server/lib/ai");
const { redactSecrets, handoffIntent } = require("../server/lib/chat-safety");
const chat = require("../server/lib/chat");
const realFetch = global.fetch;
const fakeSecret = "sk-proj-" + "X".repeat(32);
function apiResult(reply, reason = "none", summary = "") {
  return { ok: true, json: async () => ({
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ reply, handoff_reason: reason, summary }) }] }]
  }) };
}
async function newConversation(body) {
  const result = await query("INSERT INTO chat_conversations (token_hash) VALUES ('test') RETURNING id");
  const id = result.rows[0].id;
  await chat.addMessage(id, "visitor", body, { unread: true });
  return id;
}

before(async () => {
  db = new PGlite();
  await db.exec(fs.readFileSync(path.join(__dirname, "../server/migrations/001_init.sql"), "utf8"));
});
after(async () => { global.fetch = realFetch; await db.close(); });

test("quote and human requests bypass the model even when no API key exists", async () => {
  const previous = config.openai.key;
  config.openai.key = "";
  global.fetch = () => { throw Error("API should not be called"); };
  try {
    for (const [text, reason] of [
      ["Quanto custa uma loja virtual?", "quote"], ["Quero um orçamento", "quote"],
      ["Gostaria de falar com um administrador", "human"], ["Preciso de reembolso", "support"]
    ]) {
      const reply = await generateReply([{ sender: "visitor", body: text }]);
      assert.equal(reply.handoff, true);
      assert.equal(reply.reason, reason);
    }
    assert.equal(handoffIntent("Como funciona o processo?"), "none");
    assert.equal(handoffIntent("Quanto tempo leva o processo?"), "none");
  } finally { config.openai.key = previous; }
});

test("structured API request uses the company prompt and redacts secrets before sending and returning", async () => {
  let payload;
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    payload = JSON.parse(options.body);
    return apiResult("Nao compartilhe " + fakeSecret);
  };
  const result = await generateReply([{ sender: "visitor", body: "Minha ideia. " + fakeSecret }], { extraPrompt: "Priorize sites institucionais." });
  assert.equal(payload.text.format.type, "json_schema");
  assert.equal(payload.text.format.strict, true);
  assert.equal(payload.store, false);
  assert.ok(payload.instructions.includes("buildhub2426@gmail.com"));
  assert.ok(payload.instructions.includes("conceitos fictícios"));
  assert.ok(!JSON.stringify(payload).includes(fakeSecret));
  assert.ok(!result.text.includes(fakeSecret));
  assert.equal(result.handoff, false);
  assert.ok(!redactSecrets("senha=segredo123").includes("segredo123"));
});

test("malformed, refused and incomplete model results are rejected instead of shown to visitors", async () => {
  const history = [{ sender: "visitor", body: "Quero criar um site." }];
  for (const data of [
    { status: "incomplete", output_text: "{}" },
    { status: "completed", output_text: "not json" },
    { status: "completed", output_text: JSON.stringify({ reply: "oi", handoff_reason: "delete_users", summary: "" }) },
    { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }
  ]) {
    global.fetch = async () => ({ ok: true, json: async () => data });
    await assert.rejects(generateReply(history), /OPENAI_/);
  }
});

test("API error diagnostic contains status and code without provider messages or keys", async () => {
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { code: "invalid_api_key", message: fakeSecret } }) });
  await assert.rejects(generateReply([{ sender: "visitor", body: "Como funciona o processo?" }]), error => {
    assert.equal(error.message, "OPENAI_HTTP_401:invalid_api_key");
    assert.ok(!error.message.includes(fakeSecret));
    return true;
  });
});

test("quote persists a notification and pauses AI; repeated handoffs do not duplicate it", async () => {
  global.fetch = () => { throw Error("Quote must bypass API"); };
  const id = await newConversation("Quero orçamento para um site de padaria com cardapio.");
  await chat.respondWithAi(id);
  let conversation = await chat.getSummary(id);
  assert.equal(conversation.mode, "human");
  assert.equal(conversation.handoff_requested, true);
  const notifications = await query("SELECT * FROM notifications WHERE data->>'conversationId' = $1", [id]);
  assert.equal(notifications.rows.length, 1);
  assert.equal(notifications.rows[0].data.reason, "quote");
  assert.match(notifications.rows[0].data.summary, /padaria/);
  await chat.requestHandoff(id, "quote");
  await chat.respondWithAi(id);
  const count = await query("SELECT count(*)::int AS n FROM notifications WHERE data->>'conversationId' = $1", [id]);
  assert.equal(count.rows[0].n, 1);
  const messages = await query("SELECT sender FROM chat_messages WHERE conversation_id = $1", [id]);
  assert.deepEqual(messages.rows.map(m => m.sender), ["visitor", "system"]);
});

test("a model-confirmed briefing transfers with an internal summary, without leaking the summary to the visitor", async () => {
  global.fetch = async () => apiResult("Vou solicitar avaliacao.", "quote", "Projeto: site institucional, cinco paginas. Pendencia: prazo.");
  const id = await newConversation("Isso, esse resumo esta correto, pode seguir.");
  await chat.respondWithAi(id);
  const conv = await chat.getSummary(id);
  assert.equal(conv.mode, "human");
  const notification = await query("SELECT data FROM notifications WHERE data->>'conversationId' = $1", [id]);
  assert.match(notification.rows[0].data.summary, /cinco paginas/);
  const messages = await query("SELECT body FROM chat_messages WHERE conversation_id = $1 AND sender = 'system'", [id]);
  assert.equal(messages.rows.length, 1);
  assert.ok(!messages.rows[0].body.includes("cinco paginas"));
});

test("an administrator taking over during generation prevents a late AI answer", async () => {
  const id = await newConversation("Quero melhorar o site da minha empresa.");
  global.fetch = async () => {
    await query("UPDATE chat_conversations SET mode = 'human' WHERE id = $1", [id]);
    return apiResult("Qual e o publico?");
  };
  await chat.respondWithAi(id);
  const messages = await query("SELECT sender FROM chat_messages WHERE conversation_id = $1", [id]);
  assert.deepEqual(messages.rows.map(m => m.sender), ["visitor"]);
});

test("public message endpoint stores redacted credentials and routes quotes without calling the API", async () => {
  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.cookies = {}; req.clientIp = "127.0.0.1"; req.geo = null; next(); });
  app.use("/api", require("../server/routes/public"));
  const server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  global.fetch = () => { throw Error("Quote must bypass API"); };
  try {
    const response = await realFetch("http://127.0.0.1:" + server.address().port + "/api/chat/message", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Preciso de orcamento. " + fakeSecret })
    });
    assert.equal(response.status, 201);
    const data = await response.json();
    assert.ok(!JSON.stringify(data).includes(fakeSecret));
    let conv;
    for (let n = 0; n < 100; n++) {
      conv = await chat.getSummary(data.conversationId);
      if (conv.mode === "human") break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(conv.mode, "human");
    const messages = await query("SELECT body FROM chat_messages WHERE conversation_id = $1", [data.conversationId]);
    assert.ok(!JSON.stringify(messages.rows).includes(fakeSecret));
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("model-invented currency amounts are replaced by a commercial handoff", async () => {
  global.fetch = async () => apiResult("Fazemos por R$ 999,00.", "none");
  const reply = await generateReply([{ sender: "visitor", body: "Preciso de um site para padaria." }]);
  assert.equal(reply.reason, "quote");
  assert.equal(reply.handoff, true);
  assert.ok(!reply.text.includes("999"));
  assert.ok(!reply.summary.includes("999"));
});
test("a normal discovery answer is stored without pausing the AI", async () => {
  const id = await newConversation("Como funciona o processo?");
  global.fetch = async () => apiResult("Levantamento, planejamento, desenvolvimento, testes e entrega. Qual projeto quer criar?");
  await chat.respondWithAi(id);
  const conv = await chat.getSummary(id);
  assert.equal(conv.mode, "ai");
  assert.equal(conv.ai_replies, 1);
  const messages = await query("SELECT sender FROM chat_messages WHERE conversation_id=$1 ORDER BY id", [id]);
  assert.deepEqual(messages.rows.map(m=>m.sender), ["visitor","ai"]);
});
test("API failure creates a single visitor handoff message and pauses AI", async () => {
  const id = await newConversation("Quero conhecer os servicos.");
  global.fetch = async () => ({ok:false,status:401,json:async()=>({error:{code:"invalid_api_key",message:fakeSecret}})});
  const previousError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.join(" "));
  try { await chat.respondWithAi(id); } finally { console.error=previousError; }
  assert.ok(!logs.join("").includes(fakeSecret));
  assert.equal((await chat.getSummary(id)).mode,"human");
  const messages = await query("SELECT sender,body FROM chat_messages WHERE conversation_id=$1 ORDER BY id",[id]);
  assert.deepEqual(messages.rows.map(m=>m.sender),["visitor","system"]);
  assert.ok(!JSON.stringify(messages.rows).includes("invalid_api_key"));
  const notifications = await query("SELECT * FROM notifications WHERE link=$1",["#/chat/"+id]);
  assert.equal(notifications.rows.filter(n=>n.type==="handoff").length,1);
  assert.equal(notifications.rows.filter(n=>n.type==="ai_error").length,1);
  assert.ok(!JSON.stringify(notifications.rows).includes(fakeSecret));
});
