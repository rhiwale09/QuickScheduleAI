import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import Constants from "expo-constants";
import { api } from "./client";

function fmt(d) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
}

export default function App() {
  const [textInput, setTextInput] = useState("");
  const [events, setEvents] = useState([]); // [{id,title,start,end,location,description,recurrence,ambiguous}]
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // For editing dates
  const [picker, setPicker] = useState({
    show: false,
    eventId: null,
    field: null, // "start" | "end"
    value: new Date(),
  });

  const API_BASE =
    Constants.expoConfig?.extra?.API_BASE_URL ||
    "http://192.168.1.206:5000";

  // Send timezone ONCE at startup
  useEffect(() => {
    (async () => {
      try {
        const tz =
          Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || "UTC";
        await api.post("/api/set-timezone", { timeZone: tz });
        console.log("🌍 Timezone sent:", tz);
      } catch (e) {
        console.warn("Timezone send failed:", e?.message || e);
      }
    })();
  }, []);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => new Date(a.start) - new Date(b.start));
  }, [events]);

  const selectAll = () => {
    const s = new Set(events.map((e) => e.id));
    setSelectedIds(s);
  };

  const clearSelection = () => setSelectedIds(new Set());

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteEvent = (id) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const updateField = (id, field, value) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const openDatePicker = (eventId, field, currentIso) => {
    const current = currentIso ? new Date(currentIso) : new Date();
    setPicker({ show: true, eventId, field, value: current });
  };

  const onDatePicked = (event, date) => {
    if (Platform.OS === "android") {
      // Android closes picker immediately
      setPicker((p) => ({ ...p, show: false }));
    }
    if (!date) return;
    const iso = new Date(date).toISOString();
    setEvents((prev) =>
      prev.map((e) =>
        e.id === picker.eventId
          ? { ...e, [picker.field]: iso, ambiguous: false }
          : e
      )
    );
  };

  // ================= PICK FILE + UPLOAD =================
  const handlePickAndUpload = async () => {
    try {
      setMessage("");
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: "*/*",
      });

      if (picked.canceled) return;

      const asset = picked.assets?.[0];
      if (!asset?.uri) return;

      setLoading(true);

      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.name || "upload",
        type: asset.mimeType || "application/octet-stream",
      });

      const res = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = res.data;

      setTextInput(data.rawText || "");
      const evts = (data.events || []).map((e, idx) => ({
        ...e,
        id: e.id ?? idx + 1,
      }));

      setEvents(evts);
      setSelectedIds(new Set(evts.map((e) => e.id)));
      setMessage(
        evts.length
          ? `✅ Extracted ${evts.length} events`
          : "⚠️ No events found"
      );
    } catch (err) {
      console.error("UPLOAD ERROR:", err?.response?.data || err?.message || err);
      Alert.alert("Upload failed", String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  // ================= PARSE TEXT =================
  const handleParseText = async () => {
    if (!textInput.trim()) {
      Alert.alert("Missing text", "Please paste some text/email first.");
      return;
    }
    try {
      setLoading(true);
      setMessage("");

      const res = await api.post("/parse-text", { text: textInput });
      const evts = (res.data.events || []).map((e, idx) => ({
        ...e,
        id: e.id ?? idx + 1,
      }));

      setEvents(evts);
      setSelectedIds(new Set(evts.map((e) => e.id)));
      setMessage(
        evts.length ? `✅ Parsed ${evts.length} events` : "⚠️ No events found"
      );
    } catch (err) {
      console.error("PARSE ERROR:", err?.response?.data || err?.message || err);
      Alert.alert("Parse failed", String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  // ================= CREATE CALENDAR EVENTS (server side) =================
  const handleCreateEvents = async () => {
    const selectedEvents = events.filter((e) => selectedIds.has(e.id));
    if (!selectedEvents.length) {
      Alert.alert("No events selected", "Select at least one event.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      // Optional: batch to avoid large payloads
      const BATCH = 25;
      for (let i = 0; i < selectedEvents.length; i += BATCH) {
        const chunk = selectedEvents.slice(i, i + BATCH);
        await api.post("/create-events", { events: chunk });
      }

      setMessage(`✅ Created ${selectedEvents.length} calendar events`);
      // Stay on same page; do NOT wipe UI unless you want:
      // setEvents([]); setSelectedIds(new Set()); setTextInput("");
    } catch (err) {
      console.error("CREATE ERROR:", err?.response?.data || err?.message || err);
      Alert.alert("Create failed", String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  // ================= EXPORT ICS (download + share) =================
  const handleExportICS = async () => {
    const selectedEvents = events.filter((e) => selectedIds.has(e.id));
    if (!selectedEvents.length) {
      Alert.alert("No events selected", "Select at least one event.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      // get ICS as text
      const res = await api.post(
        "/export-ics",
        { events: selectedEvents },
        { responseType: "text" }
      );

      const icsText = res.data;
      const fileUri = FileSystem.cacheDirectory + "events.ics";
      await FileSystem.writeAsStringAsync(fileUri, icsText, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "text/calendar",
          dialogTitle: "Share events.ics",
        });
      } else {
        Alert.alert("Saved", `ICS saved at:\n${fileUri}`);
      }

      setMessage(`✅ Exported ${selectedEvents.length} events to ICS`);
    } catch (err) {
      console.error("EXPORT ERROR:", err?.response?.data || err?.message || err);
      Alert.alert("Export failed", String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const Header = (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>📅 QuickScheduleAI</Text>
      <Text style={{ marginTop: 6, opacity: 0.7 }}>
        API: {API_BASE}
      </Text>

      <View style={{ height: 12 }} />

      <Pressable
        onPress={handlePickAndUpload}
        style={{
          backgroundColor: "#111",
          padding: 12,
          borderRadius: 10,
          alignItems: "center",
          marginBottom: 10,
        }}
        disabled={loading}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>
          {loading ? "Working..." : "📎 Pick File & Extract"}
        </Text>
      </Pressable>

      <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
        📝 Or paste email/text
      </Text>

      <TextInput
        value={textInput}
        onChangeText={setTextInput}
        placeholder="Paste your email or meeting text here..."
        multiline
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 10,
          padding: 12,
          minHeight: 120,
          textAlignVertical: "top",
          backgroundColor: "#fff",
        }}
      />

      <View style={{ height: 10 }} />

      <Pressable
        onPress={handleParseText}
        style={{
          backgroundColor: "#2b6",
          padding: 12,
          borderRadius: 10,
          alignItems: "center",
        }}
        disabled={loading}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>
          {loading ? "Parsing..." : "Parse Text"}
        </Text>
      </Pressable>

      <View style={{ height: 12 }} />

      {!!events.length && (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={handleCreateEvents}
            style={{
              flex: 1,
              backgroundColor: "#1a73e8",
              padding: 12,
              borderRadius: 10,
              alignItems: "center",
            }}
            disabled={loading}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>
              {loading ? "Creating..." : "📅 Create Events"}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleExportICS}
            style={{
              flex: 1,
              backgroundColor: "#555",
              padding: 12,
              borderRadius: 10,
              alignItems: "center",
            }}
            disabled={loading}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>💾 Export ICS</Text>
          </Pressable>
        </View>
      )}

      {!!events.length && (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <Pressable
            onPress={selectAll}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "#ddd",
              padding: 10,
              borderRadius: 10,
              alignItems: "center",
              backgroundColor: "#fff",
            }}
          >
            <Text style={{ fontWeight: "700" }}>Select All</Text>
          </Pressable>

          <Pressable
            onPress={clearSelection}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "#ddd",
              padding: 10,
              borderRadius: 10,
              alignItems: "center",
              backgroundColor: "#fff",
            }}
          >
            <Text style={{ fontWeight: "700" }}>Clear</Text>
          </Pressable>
        </View>
      )}

      {loading && (
        <View style={{ marginTop: 12, alignItems: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 6, opacity: 0.7 }}>Processing…</Text>
        </View>
      )}

      {message ? (
        <Text style={{ marginTop: 12, color: "green", fontWeight: "700" }}>
          {message}
        </Text>
      ) : null}

      {!!events.length && (
        <Text style={{ marginTop: 12, fontWeight: "700" }}>
          Detected Events ({events.length}) — tap to edit
        </Text>
      )}
    </View>
  );

  const renderEvent = ({ item }) => {
    const selected = selectedIds.has(item.id);

    return (
      <View
        style={{
          marginHorizontal: 16,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 12,
          padding: 12,
          backgroundColor: "#fff",
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Pressable onPress={() => toggleSelect(item.id)}>
            <Text style={{ fontSize: 18 }}>
              {selected ? "✅" : "⬜️"}{" "}
              <Text style={{ fontWeight: "800" }}>{item.title || "Untitled"}</Text>
            </Text>
          </Pressable>

          <Pressable onPress={() => deleteEvent(item.id)}>
            <Text style={{ color: "red", fontWeight: "800" }}>Delete</Text>
          </Pressable>
        </View>

        <View style={{ height: 10 }} />

        <Text style={{ fontWeight: "700" }}>Title</Text>
        <TextInput
          value={item.title || ""}
          onChangeText={(v) => updateField(item.id, "title", v)}
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 10,
            padding: 10,
            marginTop: 6,
          }}
        />

        <View style={{ height: 10 }} />

        <Text style={{ fontWeight: "700" }}>Start</Text>
        <Pressable
          onPress={() => openDatePicker(item.id, "start", item.start)}
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 10,
            padding: 10,
            marginTop: 6,
          }}
        >
          <Text>{fmt(item.start)}</Text>
        </Pressable>

        <View style={{ height: 10 }} />

        <Text style={{ fontWeight: "700" }}>End</Text>
        <Pressable
          onPress={() => openDatePicker(item.id, "end", item.end)}
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 10,
            padding: 10,
            marginTop: 6,
          }}
        >
          <Text>{fmt(item.end)}</Text>
        </Pressable>

        <View style={{ height: 10 }} />

        <Text style={{ fontWeight: "700" }}>Location</Text>
        <TextInput
          value={item.location || ""}
          onChangeText={(v) => updateField(item.id, "location", v)}
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 10,
            padding: 10,
            marginTop: 6,
          }}
        />

        <View style={{ height: 10 }} />

        <Text style={{ fontWeight: "700" }}>Description</Text>
        <TextInput
          value={item.description || ""}
          onChangeText={(v) => updateField(item.id, "description", v)}
          multiline
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 10,
            padding: 10,
            marginTop: 6,
            minHeight: 80,
            textAlignVertical: "top",
          }}
        />

        <View style={{ height: 10 }} />

        <Text>
          Recurring: {item.recurrence ? "✅ Yes" : "No"}{"   "}
          Status: {item.ambiguous ? "⚠️ Fix time" : "✅ OK"}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f7f7f7" }}>
      <FlatList
        data={sortedEvents}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderEvent}
        ListHeaderComponent={Header}
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      {picker.show && (
        <DateTimePicker
          value={picker.value}
          mode="datetime"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onDatePicked}
        />
      )}
    </SafeAreaView>
  );
}