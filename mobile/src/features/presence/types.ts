export type PartnerProfile = {
  id: string;
  display_name: string | null;
  email: string | null;
};

export type Presence = {
  status: "online" | "offline" | "playing";
  current_game: string | null;
  started_at: string | null;
};
