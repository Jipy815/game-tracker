import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY;

// Helper to call Supabase REST
async function supabaseGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  return res.json();
}

async function supabasePatch(path: string, body: any) {
  await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

export default async function handler(req: Request) {
  try {
    // Fetch unprocessed notifications
    const items = await supabaseGet('notification_queue?processed=eq.false');

    for (const item of items) {
      const payload = item.payload || {};
      const userId = payload.user_id;
      const status = payload.status;
      const game = payload.current_game;

      // Find partner id
      const profiles = await supabaseGet(`profiles?select=partner_id&id=eq.${userId}`);
      const partnerId = profiles && profiles.length ? profiles[0].partner_id : null;
      if (!partnerId) {
        // mark processed to avoid loops
        await supabasePatch(`notification_queue?id=eq.${item.id}`, { processed: true, processed_at: new Date().toISOString() });
        continue;
      }

      // Fetch devices for partner
      const devices = await supabaseGet(`devices?user_id=eq.${partnerId}`);
      const playerIds = (devices || []).map((d: any) => d.push_token).filter(Boolean);

      if (playerIds.length === 0) {
        await supabasePatch(`notification_queue?id=eq.${item.id}`, { processed: true, processed_at: new Date().toISOString() });
        continue;
      }

      const message = status === 'playing'
        ? `🎮 Your partner started playing ${game}`
        : `🎮 Your partner is now ${status}`;

      const body = {
        app_id: ONESIGNAL_APP_ID,
        headings: { en: 'Game Presence' },
        contents: { en: message },
        include_player_ids: playerIds
      };

      // Send to OneSignal
      await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf-8',
          'Authorization': `Basic ${ONESIGNAL_REST_KEY}`
        },
        body: JSON.stringify(body)
      });

      // Mark processed
      await supabasePatch(`notification_queue?id=eq.${item.id}`, { processed: true, processed_at: new Date().toISOString() });
    }

    return new Response(JSON.stringify({ ok: true, count: items.length }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
}
