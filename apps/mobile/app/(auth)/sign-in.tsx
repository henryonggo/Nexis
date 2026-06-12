import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { supabase } from "../../lib/supabase";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError("Email atau kata sandi salah.");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Nexis</Text>
      <Text style={styles.sub}>Masuk ke akun karyawan Anda</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Kata sandi"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Pressable style={styles.button} onPress={onSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Masuk</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#F7F8FA" },
  brand: { fontSize: 32, fontWeight: "700", color: "#2452E6", textAlign: "center" },
  sub: { color: "#5B6675", textAlign: "center", marginTop: 4, marginBottom: 24 },
  input: {
    backgroundColor: "#fff",
    borderColor: "#E3E8EF",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  button: { backgroundColor: "#2452E6", borderRadius: 8, padding: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
  error: { color: "#DC2626", marginBottom: 12, textAlign: "center" },
});
