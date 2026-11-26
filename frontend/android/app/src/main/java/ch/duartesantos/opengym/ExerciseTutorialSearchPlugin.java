package ch.duartesantos.opengym;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExerciseTutorialSearch")
public class ExerciseTutorialSearchPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String provider = call.getString("provider", "");
        String query = call.getString("query", "").trim();
        if ("offline".equals(BuildConfig.CHANNEL) || query.isEmpty() || query.length() > 120) {
            call.reject("Tutorial search unavailable");
            return;
        }

        Uri app;
        Uri web;
        String packageName;
        switch (provider) {
            case "bilibili":
                app = searchUri("bilibili", "search", query).build();
                web = searchUri("https", "search.bilibili.com", query).path("all").build();
                packageName = "tv.danmaku.bili";
                break;
            case "douyin":
                app = searchUri("snssdk1128", "search", query).build();
                web = new Uri.Builder().scheme("https").authority("www.douyin.com")
                        .appendPath("search").appendPath(query).build();
                packageName = "com.ss.android.ugc.aweme";
                break;
            default:
                call.reject("Unknown tutorial search provider");
                return;
        }

        JSObject result = new JSObject();
        result.put("opened", tryOpen(app, packageName) || tryOpen(web, null));
        call.resolve(result);
    }

    private static Uri.Builder searchUri(String scheme, String host, String query) {
        return new Uri.Builder().scheme(scheme).authority(host).appendQueryParameter("keyword", query);
    }

    private boolean tryOpen(Uri uri, String packageName) {
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        if (packageName != null) intent.setPackage(packageName);
        try {
            getActivity().startActivity(intent);
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            return false;
        }
    }
}
