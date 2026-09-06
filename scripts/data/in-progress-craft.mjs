import { MODULE_ID } from "../config.mjs";
import { deductActorCurrencyChecked, formatDuration, maxHoursPerWorkday, resolveEntries } from "../utils.mjs";

import ProgressHoursDialog from "../applications/craft/progress-hours-dialog.mjs";

const { DocumentUUIDField, NumberField, SchemaField, StringField } = foundry.data.fields;

/**
 * @import { InProgressCraftData } from "../_types.mjs";
 */

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
 * Template used to render a craft-progress chat card.
 * @type {string}
 */
const PROGRESS_TEMPLATE = "modules/simple-shop-craft-5e/templates/chat/progress-card.hbs";

/**
 * A data model that represents a craft in progress, tracked via a consumable item's own flags.
 * @extends {foundry.abstract.DataModel<InProgressCraftData>}
 * @mixes InProgressCraftData
 */
export class InProgressCraft extends foundry.abstract.DataModel {

  /** @override */
  static defineSchema() {
    return {
      recipeId: new StringField({ blank: true }),
      targetItem: new SchemaField({
        identifier: new StringField({ blank: true }),
        uuid: new DocumentUUIDField({ type: "Item", blank: true })
      }),
      targetQuantity: new NumberField({ required: true, initial: 1, integer: true, min: 1 }),
      activityId: new StringField({ blank: true }),
      totalHours: new NumberField({ required: true, initial: 0 }),
      hoursPerUse: new NumberField({ initial: null, nullable: true }),
      progress: new NumberField({ required: true, initial: 0 })
    };
  }

  /* -------------------------------------------- */

  /**
   * Validate and apply an accepted craft start: consume the contributed materials and gold, then create
   * the in-progress craft item on the actor.
   * @param {object} craft  Pending craft-card flag data.
   * @returns {Promise<{ ok: true }|{ ok: false, error: string }>}
   */
  static async start(craft) {
    const actor = fromUuidSync(craft.actorUuid);
    if ( !actor ) return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.CraftCard.MissingActor" };

    const itemUpdates = [];
    const itemsToDelete = [];
    const remaining = new Map();
    for ( const line of craft.materialLines ) {
      const owned = actor.items.get(line.itemId);
      if ( !owned ) return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.CraftCard.MissingMaterial" };
      const available = remaining.has(line.itemId) ? remaining.get(line.itemId) : owned.system.quantity;
      if ( available < line.quantity ) return { ok: false, error: "SIMPLE_SHOP_CRAFT_5E.CraftCard.MissingMaterial" };
      remaining.set(line.itemId, available - line.quantity);
    }
    for ( const [itemId, left] of remaining ) {
      if ( left > 0 ) itemUpdates.push({ _id: itemId, "system.quantity": left });
      else itemsToDelete.push(itemId);
    }

    if ( craft.goldCP > 0 ) {
      const result = await deductActorCurrencyChecked(actor, craft.goldCP);
      if ( !result.ok ) return result;
    }

    if ( itemUpdates.length ) await actor.updateEmbeddedDocuments("Item", itemUpdates);
    if ( itemsToDelete.length ) await actor.deleteEmbeddedDocuments("Item", itemsToDelete);

    const inProgress = new InProgressCraft({
      recipeId: craft.recipeId, targetItem: craft.targetItem, targetQuantity: craft.targetQuantity,
      activityId: foundry.utils.randomID(), totalHours: craft.totalHours, hoursPerUse: craft.hoursPerUse, progress: 0
    });
    const [item] = await actor.createEmbeddedDocuments("Item", [{
      name: _loc("SIMPLE_SHOP_CRAFT_5E.Craft.InProgressName", { name: craft.targetName }),
      type: "consumable",
      img: craft.targetImg,
      system: {
        quantity: 1, price: craft.halfPrice ?? { value: 0, denomination: "gp" },
        weight: craft.weight ?? { value: 0, units: "lb" },
        description: { value: inProgress.applyProgressDescription("") }
      },
      flags: { [MODULE_ID]: { craft: inProgress.toObject() } }
    }]);
    await inProgress.createActivity(item);

    return { ok: true };
  }

