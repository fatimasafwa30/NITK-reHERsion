// Quick Exit. One job: get off this page immediately and leave as little
// behind as possible. `replace` keeps VeraTrace out of the back button.
export const NEUTRAL_URL = 'https://www.bbc.co.uk/weather';

export function quickExit() {
  try {
    window.sessionStorage.clear();
  } catch {
    /* storage may be unavailable; leaving is still the priority */
  }
  window.location.replace(NEUTRAL_URL);
}
