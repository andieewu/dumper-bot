const fs = require("fs");
const path = "./.wwebjs_auth";
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const puppeteer = require("puppeteer");

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

async function replyWithTyping(chat, message, replyText, delay = 1000) {
  try {
    if (!chat || !message || !replyText) {
      console.warn("⛔ replyWithTyping: chat/message kosong!");
      return;
    }

    await chat.sendStateTyping();
    await new Promise((resolve) => setTimeout(resolve, delay));

    if (typeof message.reply === "function") {
      await message.reply(replyText);
    } else if (message.from && typeof message.from === "string") {
      try {
        await client.sendMessage(message.from, replyText);
      } catch (err) {
        console.error("❌ Gagal kirim pesan langsung:", err);
      }
    }

    await chat.clearState();
  } catch (err) {
    console.error("❌ Gagal di replyWithTyping:", err);
  }
}

const userSettingsFile = "./user-settings.json";

function loadUserSettings() {
  if (fs.existsSync(userSettingsFile)) {
    return JSON.parse(fs.readFileSync(userSettingsFile));
  }
  return {};
}

function saveUserSettings(settings) {
  fs.writeFileSync(userSettingsFile, JSON.stringify(settings, null, 2));
}

const pendingStickerConfirmations = new Map();
const pendingImageConfirmations = new Map();

