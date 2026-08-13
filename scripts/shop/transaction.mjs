import { getShops, setShops } from "../data/shop-store.mjs";

import { breakdownCopper, effectiveGoldPool, resolveDefaultPrice } from "./currency.mjs";
import { entryKey, resolveShopItems } from "./entry-resolver.mjs";
import { needsDefaultPrice } from "./pricing.mjs";

/**
 * Validate and apply an accepted transaction: deduct/credit currency, transfer items both ways, adjust
 * shop stock. All changes are persisted to the actor and shop data.
 * @param {object} purchase  Purchase flag data.
 * @returns {Promise<{ ok: true }|{ ok: false, error: string }>}
 */
export async function applyPurchase(purchase) {
  const actor = fromUuidSync(purchase.actorUuid);
  if ( !actor ) return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.MissingActor" };

  const shops = getShops();
  const shop = shops.find(s => s._id === purchase.shopId);
  if ( !shop ) return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.MissingShop" };

  for ( const line of purchase.buyLines ) {
    const entry = shop.items.find(i => entryKey(i) === entryKey(line));
    if ( (entry?.stock.current !== null) && (entry?.stock.current < line.quantity) ) {
      return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.InsufficientStock" };
    }
  }

  for ( const line of purchase.sellLines ) {
    const owned = actor.items.get(line.itemId);
    if ( !owned || (owned.system.quantity < line.quantity) ) {
      return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.InsufficientSellQuantity" };
    }
  }

  const effectiveGoldCurrent = effectiveGoldPool(shop.goldPool);
  if ( (effectiveGoldCurrent !== null) && (purchase.netCP > 0) && (effectiveGoldCurrent < purchase.netCP) ) {
    return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.InsufficientShopGold" };
  }

  const resolved = await resolveShopItems(
    purchase.buyLines.map(line => ({
      identifier: line.identifier, uuid: line.uuid, generated: line.generated, spellScroll: line.spellScroll
    }))
  );
  const itemsToCreate = [];
  const itemUpdates = [];
  for ( const [index, line] of purchase.buyLines.entries() ) {
    const indexEntry = resolved[index].item;
    const totalQuantity = line.quantity * line.bundleSize;

    const existing = line.identifier
      ? actor.items.find(i => i.system.identifier === line.identifier)
      : (line.generated && indexEntry?.system.identifier
        ? actor.items.find(i => i.system.identifier === indexEntry.system.identifier)
        : null);
    if ( existing && (existing.type !== "container") ) {
      itemUpdates.push({ _id: existing.id, "system.quantity": existing.system.quantity + totalQuantity });
      continue;
    }

    const fullItem = (line.generated || line.spellScroll)
      ? indexEntry
      : (indexEntry?.uuid ? await fromUuid(indexEntry.uuid) : null);
    if ( !fullItem ) return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.PurchaseCard.MissingItem" };
    const itemData = fullItem.toObject();
    delete itemData._id;
    if ( needsDefaultPrice(fullItem) ) {
      const defaultPrice = resolveDefaultPrice(fullItem);
      if ( defaultPrice ) itemData.system.price = defaultPrice;
    }
    if ( fullItem.type === "container" ) {
      for ( let i = 0; i < totalQuantity; i++ ) itemsToCreate.push(foundry.utils.deepClone(itemData));
    } else {
      itemData.system.quantity = totalQuantity;
      itemsToCreate.push(itemData);
    }
  }

  const itemsToDelete = [];
  for ( const line of purchase.sellLines ) {
    const owned = actor.items.get(line.itemId);
    const remaining = owned.system.quantity - line.quantity;
    if ( remaining > 0 ) itemUpdates.push({ _id: line.itemId, "system.quantity": remaining });
    else itemsToDelete.push(line.itemId);
  }

  if ( purchase.netCP < 0 ) {
    try {
      await game.dnd5e.applications.CurrencyManager.deductActorCurrency(actor, -purchase.netCP, "cp");
    } catch ( err ) {
      return { ok: false, error: err.message };
    }
  } else if ( purchase.netCP > 0 ) {
    const amounts = breakdownCopper(purchase.netCP)
      .reduce((obj, part) => Object.assign(obj, { [part.denomination]: part.value }), {});
    await game.dnd5e.applications.Award.awardCurrency(amounts, [actor]);
  }

  if ( itemsToCreate.length ) await actor.createEmbeddedDocuments("Item", itemsToCreate);
  if ( itemUpdates.length ) await actor.updateEmbeddedDocuments("Item", itemUpdates);
  if ( itemsToDelete.length ) await actor.deleteEmbeddedDocuments("Item", itemsToDelete);

  const items = shop.items.map(entry => {
    const line = purchase.buyLines.find(l => entryKey(l) === entryKey(entry));
    if ( !line || (entry.stock.current === null) ) return entry.toObject();
    return { ...entry.toObject(), stock: { ...entry.stock, current: entry.stock.current - line.quantity } };
  });
  for ( const line of purchase.sellLines ) {
    if ( !line.identifier ) continue;
    const existing = items.find(i => i.identifier === line.identifier);
    if ( existing && (existing.stock.current !== null) ) existing.stock.current += line.quantity;
  }

  const goldPool = { ...shop.goldPool };
  if ( effectiveGoldCurrent !== null ) {
    const parts = breakdownCopper(effectiveGoldCurrent - purchase.netCP);
    goldPool.current = Object.fromEntries(parts.map(p => [p.denomination, p.value]));
  }

  await setShops(shops.map(s => s._id === shop._id ? { ...s.toObject(), items, goldPool } : s.toObject()));

  return { ok: true };
}
