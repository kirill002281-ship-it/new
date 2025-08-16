import "dotenv/config";
import express from "express";
import { Telegraf, Markup } from "telegraf";
import { createReadStream, existsSync } from "fs";
import path from "path";

const { BOT_TOKEN, OFFER_URL, START_IMG, FINAL_IMG } = process.env;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN is missing");

const bot = new Telegraf(BOT_TOKEN);

/**
 * Вопросы: 10 штук (первые 6 поп-культура, 7–10 — с казино-тематикой).
 * Для каждого вопроса можно указать локальную картинку (./images/...) или URL.
 */
const questions = [
  {
    text: "Какое прозвище получил Уолтер Уайт в сериале «Во все тяжкие»?",
    img: "./images/walter.png",
    opts: ["Хайзенберг", "Блэк Джек", "Док", "Мистер Уайт"],
    correct: 0,
  },
  {
    text: "Как называется кафе, где встречаются герои сериала «Друзья»?",
    img: "./images/friends_cafe.jpg",
    opts: ["Central Perk", "Central Park", "Coffee Time", "Perk Central"],
    correct: 0,
  },
  {
    text: "Как зовут капитана, которого играет Джонни Депп в «Пиратах Карибского моря»?",
    img: "./images/pirates_jack.jpg",
    opts: ["Джек Воробей", "Уилл Тёрнер", "Капитан Немо", "Гектор Барбосса"],
    correct: 0,
  },
  {
    text: "Кто сидит на Железном троне в начале «Игры престолов»?",
    img: "./images/got_throne.jpg",
    opts: [
      "Роберт Баратеон",
      "Джофри Баратеон",
      "Тайвин Ланнистер",
      "Дейенерис Таргариен",
    ],
    correct: 0,
  },
  {
    text: "Как называется магическая игра на метлах в «Гарри Поттере»?",
    img: "./images/harry_quidditch.jpg",
    opts: ["Квиддич", "Снитчбол", "Флэтбол", "Гривон"],
    correct: 0,
  },
  {
    text: "В каком фильме команда друзей разрабатывает дерзкий план в городе, который никогда не спит?",
    img: "./images/oceans11_city.jpg",
    opts: ["Оушен 11", "Большой куш", "Иллюзия обмана", "Афёра Томаса Крауна"],
    correct: 0,
  },
  // ===== КАЗИНО (7–10) =====
  {
    text: "В каком фильме Джеймс Бонд играет в покер против Ле Шиффра?",
    img: "./images/bond_casino_royale.jpg",
    opts: [
      "Казино Рояль",
      "Квантом милосердия",
      "Голдфингер",
      "Умри, но не сейчас",
    ],
    correct: 0,
  },
  {
    text: "Фильм, основанный на реальной истории студентов MIT, обыгравших казино в блэкджек?",
    img: "./images/film_21.jpg",
    opts: ["Двадцать одно", "Большой куш", "Игра Молли", "Шулера"],
    correct: 0,
  },
  {
    text: "В каком фильме показана история женщины, организовавшей подпольные покерные игры?",
    img: "./images/mollys_game.jpg",
    opts: [
      "Игра Молли",
      "Шулера",
      "Человек, который изменил всё",
      "Стив Джобс",
    ],
    correct: 0,
  },
  {
    text: "В фильме «Игрок» (The Gambler, 2014) герой Марка Уолберга в начале фильма выиграл в блэкджек…",
    img: "./images/the_gambler_blackjack.jpg",
    opts: ["20 000$", "40 000$", "60 000$", "80 000$"],
    correct: 1,
  },
];

// Сессии: chatId -> { idx, score, correctBtn }
const sessions = new Map();

