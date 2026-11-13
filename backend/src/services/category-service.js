export function categoryService({ database }) {
  return {
    async getCategories() {
      try {
        const [results] = await database.query("SELECT * FROM categories ORDER BY code ASC");
        return results;
      } catch (error) {
        console.error("Error retrieving categories:", error);
        throw new Error("Failed to retrieve categories");
      }
    },
  };
}