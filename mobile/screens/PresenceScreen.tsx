import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'PUBLIC_ANON_KEY';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function PresenceScreen() {
  const [presence, setPresence] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    // Replace with the watched user's id
    const watchedUserId = 'REPLACE_WITH_USER_UUID';

    async function fetchPresence() {
      const { data, error } = await supabase
        .from('presence')
        .select('*')
        .eq('user_id', watchedUserId)
        .single();
      if (data && mounted) setPresence(data);
    }

    fetchPresence();

    const subscription = supabase
      .from(`presence:user_id=eq.${watchedUserId}`)
      .on('INSERT', payload => setPresence(payload.new))
      .on('UPDATE', payload => setPresence(payload.new))
      .on('DELETE', payload => setPresence(null))
      .subscribe();

    return () => {
      mounted = false;
      if ((subscription as any).unsubscribe) (subscription as any).unsubscribe();
    };
  }, []);

  if (!presence) return (
    <View style={styles.container}>
      <Text style={styles.offline}>Offline</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.status}>{presence.status === 'playing' ? '🟢 Playing' : presence.status}</Text>
      {presence.current_game && (
        <>
          <Text style={styles.game}>{presence.current_game}</Text>
          <Text>Started: {new Date(presence.started_at).toLocaleTimeString()}</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  status: { fontSize: 20, fontWeight: '600' },
  game: { fontSize: 28, fontWeight: '700', marginTop: 8 },
  offline: { fontSize: 20, color: 'gray' }
});