// Перемешивание индексов
function shuffleIndexes(n) {
  return Array.from({ length: n }, (_, i) => i)
    .map((i) => ({ i, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map((o) => o.i);
}

function keyboardFromOptions(options) {
  return Markup.inlineKeyboard(
    options.map((label, i) => Markup.button.callback(label, `a_${i}`)),
    { columns: 2 },
  );
}

// Безопасная подготовка фото (локальный файл/URL) с фолбэком
function photoInput(pathOrUrl) {
  if (!pathOrUrl) return undefined;
  const isUrl = /^https?:\/\//i.test(pathOrUrl);
  if (isUrl) return { url: pathOrUrl };
  const abs = path.resolve(process.cwd(), pathOrUrl);
  if (!existsSync(abs)) return undefined; // файла нет — вернём undefined
  return { source: createReadStream(abs) };
}

async function sendQuestion(ctx) {
  const chatId = ctx.chat.id;
  const s = sessions.get(chatId);
  const q = questions[s.idx];

  // Перемешиваем варианты, запоминаем правильный индекс
  const order = shuffleIndexes(q.opts.length);
  const mixedOpts = order.map((k) => q.opts[k]);
  const correctBtn = order.indexOf(q.correct);
  s.correctBtn = correctBtn;

  const caption = `Вопрос ${s.idx + 1}/${questions.length}:\n${q.text}`;

  try {
    const input = photoInput(q.img);
    if (input) {
      await ctx.replyWithPhoto(input, {
        caption,
        ...keyboardFromOptions(mixedOpts),
      });
    } else {
      await ctx.reply(caption, keyboardFromOptions(mixedOpts));
    }
  } catch (err) {
    console.error("sendQuestion photo error:", err);
    await ctx.reply(caption, keyboardFromOptions(mixedOpts));
  }
}

// START и рестарт
bot.start(async (ctx) => {
  sessions.set(ctx.chat.id, { idx: 0, score: 0, correctBtn: null });

  const startImage = START_IMG || "./images/start.jpg"; // 1080x1350/1920
  const startInput = photoInput(startImage);
  const startCaption =
    "🎬 Думаешь, знаешь фильмы и сериалы лучше всех? Докажи это в нашем квизе!\n" +
    "Тебя ждёт 10 вопросов о фильмах и сериалах из разных категорий — от классики до современных хитов.\n\n" +
    "🔥 И самое главное — за правильные ответы тебя ждёт эксклюзивный приз, который можно забрать только после прохождения!\n\n" +
    "Готов начать и забрать свой приз?";

  if (startInput) {
    await ctx.replyWithPhoto(startInput, {
      caption: startCaption,
      ...Markup.inlineKeyboard([
        Markup.button.callback("Начать", "start_quiz"),
      ]),
    });
  } else {
    await ctx.reply(
      startCaption,
      Markup.inlineKeyboard([Markup.button.callback("Начать", "start_quiz")]),
    );
  }
});

bot.action("start_quiz", async (ctx) => {
  sessions.set(ctx.chat.id, { idx: 0, score: 0, correctBtn: null });
  await sendQuestion(ctx);
});

// обработка ответов a_0..a_3
bot.action(/a_\d+/, async (ctx) => {
  const chatId = ctx.chat.id;
  const s = sessions.get(chatId);
  if (!s) return ctx.answerCbQuery("Нажми /start, чтобы начать");

  const picked = Number(ctx.match[0].split("_")[1]);

  if (picked === s.correctBtn) {
    s.score++;
    await ctx.answerCbQuery("✅ Верно!");
  } else {
    await ctx.answerCbQuery("❌ Неверно");
  }

  s.idx++;

  if (s.idx < questions.length) {
    await sendQuestion(ctx);
  } else {
    const url = OFFER_URL || "https://example.com";

    const finalImage = FINAL_IMG || "./images/bonus-final.jpg"; // 1080x1350/1920 вертикаль
    const finalInput = photoInput(finalImage);
    const finalCaption =
      `🏁 Квиз окончен!\n` +
      `Ты ответил правильно на ${s.score} из ${questions.length}.\n\n` +
      `🎁 Жми, чтобы забрать свой персональный приз — он исчезнет через 1 час!`;

    if (finalInput) {
      await ctx.replyWithPhoto(finalInput, {
        caption: finalCaption,
        ...Markup.inlineKeyboard([
          Markup.button.url("Забрать приз", url),
          Markup.button.callback("Пройти ещё раз", "start_quiz"),
        ]),
      });
    } else {
      await ctx.reply(
        finalCaption,
        Markup.inlineKeyboard([
          Markup.button.url("Забрать приз", url),
          Markup.button.callback("Пройти ещё раз", "start_quиз"),
        ]),
      );
    }

    sessions.delete(chatId);
  }
});

// Keep-alive для Replit
const app = express();
app.get("/", (_, res) => res.send("OK"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Keep-alive on :" + PORT));

// Запуск long polling
bot.launch().then(() => console.log("Bot started"));

// Корректное завершение
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
