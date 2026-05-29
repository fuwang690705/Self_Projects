package com.techfone.listen;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.media.MediaPlayer;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;
import java.io.PrintWriter;
import java.io.StringWriter;

public class MainActivity extends BridgeActivity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private NativePlayer nativePlayer;

    // 每 500ms 高频将原生播放器的当前进度轮询推送给 WebView 前端，驱动波形图与滑块
    private final Runnable progressUpdater = new Runnable() {
        @Override
        public void run() {
            if (nativePlayer != null && nativePlayer.getMediaPlayer() != null && nativePlayer.getMediaPlayer().isPlaying()) {
                try {
                    int current = nativePlayer.getMediaPlayer().getCurrentPosition() / 1000;
                    int duration = nativePlayer.getMediaPlayer().getDuration() / 1000;
                    notifyFrontPlayerProgress(current, duration);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
            handler.postDelayed(this, 500);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // 在 onCreate 最开始配置异常拦截，最大范围捕获可能发生的 Java 闪退
        final Thread.UncaughtExceptionHandler defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread thread, Throwable throwable) {
                try {
                    StringWriter sw = new StringWriter();
                    PrintWriter pw = new PrintWriter(sw);
                    throwable.printStackTrace(pw);
                    String stackTrace = sw.toString();
                    
                    getSharedPreferences("crash_pref", MODE_PRIVATE)
                            .edit()
                            .putString("last_crash", stackTrace)
                            .commit();
                } catch (Exception e) {
                    Log.e("MyReadCrash", "Failed to save crash log", e);
                }
                if (defaultHandler != null) {
                    defaultHandler.uncaughtException(thread, throwable);
                }
            }
        });

        super.onCreate(savedInstanceState);

        // 允许在 PC 的 Chrome 控制台使用 chrome://inspect 进行真机 WebView 远程断点与调试！
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            android.webkit.WebView.setWebContentsDebuggingEnabled(true);
        }

        // 注入原生播放器对象到 WebView 环境中，名称为 AndroidPlayer
        if (bridge != null && bridge.getWebView() != null) {
            nativePlayer = new NativePlayer();
            bridge.getWebView().addJavascriptInterface(nativePlayer, "AndroidPlayer");
        }

        Window window = getWindow();

        // 开启真正的沉浸式体验：全屏幕布局铺满，使系统状态栏与小白条底部完全悬浮透明
        // WebView 物理内容占满整个屏幕，让背景色实现 100% 延伸，依靠前端 CSS 局部进行微调
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS
                            | android.view.WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
            window.addFlags(android.view.WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
            
            View decorView = window.getDecorView();
            int flags = decorView.getSystemUiVisibility();
            // 让内容能够延伸到系统状态栏和底部小白条下方，实现极致无缝沉浸
            flags |= View.SYSTEM_UI_FLAG_LAYOUT_STABLE 
                   | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN 
                   | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            
            // 启用浅色背景下的深色图标
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            decorView.setSystemUiVisibility(flags);
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        // 检测上次是否存在未被捕获的原生 Crash 日志
        final String lastCrash = getSharedPreferences("crash_pref", MODE_PRIVATE).getString("last_crash", null);
        if (lastCrash != null) {
            // 一旦读取，立即清除，防止页面重复弹窗
            getSharedPreferences("crash_pref", MODE_PRIVATE).edit().remove("last_crash").apply();
            
            // 延迟 3.5 秒注入到前端。延迟执行以确保前端 WebView、Vue 已经完全就绪并挂载完毕
            getWindow().getDecorView().postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (bridge != null && bridge.getWebView() != null) {
                        // 转义堆栈中的转义符与换行符，防 JS 语法崩溃
                        String safeCrash = lastCrash.replace("\\", "\\\\")
                                                    .replace("\"", "\\\"")
                                                    .replace("\n", "\\n")
                                                    .replace("\r", "\\r");
                        String js = "if (window.onNativeCrashCaptured) { window.onNativeCrashCaptured(\"" + safeCrash + "\"); } else { window.lastNativeCrash = \"" + safeCrash + "\"; }";
                        bridge.getWebView().evaluateJavascript(js, null);
                    }
                }
            }, 3500);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (nativePlayer != null) {
            nativePlayer.release();
        }
        handler.removeCallbacks(progressUpdater);
    }

    // ==========================================
    // 反向向 WebView 注入并推送播放器事件 of JS 方法
    // ==========================================
    private void notifyFrontPlayerPrepared(final int duration) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().evaluateJavascript("if (window.onNativePlayerPrepared) { window.onNativePlayerPrepared(" + duration + "); }", null);
                }
            }
        });
    }

    private void notifyFrontPlayerProgress(final int current, final int duration) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().evaluateJavascript("if (window.onNativePlayerProgress) { window.onNativePlayerProgress(" + current + ", " + duration + "); }", null);
                }
            }
        });
    }

    private void notifyFrontPlayerPaused() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().evaluateJavascript("if (window.onNativePlayerPaused) { window.onNativePlayerPaused(); }", null);
                }
            }
        });
    }

    private void notifyFrontPlayerResumed() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().evaluateJavascript("if (window.onNativePlayerResumed) { window.onNativePlayerResumed(); }", null);
                }
            }
        });
    }

    private void notifyFrontPlayerEnded() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().evaluateJavascript("if (window.onNativePlayerEnded) { window.onNativePlayerEnded(); }", null);
                }
            }
        });
    }

    private void notifyFrontPlayerError(final int what, final int extra) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (bridge != null && bridge.getWebView() != null) {
                    bridge.getWebView().evaluateJavascript("if (window.onNativePlayerError) { window.onNativePlayerError(" + what + ", " + extra + "); }", null);
                }
            }
        });
    }

    // ==========================================
    // JS 接口：Android 原生播放器
    // ==========================================
    public class NativePlayer {
        private MediaPlayer mediaPlayer;
        private String currentUrl;
        private float speed = 1.0f;

        public NativePlayer() {
            mediaPlayer = new MediaPlayer();
            setupWakeMode();
        }

        public MediaPlayer getMediaPlayer() {
            return mediaPlayer;
        }

        private void setupWakeMode() {
            try {
                if (mediaPlayer != null) {
                    // 后台锁，防锁屏休眠
                    mediaPlayer.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        // JS 动态设置图标深浅色以及强行渲染底色以实现完美的沉浸式体验
        @JavascriptInterface
        public void setSystemUiColors(final String statusBarColorHex, final String navigationBarColorHex, final boolean darkIcons) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        Window window = getWindow();
                        try {
                            // 强行把状态栏和底部导航栏彻底设为完全透明，使 WebView 渐变网页背景全范围穿透出来！
                            window.setStatusBarColor(Color.TRANSPARENT);
                            window.setNavigationBarColor(Color.TRANSPARENT);
                            
                            View decorView = window.getDecorView();
                            // 强行锁死全屏幕沉浸属性，防止 Capacitor 等框架在运行时顶开我们的布局或者破坏通顶通底状态
                            int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE 
                                       | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN 
                                       | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
                            
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                if (darkIcons) {
                                    flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                        flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                                    }
                                } else {
                                    flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                                        flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                                    }
                                }
                            }
                            decorView.setSystemUiVisibility(flags);
                        } catch (Exception e) {
                            Log.e("MyReadColor", "Failed to set transparent system UI colors", e);
                        }
                    }
                }
            });
        }

        @JavascriptInterface
        public void play(final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        if (mediaPlayer == null) {
                            mediaPlayer = new MediaPlayer();
                            setupWakeMode();
                        }
                        
                        mediaPlayer.reset();
                        mediaPlayer.setDataSource(url);
                        
                        mediaPlayer.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                            @Override
                            public void onPrepared(MediaPlayer mp) {
                                // 准备完毕后设定倍速
                                setSpeed(speed);
                                mp.start();
                                
                                // 启动进度通知轮询器
                                handler.removeCallbacks(progressUpdater);
                                handler.post(progressUpdater);
                                
                                notifyFrontPlayerPrepared(mp.getDuration() / 1000);
                            }
                        });
                        
                        mediaPlayer.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                            @Override
                            public void onCompletion(MediaPlayer mp) {
                                handler.removeCallbacks(progressUpdater);
                                notifyFrontPlayerEnded();
                            }
                        });
                        
                        mediaPlayer.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                            @Override
                            public boolean onError(MediaPlayer mp, int what, int extra) {
                                handler.removeCallbacks(progressUpdater);
                                notifyFrontPlayerError(what, extra);
                                return true;
                            }
                        });
                        
                        mediaPlayer.prepareAsync();
                        currentUrl = url;
                        
                    } catch (Exception e) {
                        e.printStackTrace();
                        notifyFrontPlayerError(-1, -1);
                    }
                }
            });
        }

        @JavascriptInterface
        public void pause() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (mediaPlayer != null && mediaPlayer.isPlaying()) {
                        mediaPlayer.pause();
                        handler.removeCallbacks(progressUpdater);
                        notifyFrontPlayerPaused();
                    }
                }
            });
        }

        @JavascriptInterface
        public void resume() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (mediaPlayer != null && !mediaPlayer.isPlaying()) {
                        mediaPlayer.start();
                        handler.removeCallbacks(progressUpdater);
                        handler.post(progressUpdater);
                        notifyFrontPlayerResumed();
                    }
                }
            });
        }

        @JavascriptInterface
        public void seekTo(final int seconds) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (mediaPlayer != null) {
                        mediaPlayer.seekTo(seconds * 1000);
                    }
                }
            });
        }

        @JavascriptInterface
        public void setSpeed(final float rate) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    speed = rate;
                    if (mediaPlayer != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        try {
                            mediaPlayer.setPlaybackParams(mediaPlayer.getPlaybackParams().setSpeed(rate));
                        } catch (Exception e) {
                            // 某些机型如果对特异倍速抛出异常，做降级处理
                            e.printStackTrace();
                        }
                    }
                }
            });
        }

        @JavascriptInterface
        public void stop() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (mediaPlayer != null) {
                        mediaPlayer.stop();
                        handler.removeCallbacks(progressUpdater);
                    }
                }
            });
        }

        public void release() {
            if (mediaPlayer != null) {
                try {
                    mediaPlayer.release();
                } catch (Exception e) {
                    e.printStackTrace();
                }
                mediaPlayer = null;
            }
        }
    }
}
