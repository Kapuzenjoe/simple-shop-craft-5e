import { MODULE_ID } from "../config.mjs";

/**
 * Data model mixin adding Setting-backed collection CRUD: create, get, getAll, update, delete.
 * @param {typeof foundry.abstract.DataModel} Base
 * @param {string} settingKey  Key under `SETTING_KEYS` this model's collection is stored at.
 * @returns {typeof Base}
 * @mixin
 */
export function SettingCollectionMixin(Base, settingKey) {
  return class extends Base {

    /**
     * Get every persisted instance.
     * @returns {Base[]}
     */
    static getAll() {
      return game.settings.get(MODULE_ID, settingKey);
    }

    /* -------------------------------------------- */

    /**
     * Get a single instance by id.
     * @param {string} id
     * @returns {Base|undefined}
     */
    static get(id) {
      return this.getAll().find(entry => entry._id === id);
    }

    /* -------------------------------------------- */

    /**
     * Persist the full collection.
     * @param {object[]} entries  Plain data objects.
     * @returns {Promise<void>}
     */
    static async setAll(entries) {
      await game.settings.set(MODULE_ID, settingKey, entries);
    }

    /* -------------------------------------------- */

    /**
     * Create a new instance and persist it.
     * @param {object} data  Data without `_id` — generated on creation.
     * @returns {Promise<Base>}  The newly created instance.
     */
    static async create(data) {
      const all = this.getAll();
      await this.setAll([...all.map(e => e.toObject()), data]);
      return this.getAll().at(-1);
    }

    /* -------------------------------------------- */

    /**
     * Delete an instance.
     * @param {string} id
     * @returns {Promise<void>}
     */
    static async delete(id) {
      await this.setAll(this.getAll().filter(e => e._id !== id).map(e => e.toObject()));
    }

    /* -------------------------------------------- */

    /**
     * Merge a partial update into a single instance.
     * @param {string} id
     * @param {object} updateData  Fields to merge into the instance's current data.
     * @returns {Promise<void>}
     */
    static async update(id, updateData) {
      const all = this.getAll();
      await this.setAll(all.map(e => e._id === id ? { ...e.toObject(), ...updateData } : e.toObject()));
    }
  };
}
