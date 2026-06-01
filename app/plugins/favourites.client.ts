// Client-only plugin: loads the user's favourites from the server on startup.
import { useFavourites } from "@@/stores/favourites";

export default defineNuxtPlugin(() => {
  const favourites = useFavourites();
  favourites.init().catch(console.error);
});
