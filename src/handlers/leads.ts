import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getLead, listLeads, setLeadStatus, type Lead } from "../lead-store.js";
import { inlineButton, inlineKeyboard, requireOwner } from "../toolkit/index.js";

const composer = new Composer<Ctx>();
type EnvCtx = Ctx & { env?: { CHAT_DO?: unknown } };
const env = (ctx: Ctx) => (ctx as EnvCtx).env as never;

function title(lead: Lead): string {
  return `${lead.name} · ${lead.intent} · ${lead.status === "done" ? "Done" : "New"}`;
}

function leadDetails(lead: Lead): string {
  return `Lead details\nName: ${lead.name}\nPhone: ${lead.phone}\nIntent: ${lead.intent}\nNote: ${lead.note}\nStatus: ${lead.status === "done" ? "Done" : "New"}`;
}

function leadButtons(lead: Lead) {
  const next = lead.status === "done" ? "new" : "done";
  return inlineKeyboard([
    [inlineButton("View", `lead:view:${lead.id}`), inlineButton(next === "done" ? "Mark done" : "Mark new", `lead:${next}:${lead.id}`)],
  ]);
}

async function dashboardText(ctx: Ctx, page: number): Promise<{ text: string; markup: ReturnType<typeof inlineKeyboard> } | undefined> {
  const result = await listLeads(env(ctx), page);
  if (!result) return undefined;
  if (result.total === 0) return { text: "No leads yet — new enquiries will appear here.", markup: inlineKeyboard([[inlineButton("Back to menu", "menu:main")]]) };
  const rows = result.leads.flatMap((lead) => [[inlineButton(title(lead), `lead:view:${lead.id}`)], leadButtons(lead).inline_keyboard[0]]);
  const nav = [] as ReturnType<typeof inlineButton>[];
  if (result.page > 0) nav.push(inlineButton("Prev", `leads:page:${result.page - 1}`));
  if ((result.page + 1) * 20 < result.total) nav.push(inlineButton("Next", `leads:page:${result.page + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([inlineButton("Back to menu", "menu:main")]);
  return { text: `Leads (${result.total})`, markup: inlineKeyboard(rows) };
}

export async function sendDashboard(ctx: Ctx, page = 0): Promise<void> {
  const view = await dashboardText(ctx, page);
  if (!view) { await ctx.reply("Lead records aren't available right now. Try again shortly."); return; }
  await ctx.reply(view.text, { reply_markup: view.markup });
}

async function editDashboard(ctx: Ctx, page = 0): Promise<void> {
  const view = await dashboardText(ctx, page);
  if (!view) { await ctx.reply("Lead records aren't available right now. Try again shortly."); return; }
  await ctx.editMessageText(view.text, { reply_markup: view.markup });
}

composer.command("leads", async (ctx) => {
  if (!(await requireOwner(ctx as never))) return;
  await sendDashboard(ctx);
});

composer.callbackQuery(/^leads:page:(\d+)$/, async (ctx) => {
  if (!(await requireOwner(ctx as never))) return;
  await ctx.answerCallbackQuery();
  await editDashboard(ctx, Number(ctx.match[1]));
});

composer.callbackQuery(/^lead:view:([a-f0-9-]{36})$/, async (ctx) => {
  if (!(await requireOwner(ctx as never))) return;
  await ctx.answerCallbackQuery();
  const lead = await getLead(env(ctx), ctx.match[1]);
  if (!lead) { await ctx.reply("That lead is no longer available."); return; }
  const next = lead.status === "done" ? "new" : "done";
  await ctx.editMessageText(leadDetails(lead), { reply_markup: inlineKeyboard([
    [inlineButton(next === "done" ? "Mark done" : "Mark new", `lead:${next}:${lead.id}`)],
    [inlineButton("All leads", "leads:page:0")],
  ]) });
});

composer.callbackQuery(/^lead:(done|new):([a-f0-9-]{36})$/, async (ctx) => {
  if (!(await requireOwner(ctx as never))) return;
  await ctx.answerCallbackQuery();
  const lead = await setLeadStatus(env(ctx), ctx.match[2], ctx.match[1] as Lead["status"]);
  if (!lead) { await ctx.reply("Couldn't update that lead. Try again shortly."); return; }
  const next = lead.status === "done" ? "new" : "done";
  await ctx.editMessageText(leadDetails(lead), { reply_markup: inlineKeyboard([
    [inlineButton(next === "done" ? "Mark done" : "Mark new", `lead:${next}:${lead.id}`)],
    [inlineButton("All leads", "leads:page:0")],
  ]) });
});

export default composer;
