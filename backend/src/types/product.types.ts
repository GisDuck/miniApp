import type { Prisma } from "@prisma/client";

export type ProductWithVariants = Prisma.ProductGetPayload<{
  include: {
    category: true;
    favoriteItems: {
      select: {
        id: true;
      };
    };
    variants: {
      include: {
        images: true;
      };
    };
  };
}>;