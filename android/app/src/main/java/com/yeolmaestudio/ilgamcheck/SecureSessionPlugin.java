package com.yeolmaestudio.ilgamcheck;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** Supabase session/verifier only. Values and cryptographic failures are never logged. */
@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {
    private static final String ALIAS = "ilgamcheck.session.v1";
    private static final String PREFS = "ilgamcheck.encrypted.session.v1";

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private String key(PluginCall call) {
        String key = call.getString("key");
        if (key == null || !key.matches("(sb-|ilgam-native-)[A-Za-z0-9._-]{1,200}")) {
            throw new IllegalArgumentException("SECURE_SESSION_KEY_INVALID");
        }
        return key;
    }

    private SecretKey encryptionKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(
                ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build());
            generator.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null)).getSecretKey();
    }

    @PluginMethod
    public synchronized void get(PluginCall call) {
        try {
            String key = key(call);
            String encoded = preferences().getString(key, null);
            JSObject result = new JSObject();
            if (encoded == null) {
                result.put("value", JSONObject.NULL);
            } else {
                byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
                if (bytes.length < 28 || bytes.length > 131100) throw new IllegalArgumentException();
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, encryptionKey(), new GCMParameterSpec(128, Arrays.copyOfRange(bytes, 0, 12)));
                cipher.updateAAD(key.getBytes(StandardCharsets.UTF_8));
                result.put("value", new String(cipher.doFinal(Arrays.copyOfRange(bytes, 12, bytes.length)), StandardCharsets.UTF_8));
            }
            call.resolve(result);
        } catch (Exception ignored) {
            call.reject("SECURE_SESSION_UNAVAILABLE");
        }
    }

    @PluginMethod
    public synchronized void set(PluginCall call) {
        try {
            String key = key(call);
            String value = call.getString("value");
            if (value == null || value.getBytes(StandardCharsets.UTF_8).length > 131072) throw new IllegalArgumentException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKey());
            cipher.updateAAD(key.getBytes(StandardCharsets.UTF_8));
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] bytes = new byte[cipher.getIV().length + encrypted.length];
            System.arraycopy(cipher.getIV(), 0, bytes, 0, cipher.getIV().length);
            System.arraycopy(encrypted, 0, bytes, cipher.getIV().length, encrypted.length);
            if (!preferences().edit().putString(key, Base64.encodeToString(bytes, Base64.NO_WRAP)).commit()) {
                throw new IllegalStateException();
            }
            call.resolve();
        } catch (Exception ignored) {
            call.reject("SECURE_SESSION_UNAVAILABLE");
        }
    }

    @PluginMethod
    public synchronized void remove(PluginCall call) {
        try {
            if (!preferences().edit().remove(key(call)).commit()) throw new IllegalStateException();
            call.resolve();
        } catch (Exception ignored) {
            call.reject("SECURE_SESSION_UNAVAILABLE");
        }
    }
}
