// Обычный ESM-скрипт — не тянем ts-node/tsx только ради одного seed-файла.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Демо-пространства "из коробки" — как в прототипе продукта.
// Создаются один раз, на пустой базе; дальше содержимое вики целиком
// принадлежит владельцу (см. main ниже).
const SPACES = [
  { slug: "company", name: "Компания", description: "Миссия, ценности, структура, политики и внутренние процессы.", icon: "building-2", color: "indigo" },
  { slug: "product", name: "Продукт", description: "Документация, планы развития, исследования и релизы.", icon: "package", color: "blue" },
  { slug: "marketing", name: "Маркетинг", description: "Стратегии, кампании, исследования и бренд-материалы.", icon: "megaphone", color: "pink" },
  { slug: "sales", name: "Продажи", description: "Презентации, скрипты, возражения и кейсы.", icon: "trending-up", color: "violet" },
  { slug: "support", name: "Поддержка", description: "Стандарты обслуживания и ответы на частые вопросы.", icon: "headphones", color: "amber" },
  { slug: "hr", name: "HR", description: "Документы, процессы, льготы и развитие сотрудников.", icon: "users", color: "emerald" },
  { slug: "finance", name: "Финансы", description: "Бюджеты, отчётность и финансовые процессы.", icon: "banknote", color: "teal" },
  { slug: "it", name: "IT", description: "Инфраструктура, доступы, гайды и безопасность.", icon: "server", color: "slate" },
];

async function main() {
  // Только на пустой базе, то есть при самом первом запуске.
  //
  // Раньше здесь был безусловный upsert по slug, а сид гоняется при КАЖДОМ
  // старте контейнера — значит удалённое владельцем демо-пространство
  // возвращалось после первого же деплоя или перезагрузки сервера
  // (проверено живым тестом). На чистовом проде это означало, что вычистить
  // демо-контент невозможно в принципе.
  const existing = await prisma.space.count();
  if (existing > 0) {
    console.log(`Пространства уже есть (${existing}) — демо-сид пропущен.`);
    return;
  }

  for (const space of SPACES) {
    await prisma.space.create({ data: space });
  }
  console.log(`Засеяно пространств: ${SPACES.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
