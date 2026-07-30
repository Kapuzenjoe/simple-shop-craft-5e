/**
 * Starter packs a GM can pick from when creating a new template, to pre-fill its item list.
 * Item identifiers are verified against the dnd5e 2024 equipment compendium.
 * @type {Record<string, {label: string, items: string[]}>}
 */
export const STARTER_PACKS = {
  blacksmith: {
    label: "SIMPLE_SHOP_CRAFT_5E.StarterPack.Blacksmith",
    items: [
      "battleaxe", "club", "dagger", "flail", "greataxe", "greatclub", "greatsword", "halberd", "handaxe",
      "javelin", "light-crossbow", "heavy-crossbow", "light-hammer", "longsword", "mace", "maul", "morningstar",
      "pike", "rapier", "scimitar", "shortbow", "sickle", "spear", "war-pick", "warhammer", "whip",
      "breastplate", "chain-mail", "chain-shirt", "half-plate-armor", "plate-armor", "ring-mail", "scale-mail",
      "shield", "splint-armor", "studded-leather-armor", "smiths-tools"
    ]
  },
  alchemist: {
    label: "SIMPLE_SHOP_CRAFT_5E.StarterPack.Alchemist",
    items: [
      "acid", "alchemists-fire", "alchemists-supplies", "antitoxin", "candle", "healers-kit", "herbalism-kit",
      "perfume", "poisoners-kit", "potion-of-climbing", "potion-of-healing", "sprig-of-mistletoe", "truth-serum", "vial"
    ]
  },
  magicShop: {
    label: "SIMPLE_SHOP_CRAFT_5E.StarterPack.MagicShop",
    items: ["book", "component-pouch", "crystal", "ink-pen", "magnifying-glass", "orb", "rod", "staff", "wand"]
  },
  blackmarket: {
    label: "SIMPLE_SHOP_CRAFT_5E.StarterPack.Blackmarket",
    items: [
      "blowgun", "caltrops", "crowbar", "dagger", "disguise-kit", "forgery-kit", "hooded-lantern", "lock",
      "manacles", "poisoners-kit", "sling", "thieves-tools"
    ]
  },
  generalStore: {
    label: "SIMPLE_SHOP_CRAFT_5E.StarterPack.GeneralStore",
    items: [
      "backpack", "basket", "bedroll", "blanket", "bucket", "chest", "flask", "jug", "lamp", "paper",
      "parchment", "pouch", "rations", "sack", "tent", "torch", "waterskin"
    ]
  },
  tavern: {
    label: "SIMPLE_SHOP_CRAFT_5E.StarterPack.Tavern",
    items: ["rations", "waterskin"]
  }
};

/* -------------------------------------------- */

/**
 * Get the localized label/value pairs for the starter pack selection dropdown.
 * @returns {Array<{value: string, label: string}>}
 */
export function getStarterPackOptions() {
  return Object.entries(STARTER_PACKS).map(([value, pack]) => ({ value, label: _loc(pack.label) }));
}

/* -------------------------------------------- */

/**
 * Get the item identifiers included in a starter pack.
 * @param {string} pack  Starter pack key.
 * @returns {string[]}
 */
export function getStarterItems(pack) {
  return STARTER_PACKS[pack]?.items ?? [];
}
