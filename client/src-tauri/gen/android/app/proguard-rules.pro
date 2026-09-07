# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# MainActivity methods invoked by name via JNI from Rust (client/src-tauri/src/lib.rs)
# with no Kotlin/Java caller. R8's default Activity keep rule only preserves the
# class, not these members, so without this they can be renamed/stripped in a
# minified release build.
-keepclassmembers class com.dumostech.dumosrx.MainActivity {
    public void setNavigationBarLight(boolean);
    public void mirrorAuthToken(java.lang.String);
    public void clearMirroredAuthToken();
    public void writeWidgetSnapshot(java.lang.String);
}