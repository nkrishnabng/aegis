// Seeds a demo project pointing at a well-known public QA practice site, so
// you can explore the UI (project list, URL screen) immediately after
// `npm run seed`, before wiring up your own ANTHROPIC_API_KEY. Generating
// and running test cases still requires a real API key and
// `npx playwright install` -- this script only creates the starting project.
import { PrismaClient } from "@prisma/client";
import { env } from "../src/env";
import { hashPassword } from "../src/auth/passwords";

const prisma = new PrismaClient();

async function seedAdminUser() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    // Upgrading from before the `role` column existed: every pre-existing user
    // defaulted to "member", which would leave nobody able to add teammates.
    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount === 0) {
      const oldest = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
      if (oldest) {
        await prisma.user.update({ where: { id: oldest.id }, data: { role: "admin" } });
        console.log(`Promoted existing user "${oldest.username}" to admin (no admin existed).`);
      }
    }
    return;
  }
  if (!env.adminPassword) {
    console.warn(
      "No users exist yet and ADMIN_PASSWORD is not set -- set ADMIN_USERNAME/ADMIN_PASSWORD in " +
        ".env and re-run `npm run seed` to create the first login.",
    );
    return;
  }
  const user = await prisma.user.create({
    data: { username: env.adminUsername, passwordHash: hashPassword(env.adminPassword), role: "admin" },
  });
  console.log(`Seeded admin user "${user.username}".`);
}

async function main() {
  await seedAdminUser();

  const existing = await prisma.project.findFirst({ where: { name: "Demo: The Internet (login page)" } });
  if (existing) {
    console.log("Demo project already exists, skipping seed.");
    return;
  }

  const project = await prisma.project.create({
    data: {
      name: "Demo: The Internet (login page)",
      urls: {
        create: {
          url: "https://the-internet.herokuapp.com/login",
        },
      },
    },
    include: { urls: true },
  });

  console.log(`Seeded project "${project.name}" (${project.id}) with URL ${project.urls[0].url}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
