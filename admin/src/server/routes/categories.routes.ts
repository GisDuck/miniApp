import type { FastifyPluginAsync } from "fastify";

import { getMoySkladProductFolders } from "../lib/moysklad.js";

export const categoriesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", async () => {
    const folders = await getMoySkladProductFolders();

    return folders
      .filter((folder) => !folder.archived)
      .map((folder) => ({
        id: folder.id,
        title: folder.pathName ? `${folder.pathName}/${folder.name}` : folder.name,
      }))
      .sort((first, second) => first.title.localeCompare(second.title, "ru"));
  });
};
