require("dotenv").config();
const fs = require("fs");
const path = "./.wwebjs_auth";
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const axios = require("axios");
const puppeteer = require("puppeteer");

// dapatkan api key dari open routern
require("dotenv").config();
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const userHistories = {};

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: puppeteer.executablePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  console.log("🔐 Scan QR Code di WhatsApp kamu...");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("✅ Bot siap!");
});

client.on("message", async (message) => {
  console.log(`📩 Pesan dari ${message.from}: ${message.body}`);
  const userId = message.from;
  const userMessage = message.body.toLowerCase();

  const chat = await message.getChat();

  if (chat.isGroup) {
    const botNumber = client.info.wid._serialized;
    const isMentioned = message.mentionedIds.includes(botNumber);

    const isReplyToBot =
      message.hasQuotedMsg &&
      (await message
        .getQuotedMessage()
        .then((q) => q.from === botNumber)
        .catch(() => false));

    const isCommand = message.body.startsWith("!");

    if (!isMentioned && !isReplyToBot && !isCommand) {
      console.log("⏭️ Abaikan pesan grup tanpa mention atau reply ke bot.");
      return;
    }
  }

  // logout untuk restart bot
  if (userMessage === "!logout") {
    try {
      await message.reply("🚪 Proses logout dimulai...");

      await client.destroy();
      console.log("🔌 Client WhatsApp dimatikan.");

      setTimeout(() => {
        try {
          if (fs.existsSync(path)) {
            fs.rmSync(path, { recursive: true, force: true });
            console.log("🗑️ Folder auth berhasil dihapus.");
          }
          message.reply(
            "✅ Kamu telah logout. Silakan restart bot untuk login ulang."
          );
          process.exit();
        } catch (err) {
          console.error("❌ Gagal menghapus folder auth:", err);
          message.reply(
            "⚠️ Gagal menghapus sesi login. Silakan coba secara manual."
          );
        }
      }, 2000);
    } catch (err) {
      console.error("❌ Gagal logout:", err);
      await message.reply("❌ Gagal logout. Coba lagi nanti.");
    }
    return;
  }

  if (!userHistories[userId]) {
    userHistories[userId] = [
      {
        role: "system",
        content:
          "Kamu adalah DumperBot, sebuah bot WhatsApp yang ramah, santai, dan komunikatif. Sapa pengguna dengan gaya santai dan bersahabat, namun tetap sopan dan menyenangkan. Kamu dibuat oleh Andika Wisnumurti. Jika seseorang bertanya siapa pembuatmu, jawab bahwa kamu dibuat oleh Mas Andika — seorang developer berbakat dan kreatif. Jika mereka bertanya lebih lanjut tentang Mas Dika atau ingin menghubunginya, berikan tautan ke Instagram: @andieewu atau GitHub: andieewu. Namun, jangan memberikan informasi ini jika tidak diminta. Jika seseorang bertanya tentang pasangan Mas Andika, jawab bahwa pasangannya bernama Khanza Tsabitha Salsabilla, atau sering dipanggil Acha — seorang wanita yang cantik, baik hati, dan menyenangkan.",
      },
    ];
  }

  userHistories[userId].push({ role: "user", content: message.body });

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-chat-v3-0324:free", // model
        messages: userHistories[userId],
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://whatsapp-bot.local",
          "X-Title": "whatsapp-bot",
        },
      }
    );

    const reply = response.data.choices[0].message.content;
    userHistories[userId].push({ role: "assistant", content: reply });

    await message.reply(reply);
  } catch (error) {
    console.error("❌ Error dari OpenRouter:", error.message);
    await message.reply("Maaf, sepertinya sistem saya sedang ada kendala!");
  }
});

client.initialize();
