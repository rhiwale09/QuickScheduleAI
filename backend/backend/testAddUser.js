require("dotenv").config(); // load .env
const prisma = require("./db"); // adjust if your db.js path is different
const { encrypt } = require("./utils/encryption"); // your encryption module

async function addUser(email, refreshToken) {
  try {
    const encryptedToken = encrypt(refreshToken);

    const user = await prisma.user.create({
      data: {
        email,
        google_refresh_token: encryptedToken,
        google_connected: true,
      },
    });

    console.log("✅ User added successfully:", user);
  } catch (err) {
    console.error("❌ Error adding user:", err);
  } finally {
    await prisma.$disconnect();
  }
}

// Wrap in async IIFE to allow top-level async
(async () => {
  const testEmail = "user@example.com";        // <-- replace with your test email
  const testRefreshToken = "1//example_token"; // <-- replace with test token

  await addUser(testEmail, testRefreshToken);
})();