import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.yeolmaestudio.ilgamcheck",
  appName: "일감체크",
  webDir: "dist/client",
  server: {
    androidScheme: "https",
  },
};

export default config;