  /* -------------------------------------------- */

  /**
   * Handle configuring a use of the "Progress Craft" activity: replace dnd5e's own usage dialog with one
   * that lets the player choose how many hours of progress this use contributes.
   * @param {Activity} activity
   * @param {ActivityUseConfiguration} usageConfig
   * @param {ActivityDialogConfiguration} dialogConfig
   * @param {ActivityMessageConfiguration} messageConfig
   * @returns {void}
   */
  static onPreUseActivity(activity, usageConfig, dialogConfig, messageConfig) {
    const item = activity.item;
    const flag = item?.getFlag(MODULE_ID, "craft");
    if ( !flag || (flag.activityId !== activity.id) ) return;

    const actor = item.actor;
    const dailyMax = maxHoursPerWorkday();
    const workedToday = actor?.getFlag(MODULE_ID, "hoursWorkedToday") ?? 0;
    const remainingToday = Math.max(0, dailyMax - workedToday);
    const craft = new InProgressCraft(flag);
    const max = Math.min(remainingToday, craft.totalHours - craft.progress);
    usageConfig.scaling = 0;
    dialogConfig.applicationClass = ProgressHoursDialog;
    dialogConfig.options = { max, initial: Math.min(max, craft.hoursPerUse ?? max), workedToday, dailyMax };
    messageConfig.create = false;
  }

  /* -------------------------------------------- */

