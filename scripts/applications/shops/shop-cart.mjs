import { PurchaseMessageData } from "../../data/purchase-message.mjs";
import { breakdownCopper } from "../../utils.mjs";

/**
 * @import { default as ShopSheet } from "./shop-sheet.mjs";
 */

const { Dialog5e } = game.dnd5e.applications.api;

/**
 * Window showing the current shopping cart for a shop, with a confirm action.
 */
export default class ShopCart extends Dialog5e {
  constructor({ shopSheet, ...options }={}) {
    super(options);
    this.shopSheet = shopSheet;
  }

  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "shop-cart-{id}",
    classes: ["simple-shop-craft-5e", "shop-cart", "standard-form"],
    window: { title: "SIMPLE_SHOP_CRAFT_5E.ShopCart.Title", resizable: true },
    position: { width: 400 },
    form: { handler: ShopCart.#onSubmit, closeOnSubmit: false }
  };

  /* -------------------------------------------- */

  /** @override */
  static PARTS = {
    ...super.PARTS,
    content: { template: "modules/simple-shop-craft-5e/templates/shop-cart/content.hbs" }
  };

  /**
   * The shop editor this cart belongs to.
   * @type {ShopSheet}
   */
  shopSheet;

  /* -------------------------------------------- */

  /**
   * Compute the current buy/sell lines, net total, and confirm-eligibility for this cart.
   * @returns {object}
   */
  #computeState() {
    const lines = this.shopSheet.cartLines.map(row => ({
      ...row,
      subtotal: breakdownCopper(row.priceCP * row.cartQuantity, { negative: true })
    }));
    const sellLines = this.shopSheet.sellLines.map(row => ({
      ...row,
      subtotal: breakdownCopper(row.priceCP * row.sellQuantity)
    }));

    const { count, netCP, parts } = summarizeNet(lines, sellLines);
    const hasLines = count > 0;
    const total = { parts };

    const actor = this.shopSheet.selectedActorUuid ? fromUuidSync(this.shopSheet.selectedActorUuid) : null;
    const balance = { insufficient: false };
    if ( actor && (netCP < 0) ) {
      const updates = game.dnd5e.applications.CurrencyManager.getActorCurrencyUpdates(actor, -netCP, "cp", {});
      balance.insufficient = !updates.remainder.almostEqual(0);
    }

    const noActiveGM = !game.users.activeGM;
    const confirmDisabled = noActiveGM || !hasLines || !actor || !!balance.insufficient;
    return { lines, sellLines, netCP, hasLines, total, actor, balance, noActiveGM, confirmDisabled };
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareContentContext(context, options) {
    context = await super._prepareContentContext(context, options);
    const state = this.#computeState();
    context.buyRows = state.lines.map(row => ({
      img: row.item.img, name: row.item.name, quantity: row.cartQuantity, subtotal: row.subtotal
    }));
    context.sellRows = state.sellLines.map(row => ({
      img: row.item.img, name: row.item.name, quantity: row.sellQuantity, subtotal: row.subtotal
    }));
    context.hasLines = state.hasLines;
    context.total = state.total;
    context.balance = state.balance;
    context.actor = state.actor;
    context.noActiveGM = state.noActiveGM;
    return context;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _prepareFooterContext(context, options) {
    context = await super._prepareFooterContext(context, options);
    const state = this.#computeState();
    context.buttons = [{ action: "confirm", label: "DND5E.Confirm", disabled: state.confirmDisabled }];
    return context;
  }

  /* -------------------------------------------- */

  /**
   * Handle confirming the cart: send a GM-confirmation purchase chat card, clear both carts.
   * @this {ShopCart}
   * @param {Event} event                Triggering submit event.
   * @param {HTMLFormElement} form       The submitted form.
   * @param {FormDataExtended} formData  Data from the form.
   * @returns {Promise<void>}
   */
  static async #onSubmit(event, form, formData) {
    const state = this.#computeState();
    await PurchaseMessageData.create(
      this.shopSheet, state.actor, state.lines, state.sellLines, state.total.parts, state.netCP
    );
    ui.notifications.info("SIMPLE_SHOP_CRAFT_5E.ShopCart.PurchaseRequested", { localize: true });
    this.shopSheet.cart.clear();
    this.shopSheet.sellCart.clear();
    await this.shopSheet.render();
    this.render();
  }
}

/* -------------------------------------------- */

/**
 * Summarize a flat set of buy/sell rows into a single net total. Buying costs money (negative), selling
 * earns money (positive).
 * @param {{ cartQuantity?: number, priceCP: number }[]} buyRows
 * @param {{ sellQuantity?: number, priceCP: number }[]} sellRows
 * @returns {{ count: number, netCP: number, parts: { denomination: string, value: number }[] }}
 */
function summarizeNet(buyRows, sellRows) {
  let count = 0;
  let buyTotalCP = 0;
  for ( const row of buyRows ) {
    if ( !row.cartQuantity ) continue;
    count += row.cartQuantity;
    buyTotalCP += row.priceCP * row.cartQuantity;
  }
  let sellTotalCP = 0;
  for ( const row of sellRows ) {
    if ( !row.sellQuantity ) continue;
    count += row.sellQuantity;
    sellTotalCP += row.priceCP * row.sellQuantity;
  }
  const netCP = sellTotalCP - buyTotalCP;
  return { count, netCP, parts: count > 0 ? breakdownCopper(Math.abs(netCP), { negative: netCP < 0 }) : [] };
}
