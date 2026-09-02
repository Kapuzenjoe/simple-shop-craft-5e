/**
 * Migrate the `noRestock` boolean to the three-way `restockMode`.
 * @param {object} source  The candidate source data from which the model will be constructed.
 */
export function migrateRestockMode(source) {
  if ( !("noRestock" in source) ) return;
  source.restockMode = source.noRestock ? "exclude" : "normal";
  delete source.noRestock;
}

/* -------------------------------------------- */

/**
 * Migrate the `openToAll` boolean to the three-way `unlockMode`.
 * @param {object} source  The candidate source data from which the model will be constructed.
 */
export function migrateUnlockMode(source) {
  if ( !("openToAll" in source) ) return;
  source.unlockMode = source.openToAll ? "all" : "individual";
  delete source.openToAll;
}
