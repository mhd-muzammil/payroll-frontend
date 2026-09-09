package in.systimus.payroll;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Our own tracker, alongside the community geolocation plugin rather
        // than instead of it: the web app picks whichever it finds and falls
        // back to the old path on an APK that has never heard of this one.
        registerPlugin(DutyTracker.class);
        super.onCreate(savedInstanceState);
    }
}
