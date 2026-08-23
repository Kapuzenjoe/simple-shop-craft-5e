import { HOURS_PER_USE, MODULE_ID } from "../config.mjs";
import { resolveEntries } from "../utils.mjs";

/**
 * Activity type used for the "Progress Craft" activity — generic, no combat mechanics.
 * @type {string}
 */
const ACTIVITY_TYPE = "utility";

/**
 * Marker block holding the progress status within an in-progress craft item's description.
 * @type {RegExp}
 */
const PROGRESS_BLOCK_REGEX = /<div class="simple-shop-craft-5e craft-progress">[\s\S]*?<\/div>/;

/**
 * Insert or replace the progress status block within an item's description, preserving the rest of it.
 * @param {string} description  Current description HTML.
 * @param {object} craft        Craft flag data.
 * @returns {string}
 */
export function applyProgressDescription(description, craft) {
  const block = `<div class="simple-shop-craft-5e craft-progress"><p>${progressLabel(craft)}</p></div>`;
  return PROGRESS_BLOCK_REGEX.test(description)
    ? description.replace(PROGRESS_BLOCK_REGEX, block)
    : description + block;
}

/* -------------------------------------------- */

/**
 * Create the "Progress Craft" use-activity on an in-progress craft item.
 * @param {Item5e} item        The in-progress craft item.
 * @param {string} activityId  Id to assign to the created activity.
 * @param {object} craft       Craft flag data, used for the initial progress label.
 * @returns {Promise<void>}
 */
export async function createProgressActivity(item, activityId, craft) {
  await item.createActivity(ACTIVITY_TYPE, {
    _id: activityId,
    name: _loc("SIMPLE_SHOP_CRAFT_5E.Craft.ProgressActivityName"),
    description: { chatFlavor: progressLabel(craft) },
    activation: resolveActivation(craft.hoursPerUse ?? HOURS_PER_USE),
    consumption: { targets: [{ type: "itemUses", target: "", value: "1" }] }
  }, { renderSheet: false });
}

/* -------------------------------------------- */

/**
 * Register hooks driving craft progress: activity usage and self-healing on sheet render.
 */
export function registerCraftProgress() {
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
  Hooks.on("renderCharacterActorSheet", onRenderCharacterActorSheet);
}

/* -------------------------------------------- */

/**
 * Finish a craft: replace the in-progress item with the real target item — merged into an existing
 * matching item if the actor already has one, otherwise created — and post an info message.
 * @param {Item5e} item    The in-progress craft item.
 * @param {object} craft   The item's craft flag data.
 * @returns {Promise<void>}
 */
async function completeCraft(item, craft) {
  const actor = item.actor;
  if ( !actor ) return;

  const [resolved] = await resolveEntries([craft.targetItem]);
  const fullItem = resolved.item?.uuid ? await fromUuid(resolved.item.uuid) : null;
  if ( !fullItem ) {
    ui.notifications.error("SIMPLE_SHOP_CRAFT_5E.CraftCard.MissingItem", { localize: true });
    return;
  }

  const itemData = fullItem.toObject();
  delete itemData._id;

  const existing = (fullItem.type !== "container") && fullItem.system.identifier
    ? actor.items.find(i => (i.id !== item.id) && (i.system.identifier === fullItem.system.identifier))
    : null;

  await item.delete();
  if ( existing ) {
    await actor.updateEmbeddedDocuments("Item", [
      { _id: existing.id, "system.quantity": existing.system.quantity + itemData.system.quantity }
    ]);
  } else {
    await actor.createEmbeddedDocuments("Item", [itemData]);
  }

  await ChatMessage.create({
    content: `<p>${_loc("SIMPLE_SHOP_CRAFT_5E.Craft.CompleteMessage", { name: fullItem.name, actor: actor.name })}</p>`,
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: game.users.filter(u => actor.testUserPermission(u, "OWNER"))
  });
}

/* -------------------------------------------- */

/**
 * Handle a use of the "Progress Craft" activity: advance progress, complete the craft once full.
 * @param {Activity} activity
 * @returns {Promise<void>}
 */
async function onPostUseActivity(activity) {
  const item = activity.item;
  const craft = item?.getFlag(MODULE_ID, "craft");
  if ( !craft || (craft.activityId !== activity.id) ) return;

  const progress = craft.progress + (craft.hoursPerUse ?? HOURS_PER_USE);
  if ( progress >= craft.totalHours ) {
    await completeCraft(item, craft);
    return;
  }

  const updated = { ...craft, progress };
  await activity.update({ "description.chatFlavor": progressLabel(updated) });
  await item.update({
    [`flags.${MODULE_ID}.craft`]: updated,
    "system.description.value": applyProgressDescription(item.system.description.value ?? "", updated)
  });
}

/* -------------------------------------------- */

/**
 * Self-healing: on every character sheet render, recreate a deleted "Progress Craft" activity and
 * refresh a missing or stale progress block in the description of any in-progress craft item.
 * @param {Application5e} app
 * @returns {Promise<void>}
 */
async function onRenderCharacterActorSheet(app) {
  const actor = app.actor;
  if ( !actor ) return;

  for ( const item of actor.items ) {
    const craft = item.getFlag(MODULE_ID, "craft");
    if ( !craft?.activityId ) continue;

    if ( !item.system.activities?.get(craft.activityId) ) await createProgressActivity(item, craft.activityId, craft);

    const description = item.system.description.value ?? "";
    const updated = applyProgressDescription(description, craft);
    if ( updated !== description ) await item.update({ "system.description.value": updated });
  }
}

/* -------------------------------------------- */

/**
 * Format a craft's progress as a localized workdays label, e.g. "2/5".
 * @param {object} craft  Craft flag data.
 * @returns {string}
 */
function progressLabel(craft) {
  const hoursPerUse = craft.hoursPerUse ?? HOURS_PER_USE;
  const completed = craft.progress / hoursPerUse;
  const total = Math.ceil(craft.totalHours / hoursPerUse);
  return _loc("SIMPLE_SHOP_CRAFT_5E.Craft.ProgressActivityFlavor", { completed, total });
}

/* -------------------------------------------- */

/**
 * Resolve an hours-per-use value to a valid, whole-number activity activation: whole hours stay
 * `type: "hour"`, anything else (e.g. a 30-minute recipe) converts to whole minutes.
 * @param {number} hoursPerUse
 * @returns {{ type: "hour"|"minute", value: number }}
 */
function resolveActivation(hoursPerUse) {
  return Number.isInteger(hoursPerUse)
    ? { type: "hour", value: Math.max(1, hoursPerUse) }
    : { type: "minute", value: Math.max(1, Math.round(hoursPerUse * 60)) };
}
