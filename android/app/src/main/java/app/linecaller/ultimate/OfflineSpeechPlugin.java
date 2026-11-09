package app.linecaller.ultimate;

import android.Manifest;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.IOException;
import org.json.JSONException;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;
import org.vosk.android.StorageService;

/** Speech to text that runs entirely on the device. Audio is never saved or sent anywhere. */
@CapacitorPlugin(
    name = "OfflineSpeech",
    permissions = { @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }) }
)
public class OfflineSpeechPlugin extends Plugin implements RecognitionListener {

    private static final float SAMPLE_RATE = 16000.0f;
    private Model model;
    private Recognizer recognizer;
    private SpeechService service;

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphoneResult");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void microphoneResult(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            begin(call);
        } else {
            call.reject("Microphone permission was not granted", "denied");
        }
    }

    private void begin(PluginCall call) {
        release();
        if (model != null) {
            listen(call);
            return;
        }
        // The first run copies the speech model out of the app, which takes a little while.
        StorageService.unpack(
            getContext(),
            "model-en-us",
            "model",
            (loaded) -> {
                model = loaded;
                listen(call);
            },
            (error) -> call.reject("Could not load the speech model: " + error.getMessage())
        );
    }

    private void listen(PluginCall call) {
        try {
            JSArray words = call.getArray("words");
            recognizer = words != null && words.length() > 0
                ? new Recognizer(model, SAMPLE_RATE, words.toString())
                : new Recognizer(model, SAMPLE_RATE);
            service = new SpeechService(recognizer, SAMPLE_RATE);
            service.startListening(this);
            call.resolve();
        } catch (IOException e) {
            release();
            call.reject("Could not start listening: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        release();
        call.resolve();
    }

    private void release() {
        if (service != null) {
            service.stop();
            service.shutdown();
            service = null;
        }
        if (recognizer != null) {
            recognizer.close();
            recognizer = null;
        }
    }

    private void send(String event, String json, String key) {
        try {
            JSObject out = new JSObject();
            out.put("text", new JSONObject(json).optString(key, ""));
            notifyListeners(event, out);
        } catch (JSONException e) {
            // A malformed result is skipped; the next one will arrive shortly.
        }
    }

    @Override
    public void onPartialResult(String hypothesis) {
        send("partial", hypothesis, "partial");
    }

    @Override
    public void onResult(String hypothesis) {
        send("phrase", hypothesis, "text");
    }

    @Override
    public void onFinalResult(String hypothesis) {
        send("phrase", hypothesis, "text");
    }

    @Override
    public void onError(Exception exception) {
        JSObject out = new JSObject();
        out.put("message", exception.getMessage());
        notifyListeners("error", out);
    }

    @Override
    public void onTimeout() {
        // No timeout is set, so this never fires.
    }

    @Override
    protected void handleOnDestroy() {
        release();
        if (model != null) {
            model.close();
            model = null;
        }
    }
}
