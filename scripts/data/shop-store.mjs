import { MODULE_ID, SETTING_KEYS } from "../config.mjs";

/**
 * @import { Shop } from "./shop-data.mjs";
 */

/**
 * Create a new shop and persist it.
 * @param {object} data  Shop data, without `_id` — generated on creation.
 * @returns {Promise<Shop>}  The newly created shop.
 */
export async function createShop(data) {
  const shops = getShops();
  await setShops([...shops.map(s => s.toObject()), data]);
  return getShops().at(-1);
}

/* -------------------------------------------- */

/**
 * Delete a shop.
 * @param {string} shopId
 * @returns {Promise<void>}
 */
export async function deleteShop(shopId) {
  await setShops(getShops().filter(s => s._id !== shopId).map(s => s.toObject()));
}

/* -------------------------------------------- */

/**
 * Get a single shop by id.
 * @param {string} shopId
 * @returns {Shop|undefined}
 */
export function getShop(shopId) {
  return getShops().find(s => s._id === shopId);
}

/* -------------------------------------------- */

/**
 * Get every shop.
 * @returns {Shop[]}
 */
export function getShops() {
  return game.settings.get(MODULE_ID, SETTING_KEYS.SHOPS);
}

/* -------------------------------------------- */

/**
 * Persist the full shops array.
 * @param {object[]} shops  Plain shop data objects.
 * @returns {Promise<void>}
 */
export async function setShops(shops) {
  await game.settings.set(MODULE_ID, SETTING_KEYS.SHOPS, shops);
}

/* -------------------------------------------- */

/**
 * Merge a partial update into a single shop.
 * @param {string} shopId
 * @param {object} updateData  Fields to merge into the shop's current data.
 * @returns {Promise<void>}
 */
export async function updateShop(shopId, updateData) {
  const shops = getShops();
  await setShops(shops.map(s => s._id === shopId ? { ...s.toObject(), ...updateData } : s.toObject()));
}
