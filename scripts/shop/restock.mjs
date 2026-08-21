/**
 * @import { Shop } from "../data/shop-data.mjs";
 */

/**
 * Resolve a shop's restock patch: full stock (except `noRestock` items) and gold pool.
 * @param {Shop} shop
 * @returns {{ items: object[], goldPool: object }}
 */
export function resolveRestockPatch(shop) {
  const items = shop.items.map(entry => {
    const obj = entry.toObject();
    if ( !obj.noRestock ) obj.stock = { ...obj.stock, current: obj.stock.max };
    return obj;
  });
  const goldPool = { ...shop.goldPool };
  if ( !goldPool.unlimited ) goldPool.current = { ...goldPool.max };
  return { items, goldPool };
}
