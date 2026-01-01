// hashAdmin.js
import bcrypt from "bcryptjs";

const plainPassword = "admin@123";

const generateHash = async () => {
  const hash = await bcrypt.hash(plainPassword, 10);
  console.log("Hashed password:", hash);
};

generateHash();
