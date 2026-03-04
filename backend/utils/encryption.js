const crypto = require("crypto");

const algorithm = "aes-256-cbc";
const secret = crypto
  .createHash("sha256")
  .update(process.env.ENCRYPTION_SECRET)
  .digest();

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, secret, iv);

  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text) {
  const parts = text.split(":");
  const iv = Buffer.from(parts.shift(), "hex");
  const encryptedText = Buffer.from(parts.join(":"), "hex");

  const decipher = crypto.createDecipheriv(algorithm, secret, iv);

  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString();
}

module.exports = { encrypt, decrypt };