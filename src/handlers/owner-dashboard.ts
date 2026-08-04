import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { sendDashboard } from "./leads.js";
import { registerMainMenuItem, requireOwner } from "../toolkit/index.js";

registerMainMenuItem({ label: "Owner", data: "owner:dashboard", order: 90 });

const composer = new Composer<Ctx>();

composer.callbackQuery("owner:dashboard", async (ctx) => {
  if (!(await requireOwner(ctx as never))) return;
  await ctx.answerCallbackQuery();
  await sendDashboard(ctx);
});

export default composer;
