# Real Estate Lead Capture Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot for a single real-estate agent to capture and manage leads. Visitors can submit leads with name, phone, intent (buy/rent/sell), and a short note. The agent receives immediate notifications and has a private dashboard to view and manage leads.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- prospective real estate clients
- real estate agent

## Success criteria

- Agent receives immediate notification for every new lead
- Agent can view all leads in a private dashboard
- Agent can mark leads as Done or New
- Visitors can successfully submit leads with all required information

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu
- **Submit a lead** (button, actor: user, callback: submit_lead:start) — Start the lead submission flow for visitors
- **/leads** (command, actor: admin, command: /leads) — Open the private leads dashboard for the agent
- **Owner** (button, actor: admin, callback: owner:dashboard) — Open the private leads dashboard for the agent

## Flows

### Lead submission
_Trigger:_ submit_lead:start

1. Show welcome message with 'Submit a lead' button
2. Ask for name
3. Ask for phone (contact share or typed)
4. Ask for intent (Buy/Rent/Sell buttons)
5. Ask for short note
6. Show summary with Confirm/Edit options
7. Confirm saves lead and triggers owner notification
8. Edit allows restarting or field-by-field correction

_Data touched:_ Lead

### Lead dashboard
_Trigger:_ /leads or owner:dashboard

1. Verify admin access
2. List leads (newest first, 20 per page)
3. Show View and Mark Done/New buttons for each lead
4. View full lead details and status toggle
5. Navigate pages with Prev/Next buttons

_Data touched:_ Lead

### Owner notification
_Trigger:_ Lead submission confirmation

1. Send notification to admin chat
2. Include all lead fields
3. Include 'View in bot' and 'Mark Done' buttons

_Data touched:_ Lead

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram chat ID for the agent to receive notifications and access the dashboard
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **Lead** _(retention: persistent)_ — A lead submitted by a visitor
  - fields: id, name, phone, intent, note, status, created_at

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- View all leads in private dashboard
- Mark leads as New or Done

## Notifications

- Immediate notification to agent when new lead is submitted
- In-bot notification for agent to view lead details or mark as Done

## Permissions & privacy

- Only the configured admin can view and manage leads
- Leads are stored securely with no external sharing

## Edge cases

- User submits incomplete lead information
- Agent tries to access dashboard without proper permissions
- Multiple leads submitted simultaneously

## Required tests

- End-to-end test of lead submission flow from start to confirmation
- Test that agent receives notification with all lead details
- Test private dashboard access control for non-admin users
- Test pagination and status changes in the dashboard

## Assumptions

- Single admin chat ID is sufficient for agent access
- Buy/Rent/Sell are the only required intent options
- Telegram contact share or typed phone number is acceptable for phone input
- Lead submission confirmation with summary and edit options is sufficient
- 20 leads per page with newest first is an acceptable default
- One Telegram message per new lead with action buttons is sufficient for triage
