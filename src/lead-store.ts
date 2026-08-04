import type { StoredLead } from "./toolkit/session/durable.js";

export type Lead = StoredLead;
export type LeadPage = { leads: Lead[]; total: number; page: number };

type DurableObjectNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(input: string, init?: { method?: string; body?: string }): Promise<Response> };
};

type LeadStoreEnv = { CHAT_DO?: DurableObjectNamespace };

function namespace(env: LeadStoreEnv | undefined): DurableObjectNamespace | undefined {
  return env?.CHAT_DO;
}

async function request<T>(env: LeadStoreEnv | undefined, path: string, init?: { method?: string; body?: string }): Promise<T | undefined> {
  const doNamespace = namespace(env);
  if (!doNamespace) return undefined;
  const stub = doNamespace.get(doNamespace.idFromName("real-estate-leads"));
  const response = await stub.fetch(`https://do${path}`, init);
  if (!response.ok) return undefined;
  return response.json() as Promise<T>;
}

export async function createLead(env: LeadStoreEnv | undefined, lead: Lead): Promise<Lead | undefined> {
  return request<Lead>(env, "/leads", { method: "POST", body: JSON.stringify(lead) });
}

export async function listLeads(env: LeadStoreEnv | undefined, page: number): Promise<LeadPage | undefined> {
  return request<LeadPage>(env, `/leads?page=${Math.max(0, Math.floor(page))}`);
}

export async function getLead(env: LeadStoreEnv | undefined, id: string): Promise<Lead | undefined> {
  return request<Lead>(env, `/lead?id=${encodeURIComponent(id)}`);
}

export async function setLeadStatus(env: LeadStoreEnv | undefined, id: string, status: Lead["status"]): Promise<Lead | undefined> {
  return request<Lead>(env, "/lead", { method: "PATCH", body: JSON.stringify({ id, status }) });
}
