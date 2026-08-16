module.exports = {
  expo: {
    name: "Game Presence",
    slug: "game-presence",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    plugins: ["expo-notifications"],
    extra: {
      eas: {
        projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined,
      },
    },
  },
};
