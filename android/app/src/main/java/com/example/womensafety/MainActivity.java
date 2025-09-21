package com.example.womensafety;

import android.os.Handler;
import android.os.Looper;
import android.os.Build;
import android.content.pm.PackageManager;
import android.Manifest;
import android.app.Activity;
import android.view.KeyEvent;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

public class MainActivity extends BridgeActivity {
    private static final int LOCATION_PERMISSION_REQUEST_CODE = 1011;
    private static final int REQUIRED_PRESSES = 3;
    private static final long PRESS_WINDOW_MS = 1200; // 1.2 seconds
    private int pressCount = 0;
    private long lastPressTime = 0;
    private Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable resetRunnable = new Runnable() {
        @Override
        public void run() {
            pressCount = 0;
            lastPressTime = 0;
        }
    };

    @Override
    public void onStart() {
        super.onStart();
        // Set WebChromeClient for geolocation
        this.bridge.getWebView().setWebChromeClient(new WebChromeClient(){
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false); // automatically grant location permission
            }
        });

        // Handle Android 6+ runtime location permissions
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
                    || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(
                        new String[]{
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                        },
                        LOCATION_PERMISSION_REQUEST_CODE
                );
            }
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            int keyCode = event.getKeyCode();
            if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
                long now = System.currentTimeMillis();
                if (now - lastPressTime > PRESS_WINDOW_MS) {
                    pressCount = 0;
                }
                pressCount++;
                lastPressTime = now;

                handler.removeCallbacks(resetRunnable);
                handler.postDelayed(resetRunnable, PRESS_WINDOW_MS);

                if (pressCount >= REQUIRED_PRESSES) {
                    pressCount = 0;
                    lastPressTime = 0;
                    handler.removeCallbacks(resetRunnable);
                    fireVolumeSOSEvent();
                }
            }
        }
        return super.dispatchKeyEvent(event);
    }

    private void fireVolumeSOSEvent() {
        if (this.bridge != null) {
            JSObject data = new JSObject();
            this.bridge.triggerWindowJSEvent("volumeSOS", data.toString());
        }
    }
}
    // Optionally, handle the result of the permission request if needed in the future
    // @Override
    // public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    //     super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    //     // You can handle permission result here if needed
    // }