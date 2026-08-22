import { MODULE_ID } from "../config.mjs";

import { applyProgressDescription, createProgressActivity } from "./progress.mjs";

/**
 * Validate and apply an accepted craft start: consume the contributed materials and gold, then create
 * the in-progress craft item on the actor.
 * @param {object} craft  Craft flag data.
 * @returns {Promise<{ ok: true }|{ ok: false, error: string }>}
 */
export async function applyCraftStart(craft) {
  const actor = fromUuidSync(craft.actorUuid);
  if ( !actor ) return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.CraftCard.MissingActor" };

  const itemUpdates = [];
  const itemsToDelete = [];
  for ( const line of craft.materialLines ) {
    const owned = actor.items.get(line.itemId);
    if ( !owned || (owned.system.quantity < 1) ) {
      return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.CraftCard.MissingMaterial" };
    }
    if ( owned.system.quantity > 1 ) itemUpdates.push({ _id: owned.id, "system.quantity": owned.system.quantity - 1 });
    else itemsToDelete.push(owned.id);
  }

  if ( craft.goldCP > 0 ) {
    try {
      await game.dnd5e.applications.CurrencyManager.deductActorCurrency(actor, craft.goldCP, "cp");
    } catch ( err ) {
      return { ok: false, error: err.message };
    }
  }

  if ( itemUpdates.length ) await actor.updateEmbeddedDocuments("Item", itemUpdates);
  if ( itemsToDelete.length ) await actor.deleteEmbeddedDocuments("Item", itemsToDelete);

  const activityId = foundry.utils.randomID();
  const initialCraft = {
    recipeId: craft.recipeId, targetItem: craft.targetItem,
    activityId, totalHours: craft.totalHours, hoursPerUse: craft.hoursPerUse, progress: 0
  };
  const [item] = await actor.createEmbeddedDocuments("Item", [{
    name: _loc("SIMPLE_SHOP_CRAFT_5E.Craft.InProgressName", { name: craft.targetName }),
    type: "consumable",
    img: craft.targetImg,
    system: {
      quantity: 1, price: craft.halfPrice ?? { value: 0, denomination: "gp" },
      weight: craft.weight ?? { value: 0, units: "lb" },
      uses: { max: "1", recovery: [{ period: "lr", type: "recoverAll" }] },
      description: { value: applyProgressDescription("", initialCraft) }
    },
    flags: { [MODULE_ID]: { craft: initialCraft } }
  }]);
  await createProgressActivity(item, activityId, initialCraft);

  return { ok: true };
}
