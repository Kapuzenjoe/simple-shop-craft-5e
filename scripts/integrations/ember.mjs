/**
 * Whether the Ember module is active.
 * @returns {boolean}
 */
export function isEmberActive() {
  return !!game.modules.get("ember")?.active;
}
