import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const categories = [
  "Дроны",
  "Камеры",
  "Аксессуары",
  "Стабилизаторы",
];

const products = [
  {
    title: "DJI Mini 4 Pro",
    price: 94900,
    imageUrl: "/products/huba.webp",
    description:
      "Компактный дрон с качественной камерой, датчиками препятствий и длительным временем полета.",
    categoryTitle: "Дроны",
  },
  {
    title: "DJI Air 3",
    price: 129900,
    imageUrl: "/products/huba.webp",
    description:
      "Мощный дрон с двумя камерами, хорошей стабилизацией и большим запасом по дальности.",
    categoryTitle: "Дроны",
  },
  {
    title: "DJI Avata 2",
    price: 119900,
    imageUrl: "/products/huba.webp",
    description:
      "FPV-дрон для динамичной съемки с эффектом полного погружения и удобным управлением.",
    categoryTitle: "Дроны",
  },
  {
    title: "DJI Osmo Action 4",
    price: 32900,
    imageUrl: "/products/huba.webp",
    description:
      "Экшн-камера для съемки спорта, путешествий и активного отдыха с хорошей стабилизацией.",
    categoryTitle: "Камеры",
  },
  {
    title: "DJI Osmo Pocket 3",
    price: 57900,
    imageUrl: "/products/huba.webp",
    description:
      "Компактная камера со встроенным стабилизатором для блогов, поездок и повседневной съемки.",
    categoryTitle: "Камеры",
  },
  {
    title: "DJI RS 4",
    price: 49900,
    imageUrl: "/products/huba.webp",
    description:
      "Стабилизатор для камеры, который помогает получать плавную картинку при движении.",
    categoryTitle: "Стабилизаторы",
  },
  {
    title: "Комплект ND-фильтров",
    price: 6900,
    imageUrl: "/products/huba.webp",
    description:
      "Набор фильтров для контроля света и более кинематографичной картинки при съемке.",
    categoryTitle: "Аксессуары",
  },
  {
    title: "Дополнительный аккумулятор",
    price: 8900,
    imageUrl: "/products/huba.webp",
    description:
      "Запасной аккумулятор для увеличения времени работы устройства во время съемки.",
    categoryTitle: "Аксессуары",
  },
];

async function main() {
  // Сначала удаляем записи из зависимых таблиц,
  // потом товары и категории.
  await prisma.cartItem.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  for (const title of categories) {
    await prisma.category.create({
      data: {
        title,
      },
    });
  }

  for (const product of products) {
    const category = await prisma.category.findUnique({
      where: {
        title: product.categoryTitle,
      },
    });

    if (!category) {
      throw new Error(`Категория не найдена: ${product.categoryTitle}`);
    }

    await prisma.product.create({
      data: {
        title: product.title,
        price: product.price,
        imageUrl: product.imageUrl,
        description: product.description,
        isActive: true,
        categoryId: category.id,
      },
    });
  }
}

main()
  .then(async () => {
    console.log("Базовые категории и товары добавлены в базу данных");
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