  /**
   * Handle a use of the "Progress Craft" activity: advance progress, complete the craft once full.
   * @param {Activity} activity
   * @param {ActivityUseConfiguration} usageConfig
   * @returns {Promise<void>}
   */
  static async onPostUseActivity(activity, usageConfig) {
    const item = activity.item;
    const flag = item?.getFlag(MODULE_ID, "craft");
    if ( !flag || (flag.activityId !== activity.id) ) return;

    const craft = new InProgressCraft(flag);
    const hoursThisUse = usageConfig.simpleShopCraft5e?.hoursThisUse ?? craft.hoursPerUse ?? maxHoursPerWorkday();
    craft.updateSource({ progress: craft.progress + hoursThisUse });

    const actor = item.actor;
    if ( actor ) {
      const workedToday = actor.getFlag(MODULE_ID, "hoursWorkedToday") ?? 0;
      await actor.setFlag(MODULE_ID, "hoursWorkedToday", workedToday + hoursThisUse);
    }

    await ChatMessage.create({
      content: await foundry.applications.handlebars.renderTemplate(PROGRESS_TEMPLATE, {
        itemImg: item.img, itemName: item.name, actorName: actor?.name ?? "",
        hoursWorkedLabel: _loc("SIMPLE_SHOP_CRAFT_5E.Craft.ProgressCard.HoursWorked", {
          hours: formatDuration(hoursThisUse, { days: false })
        }),
        progressLabel: craft.#progressLabel()
      }),
      speaker: ChatMessage.getSpeaker({ actor })
    });

    if ( craft.progress >= craft.totalHours ) {
      await craft.complete(item);
      return;
    }

    await activity.update({ "description.chatFlavor": craft.#progressLabel() });
    await item.update({
      [`flags.${MODULE_ID}.craft`]: craft.toObject(),
      "system.description.value": craft.applyProgressDescription(item.system.description.value ?? "")
    });
  }

  /* -------------------------------------------- */

  /**
   * Self-healing: on every character sheet render, recreate a deleted "Progress Craft" activity and
   * reconcile it to the current activity definition, and refresh a missing or stale progress block in
   * the description of any in-progress craft item.
   * @param {Application5e} app
   * @returns {Promise<void>}
   */
  static async onRenderCharacterActorSheet(app) {
    const actor = app.actor;
    if ( !actor ) return;

    for ( const item of actor.items ) {
      const flag = item.getFlag(MODULE_ID, "craft");
      if ( !flag?.activityId ) continue;
      const craft = new InProgressCraft(flag);

      await craft.createActivity(item);

      const description = item.system.description.value ?? "";
      const updated = craft.applyProgressDescription(description);
      if ( updated !== description ) await item.update({ "system.description.value": updated });
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle a completed rest: reset the actor's tracked crafting hours for the day on a long rest.
   * @param {Actor5e} actor
   * @param {object} result
   * @param {RestConfiguration} config
   * @returns {Promise<void>}
   */
  static async onRestCompleted(actor, result, config) {
    if ( config.type !== "long" ) return;
    await actor.unsetFlag(MODULE_ID, "hoursWorkedToday");
  }

  /* -------------------------------------------- */

  /**
   * Insert or replace the progress status block within a description, preserving the rest of it.
   * @param {string} description  Current description HTML.
   * @returns {string}
   */
  applyProgressDescription(description) {
    const block = `<div class="simple-shop-craft-5e craft-progress"><p>${this.#progressLabel()}</p></div>`;
    return PROGRESS_BLOCK_REGEX.test(description)
      ? description.replace(PROGRESS_BLOCK_REGEX, block)
      : description + block;
  }

  /* -------------------------------------------- */

  /**
   * Create the "Progress Craft" use-activity on this craft's item.
   * @param {Item5e} item  The in-progress craft item.
   * @returns {Promise<void>}
   */
  async createActivity(item) {
    const data = {
      _id: this.activityId,
      name: _loc("SIMPLE_SHOP_CRAFT_5E.Craft.ProgressActivityName"),
      description: { chatFlavor: this.#progressLabel() },
      activation: { type: "action", value: null }
    };
    const activity = item.system.activities?.get(this.activityId);
    if ( activity && !this.#activityNeedsUpdate(activity, data) ) return;
    await item.createActivity(ACTIVITY_TYPE, data, { renderSheet: false });
  }

  /* -------------------------------------------- */

  /**
   * Determine whether a live activity's definition has drifted from its intended values.
   * @param {Activity} activity  The activity as currently stored on the item.
   * @param {object} data        The intended activity data, as passed to `Item5e#createActivity()`.
   * @returns {boolean}
   */
  #activityNeedsUpdate(activity, data) {
    return (activity.name !== data.name)
      || (activity.description.chatFlavor !== data.description.chatFlavor)
      || (activity.activation.type !== data.activation.type)
      || (activity.activation.value !== data.activation.value)
      || (activity.consumption?.targets?.length > 0);
  }

  /* -------------------------------------------- */

  /**
   * Finish this craft: replace the in-progress item with the real target item — merged into an existing
   * matching item if the actor already has one, otherwise created — and post an info message.
   * @param {Item5e} item  The in-progress craft item.
   * @returns {Promise<void>}
   */
  async complete(item) {
    const actor = item.actor;
    if ( !actor ) return;

    const [resolved] = await resolveEntries([this.targetItem]);
    const fullItem = resolved.item?.uuid ? await fromUuid(resolved.item.uuid) : null;
    if ( !fullItem ) {
      ui.notifications.error("SIMPLE_SHOP_CRAFT_5E.CraftCard.MissingItem", { localize: true });
      return;
    }

    const itemData = fullItem.toObject();
    delete itemData._id;
    if ( fullItem.type !== "container" ) itemData.system.quantity = this.targetQuantity;

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
   * Format this craft's progress as a localized duration ratio, e.g. "2h 30min/8h".
   * @returns {string}
   */
  #progressLabel() {
    return _loc("SIMPLE_SHOP_CRAFT_5E.Craft.ProgressActivityFlavor", {
      progress: formatDuration(this.progress), total: formatDuration(this.totalHours)
    });
  }

}
