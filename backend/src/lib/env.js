// Load local configuration before modules read process.env. Shell/deployment values win.
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// backend/.env takes precedence over the project-root .env.
dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
