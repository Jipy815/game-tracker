export type PartnerProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
};

export type Presence = {
  status: "online" | "offline" | "playing";
  current_game: string | null;
  current_executable: string | null;
  started_at: string | null;
  updated_at: string | null;
};

export type GameSession = {
  id: string;
  game_name: string;
  executable_name: string | null;
  start_time: string;
  end_time: string | null;
  duration: string | null;
};
