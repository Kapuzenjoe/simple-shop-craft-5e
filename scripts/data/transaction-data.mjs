import { MODULE_ID, SETTING_KEYS } from "../config.mjs";
import SettingCollectionMixin from "./setting-collection-mixin.mjs";

const { ArrayField, BooleanField, DocumentIdField, NumberField, SchemaField, StringField } = foundry.data.fields;

/**
 * @import { TransactionData } from "../_types.mjs";
 */

/**
 * A data model that represents a completed buy/sell transaction in the transaction log.
 * @extends {foundry.abstract.DataModel<TransactionData>}
 * @mixes TransactionData
 */
export default class Transaction extends SettingCollectionMixin(foundry.abstract.DataModel, SETTING_KEYS.TRANSACTIONS) {

  /** @override */
  static defineSchema() {
    return {
      _id: new DocumentIdField({ initial: () => foundry.utils.randomID() }),
      timestamp: new NumberField({ required: true, integer: true }),
      worldTime: new NumberField({ required: true }),
      shopId: new StringField({ blank: true }),
      shopName: new StringField(),
      actorName: new StringField(),
      netCP: new NumberField({ initial: 0 }),
      buyLines: new ArrayField(lineField()),
      sellLines: new ArrayField(lineField())
    };
  }

  /* -------------------------------------------- */

  /** @override */
  static get limit() {
    return game.settings.get(MODULE_ID, SETTING_KEYS.TRANSACTION_LIMIT);
  }

  /* -------------------------------------------- */

  /**
   * Append a completed transaction to the log if logging is enabled.
   * @param {object} purchase  Purchase flag data of the accepted transaction.
   * @returns {Promise<void>}
   */
  static async log(purchase) {
    if ( !game.settings.get(MODULE_ID, SETTING_KEYS.LOG_TRANSACTIONS) ) return;
    const lines = rows => rows.map(({ name, quantity, priceCP, isService }) => {
      return { name, quantity, priceCP, isService };
    });
    await this.create({
      _id: foundry.utils.randomID(), timestamp: Date.now(), worldTime: game.time.worldTime,
      shopId: purchase.shopId, shopName: purchase.shopName, actorName: purchase.actorName,
      netCP: purchase.netCP, buyLines: lines(purchase.buyLines), sellLines: lines(purchase.sellLines)
    });
  }

  /* -------------------------------------------- */

  /**
   * Add transactions that are not yet in the log, keeping it in chronological order and within the limit.
   * @param {object[]} entries  Plain transaction data.
   * @returns {Promise<number>}  The number of transactions added that remain within the limit.
   */
  static async merge(entries) {
    let added = 0;
    await this.updateAll(all => {
      const known = new Set(all.map(entry => entry._id));
      const fresh = entries.filter(entry => {
        if ( known.has(entry._id) ) return false;
        known.add(entry._id);
        return true;
      });
      const merged = [...all, ...fresh].sort((a, b) => a.timestamp - b.timestamp).slice(-this.limit);
      added = fresh.filter(entry => merged.includes(entry)).length;
      return merged;
    });
    return added;
  }
}

/* -------------------------------------------- */

/**
 * A logged item or service line.
 * @returns {SchemaField}
 */
function lineField() {
  return new SchemaField({
    name: new StringField(), quantity: new NumberField(), priceCP: new NumberField(),
    isService: new BooleanField({ initial: false })
  });
}
