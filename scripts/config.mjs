/**
 * Simple Shop & Craft 5e module id.
 * @type {string}
 */
export const MODULE_ID = "simple-shop-craft-5e";

/**
 * Setting keys used by this module.
 * All settings are registered under {@link MODULE_ID} using these keys.
 *
 * @readonly
 * @enum {string}
 */
export const SETTING_KEYS = {
  SHOPS: "shops",
  RECIPES: "recipes"
};

/**
 * Compendium packs excluded as shop-goods sources — monster/class "feature" packs whose weapon-typed
 * entries are combat abilities (e.g. a monster's claw), not real items.
 * @type {Set<string>}
 */
export const EXCLUDED_PACKS = new Set(["dnd5e.monsterfeatures", "dnd5e.monsterfeatures24", "dnd-monster-manual.features"]);

/**
 * Package types, in priority order, searched when resolving an identifier-based entry.
 * @type {string[]}
 */
export const PACKAGE_TYPE_ORDER = ["module", "system", "world"];

/**
 * Settlement cap guideline values per DMG 2024 "Settlements by Size".
 * @type {Record<string, { label: string, value: number }>}
 */
export const SETTLEMENT_CAPS = {
  village: { label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Village", value: 20 },
  town: { label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.Town", value: 2000 },
  city: { label: "SIMPLE_SHOP_CRAFT_5E.ShopEditor.City", value: 200000 }
};

/**
 * Default effective gold pool (in GP) used when a shop has neither an explicit gold pool
 * nor "unlimited" enabled.
 * @type {number}
 */
export const GOLD_POOL_DEFAULT = 100;

/**
 * Hours of progress granted per use of the "Progress Craft" activity (one downtime workday), per DMG
 * 2024 crafting rules.
 * @type {number}
 */
export const HOURS_PER_USE = 8;

/**
 * Default gp price per rarity, per DMG 2024 "Magic Item Values by Rarity".
 * @type {Record<string, { durable: number, consumable: number }>}
 */
export const RARITY_DEFAULT_PRICES = {
  common: { durable: 100, consumable: 50 },
  uncommon: { durable: 400, consumable: 200 },
  rare: { durable: 4000, consumable: 2000 },
  veryRare: { durable: 40000, consumable: 20000 },
  legendary: { durable: 200000, consumable: 100000 }
};

/**
 * Spell levels matching each rarity tier's spell scroll price/rarity, per DMG 2024 "Spell Scroll Costs".
 * @type {Record<string, number[]>}
 */
export const SPELL_SCROLL_LEVELS = {
  common: [0, 1], uncommon: [2, 3], rare: [4, 5], veryRare: [6, 7, 8], legendary: [9]
};

/**
 * Starter packs a GM can pick from when creating a new shop, to pre-fill its item list.
 * @type {Record<string, { label: string, items: (string|{ identifier: string, bundleSize: number })[] }>}
 */
export const STARTER_PACKS = {
  blacksmith: {
    label: "SIMPLE_SHOP_CRAFT_5E.StarterPack.Blacksmith",
    items: [
      "battleaxe", "blowgun", "club", "dagger", "dart", "flail", "glaive", "greataxe", "greatclub", "greatsword",
      "halberd", "hand-crossbow", "handaxe", "heavy-crossbow", "javelin", "lance", "light-crossbow", "light-hammer",
      "longbow", "longsword", "mace", "maul", "morningstar", "pike", "quarterstaff", "rapier", "scimitar",
      "shortbow", "shortsword", "sickle", "sling", "spear", "trident", "war-pick", "warhammer", "whip",
      "breastplate", "chain-mail", "chain-shirt", "half-plate-armor", "hide-armor", "leather-armor", "padded-armor",
      "plate-armor", "ring-mail", "scale-mail", "shield", "splint-armor", "studded-leather-armor",
      "arrows", "bolts", "bullets-sling", "needles", "quiver", "case-crossbow-bolt", "smiths-tools"
    ]
  },
  alchemist: {
    label: "SIMPLE_SHOP_CRAFT_5E.StarterPack.Alchemist",
    items: [
      "acid", "alchemists-fire", "alchemists-supplies", "antitoxin", "candle", "component-pouch", "healers-kit",
      "herbalism-kit", "oil", "paper", "perfume", "poisoners-kit", "potion-of-climbing", "potion-of-healing",
      "sprig-of-mistletoe", "truth-serum", "vial"
    ]
  },
  magicShop: {
    label: "SIMPLE_SHOP_CRAFT_5E.StarterPack.MagicShop",
    items: [
      "amulet", "book", "calligraphers-supplies", "component-pouch", "crystal", "emblem", "ink-pen",
      "magnifying-glass", "orb", "reliquary", "rod",
      "sprig-of-mistletoe", "staff", "wand", "wooden-staff", "yew-wand"
    ]
  },
  blackmarket: {
    label: "SIMPLE_SHOP_CRAFT_5E.StarterPack.Blackmarket",
    items: [
      "blowgun", "bullets-sling", "caltrops", "crowbar", "dagger", "disguise-kit", "forgery-kit", "lantern-hooded",
      "lock", "manacles", "needles", "poison-basic", "poisoners-kit", "sling", "thieves-tools"
    ]
  },
  generalStore: {
    label: "SIMPLE_SHOP_CRAFT_5E.StarterPack.GeneralStore",
    items: [
      "acid", "alchemists-fire", "antitoxin", "backpack", "ball-bearings", "barrel", "basket", "bedroll", "bell",
      "blanket", "block-and-tackle", "book", "bottle-glass", "bucket", "burglars-pack", "caltrops", "candle",
      "case-crossbow-bolt", "case-map-or-scroll", "chain", "chest", "climbers-kit", "clothes-fine",
      "clothes-travelers", "component-pouch", "costume", "crowbar", "diplomats-pack", "dungeoneers-pack",
      "entertainers-pack", "explorers-pack", "flask", "grappling-hook", "healers-kit", "holy-water", "hunting-trap",
      "ink", "ink-pen", "jug", "ladder", "lamp", "lantern-bullseye", "lantern-hooded", "lock", "magnifying-glass",
      "manacles", "map", "mirror", "net", "oil", "paper", "parchment", "perfume", "poison-basic", "pole",
      "pot-iron", "potion-of-healing", "pouch", "priests-pack", "quiver", "ram-portable", "rations", "robe", "rope",
      "sack", "scholars-pack", "shovel", "signal-whistle",
      "spikes-iron", "spyglass", "string", "tent", "tinderbox", "torch", "vial", "waterskin",
      "alchemists-supplies", "bagpipes", "brewers-supplies", "calligraphers-supplies", "carpenters-tools",
      "cartographers-tools", "cobblers-tools", "cooks-utensils", "dice", "dragonchess", "drum", "dulcimer", "flute",
      "glassblowers-tools", "herbalism-kit", "horn", "jewelers-tools", "leatherworkers-tools", "lute", "lyre",
      "masons-tools", "navigators-tools", "painters-supplies", "pan-flute", "playing-cards", "potters-tools",
      "shawm", "smiths-tools", "three-dragon-ante", "tinkers-tools", "viol", "weavers-tools", "woodcarvers-tools"
    ]
  },
  tavern: {
    label: "SIMPLE_SHOP_CRAFT_5E.StarterPack.Tavern",
    items: ["rations", "waterskin"]
  }
};
