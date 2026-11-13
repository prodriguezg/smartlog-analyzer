export function categoryService({ database }) {
  return {
    async getCategories() {
      try {
        return await database.models.Category.findAll({
          attributes: ["code", "description"],
          order: [["code", "ASC"]],
          raw: true,
        });
      } catch (error) {
        console.error("Error retrieving categories:", error);
        throw new Error("Failed to retrieve categories", { cause: error });
      }
    },
  };
}
