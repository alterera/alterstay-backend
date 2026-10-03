import { readFileSync } from 'fs';
import { join } from 'path';
import type { PrismaClient } from '../../src/generated/prisma/client';

export interface CitySeedRow {
  name: string;
  state: string;
  areas: string[];
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseCityDataset(csvContent: string): CitySeedRow[] {
  const lines = csvContent.trim().split(/\r?\n/);
  if (lines.length < 2) {
    return [];
  }

  const rows: CitySeedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }

    const columns = line.split(',');
    if (columns.length < 2) {
      continue;
    }

    const name = columns[0].trim();
    const state = columns[1].trim();
    if (!name) {
      continue;
    }

    const areas: string[] = [];
    const seen = new Set<string>();

    for (let j = 2; j < columns.length; j++) {
      const area = columns[j].trim();
      if (!area) {
        continue;
      }

      const key = area.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      areas.push(area);
    }

    rows.push({ name, state, areas });
  }

  return rows;
}

export function loadCityDataset(csvPath?: string): CitySeedRow[] {
  const resolvedPath =
    csvPath ?? join(__dirname, '..', 'data', 'alterstay-city-dataset.csv');

  return parseCityDataset(readFileSync(resolvedPath, 'utf8'));
}

export async function seedCitiesFromDataset(
  prisma: PrismaClient,
  csvPath?: string,
): Promise<{ cities: number; areas: number }> {
  const cityRows = loadCityDataset(csvPath);

  let areaCount = 0;

  for (const cityData of cityRows) {
    const slug = slugify(cityData.name);
    if (!slug) {
      continue;
    }

    const city = await prisma.city.upsert({
      where: { slug },
      update: {
        name: cityData.name,
        state: cityData.state || null,
      },
      create: {
        name: cityData.name,
        slug,
        state: cityData.state || null,
        country: 'India',
      },
    });

    for (const areaName of cityData.areas) {
      const areaSlug = slugify(areaName);
      if (!areaSlug) {
        continue;
      }

      await prisma.area.upsert({
        where: { cityId_slug: { cityId: city.id, slug: areaSlug } },
        update: { name: areaName },
        create: { cityId: city.id, name: areaName, slug: areaSlug },
      });
      areaCount++;
    }
  }

  return { cities: cityRows.length, areas: areaCount };
}
