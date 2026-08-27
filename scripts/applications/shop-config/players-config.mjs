import BaseShopConfig from "./base-shop-config.mjs";

/**
 * @import { default as ShopSheet } from "../shop-sheet.mjs";
 */

/**
 * Dialog to manage a shop's per-player discount overrides and haggling locks.
 * @param {object} options
 * @param {ShopSheet} options.shopSheet
 * @param {(updateData: object) => Promise<void>} options.onUpdate
 * @param {(actorUuid: string, updateData: object) => Promise<void>} options.onUpdatePlayerDiscount
 */
export default class PlayersConfig extends BaseShopConfig {
  constructor({ shopSheet, onUpdate, onUpdatePlayerDiscount, ...options }={}) {
    super(options);
    this.shopSheet = shopSheet;
    this.onUpdate = onUpdate;
    this.onUpdatePlayerDiscount = onUpdatePlayerDiscount;
    this.#actorUuids = this.shopSheet.shop.playerDiscounts.map(pd => pd.actor);
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "players-config-{id}",
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Players" },
    form: { handler: PlayersConfig.#onSubmit },
    actions: {
      removePlayerDiscount: PlayersConfig.#removePlayerDiscount,
      resetHaggling: PlayersConfig.#resetHaggling
    }
  };

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/players-config/content.hbs" }
  };

  /**
   * The shop editor this config belongs to.
   * @type {ShopSheet}
   */
  shopSheet;

  /**
   * Callback receiving the shop update.
   * @type {(updateData: object) => Promise<void>}
   */
  onUpdate;

  /**
   * Callback receiving a haggling-lock update for one actor.
   * @type {(actorUuid: string, updateData: object) => Promise<void>}
   */
  onUpdatePlayerDiscount;

  /* -------------------------------------------- */

  /**
   * Actor UUIDs currently listed, in display order.
   * @type {string[]}
   */
  #actorUuids;

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const rows = this.#actorUuids.map((uuid, index) => {
      const existing = this.shopSheet.shop.playerDiscounts.find(pd => pd.actor === uuid);
      const actor = fromUuidSync(uuid);
      return {
        index, actorUuid: uuid, actorImg: actor?.img, actorName: actor?.name,
        buyModifier: existing?.buyModifier ?? null, sellModifier: existing?.sellModifier ?? null,
        hagglingLocked: !!existing?.hagglingLocked,
        template: "modules/simple-shop-craft-5e/templates/shop-sheet/players-dialog-row.hbs"
      };
    });
    context.table = {
      hasRows: rows.length > 0,
      emptyLabel: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Players.None",
      sections: [{
        label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Player",
        columns: [
          { id: "name" },
          { id: "discount", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Buy" },
          { id: "discount", label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Tabs.Sell" },
          { id: "controls" }
        ],
        rows
      }]
    };
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const tags = this.element.querySelector('document-tags[name="newPlayerActors"]');
    tags?.addEventListener("change", async () => {
      this.#actorUuids = Array.from(new Set([...this.#actorUuids, ...tags.value]));
      await this.#persistPlayerList();
      this.render({ parts: ["content"] });
    });
  }

  /* -------------------------------------------- */

  /**
   * Persist the current actor list as player discount entries, preserving existing haggling state.
   * @returns {Promise<void>}
   */
  async #persistPlayerList() {
    const existing = new Map(this.shopSheet.shop.playerDiscounts.map(pd => [pd.actor, pd]));
    const playerDiscounts = this.#actorUuids.map(uuid => ({
      actor: uuid,
      buyModifier: existing.get(uuid)?.buyModifier ?? null,
      sellModifier: existing.get(uuid)?.sellModifier ?? null,
      hagglingLocked: existing.get(uuid)?.hagglingLocked ?? false,
      hagglingTimestamp: existing.get(uuid)?.hagglingTimestamp ?? null
    }));
    await this.onUpdate({ playerDiscounts });
  }

  /* -------------------------------------------- */

  /**
   * Handle removing a player from the list.
   * @this {PlayersConfig}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<void>}
   */
  static async #removePlayerDiscount(event, target) {
    const uuid = target.closest("li")?.dataset.actorUuid;
    this.#actorUuids = this.#actorUuids.filter(u => u !== uuid);
    await this.#persistPlayerList();
    this.render({ parts: ["content"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle resetting a player's haggling lock.
   * @this {PlayersConfig}
   * @param {Event} event         Triggering click event.
   * @param {HTMLElement} target  Button that was clicked.
   * @returns {Promise<void>}
   */
  static async #resetHaggling(event, target) {
    const uuid = target.closest("li")?.dataset.actorUuid;
    await this.onUpdatePlayerDiscount(uuid, { hagglingLocked: false, hagglingTimestamp: null });
    this.render({ parts: ["content"] });
  }

  /* -------------------------------------------- */

  /**
   * Handle persisting per-player buy/sell modifiers from the form's number inputs.
   * @this {PlayersConfig}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const existing = new Map(this.shopSheet.shop.playerDiscounts.map(pd => [pd.actor, pd]));
    const playerDiscounts = Object.values(data.playerDiscounts ?? {}).map(row => ({
      actor: row.actor,
      buyModifier: ((row.buy === "") || (row.buy == null)) ? null : Number(row.buy),
      sellModifier: ((row.sell === "") || (row.sell == null)) ? null : Number(row.sell),
      hagglingLocked: existing.get(row.actor)?.hagglingLocked ?? false,
      hagglingTimestamp: existing.get(row.actor)?.hagglingTimestamp ?? null
    }));
    await this.onUpdate({ playerDiscounts });
  }
}
