import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.cartItem.deleteMany();
  await prisma.favoriteItem.deleteMany();
  await prisma.telegramUser.deleteMany();
  await prisma.user.deleteMany();
}

main()
  .then(async () => {
    console.log("Seed data has been cleared.");
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