client.on("message", async (message) => {
  const chat = await message.getChat();
  const rawMessage = message.body?.trim() || "";
  let userMessage = rawMessage.toLowerCase();
  const botNumber = client.info.wid._serialized;

  console.log(
    `📩 Pesan masuk dari ${message.from}: [${message.type}] ${
      rawMessage || "(media/sticker)"
    }`
  );

  if (pendingStickerConfirmations.size > 0) {
    const confirmation = userMessage;
    const pendingEntry = [...pendingStickerConfirmations.values()].find(
      (entry) => entry.userId === message.from
    );

    if (pendingEntry) {
      if (confirmation === "y" || confirmation === "ya") {
        const media = pendingEntry.media;
        if (!media) {
          await replyWithTyping(chat, message, "❌ Gagal mengunduh media.");
        } else {
          await chat.sendStateTyping();
          await new Promise((r) => setTimeout(r, 1000));
          await chat.sendMessage(media, { caption: "🖼️ Ini gambarnya ya!" });
          await chat.clearState();
        }
      } else if (confirmation === "n" || confirmation === "tidak") {
        await replyWithTyping(
          chat,
          message,
          "👍 Oke, stiker tidak dijadikan gambar."
        );
      } else {
        await replyWithTyping(
          chat,
          message,
          "❓ Pilih Y untuk ya atau N untuk tidak."
        );
        return;
      }

      for (const [key, value] of pendingStickerConfirmations.entries()) {
        if (value.userId === message.from) {
          pendingStickerConfirmations.delete(key);
          break;
        }
      }
      return;
    }
  }

  if (pendingImageConfirmations.size > 0) {
    const confirmation = userMessage;
    const pendingEntry = [...pendingImageConfirmations.values()].find(
      (entry) => entry.userId === message.from
    );

    if (pendingEntry) {
      if (confirmation === "y" || confirmation === "ya") {
        const media = pendingEntry.media;
        if (!media) {
          await replyWithTyping(chat, message, "❌ Gagal mengunduh media.");
        } else {
          await chat.sendStateTyping();
          await new Promise((r) => setTimeout(r, 1000));
          await chat.sendMessage(media, { sendMediaAsSticker: true });
          await chat.clearState();
        }
      } else if (confirmation === "n" || confirmation === "tidak") {
        await replyWithTyping(chat, message, "👍 Oke, tidak dijadikan stiker.");
      } else {
        await replyWithTyping(
          chat,
          message,
          "❓ Pilih Y untuk ya atau N untuk tidak."
        );
        return;
      }

      for (const [key, value] of pendingImageConfirmations.entries()) {
        if (value.userId === message.from) {
          pendingImageConfirmations.delete(key);
          break;
        }
      }
      return;
    }
  }

  if (message.type === "sticker") {
    const isMentioned = message.mentionedIds.includes(botNumber);
    const isReplyToBot =
      message.hasQuotedMsg &&
      (await message
        .getQuotedMessage()
        .then((q) => q.from === botNumber)
        .catch(() => false));

    if (chat.isGroup && !isMentioned && !isReplyToBot) return;

    const media = await message.downloadMedia();
    if (!media) {
      await replyWithTyping(chat, message, "❌ Gagal mengunduh stiker.");
      return;
    }

    pendingStickerConfirmations.set(message.id._serialized, {
      userId: message.from,
      chatId: message.from,
      media: media,
    });

    await replyWithTyping(
      chat,
      message,
      "🤔 Apakah stiker ini ingin dijadikan gambar? (Y/N)"
    );
    return;
  }

  if (message.type === "image") {
    const isMentioned = message.mentionedIds.includes(botNumber);
    const isReplyToBot =
      message.hasQuotedMsg &&
      (await message
        .getQuotedMessage()
        .then((q) => q?.from === botNumber)
        .catch(() => false));

    if (!chat.isGroup || isMentioned || isReplyToBot) {
      const media = await message.downloadMedia();
      if (!media) {
        await replyWithTyping(chat, message, "❌ Gagal mengunduh gambar.");
        return;
      }

      pendingImageConfirmations.set(message.id._serialized, {
        userId: message.from,
        chatId: message.from,
        media: media,
      });

      await replyWithTyping(
        chat,
        message,
        "🤔 Apakah gambar ini ingin dijadikan stiker? (Y/N)"
      );
      return;
    }
  }

  if (userMessage === "/tosticker") {
    if (message.hasMedia) {
      const media = await message.downloadMedia();
      if (!media) {
        await replyWithTyping(chat, message, "❌ Gagal mengunduh media.");
        return;
      }
      await chat.sendStateTyping();
      await new Promise((r) => setTimeout(r, 1000));
      await chat.sendMessage(media, { sendMediaAsSticker: true });
      await chat.clearState();
      return;
    } else if (message.hasQuotedMsg) {
      const quoted = await message.getQuotedMessage();
      if (
        quoted.hasMedia &&
        quoted._data.mimetype.startsWith("image/") &&
        !quoted._data.mimetype.includes("webp")
      ) {
        const media = await quoted.downloadMedia();
        if (!media) {
          await replyWithTyping(chat, message, "❌ Gagal mengunduh gambar.");
          return;
        }
        await chat.sendStateTyping();
        await new Promise((r) => setTimeout(r, 1000));
        await chat.sendMessage(media, { sendMediaAsSticker: true });
        await chat.clearState();
        return;
      } else {
        await replyWithTyping(
          chat,
          message,
          "⚠️ Reply ke *gambar* untuk dijadikan stiker!"
        );
        return;
      }
    } else {
      await replyWithTyping(
        chat,
        message,
        "⚠️ Kirim atau reply ke *gambar* untuk dijadikan stiker!"
      );
      return;
    }
  }

  if (userMessage === "/toimage") {
    if (message.hasQuotedMsg) {
      const quoted = await message.getQuotedMessage();
      if (quoted.hasMedia && quoted._data.mimetype === "image/webp") {
        const media = await quoted.downloadMedia();
        if (!media) {
          await replyWithTyping(chat, message, "❌ Gagal mengunduh stiker.");
          return;
        }
        await chat.sendStateTyping();
        await new Promise((r) => setTimeout(r, 1000));
        await chat.sendMessage(media, { caption: "🖼️ Ini gambarnya ya!" });
        await chat.clearState();
        return;
      } else {
        await replyWithTyping(
          chat,
          message,
          "⚠️ Reply ke *stiker* untuk dijadikan gambar!"
        );
        return;
      }
    } else {
      await replyWithTyping(
        chat,
        message,
        "⚠️ Reply ke *stiker* untuk dijadikan gambar!"
      );
      return;
    }
  }

  if (chat.isGroup) {
    const isMentioned = message.mentionedIds.includes(botNumber);
    const isReplyToBot =
      message.hasQuotedMsg &&
      (await message
        .getQuotedMessage()
        .then((q) => q.from === botNumber)
        .catch(() => false));
    const isCommand = userMessage.startsWith("!");

    if (!isMentioned && !isReplyToBot && !isCommand) {
      console.log("⏭️ Abaikan pesan grup tanpa mention atau reply ke bot.");
      return;
    }

    if (isMentioned) {
      const botNameRegex = /@\w+/g;
      const messageWithoutMentions = rawMessage
        .replace(botNameRegex, "")
        .trim();
      userMessage = messageWithoutMentions.toLowerCase();

      if (userMessage === "") {
        await replyWithTyping(
          chat,
          message,
          "Yo! 😎 Ada yang manggil DumperBot? Ketik */menu* buat lihat daftar perintah."
        );
        return;
      }
    }
  }

  // USER SETTINGS & COMMANDS
  const userId = message.from;
  let userSettings = loadUserSettings();
  let timezone = userSettings[userId]?.timezone || "Asia/Jakarta";

  switch (userMessage) {
    case "/menu":
      await message.reply(
        `📋 *MENU DumperBot*\n\n` +
          `👋 /halo       – Sapa bot\n` +
          `👨‍💻 /creator    – Info pembuat bot\n` +
          `🕒 /waktu      – Lihat waktu sekarang\n` +
          `🖼️ /tosticker  – Ubah gambar jadi stiker\n` +
          `🔁 /toimage    – Ubah stiker jadi gambar`
      );
      break;

    case "/halo":
      await replyWithTyping(
        chat,
        message,
        "Yo! 😎 Ada yang bisa DumperBot bantuin?"
      );
      break;

    case "/creator":
      await replyWithTyping(
        chat,
        message,
        `👨‍💻 *Tentang DumperBot*\n` +
          `Dibuat oleh *Mas Dika* yang super kece! 😎\n\n` +
          `🔗 *Instagram*: https://www.instagram.com/andieewu\n` +
          `💻 *GitHub*   : https://github.com/andieewu`
      );
      break;

    case "/waktu":
      const waktu = new Date().toLocaleString("id-ID", { timeZone: timezone });
      await replyWithTyping(
        chat,
        message,
        `🕒 Zona waktu kamu: *${timezone}*\nWaktu sekarang: ${waktu}`
      );
      break;

    case rawMessage.toLowerCase().startsWith("/setlokasi")
      ? rawMessage.toLowerCase()
      : "":
      const parts = rawMessage.split(" ");
      if (parts.length >= 2) {
        const tz = parts[1];
        try {
          new Date().toLocaleString("id-ID", { timeZone: tz });
          if (!userSettings[userId]) userSettings[userId] = {};
          userSettings[userId].timezone = tz;
          saveUserSettings(userSettings);
          await replyWithTyping(
            chat,
            message,
            `✅ Zona waktu disetel ke *${tz}*`
          );
        } catch (err) {
          await replyWithTyping(
            chat,
            message,
            `❌ Zona waktu tidak valid. Contoh: /setlokasi Asia/Jakarta`
          );
        }
      } else {
        await replyWithTyping(
          chat,
          message,
          `❗ Gunakan format: */setlokasi Asia/Jakarta*`
        );
      }
      break;

    case "/logout":
      await replyWithTyping(chat, message, "🚪 Logout dimulai...");
      try {
        await client.destroy();
        if (fs.existsSync(path)) {
          fs.rmSync(path, { recursive: true, force: true });
        }
        console.log("✅ Client dimatikan dan auth folder dihapus.");
        process.exit();
      } catch (err) {
        console.error("❌ Gagal logout:", err);
        await replyWithTyping(chat, message, "❌ Gagal logout.");
      }
      break;

    default:
      await replyWithTyping(
        chat,
        message,
        `Hai *DumperBot* disini!\nKetik */menu* buat lihat daftar perintah.`
      );
  }
});

client.initialize();
