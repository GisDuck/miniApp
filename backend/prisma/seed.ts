import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedVariant = {
  optionLabel: string;
  title: string;
  description: string;
  price: number;
  maxQuantity: number;
  images: string[];
};

type SeedProduct = {
  categoryTitle: string;
  description: string;
  variants: SeedVariant[];
};

const categories = ["Drones", "Cameras", "Accessories", "Stabilizers"];

const products: SeedProduct[] = [
  {
    categoryTitle: "Drones",
    description: "Compact drone for travel shooting and everyday content.",
    variants: [
      {
        optionLabel: "basic",
        title: "DJI Mini 4 Pro",
        description: "Base kit with drone, controller, battery and propellers.",
        price: 94900,
        maxQuantity: 5,
        images: ["/products/dron.webp", "/products/huba.webp"],
      },
      {
        optionLabel: "combo",
        title: "DJI Mini 4 Pro Combo",
        description: "Extended kit with extra batteries and charging hub.",
        price: 119900,
        maxQuantity: 3,
        images: ["/products/huba.webp", "/products/dron.webp"],
      },
    ],
  },
  {
    categoryTitle: "Drones",
    description: "Powerful drone with a dual-camera system.",
    variants: [
      {
        optionLabel: "basic",
        title: "DJI Air 3",
        description: "Base kit for aerial photo and video shooting.",
        price: 129900,
        maxQuantity: 4,
        images: ["/products/dron.webp", "/products/cam.webp"],
      },
      {
        optionLabel: "2 cam",
        title: "DJI Air 3 Dual Camera Kit",
        description: "Kit focused on dual-camera shooting scenarios.",
        price: 149900,
        maxQuantity: 2,
        images: ["/products/cam.webp", "/products/dron.webp"],
      },
    ],
  },
  {
    categoryTitle: "Drones",
    description: "FPV drone for dynamic shots and immersive flying.",
    variants: [
      {
        optionLabel: "basic",
        title: "DJI Avata 2",
        description: "Base FPV kit for fast and smooth shooting.",
        price: 119900,
        maxQuantity: 3,
        images: ["/products/dron.webp", "/products/fpvLens.webp"],
      },
      {
        optionLabel: "combo",
        title: "DJI Avata 2 Combo",
        description: "FPV combo with goggles and extra accessories.",
        price: 154900,
        maxQuantity: 2,
        images: ["/products/fpvLens.webp", "/products/dron.webp"],
      },
    ],
  },
  {
    categoryTitle: "Cameras",
    description: "Action camera for sport, travel and everyday shooting.",
    variants: [
      {
        optionLabel: "basic",
        title: "DJI Osmo Action 4",
        description: "Base camera kit with standard accessories.",
        price: 32900,
        maxQuantity: 8,
        images: ["/products/cam.webp", "/products/stable.webp"],
      },
      {
        optionLabel: "+ mic",
        title: "DJI Osmo Action 4 + Mic",
        description: "Camera kit with a microphone for better sound.",
        price: 42900,
        maxQuantity: 5,
        images: ["/products/cam.webp", "/products/mic.webp"],
      },
    ],
  },
  {
    categoryTitle: "Cameras",
    description: "Pocket camera with a built-in stabilizer.",
    variants: [
      {
        optionLabel: "basic",
        title: "DJI Osmo Pocket 3",
        description: "Base pocket camera kit for vlogs and trips.",
        price: 57900,
        maxQuantity: 6,
        images: ["/products/stable.webp", "/products/cam.webp"],
      },
      {
        optionLabel: "+ mic",
        title: "DJI Osmo Pocket 3 Creator Kit",
        description: "Creator kit with microphone and useful accessories.",
        price: 74900,
        maxQuantity: 4,
        images: ["/products/mic.webp", "/products/stable.webp"],
      },
    ],
  },
  {
    categoryTitle: "Stabilizers",
    description: "Camera stabilizer for smooth handheld video.",
    variants: [
      {
        optionLabel: "basic",
        title: "DJI RS 4",
        description: "Base stabilizer kit for mirrorless cameras.",
        price: 49900,
        maxQuantity: 7,
        images: ["/products/stable.webp", "/products/cam.webp"],
      },
      {
        optionLabel: "combo",
        title: "DJI RS 4 Combo",
        description: "Combo kit with extra grip and focus accessories.",
        price: 64900,
        maxQuantity: 4,
        images: ["/products/stable.webp", "/products/fpvLens.webp"],
      },
    ],
  },
  {
    categoryTitle: "Accessories",
    description: "Lens and light-control accessories for shooting.",
    variants: [
      {
        optionLabel: "basic",
        title: "ND Filter Set",
        description: "Basic filter set for daylight shooting.",
        price: 6900,
        maxQuantity: 12,
        images: ["/products/fpvLens.webp", "/products/cam.webp"],
      },
      {
        optionLabel: "combo",
        title: "ND Filter Set Combo",
        description: "Extended filter set for flexible exposure control.",
        price: 9900,
        maxQuantity: 8,
        images: ["/products/fpvLens.webp", "/products/huba.webp"],
      },
    ],
  },
  {
    categoryTitle: "Accessories",
    description: "Extra power for longer shooting sessions.",
    variants: [
      {
        optionLabel: "basic",
        title: "Extra Battery",
        description: "One extra battery for compatible DJI devices.",
        price: 8900,
        maxQuantity: 10,
        images: ["/products/huba.webp", "/products/dron.webp"],
      },
      {
        optionLabel: "combo",
        title: "Extra Battery Combo",
        description: "Two batteries and charging hub for longer sessions.",
        price: 18900,
        maxQuantity: 6,
        images: ["/products/huba.webp", "/products/stable.webp"],
      },
    ],
  },
];

async function clearDatabase() {
  await prisma.cartItem.deleteMany();
  await prisma.favoriteItem.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.telegramUser.deleteMany();
  await prisma.user.deleteMany();
  await prisma.productVariantImage.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
}

async function main() {
  await clearDatabase();

  const categoriesByTitle = new Map<string, number>();

  for (const title of categories) {
    const category = await prisma.category.create({
      data: {
        title,
      },
    });

    categoriesByTitle.set(category.title, category.id);
  }

  for (const product of products) {
    const categoryId = categoriesByTitle.get(product.categoryTitle);

    if (!categoryId) {
      throw new Error(`Category not found: ${product.categoryTitle}`);
    }

    await prisma.product.create({
      data: {
        description: product.description,
        isActive: true,
        categoryId,
        variants: {
          create: product.variants.map((variant, variantIndex) => ({
            moySkladId: 123123,
            optionLabel: variant.optionLabel,
            title: variant.title,
            description: variant.description,
            price: variant.price,
            maxQuantity: variant.maxQuantity,
            isActive: true,
            sortOrder: variantIndex,
            images: {
              create: variant.images.map((url, imageIndex) => ({
                url,
                sortOrder: imageIndex,
              })),
            },
          })),
        },
      },
    });
  }
}

main()
  .then(async () => {
    console.log("Seed data has been created.");
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
