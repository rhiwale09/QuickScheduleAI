export default ({ config }) => ({
  ...config,
  name: "QuickScheduleAI",
  slug: "quickscheduleai",
  ios: {
    bundleIdentifier: "com.yourcompany.quickscheduleai",
    buildNumber: "1",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.yourcompany.quickscheduleai",
    versionCode: 1,
  },
  extra: {
    API_BASE_URL: process.env.API_BASE_URL || "http://192.168.1.206:5000",
    eas: {
      projectId: "28ac1c8d-1427-406c-b129-47032fe90b96",
    },
  },
});