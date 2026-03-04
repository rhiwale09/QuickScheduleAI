const prisma = require("../db");
const { encrypt, decrypt } = require("../utils/encryption");

/**
 * Create or update a user with Google tokens
 */
async function upsertUserWithGoogle(email, tokens) {
  try {
    const updateData = {
      googleConnected: true,
    };

    if (tokens.refresh_token) {
      updateData.googleRefreshToken = encrypt(tokens.refresh_token);
    }

    if (tokens.access_token) {
      updateData.googleAccessToken = tokens.access_token;
    }

    if (tokens.expiry_date) {
      updateData.tokenExpiry = new Date(tokens.expiry_date);
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: updateData,
      create: {
        email,
        googleConnected: true,
        googleRefreshToken: tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : null,
        googleAccessToken: tokens.access_token || null,
        tokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : null,
      },
    });

    return user;
  } catch (error) {
    console.error("User upsert error:", error);
    throw error;
  }
}

/**
 * Get user by email
 */
async function getUserByEmail(email) {
  return prisma.user.findUnique({
    where: { email },
  });
}

/**
 * Mark Google as disconnected
 */
async function disconnectGoogle(email) {
  return prisma.user.update({
    where: { email },
    data: { googleConnected: false },
  });
}

module.exports = {
  upsertUserWithGoogle,
  getUserByEmail,
  disconnectGoogle,
};