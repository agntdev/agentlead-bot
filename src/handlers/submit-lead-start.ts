import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { createLead, type Lead } from "../lead-store.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Submit request", data: "submit_lead:start", order: 10 });

type Step = "name" | "phone" | "note" | "confirm" | undefined;
type LeadFlow = { leadStep?: Step; editing?: boolean; name?: string; phone?: string; intent?: Lead["intent"]; note?: string };
type EnvCtx = Ctx & { env?: { CHAT_DO?: any } };

const composer = new Composer<Ctx>();
const flow = (ctx: Ctx): LeadFlow => ctx.session as LeadFlow;
const env = (ctx: Ctx) => (ctx as EnvCtx).env;
const back = inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]);

function reset(ctx: Ctx): LeadFlow {
  const state = flow(ctx);
  delete state.name; delete state.phone; delete state.intent; delete state.note;
  state.editing = false;
  state.leadStep = "name";
  return state;
}

async function askName(ctx: Ctx) {
  flow(ctx).leadStep = "name";
  await ctx.reply("Share your full name.", { reply_markup: { force_reply: true, input_field_placeholder: "Your name" } });
}

async function askPhone(ctx: Ctx) {
  flow(ctx).leadStep = "phone";
  await ctx.reply("Share your phone number, or type it below.", {
    reply_markup: { keyboard: [[{ text: "Share phone number", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true, input_field_placeholder: "Phone number" },
  });
}

async function askIntent(ctx: Ctx) {
  flow(ctx).leadStep = undefined;
  await ctx.reply("What can we help you with?", {
    reply_markup: inlineKeyboard([[inlineButton("Buy", "lead:intent:buy"), inlineButton("Rent", "lead:intent:rent"), inlineButton("Sell", "lead:intent:sell")]]),
  });
}

async function askNote(ctx: Ctx) {
  flow(ctx).leadStep = "note";
  await ctx.reply("Add a short note about what you need.", { reply_markup: { remove_keyboard: true, force_reply: true, input_field_placeholder: "Area, budget, timing, or details" } });
}

function summary(state: LeadFlow): string {
  return `Please review your lead:\nName: ${state.name}\nPhone: ${state.phone}\nIntent: ${state.intent}\nNote: ${state.note}`;
}

async function showSummary(ctx: Ctx) {
  flow(ctx).leadStep = "confirm";
  await ctx.reply(summary(flow(ctx)), { reply_markup: inlineKeyboard([
    [inlineButton("Confirm", "lead:confirm"), inlineButton("Edit", "lead:edit")],
    [inlineButton("Back to menu", "menu:main")],
  ]) });
}

composer.callbackQuery("submit_lead:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  reset(ctx);
  await ctx.reply("Tell us a little about your property plans.");
  await askName(ctx);
});

composer.on("message:contact", async (ctx, next) => {
  if (flow(ctx).leadStep !== "phone") return next();
  const phone = ctx.message.contact.phone_number.trim();
  if (phone.length < 5) { await ctx.reply("That phone number looks incomplete. Share it again or type it below."); return; }
  flow(ctx).phone = phone;
  if (flow(ctx).editing) { flow(ctx).editing = false; await showSummary(ctx); return; }
  await askIntent(ctx);
});

composer.on("message:text", async (ctx, next) => {
  const state = flow(ctx);
  const value = ctx.message.text.trim();
  if (!state.leadStep) return next();
  if (state.leadStep === "name") {
    if (value.length < 2) { await ctx.reply("Enter your full name so the agent knows who to contact."); return; }
    state.name = value;
    if (state.editing) { state.editing = false; await showSummary(ctx); return; }
    await askPhone(ctx); return;
  }
  if (state.leadStep === "phone") {
    if (value.length < 5) { await ctx.reply("Enter a phone number with at least five digits."); return; }
    state.phone = value;
    if (state.editing) { state.editing = false; await showSummary(ctx); return; }
    await askIntent(ctx); return;
  }
  if (state.leadStep === "note") {
    if (!value) { await ctx.reply("Add a short note so the agent can prepare."); return; }
    state.note = value.slice(0, 1000); await showSummary(ctx); return;
  }
  return next();
});

composer.callbackQuery(/^lead:intent:(buy|rent|sell)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  flow(ctx).intent = ctx.match[1] as Lead["intent"];
  if (flow(ctx).editing) { flow(ctx).editing = false; await showSummary(ctx); return; }
  await askNote(ctx);
});

composer.callbackQuery("lead:edit", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Choose what you want to change.", { reply_markup: inlineKeyboard([
    [inlineButton("Name", "lead:edit:name"), inlineButton("Phone", "lead:edit:phone")],
    [inlineButton("Intent", "lead:edit:intent"), inlineButton("Note", "lead:edit:note")],
    [inlineButton("Start over", "lead:edit:restart")],
  ]) });
});

composer.callbackQuery(/^lead:edit:(name|phone|intent|note|restart)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const field = ctx.match[1];
  if (field === "restart") { reset(ctx); await askName(ctx); return; }
  flow(ctx).editing = true;
  if (field === "name") { await askName(ctx); return; }
  if (field === "phone") { await askPhone(ctx); return; }
  if (field === "intent") { await askIntent(ctx); return; }
  await askNote(ctx);
});

composer.callbackQuery("lead:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const state = flow(ctx);
  if (!state.name || !state.phone || !state.intent || !state.note) { await ctx.reply("Your lead is incomplete. Tap Edit to finish it.", { reply_markup: back }); return; }
  const id = crypto.randomUUID();
  const createdAt = new Date(now()).toISOString();
  const lead: Lead = { id, name: state.name, phone: state.phone, intent: state.intent, note: state.note, status: "new", created_at: createdAt };
  const saved = await createLead(env(ctx), lead);
  if (!saved) { await ctx.reply("Lead submissions aren't available right now. Please try again shortly."); return; }
  state.leadStep = undefined;
  await ctx.editMessageText("Your details have been sent. The agent will be in touch.", { reply_markup: back });
  const owner = adminChatId(ctx as unknown as { env?: Record<string, unknown> });
  if (!owner) return;
  try {
    await ctx.api.sendMessage(owner, `New lead\nName: ${lead.name}\nPhone: ${lead.phone}\nIntent: ${lead.intent}\nNote: ${lead.note}\nStatus: New`, {
      reply_markup: inlineKeyboard([[inlineButton("View in bot", `lead:view:${lead.id}`), inlineButton("Mark done", `lead:done:${lead.id}`)]]),
    });
  } catch {
    // A notification failure must never discard a lead that was already saved.
  }
});

// One injectable clock seam for persisted timestamps. Tests may replace this
// function through module mocking without changing business logic.
export let now = () => Date.now();
export default composer;
