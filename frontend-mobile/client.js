import axios from "axios";
import Constants from "expo-constants";

const API_BASE =
  Constants.expoConfig?.extra?.API_BASE_URL ||
  "http://192.168.1.206:5000"; // dev: your laptop IP
export const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
});

export const setTimezone = (timeZone) =>
  api.post("/api/set-timezone", { timeZone }).then((r) => r.data);

export const parseText = (text) =>
  api.post("/parse-text", { text }).then((r) => r.data);

export const uploadFileMobile = (asset) => {
  const formData = new FormData();
  formData.append("file", {
    uri: asset.uri,
    name: asset.name || "upload",
    type: asset.mimeType || "application/octet-stream",
  });

  return api
    .post("/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
};

export const createEvents = (events) =>
  api.post("/create-events", { events }).then((r) => r.data);

export const exportICS = (events) =>
  api.post("/export-ics", { events }, { responseType: "text" }).then((r) => r.data);