package io.ionic.starter;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String PREFS = "app_update_check";
    private static final String KEY_VERSION_CODE = "last_version_code";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Al actualizar la APK sobre una instalación previa, Android conserva
        // los datos de la app — incluida la caché HTTP del WebView. Como los
        // bundles de Angular llevan hash en el nombre de archivo, no debería
        // chocar, pero index.html no lleva hash: si el WebView lo sirve desde
        // caché, puede referenciar bundles de la versión anterior que ya no
        // existen en este APK. Detectamos el cambio de versionCode UNA vez y
        // limpiamos solo la caché del WebView (no toca @capacitor/preferences
        // ni la sesión guardada — eso vive en un storage aparte).
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        int lastVersionCode = prefs.getInt(KEY_VERSION_CODE, -1);
        int currentVersionCode = BuildConfig.VERSION_CODE;

        if (lastVersionCode != currentVersionCode) {
            WebView webView = getBridge().getWebView();
            webView.clearCache(true);
            webView.clearHistory();
            prefs.edit().putInt(KEY_VERSION_CODE, currentVersionCode).apply();
        }
    }
}
