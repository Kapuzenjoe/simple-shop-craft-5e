import { MODULE_ID, SETTING_KEYS } from "../config.mjs";

/**
 * @import { Recipe } from "./recipe-data.mjs";
 */

/**
 * Create a new recipe and persist it.
 * @param {object} data  Recipe data, without `_id` — generated on creation.
 * @returns {Promise<Recipe>}  The newly created recipe.
 */
export async function createRecipe(data) {
  const recipes = getRecipes();
  await setRecipes([...recipes.map(r => r.toObject()), data]);
  return getRecipes().at(-1);
}

/* -------------------------------------------- */

/**
 * Delete a recipe.
 * @param {string} recipeId
 * @returns {Promise<void>}
 */
export async function deleteRecipe(recipeId) {
  await setRecipes(getRecipes().filter(r => r._id !== recipeId).map(r => r.toObject()));
}

/* -------------------------------------------- */

/**
 * Get a single recipe by id.
 * @param {string} recipeId
 * @returns {Recipe|undefined}
 */
export function getRecipe(recipeId) {
  return getRecipes().find(r => r._id === recipeId);
}

/* -------------------------------------------- */

/**
 * Get every recipe.
 * @returns {Recipe[]}
 */
export function getRecipes() {
  return game.settings.get(MODULE_ID, SETTING_KEYS.RECIPES);
}

/* -------------------------------------------- */

/**
 * Persist the full recipes array.
 * @param {object[]} recipes  Plain recipe data objects.
 * @returns {Promise<void>}
 */
export async function setRecipes(recipes) {
  await game.settings.set(MODULE_ID, SETTING_KEYS.RECIPES, recipes);
}

/* -------------------------------------------- */

/**
 * Merge a partial update into a single recipe.
 * @param {string} recipeId
 * @param {object} updateData  Fields to merge into the recipe's current data.
 * @returns {Promise<void>}
 */
export async function updateRecipe(recipeId, updateData) {
  const recipes = getRecipes();
  await setRecipes(recipes.map(r => r._id === recipeId ? { ...r.toObject(), ...updateData } : r.toObject()));
}
