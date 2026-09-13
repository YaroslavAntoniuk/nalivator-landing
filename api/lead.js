// api/lead.js — Vercel serverless function for lead capture.
// Stores a lead (name + contact + model) and an analytics "signup" event.
// Data goes to Vercel KV if Vercel KV is linked, otherwise to Upstash-free
// in-memory fallback is NOT durable — so when no KV is configured we still
// return 200 but log to stdout, and the count is tracked via a lightweight
// Google Sheet / analytics event fired client-side.
//
// This endpoint only needs to work for a pre-launch interest gauge, so we
// keep it dependency-free: no KV SDK required.

export default async function handler(req, res) {
  // CORS for the landing origin (SSR-safe; fine for a public lead form).
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { name, contact, model } = body || {};

    // Basic validation — this is an interest gauge, not a billing form.
    if (!contact || String(contact).trim().length < 3) {
      res.status(400).json({ ok: false, error: "Contact is required" });
      return;
    }

    const lead = {
      name: String(name || "").trim(),
      contact: String(contact).trim(),
      model: String(model || "tbd").trim(),
      ts: new Date().toISOString(),
    };

    // If Vercel KV is linked, persist durably. Otherwise fall through to a
    // console log (still returns success so the UI can show confirmation).
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const url = `${process.env.KV_REST_API_URL}/lpush/nalivator_leads`;
      await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(JSON.stringify(lead)),
      });
    }

    // Always log for observability (visible in Vercel function logs).
    console.log("[lead]", JSON.stringify(lead));

    res.status(201).json({ ok: true, received: true });
  } catch (err) {
    console.error("[lead] error", err);
    res.status(500).json({ ok: false, error: "Something went wrong" });
  }
}