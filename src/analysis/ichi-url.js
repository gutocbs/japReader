const createIchiMoeUrl = (text) =>
  `https://ichi.moe/cl/qr/?q=${encodeURIComponent(text)}&r=kana`;

module.exports = { createIchiMoeUrl };
