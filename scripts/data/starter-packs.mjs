/**
 * Starter packs a GM can pick from when creating a new template, to pre-fill its item list.
 * Item identifiers are verified against the dnd5e 2024 equipment compendium.
 * @type {Record<string, {label: string, items: Array<string|{identifier: string, bundleSize: number}>>}>}
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
      "magnifying-glass", "orb", "reliquary", "rod", "spell-scroll-cantrip", "spell-scroll-level-1",
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
      "sack", "scholars-pack", "shovel", "signal-whistle", "spell-scroll-cantrip", "spell-scroll-level-1",
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

/* -------------------------------------------- */

/**
 * Get the item identifiers included in a starter pack.
 * @param {string} pack  Starter pack key.
 * @returns {{ identifier: string, bundleSize: number|null }[]}
 */
export function getStarterItems(pack) {
  return (STARTER_PACKS[pack]?.items ?? []).map(item => {
    return typeof item === "string" ? { identifier: item, bundleSize: null } : { identifier: item.identifier, bundleSize: item.bundleSize ?? null };
  }
  );
}

/* -------------------------------------------- */

/**
 * Get the localized label/value pairs for the starter pack selection dropdown.
 * @returns {{ value: string, label: string }[]}
 */
export function getStarterPackOptions() {
  return Object.entries(STARTER_PACKS).map(([value, pack]) => ({ value, label: _loc(pack.label) }));
}
