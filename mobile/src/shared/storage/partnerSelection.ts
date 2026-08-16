import AsyncStorage from "@react-native-async-storage/async-storage";

const keyFor = (userId: string) => `game-presence:selected-partner:${userId}`;

export const partnerSelection = {
  get: (userId: string) => AsyncStorage.getItem(keyFor(userId)),
  save: (userId: string, partnerId: string) => AsyncStorage.setItem(keyFor(userId), partnerId),
  clear: (userId: string) => AsyncStorage.removeItem(keyFor(userId)),
};
