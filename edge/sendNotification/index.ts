import fetch from 'node-fetch';

// Example Edge Function: receives a POST from Supabase Realtime or DB trigger with payload {
//  user_id, status, current_game, started_at
// }

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY;

export default async function handler(req: Request) {
  try {
    const payload = await req.json();
    // Lookup partner's device tokens in Supabase (not implemented here)
    const userId = payload.user_id;
    const status = payload.status;
    const game = payload.current_game;

    const message = status === 'playing'
      ? `🎮 ${payload.display_name || 'Someone'} started playing ${game}`
      : `🎮 ${payload.display_name || 'Someone'} went offline`;

    const body = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: 'Game Presence' },
      contents: { en: message },
      // include filters or include_player_ids
      // filters: [ { field: 'tag', key: 'partner_of', relation: '=', value: userId } ]
    };

    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        'Authorization': `Basic ${ONESIGNAL_REST_KEY}`
      },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    return new Response(JSON.stringify({ ok: true, data }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), { status: 500 });
  }
}
