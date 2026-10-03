import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { createPrismaPgAdapter } from '../src/prisma/pg-adapter';
import { seedCitiesFromDataset } from './lib/city-dataset';

const prisma = new PrismaClient({
  adapter: createPrismaPgAdapter(process.env.DATABASE_URL!),
});

async function main() {
  const { cities, areas } = await seedCitiesFromDataset(prisma);
  console.log(`Seeded ${cities} cities and ${areas} areas from alterstay-city-dataset.csv`);
}

main()
  .catch((error) => {
    console.error('City seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
